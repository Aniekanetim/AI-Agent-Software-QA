import { existsSync, readFileSync } from 'node:fs';
import { contained, requireText, verifyEvidence, assertNonsecret, type Evidence } from '../shared/store.js';
import { currentHarness, type ExecutionContext } from './runtime.js';
import { readRecord, readinessIssues, assertToolId, type ToolId } from './registry.js';
import { readToolPolicy, toolVisibility, uniqueTexts, type ToolPolicy } from './policy.js';
import { validateReport, type BrowserReport } from '../browser/tools.js';
import { status as postmanStatus } from '../postman/postman.js';

export interface TaskToolPlan {
  schemaVersion: 1; id: string; revision: string; task: Evidence; objective: string; executionContext: ExecutionContext;
  requirements: { id: string; browser: boolean; operations: string[]; requiredTool: ToolId | null; basis: Evidence[] }[];
  selections: { requirementId: string; tool: ToolId; rationale: string; limitations: string[] }[];
}
const providers: Partial<Record<ToolId, BrowserReport['provider']>> = { inAppBrowser: 'inApp', harnessMcp: 'harnessMcp', playwrightCli: 'cli', playwrightLibrary: 'library' };

/** Assess the agent's explicit selection; never select a fallback, execute work or grant approval. */
export function assessTaskTools(root: string, plan: TaskToolPlan) {
  assertNonsecret(plan);
  if (!plan || plan.schemaVersion !== 1) throw new Error('Unsupported task-tool plan; preserve it for explicit migration.');
  requireText(plan.id); requireText(plan.revision); requireText(plan.objective);
  if (!['interactive', 'scheduled', 'ci'].includes(plan.executionContext)) throw new Error('Identify the actual execution context.');
  if (!Array.isArray(plan.requirements) || !plan.requirements.length || !Array.isArray(plan.selections)) throw new Error('Identify required operations and the agent selections.');
  const ids = plan.requirements.map(r => r.id); uniqueTexts(ids, 'Requirement IDs');
  uniqueTexts(plan.selections.map(s => s.requirementId), 'Selection bindings');
  if (plan.selections.some(s => !ids.includes(s.requirementId))) throw new Error('Selection points to an unknown requirement.');
  const globalIssues: string[] = [];
  try { verifyEvidence(root, plan.task); currentHarness(root, plan.executionContext); } catch { globalIssues.push('Task source or calling harness changed; revalidate affected preparation.'); }
  let policy: ReturnType<typeof readToolPolicy> = null;
  let visibility: ToolPolicy['visibility'] = 'any';
  try { policy = readToolPolicy(root); if (plan.requirements.some(r => r.browser)) visibility = toolVisibility(root); } catch { globalIssues.push('Tool policy/visibility is unreadable, unsupported or its source changed; resolve constraints before execution.'); }
  const requirements = plan.requirements.map(requirement => {
    uniqueTexts(requirement.operations, 'Required operations');
    if (typeof requirement.browser !== 'boolean' || !requirement.operations.length || !Array.isArray(requirement.basis) || !requirement.basis.length) throw new Error('Each requirement needs its browser/other target, actual operations and source basis.');
    if (requirement.requiredTool !== null) assertToolId(requirement.requiredTool);
    const issues: string[] = [];
    for (const ref of requirement.basis) { try { verifyEvidence(root, ref); } catch { issues.push('Requirement basis is missing or changed.'); } }
    const selection = plan.selections.find(s => s.requirementId === requirement.id);
    if (!selection) issues.push('Agent must choose a suitable tool and explain its fit.');
    else {
      assertToolId(selection.tool); requireText(selection.rationale, 'Selection rationale'); uniqueTexts(selection.limitations, 'Selection limitations');
      if (requirement.requiredTool && selection.tool !== requirement.requiredTool) issues.push(`This task explicitly requires ${requirement.requiredTool}; do not silently substitute another tool.`);
      if (policy?.prohibitedTools.includes(selection.tool) || policy?.allowedTools && !policy.allowedTools.includes(selection.tool)) issues.push('Selected tool conflicts with actual project constraints.');
      try {
        const report = readRecord(root, selection.tool);
        if (report && report.tool !== selection.tool) issues.push('Capability record identifies a different tool.');
        issues.push(...(selection.tool === 'postman' ? postmanStatus(root, requirement.operations).issues : readinessIssues(root, report, requirement.operations)));
        const provider = requirement.browser ? providers[selection.tool] : undefined;
        if (provider) {
          const path = contained(root, `.local/browser-reports/${provider}-${plan.executionContext}.json`);
          if (!existsSync(path)) issues.push('Verify the selected browser through this harness; installation is insufficient.');
          else {
            const browser = JSON.parse(readFileSync(path, 'utf8')) as BrowserReport;
            issues.push(...validateReport(root, browser, plan.executionContext, requirement.operations));
            if (browser.provider !== provider) issues.push('Browser operation report identifies another method.');
            if (visibility !== 'any' && browser.visibility !== visibility) issues.push('Verify the required visibility through the selected browser.');
          }
        } else if (visibility !== 'any' && requirement.browser) {
          issues.push(...readinessIssues(root, report, [`visibility:${visibility}`]));
        }
      } catch { issues.push('Selected capability evidence is unavailable or invalid; recheck only this tool.'); }
    }
    return { id: requirement.id, selection: selection ?? null, status: issues.length || globalIssues.length ? 'needsPreparation' : 'capabilitiesVerified', issues };
  });
  return { id: plan.id, revision: plan.revision, status: globalIssues.length || requirements.some(r => r.status === 'needsPreparation') ? 'needsPreparation' : 'capabilitiesVerified', globalIssues, requirements,
    unselectedTools: 'Not assessed; optional unavailable tools do not block this selection.',
    authorization: 'Not established by this assessment', productVerdict: 'Not assessed',
    limits: ['The agent chooses tools and assesses semantic suitability; declared operations and evidence still require review.', 'No product access, test execution, installation or fallback occurs here.', 'Recheck live sessions, provider bindings and actual tool versions before dependent execution.'] };
}
