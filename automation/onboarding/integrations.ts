import { existsSync, readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { contained, verifyEvidence } from '../shared/store.js';
import { validatePreference, validateReport, type BrowserPreference, type BrowserReport } from '../browser/tools.js';
import { readConnections } from '../email/email.js';
import { validateSettings } from '../github/github.js';
import { readHarness, currentHarness, type ExecutionContext } from '../tools/runtime.js';
import { readRecord, readinessIssues } from '../tools/registry.js';
import { settings as postmanSettings, capabilityIssues as postmanCapabilityIssues } from '../postman/postman.js';

/** Revalidates configured capabilities; absence is not silently converted into a configured service. */
export function integrationIssues(root: string): string[] {
  const issues: string[] = [];
  const read = (path: string) => JSON.parse(readFileSync(contained(root, path), 'utf8'));
  const present = (path: string) => existsSync(contained(root, path));
  let executionContext: ExecutionContext = readHarness(root)?.executionContext ?? 'interactive';
  try { currentHarness(root); } catch { issues.push('Identify this calling harness; preserve existing onboarding and verify only affected tools.'); }
  if (!present('.local/project.json')) issues.push('Identify the project, environments and responsible people in the canonical project record.');
  else { const project = read('.local/project.json'); if (!project.name || !project.source || !Array.isArray(project.environments) || !project.environments.length || !Array.isArray(project.owners) || !project.owners.length) issues.push('The project record needs environments, owners and its source.'); }
  if (!present('.local/context-settings.json')) issues.push('Record the context-establishment route.');
  else { const context = read('.local/context-settings.json'); if (!['provide', 'discover', 'combined'].includes(context.route) || !context.source) issues.push('Choose provide, discover or combined with an actual source.'); }
  if (!present('.local/operation-preferences.json')) issues.push('Record on-demand, scheduled, events or combined operation; a preference alone activates nothing.');
  if (present('.local/operation-preferences.json')) {
    const operation = read('.local/operation-preferences.json');
    if (!['onDemand', 'scheduled', 'events', 'combined'].includes(operation.mode) || !operation.source) issues.push('Record an actual operating-mode choice.');
    if (['scheduled', 'combined'].includes(operation.mode)) {
      executionContext = 'scheduled';
      if (!present('.local/schedule-record.json')) issues.push('The schedule preference has no actual scheduler record.');
      else { const schedule = read('.local/schedule-record.json'); if (!schedule.id || schedule.state !== 'ACTIVE' || schedule.root !== realpathSync(root) || !schedule.source || !schedule.evidence?.length) issues.push('The actual schedule is not verified for this project.'); else for (const ref of schedule.evidence) { try { verifyEvidence(root, ref); } catch { issues.push('Schedule evidence changed.'); } } }
    }
    if (['events', 'combined'].includes(operation.mode)) {
      if (!operation.triggerReference || !operation.triggerEvidence?.length) issues.push('An event preference needs its actual configured trigger reference and evidence.');
      for (const ref of operation.triggerEvidence ?? []) { try { verifyEvidence(root, ref); } catch { issues.push('Event trigger evidence changed.'); } }
    }
  }
  if (present('.local/browser-preferences.json')) {
    const preference = read('.local/browser-preferences.json') as BrowserPreference;
    try { validatePreference(preference); } catch { issues.push('Browser preference is invalid.'); return issues; }
    if (preference.method === 'recommend') issues.push('Resolve the recommended browser using an actual capability comparison.');
    const provider = preference.method === 'cli' ? 'cli' : preference.method === 'mcp' ? 'harnessMcp' : 'inApp';
    const path = `.local/browser-reports/${provider}-${executionContext}.json`;
    if (!present(path)) issues.push(`${provider}: verify actual ${executionContext} operation; a server/configuration check alone is insufficient.`);
    else {
      const report = read(path) as BrowserReport;
      issues.push(...validateReport(root, report, executionContext));
      if (report.provider !== provider || (preference.method !== 'inApp' && report.visibility !== preference.visibility)) issues.push('The browser report does not match the saved method/visibility.');
    }
  }
  if (present('.local/email-connections.json')) for (const binding of readConnections(root).value.bindings) {
    if (binding.transport === 'human') continue;
    if (binding.authentication !== 'connected' || !binding.verification?.bodyReadAt || binding.verification.context !== executionContext) issues.push(`${binding.id}: full-message ${executionContext} access is not verified.`);
    for (const ref of binding.verification?.evidence ?? []) { try { verifyEvidence(root, ref); } catch { issues.push(`${binding.id}: email capability evidence changed.`); } }
    if (readHarness(root)) issues.push(...readinessIssues(root, readRecord(root, `email:${binding.id}`), ['account', 'listMessages', 'readMessage']).map(i => `${binding.id}: ${i}`));
  }
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
  const postman = postmanSettings(root);
  if (postman && readHarness(root)) {
    const required = ['version', 'collectionRun', ...(postman.mode === 'local' ? ['localCollectionRun'] : ['identity', ...postman.collections.map(id => `collection:${id}`), ...postman.environments.map(id => `environment:${id}`)])];
    issues.push(...postmanCapabilityIssues(root, readRecord(root, 'postman'), required, postman).map(i => `Postman: ${i}`));
  }
  return issues;
}
