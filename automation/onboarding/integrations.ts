import { existsSync, readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { contained, verifyEvidence } from '../shared/store.js';
import { validatePreference, validateReport, type BrowserPreference, type BrowserReport } from '../browser/tools.js';
import { readToolPolicy } from '../tools/policy.js';
import { readConnections } from '../email/email.js';
import { validateSettings } from '../github/github.js';
import { readHarness, currentHarness, type ExecutionContext } from '../tools/runtime.js';
import { readRecord, readinessIssues } from '../tools/registry.js';
import { settings as postmanSettings, capabilityIssues as postmanCapabilityIssues } from '../postman/postman.js';
import { readSettings as chromeSettings } from '../chrome-devtools/config.js';
import { browserAccessStatus } from '../browser/access.js';
import type { Stage } from './state.js';

/** Project preparation and optional capability gaps remain separate; neither authorizes task execution. */
export function integrationStatus(root: string) {
  const stageIssues: { stage: Stage; message: string }[] = [];
  const read = (path: string) => JSON.parse(readFileSync(contained(root, path), 'utf8'));
  const present = (path: string) => existsSync(contained(root, path));
  let executionContext: ExecutionContext = 'interactive';
  const check = (stage: Stage, invalid: string, assess: (report: (message: string) => void) => void) => {
    const report = (message: string) => { stageIssues.push({ stage, message }); };
    try { assess(report); } catch { report(invalid); }
  };
  check('tools', 'Identify this calling harness; preserve existing onboarding and verify only affected tools.', () => {
    executionContext = readHarness(root)?.executionContext ?? 'interactive';
    currentHarness(root);
  });
  check('project', 'The project record is unreadable or invalid. Inspect and reconcile it.', report => {
    if (!present('.local/project.json')) {
      report('Identify the project, environments and responsible people in the canonical project record.');
      return;
    }
    const project = read('.local/project.json');
    if (!project.name || !project.source || !Array.isArray(project.environments) || !project.environments.length || !Array.isArray(project.owners) || !project.owners.length) report('The project record needs environments, owners and its source.');
  });
  check('contextRoute', 'The context route is unreadable or invalid. Inspect and reconcile it.', report => {
    if (!present('.local/context-settings.json')) {
      report('Record the context-establishment route.');
      return;
    }
    const context = read('.local/context-settings.json');
    if (!['provide', 'discover', 'combined'].includes(context.route) || !context.source) report('Choose provide, discover or combined with an actual source.');
  });
  check('operation', 'The operating preferences or scheduler record is unreadable or invalid. Inspect and reconcile it.', report => {
    if (!present('.local/operation-preferences.json')) {
      report('Record on-demand, scheduled, events or combined operation; a preference alone activates nothing.');
      return;
    }
    const operation = read('.local/operation-preferences.json');
    if (!['onDemand', 'scheduled', 'events', 'combined'].includes(operation.mode) || !operation.source) report('Record an actual operating-mode choice.');
    if (['scheduled', 'combined'].includes(operation.mode)) {
      executionContext = 'scheduled';
      if (!present('.local/schedule-record.json')) report('The schedule preference has no actual scheduler record.');
      else {
        const schedule = read('.local/schedule-record.json');
        if (!schedule.id || schedule.state !== 'ACTIVE' || schedule.root !== realpathSync(root) || !schedule.source || !schedule.evidence?.length) report('The actual schedule is not verified for this project.');
        else for (const ref of schedule.evidence) { try { verifyEvidence(root, ref); } catch { report('Schedule evidence changed.'); } }
      }
    }
    if (['events', 'combined'].includes(operation.mode)) {
      if (!operation.triggerReference || !operation.triggerEvidence?.length) report('An event preference needs its actual configured trigger reference and evidence.');
      for (const ref of operation.triggerEvidence ?? []) { try { verifyEvidence(root, ref); } catch { report('Event trigger evidence changed.'); } }
    }
  });
  check('tools', 'Tool policy or its source is invalid; resolve the actual constraints.', () => { readToolPolicy(root); });
  const issues: string[] = [];
  const inspect = (name: string, action: () => void) => { try { action(); } catch { issues.push(`${name}: configuration/evidence is invalid; preserve it and recheck affected work.`); } };
  inspect('Legacy browser preference', () => {
    if (present('.local/browser-preferences.json')) {
      const preference = read('.local/browser-preferences.json') as BrowserPreference;
      try { validatePreference(preference); } catch { issues.push('Browser preference is invalid.'); return; }
      if (preference.method === 'recommend') return; // A historical recommendation is not an unresolved compulsory choice.
      const provider = preference.method === 'cli' ? 'cli' : preference.method === 'mcp' ? 'harnessMcp' : 'inApp';
      const path = `.local/browser-reports/${provider}-${executionContext}.json`;
      if (!present(path)) issues.push(`${provider}: verify actual ${executionContext} operation; a server/configuration check alone is insufficient.`);
      else {
        const report = read(path) as BrowserReport;
        issues.push(...validateReport(root, report, executionContext));
        if (report.provider !== provider || (preference.method !== 'inApp' && report.visibility !== preference.visibility)) issues.push('The browser report does not match the saved method/visibility.');
      }
    }
  });
  inspect('Email', () => {
    if (present('.local/email-connections.json')) for (const binding of readConnections(root).value.bindings) {
      if (binding.transport === 'human') continue;
      if (binding.authentication !== 'connected' || !binding.verification?.listedAt || binding.verification.context !== executionContext) issues.push(`${binding.id}: verify mailbox identity and listing for ${executionContext} work when needed.`);
      for (const ref of binding.verification?.evidence ?? []) { try { verifyEvidence(root, ref); } catch { issues.push(`${binding.id}: email capability evidence changed.`); } }
      if (readHarness(root)) issues.push(...readinessIssues(root, readRecord(root, `email:${binding.id}`), ['account', 'listMessages']).map(i => `${binding.id}: ${i}`));
    }
  });
  inspect('GitHub', () => {
    if (present('.local/github-settings.json')) {
      const settings = read('.local/github-settings.json');
      validateSettings(settings);
      if (!settings.account || !settings.source || !Array.isArray(settings.repositories)) issues.push('GitHub settings are incomplete.');
      else for (const rule of settings.repositories) {
        const path = `.local/github-access/${rule.repository.replace('/', '--')}.json`;
        if (!present(path)) issues.push(`${rule.repository}: repository access is not verified.`);
        else { const access = read(path); if (access.account !== settings.account || access.repository.toLowerCase() !== rule.repository.toLowerCase() || access.root !== realpathSync(root)) issues.push(`${rule.repository}: account/root access evidence differs.`); }
        if (readHarness(root)) issues.push(...readinessIssues(root, readRecord(root, 'github'), [`repository:${rule.repository.toLowerCase()}`]).map(i => `${rule.repository}: ${i}`));
      }
    }
  });
  inspect('Postman', () => {
    const postman = postmanSettings(root);
    if (postman && readHarness(root)) {
      const required = ['version', 'collectionRun', ...(postman.mode === 'local' ? ['localCollectionRun'] : ['identity', ...postman.collections.map(id => `collection:${id}`), ...postman.environments.map(id => `environment:${id}`)])];
      issues.push(...postmanCapabilityIssues(root, readRecord(root, 'postman'), required, postman).map(i => `Postman: ${i}`));
    }
  });
  const chrome: { configured: boolean; methods: { tool: string; issues: string[] }[]; limitation: string } = {
    configured: false, methods: [], limitation: 'Package, terminal SDK/CLI access, native harness connection and current-page WebMCP readiness are separate. Assess only task-selected methods.' };
  inspect('Chrome DevTools', () => {
    chrome.configured = !!chromeSettings(root);
    for (const tool of ['chromeDevtoolsMcp', 'chromeDevtoolsCli', 'chromeDevtoolsHost'] as const) {
      const record = readRecord(root, tool);
      if (record) chrome.methods.push({ tool, issues: readinessIssues(root, record, [tool === 'chromeDevtoolsHost' ? 'hostConnection' : tool === 'chromeDevtoolsCli' ? 'cliRehearsal' : 'serverRehearsal']) });
    }
    if (chrome.configured && !chrome.methods.some(m => !m.issues.length)) issues.push('Chrome DevTools: verify the relevant selected access route; installation/settings alone are insufficient. Independent work can continue.');
  });
  for (const access of browserAccessStatus(root)) if (access.status !== 'verified') {
    issues.push(`Browser target${'target' in access ? ' ' + access.target.environment + ' (' + access.origin + ')' : ''}: ${access.next}`);
  }
  return { issues: stageIssues.map(issue => issue.message), stageIssues, capabilityIssues: issues, chrome, taskReadiness: 'Assess the selected operations for each task; onboarding completion is not task execution authorization.' };
}

/** Backwards-compatible full diagnostic list, not the onboarding blocking decision. */
export function integrationIssues(root: string): string[] { const result = integrationStatus(root); return [...result.issues, ...result.capabilityIssues]; }
