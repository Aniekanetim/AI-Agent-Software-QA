import { assertNonsecret, requireText, verifyEvidence, type Evidence } from '../shared/store.js';

export interface Condition {
  id: string; group: string; basisId: string; basisState: 'accepted' | 'risk' | 'unresolved';
  definition: string; applicability: 'included' | 'excluded' | 'notApplicable'; reason?: string;
}
export interface Check {
  id: string; conditionIds: string[]; interface: string; objectives: string[];
  perspectives: ('positive' | 'negative' | 'edge')[]; techniques: string[]; rationale: string;
}
export interface Observation {
  checkId: string; outcome: 'Pass' | 'Fail' | 'Partial' | 'Blocked' | 'Not run';
  exercisedConditionIds: string[]; evidence: Evidence[]; note?: string;
}
export interface CoverageSnapshot {
  schemaVersion: 1; scopeId: string; scopeRevision: string; targetBuild: string | null;
  sourceRecords: Evidence[]; conditions: Condition[]; checks: Check[];
  execution: null | { runId: string; observedAt: string; scopeRevision: string; targetBuild: string | null; results: Observation[] };
}

function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function list(value: unknown, label: string): asserts value is unknown[] {
  ensure(Array.isArray(value), `${label} must be an array.`);
}
function strings(value: unknown, label: string, nonempty = true): asserts value is string[] {
  list(value, label);
  ensure(!nonempty || value.length, `${label} requires at least one item.`);
  for (const item of value) requireText(item, label);
  ensure(new Set(value).size === value.length, `${label} contains duplicate values.`);
}
function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  ensure(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
}
function build(value: unknown): void {
  if (value !== null) requireText(value, 'Build identity; use null when undisclosed');
}

