import { load, save, requireText, verifyEvidence, type Evidence } from '../shared/store.js';
import { integrationStatus } from './integrations.js';

export const stages = ['project', 'contextRoute', 'tools', 'email', 'access', 'understanding', 'operation', 'handoff'] as const;
export type Stage = typeof stages[number];
export const mandatoryCheckpoints: ReadonlySet<Stage> = new Set(['project', 'contextRoute', 'understanding', 'operation', 'handoff']);
export const labels: Record<Stage, string> = {
  project: 'Establish the project, environments and owners', contextRoute: 'Choose how context is established',
  tools: 'Verify existing tools and prepare missing browser, API and GitHub capabilities', email: 'Reuse or prepare a verification mailbox when needed',
  access: 'Establish application access', understanding: 'Build and review initial project/product understanding',
  operation: 'Choose the task source and configure check-ins, PR triggers and reporting', handoff: 'Verify readiness and explain how work begins',
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
export function assessReadiness(root: string, state: SetupState, includeHandoff = true) {
  validateState(state);
  const findings: { stage: Stage; message: string; next: string }[] = [];
  const deferredChecks: { stage: Stage; label: string; reason: string; next: string }[] = [];
  const report = (stage: Stage, message: string, next = message) => { findings.push({ stage, message, next }); };
  for (const stage of stages.filter(s => includeHandoff || s !== 'handoff')) {
    const check = state.checks[stage];
    const optional = !mandatoryCheckpoints.has(stage);
    if (!optional && ['deferred', 'notApplicable'].includes(check.status)) {
      report(stage, `${labels[stage]} is required. Record the scope and any open questions.`);
      continue;
    }
    if (optional && check.status === 'deferred' && check.reason?.trim()) {
      deferredChecks.push({ stage, label: labels[stage], reason: check.reason, next: check.nextAction ?? 'Verify this capability when an assigned task needs it.' });
      continue;
    }
    if (!['verified', 'notApplicable'].includes(check.status)) {
      const next = stage === 'handoff' ? 'Prepare the scoped handoff and submit its evidence with onboarding finish.'
        : optional && check.status === 'pending' ? 'Verify what the project needs now, or record why this checkpoint can wait.'
        : 'Inspect existing sources and prepare the missing evidence for this checkpoint.';
      report(stage, `${stage}: ${check.nextAction ?? check.reason ?? check.status}`, check.nextAction ?? check.reason ?? next);
    }
    if (check.status === 'notApplicable' && !check.reason) report(stage, `${stage}: a non-applicability reason is required`);
    if (check.status === 'verified' && (!check.evidence.length || !check.checkedAt)) report(stage, `${stage}: observed evidence is required`);
    for (const ref of check.evidence) {
      try { verifyEvidence(root, ref); }
      catch {
        const location = ref?.path ? ` at ${ref.path}` : '';
        report(stage, `${stage}: evidence changed or is unavailable`, `Revalidate the changed or unavailable evidence${location} before continuing.`);
      }
    }
  }
  for (const name of ['business', 'product', 'technical', 'design', 'decisions']) {
    const domain = state.domains.find(d => d.domain === name);
    if (!domain || !domain.owner?.trim()) report('understanding', `${name}: record knowledge, an owner question or justified non-applicability`);
    else {
      if (!['documented', 'gap', 'notApplicable'].includes(domain.state)) report('understanding', `${name}: invalid context state`);
      if (domain.state === 'documented' && !domain.sources.length) report('understanding', `${name}: source evidence is missing`);
      if (domain.state === 'gap' && !domain.questionReference) report('understanding', `${name}: link the original owner question`);
      if (domain.state === 'notApplicable' && !domain.reason) report('understanding', `${name}: explain non-applicability`);
      for (const ref of domain.sources) {
        try { verifyEvidence(root, ref); }
        catch {
          const location = ref?.path ? ` at ${ref.path}` : '';
          report('understanding', `${name}: source evidence changed`, `Revalidate the ${name} source${location} before continuing.`);
        }
      }
    }
  }
  for (const q of state.questions) if (q.required && q.status !== 'answered') report(q.stage, `question ${q.id}: ${q.status}`);
  let capabilityIssues: string[] = [];
  try {
    const integrations = integrationStatus(root);
    for (const { stage, message } of integrations.stageIssues) report(stage, message);
    capabilityIssues = integrations.capabilityIssues;
  } catch { report('operation', 'Project integration state is invalid; preserve and reconcile it.'); }
  const issues = findings.map(finding => finding.message);
  if (state.paused) issues.push('Onboarding is paused.');
  const stage = stages.find(stage => findings.some(finding => finding.stage === stage));
  const blocker = findings.find(finding => finding.stage === stage);
  return { status: { ready: !issues.length, issues, capabilityIssues, deferredChecks }, blocker };
}
export function readiness(root: string, state: SetupState, includeHandoff = true) {
  return assessReadiness(root, state, includeHandoff).status;
}
