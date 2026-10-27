import { load, save, requireText, verifyEvidence, type Evidence } from '../shared/store.js';
import { integrationIssues } from './integrations.js';

export const stages = ['project', 'contextRoute', 'tools', 'email', 'access', 'understanding', 'operation', 'handoff'] as const;
export type Stage = typeof stages[number];
export const labels: Record<Stage, string> = {
  project: 'Establish the project, environments and owners', contextRoute: 'Choose how context is established',
  tools: 'Prepare browser automation and GitHub', email: 'Discover providers and select verification mailboxes',
  access: 'Establish application access', understanding: 'Build and review initial project/product understanding',
  operation: 'Configure check-ins, PR triggers and reporting', handoff: 'Verify readiness and explain how work begins',
};
export type CheckStatus = 'pending' | 'verified' | 'blocked' | 'deferred' | 'notApplicable';
export interface Check { status: CheckStatus; evidence: Evidence[]; reason: string | null; nextAction: string | null; checkedAt: string | null }
export interface Question {
  id: string; stage: Stage; prompt: string; path: string; pointer?: string; required: boolean;
  status: 'queued' | 'presenting' | 'asked' | 'answered' | 'deferred' | 'canceled';
  promptReferences: string[]; answerReferences: { source: string; evidence: Evidence }[];
  clarificationHistory: { prompt: string; source: string }[];
}
export interface ContextDomain { domain: 'business' | 'product' | 'technical' | 'design' | 'decisions'; state: 'documented' | 'gap' | 'notApplicable'; sources: Evidence[]; owner: string; questionReference?: string; reason?: string }
export interface SetupState {
  schemaVersion: 1; paused: boolean; roadmapShown: boolean; questions: Question[];
  roadmapSource?: string;
  checks: Record<Stage, Check>; domains: ContextDomain[]; completed: boolean;
  responses: { id: string; digest: string; source: string }[]; updatedAt: string | null;
}
export const statePath = '.local/onboarding-state.json';
export function emptyCheck(): Check { return { status: 'pending', evidence: [], reason: null, nextAction: null, checkedAt: null }; }
export function emptyState(): SetupState {
  return { schemaVersion: 1, paused: false, roadmapShown: false, questions: [], domains: [], completed: false,
    checks: Object.fromEntries(stages.map(stage => [stage, emptyCheck()])) as SetupState['checks'], responses: [], updatedAt: null };
}
export function validateState(state: SetupState): void {
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.questions) || !Array.isArray(state.domains) || !Array.isArray(state.responses) || typeof state.paused !== 'boolean' || typeof state.completed !== 'boolean') throw new Error('Unsupported onboarding state; preserve and migrate it explicitly.');
  const ids = new Set<string>();
  for (const q of state.questions) {
    requireText(q.id); requireText(q.path); requireText(q.prompt);
    if (ids.has(q.id) || !stages.includes(q.stage) || !['queued', 'presenting', 'asked', 'answered', 'deferred', 'canceled'].includes(q.status) || !Array.isArray(q.answerReferences) || !Array.isArray(q.promptReferences)) throw new Error('Invalid or duplicate onboarding question.');
    ids.add(q.id);
  }
  for (const stage of stages) if (!state.checks[stage] || !['pending', 'verified', 'blocked', 'deferred', 'notApplicable'].includes(state.checks[stage].status) || !Array.isArray(state.checks[stage].evidence)) throw new Error('Invalid preparation check.');
  if (new Set(state.domains.map(d => d.domain)).size !== state.domains.length) throw new Error('Context domain entries must be unique.');
}
export function readState(root: string) { const result = load(root, statePath, emptyState); validateState(result.value); return result; }
export function writeState(root: string, state: SetupState, expected: string | null) {
  validateState(state); state.updatedAt = new Date().toISOString(); return save(root, statePath, state, expected);
}
export function readiness(root: string, state: SetupState, includeHandoff = true): { ready: boolean; issues: string[] } {
  validateState(state); const issues: string[] = [];
  for (const stage of stages.filter(s => includeHandoff || s !== 'handoff')) {
    const check = state.checks[stage];
    if (['project', 'contextRoute', 'understanding', 'operation', 'handoff'].includes(stage) && check.status === 'notApplicable') issues.push(`${stage}: this checkpoint is mandatory; record scoped knowledge and gaps instead`);
    if (!['verified', 'notApplicable'].includes(check.status)) issues.push(`${stage}: ${check.nextAction ?? check.reason ?? check.status}`);
    if (check.status === 'notApplicable' && !check.reason) issues.push(`${stage}: a non-applicability reason is required`);
    if (check.status === 'verified' && (!check.evidence.length || !check.checkedAt)) issues.push(`${stage}: observed evidence is required`);
    for (const ref of check.evidence) { try { verifyEvidence(root, ref); } catch { issues.push(`${stage}: evidence changed or is unavailable`); } }
  }
  for (const name of ['business', 'product', 'technical', 'design', 'decisions']) {
    const domain = state.domains.find(d => d.domain === name);
    if (!domain || !domain.owner?.trim()) issues.push(`${name}: record knowledge, an owner question or justified non-applicability`);
    else {
      if (!['documented', 'gap', 'notApplicable'].includes(domain.state)) issues.push(`${name}: invalid context state`);
      if (domain.state === 'documented' && !domain.sources.length) issues.push(`${name}: source evidence is missing`);
      if (domain.state === 'gap' && !domain.questionReference) issues.push(`${name}: link the original owner question`);
      if (domain.state === 'notApplicable' && !domain.reason) issues.push(`${name}: explain non-applicability`);
      for (const ref of domain.sources) { try { verifyEvidence(root, ref); } catch { issues.push(`${name}: source evidence changed`); } }
    }
  }
  for (const q of state.questions) if (q.required && q.status !== 'answered') issues.push(`question ${q.id}: ${q.status}`);
  try { issues.push(...integrationIssues(root)); } catch { issues.push('Configured integration state is invalid; preserve and reconcile it.'); }
  if (state.paused) issues.push('Onboarding is paused.');
  return { ready: !issues.length, issues };
}