/** Read-only structural assessment of supplied records, never an execution or approval. */
export function assessCoverage(root: string, snapshot: CoverageSnapshot) {
  record(snapshot, 'Snapshot'); assertNonsecret(snapshot);
  ensure(snapshot.schemaVersion === 1, 'Unsupported coverage snapshot; preserve and migrate it explicitly.');
  requireText(snapshot.scopeId, 'Scope ID'); requireText(snapshot.scopeRevision, 'Scope revision'); build(snapshot.targetBuild);
  list(snapshot.conditions, 'Conditions'); list(snapshot.checks, 'Checks'); list(snapshot.sourceRecords, 'Source records');
  const issues: string[] = [];
  function references(refs: Evidence[], label: string) {
    list(refs, label);
    for (const ref of refs) {
      record(ref, label); requireText(ref.path, 'Evidence path');
      ensure(typeof ref.sha256 === 'string' && /^[a-f0-9]{64}$/.test(ref.sha256), 'Evidence requires a SHA-256 reference.');
      if (ref.pointer !== undefined) requireText(ref.pointer, 'Evidence pointer');
      try { verifyEvidence(root, ref); }
      catch { issues.push(`${label}: missing or changed reference ${ref.path}; review affected coverage before reuse.`); }
    }
  }
  references(snapshot.sourceRecords, 'Source records');
  const conditions = new Map<string, Condition>();
  for (const condition of snapshot.conditions) {
    record(condition, 'Condition');
    for (const field of ['id', 'group', 'basisId', 'definition'] as const) requireText(condition[field], `Condition ${field}`);
    ensure(!conditions.has(condition.id), `Duplicate condition ID ${condition.id}.`);
    ensure(['accepted', 'risk', 'unresolved'].includes(condition.basisState), 'Invalid condition basis state.');
    ensure(['included', 'excluded', 'notApplicable'].includes(condition.applicability), 'Invalid condition applicability.');
    if (condition.applicability !== 'included') requireText(condition.reason, 'Exclusion/non-applicability reason and decision reference');
    conditions.set(condition.id, condition);
  }
  const checks = new Map<string, Check>(), designed = new Set<string>();
  for (const check of snapshot.checks) {
    record(check, 'Check'); requireText(check.id, 'Check ID'); requireText(check.interface, 'Interface'); requireText(check.rationale, 'Selection rationale');
    ensure(!checks.has(check.id), `Duplicate check ID ${check.id}.`);
    strings(check.conditionIds, 'Check condition IDs'); strings(check.objectives, 'Objectives'); strings(check.techniques, 'Techniques');
    strings(check.perspectives, 'Perspectives', false);
    ensure(check.perspectives.every(p => ['positive', 'negative', 'edge'].includes(p)), 'Invalid scenario perspective; record exploration as a technique or charter.');
    for (const id of check.conditionIds) {
      ensure(conditions.has(id), `Unknown condition ${id}.`);
      ensure(conditions.get(id)!.applicability === 'included', `Check targets excluded/non-applicable condition ${id}.`);
      designed.add(id);
    }
    checks.set(check.id, check);
  }
  const results = new Map<string, Observation>(), exercised = new Set<string>();
  if (snapshot.execution !== null) {
    const execution = snapshot.execution;
    record(execution, 'Execution'); requireText(execution.runId, 'Run ID'); requireText(execution.scopeRevision, 'Execution scope revision');
    requireText(execution.observedAt, 'Observation time');
    ensure(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(execution.observedAt) && Number.isFinite(Date.parse(execution.observedAt)), 'Observation time must identify a date/time and timezone.');
    build(execution.targetBuild); list(execution.results, 'Results');
    ensure(snapshot.sourceRecords.length > 0, 'Execution requires references to its canonical source and result records.');
    if (execution.scopeRevision !== snapshot.scopeRevision) issues.push('Scope revision changed; retain the run as historical and assess impact.');
    if (execution.targetBuild !== snapshot.targetBuild) issues.push('Target build changed; historical execution does not verify the current target.');
    for (const result of execution.results) {
      record(result, 'Result'); requireText(result.checkId, 'Result check ID');
      ensure(checks.has(result.checkId), `Unknown result check ${result.checkId}.`);
      ensure(!results.has(result.checkId), `Duplicate result for ${result.checkId}; select a distinct run instead of merging attempts.`);
      ensure(['Pass', 'Fail', 'Partial', 'Blocked', 'Not run'].includes(result.outcome), 'Invalid execution outcome.');
      strings(result.exercisedConditionIds, 'Exercised condition IDs', false); references(result.evidence, `Result ${result.checkId}`);
      const check = checks.get(result.checkId)!;
      for (const id of result.exercisedConditionIds) ensure(check.conditionIds.includes(id), `Result exercises unlinked condition ${id}.`);
      if (['Pass', 'Fail', 'Partial'].includes(result.outcome)) {
        ensure(result.evidence.length > 0 && result.exercisedConditionIds.length > 0, 'Executed checks require actual evidence and exercised conditions.');
      } else ensure(!result.exercisedConditionIds.length, 'Blocked/not-run checks cannot imply exercised coverage; use Partial for observed work.');
      if (['Pass', 'Fail'].includes(result.outcome)) {
        ensure(!check.conditionIds.some(id => conditions.get(id)!.basisState === 'unresolved'), 'Unresolved intent cannot support a correctness Pass/Fail; retain observations as Partial.');
      }
      if (result.outcome === 'Pass') ensure(result.exercisedConditionIds.length === check.conditionIds.length, 'A passing check must exercise all its linked conditions; use Partial otherwise.');
      if (['Partial', 'Blocked', 'Not run'].includes(result.outcome)) requireText(result.note, 'Partial/blocker/not-run explanation');
      result.exercisedConditionIds.forEach(id => exercised.add(id));
      results.set(result.checkId, result);
    }
  }
  const included = snapshot.conditions.filter(c => c.applicability === 'included');
  const itemCounts = (items: Condition[]) => {
    const completed = items.filter(c => exercised.has(c.id)).length;
    return { included: items.length, designed: items.filter(c => designed.has(c.id)).length, exercised: completed,
      notExercised: items.length - completed, unresolved: items.filter(c => c.basisState === 'unresolved').length,
      exercisedPercent: items.length ? 100 * completed / items.length : null };
  };
  const outcomeCount = (outcome: Observation['outcome']) => [...results.values()].filter(r => r.outcome === outcome).length;
  const recordedCounts = { conditions: { ...itemCounts(included), excluded: snapshot.conditions.filter(c => c.applicability === 'excluded').length,
      notApplicable: snapshot.conditions.filter(c => c.applicability === 'notApplicable').length },
    checks: { planned: checks.size, executed: outcomeCount('Pass') + outcomeCount('Fail') + outcomeCount('Partial'),
      pass: outcomeCount('Pass'), fail: outcomeCount('Fail'), partial: outcomeCount('Partial'), blocked: outcomeCount('Blocked'),
      notRun: checks.size - results.size + outcomeCount('Not run') },
    groups: [...new Set(included.map(c => c.group))].map(group => ({ group, ...itemCounts(included.filter(c => c.group === group)) })) };
  return { scopeId: snapshot.scopeId, scopeRevision: snapshot.scopeRevision, targetBuild: snapshot.targetBuild,
    runId: snapshot.execution?.runId ?? null, revisionIdentified: snapshot.targetBuild !== null,
    status: issues.length ? 'needsReview' : snapshot.execution ? 'recorded' : 'planning', issues,
    limits: ['Structural assessment of supplied records only; source meaning, authorization and observed behavior require review.',
      ...(snapshot.targetBuild === null ? ['Served build identity is undisclosed; no exact-revision verification is established.'] : []),
      ...(included.some(c => c.basisState === 'unresolved') ? ['Unresolved intended behavior remains a coverage gap.'] : [])],
    recordedCounts, currentCoverage: issues.length ? null : recordedCounts, productVerdict: 'Not assessed' };
}
