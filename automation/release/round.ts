import { digest, evidence, load, requireText, save, verifyEvidence, withLock, type Evidence } from '../shared/store.js';
import { identifier, indexById, pinned, readLibrary, references } from './library.js';

export interface Target { buildId: string; environment: string }
interface Obligation {
  id: string; moduleId: string; testTypeId: string; conditionId: string;
  state: 'required' | 'excluded' | 'unresolved'; checkIds: string[];
  reason?: string; decision?: Evidence; exceptionAllowed?: boolean;
}
export interface Round {
  schemaVersion: 1; id: string; library: Evidence; scope: Evidence; changes: Evidence;
  target: Target; assignmentIds: string[]; moduleIds: string[]; obligations: Obligation[];
}
type Outcome = 'Pass' | 'Fail' | 'Blocked' | 'Partial' | 'Not run';
interface Observation {
  checkId: string; conditionId: string; outcome: Outcome; evidence: Evidence[];
  note?: string; previousRunId?: string;
}
export interface Run {
  schemaVersion: 1; id: string; round: Evidence; target: Target;
  observedAt: string; targetEvidence: Evidence; observations: Observation[];
}
export interface AssessmentInput { round: Evidence; runs: Evidence[] }

export function sameTarget(a: Target | undefined, b: Target | undefined) {
  return Boolean(a && b && a.buildId === b.buildId && a.environment === b.environment);
}

function checkTarget(target: Target) {
  requireText(target?.buildId, 'Build identity');
  requireText(target.environment, 'Target environment');
}

function readRound(root: string, ref: Evidence) {
  const round = pinned<Round>(root, ref, 'testing round');
  if (round?.schemaVersion !== 1) throw new Error('Use a version 1 testing round.');
  identifier(round.id, 'round');
  checkTarget(round.target);
  if (!Array.isArray(round.assignmentIds) || !round.assignmentIds.length || new Set(round.assignmentIds).size !== round.assignmentIds.length) {
    throw new Error('Identify the distinct assignments in this round.');
  }
  for (const id of round.assignmentIds) requireText(id, 'Assignment identity');
  verifyEvidence(root, round.scope);
  verifyEvidence(root, round.changes);
  const catalogue = readLibrary(root, round.library);
  references(round.moduleIds, catalogue.modules, 'in-scope module');
  const obligations = indexById(round.obligations, 'release obligation');
  const coordinates = new Set<string>();
  const required = new Set<string>();
  const scopedModules = new Set(round.moduleIds);
  for (const obligation of obligations.values()) {
    const { moduleId, testTypeId, conditionId, state } = obligation;
    const module = catalogue.modules.get(moduleId);
    const coordinate = `${moduleId}/${testTypeId}/${conditionId}`;
    if (!scopedModules.has(moduleId) || !module?.testTypeIds.includes(testTypeId) || !module.conditionIds.includes(conditionId) ||
        coordinates.has(coordinate) || !['required', 'excluded', 'unresolved'].includes(state) ||
        obligation.exceptionAllowed !== undefined && typeof obligation.exceptionAllowed !== 'boolean') {
      throw new Error(`Review scope and applicability for obligation ${obligation.id}.`);
    }
    coordinates.add(coordinate);
    if (state !== 'required') {
      requireText(obligation.reason, 'Applicability reason');
      if (!Array.isArray(obligation.checkIds) || obligation.checkIds.length) throw new Error('Use an empty check list for exclusions and unresolved obligations.');
      if (state === 'excluded') verifyEvidence(root, obligation.decision!);
      continue;
    }
    references(obligation.checkIds, catalogue.checksByArea.get(`${moduleId}/${testTypeId}`) ?? new Set(), 'applicable check', true);
    for (const checkId of obligation.checkIds) {
      if (!catalogue.checks.get(checkId)!.conditionIds.includes(conditionId)) throw new Error(`Check ${checkId} does not cover condition ${conditionId}.`);
      required.add(`${checkId}/${conditionId}`);
    }
  }
  return { round, catalogue, required };
}

function readRun(root: string, ref: Evidence, scope: ReturnType<typeof readRound>, roundRef: Evidence) {
  const run = pinned<Run>(root, ref, 'test run');
  if (run?.schemaVersion !== 1) throw new Error('Use a version 1 test run.');
  identifier(run.id, 'run');
  if (run.round?.path !== roundRef.path || run.round.sha256 !== roundRef.sha256 || !sameTarget(run.target, scope.round.target)) {
    throw new Error('The run belongs to another round, build, or environment.');
  }
  if (typeof run.observedAt !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(run.observedAt) || !Number.isFinite(Date.parse(run.observedAt))) throw new Error('Record the observed run time with a timezone.');
  const observed = pinned<Target & { observedAt: string; source: string }>(root, run.targetEvidence, 'observed run target');
  if (!sameTarget(observed, run.target) || !Number.isFinite(Date.parse(observed.observedAt)) ||
      Date.parse(observed.observedAt) > Date.parse(run.observedAt)) throw new Error('The run must match its observed target and timing.');
  requireText(observed.source, 'Actual target observation source');
  if (!Array.isArray(run.observations) || !run.observations.length) throw new Error('Record the actual check observations.');
  const seen = new Set<string>();
  for (const observation of run.observations) {
    const key = `${observation.checkId}/${observation.conditionId}`;
    if (!scope.required.has(key) || seen.has(key) || !['Pass', 'Fail', 'Blocked', 'Partial', 'Not run'].includes(observation.outcome) || !Array.isArray(observation.evidence)) {
      throw new Error('Record distinct check and condition outcomes from the reviewed scope.');
    }
    seen.add(key);
    if (['Pass', 'Fail', 'Partial'].includes(observation.outcome) && !observation.evidence.length) throw new Error('Link evidence for the observed check outcome.');
    if (['Partial', 'Blocked', 'Not run'].includes(observation.outcome)) requireText(observation.note, 'Outcome reason');
    for (const item of observation.evidence) verifyEvidence(root, item);
  }
  return run;
}

export function assessRound(root: string, input: AssessmentInput) {
  const scope = readRound(root, input.round), { round, catalogue } = scope;
  if (!Array.isArray(input.runs)) throw new Error('Supply the run references for this round.');
  const eligible: { ref: Evidence; run: Run }[] = [];
  const ineligible: { ref: Evidence; reason: string }[] = [];
  const supplied = new Set<string>();
  for (const ref of input.runs) {
    if (supplied.has(ref.sha256)) throw new Error('Supply each run once.');
    supplied.add(ref.sha256);
    try { eligible.push({ ref, run: readRun(root, ref, scope, input.round) }); }
    catch (error) { ineligible.push({ ref, reason: error instanceof Error ? error.message : 'Run evidence needs review.' }); }
  }
  indexById(eligible.map(({ run }) => run), 'run');
  const attempts = new Map<string, { runId: string; observedAt: string; observation: Observation }[]>();
  const executions = new Set<string>();
  for (const { run } of eligible) for (const observation of run.observations) {
    const key = `${observation.checkId}/${observation.conditionId}`;
    const rows = attempts.get(key) ?? [];
    rows.push({ runId: run.id, observedAt: run.observedAt, observation });
    attempts.set(key, rows);
    if (['Pass', 'Fail', 'Partial'].includes(observation.outcome)) executions.add(`${run.id}/${observation.checkId}`);
  }
  const current = new Map<string, Outcome>();
  const precedence: Outcome[] = ['Fail', 'Blocked', 'Partial', 'Not run', 'Pass'];
  for (const [key, rows] of attempts) {
    const superseded = new Set<string>();
    for (const row of rows) if (row.observation.previousRunId !== undefined) {
      const prior = rows.find(candidate => candidate.runId === row.observation.previousRunId);
      if (!prior || Date.parse(prior.observedAt) >= Date.parse(row.observedAt)) throw new Error(`Retest for ${key} must reference an earlier eligible observation in this round.`);
      if (['Pass', 'Fail'].includes(row.observation.outcome)) superseded.add(prior.runId);
    }
    const outcomes = rows.filter(row => !superseded.has(row.runId)).map(row => row.observation.outcome);
    current.set(key, precedence.find(outcome => outcomes.includes(outcome))!);
  }
  const findings = round.obligations.map(obligation => {
    const checks = obligation.checkIds.map(id => {
      const key = `${id}/${obligation.conditionId}`;
      return { id, outcome: current.get(key) ?? 'Not run', attempts: attempts.get(key) ?? [] };
    });
    const outcome = obligation.state === 'required'
      ? checks.length ? precedence.find(status => checks.some(check => check.outcome === status))! : 'Missing check'
      : obligation.state;
    return { ...obligation, outcome, checks };
  });
  const gaps = findings.filter(item => !['Pass', 'excluded'].includes(item.outcome))
    .map(({ id, outcome, state, exceptionAllowed }) => ({ id, outcome, exceptionAllowed: state === 'required' && exceptionAllowed === true }));
  for (const moduleId of round.moduleIds) {
    const module = catalogue.modules.get(moduleId)!;
    const scoped = round.obligations.filter(item => item.moduleId === moduleId);
    for (const id of module.conditionIds) if (!scoped.some(item => item.conditionId === id)) gaps.push({ id: `${moduleId}/condition/${id}`, outcome: 'Missing scope decision', exceptionAllowed: false });
    for (const id of module.testTypeIds) if (!scoped.some(item => item.testTypeId === id)) gaps.push({ id: `${moduleId}/type/${id}`, outcome: 'Missing scope decision', exceptionAllowed: false });
  }
  return {
    roundId: round.id, projectId: catalogue.library.projectId, target: round.target, library: round.library,
    scope: round.scope, changes: round.changes, assignmentIds: round.assignmentIds, runs: eligible.map(({ ref, run }) => ({ id: run.id, ref })),
    ineligible, uniqueCheckExecutions: executions.size, gaps,
    outOfScopeModuleIds: [...catalogue.modules.keys()].filter(id => !round.moduleIds.includes(id)),
    modules: round.moduleIds.map(moduleId => {
      const module = catalogue.modules.get(moduleId)!;
      return {
        id: moduleId, name: module.name,
        testTypes: module.testTypeIds.map(testTypeId => {
          const obligations = findings.filter(item => item.moduleId === moduleId && item.testTypeId === testTypeId);
          const suites = catalogue.library.suites.filter(suite => suite.moduleId === moduleId && suite.testTypeId === testTypeId);
          return {
            ...catalogue.types.get(testTypeId)!, obligations,
            suites: suites.map(suite => ({
              id: suite.id,
              checks: suite.checkIds.map(checkId => ({
                id: checkId, name: catalogue.checks.get(checkId)!.name,
                results: obligations.flatMap(obligation => obligation.checks.filter(check => check.id === checkId).map(check => ({
                  obligationId: obligation.id, conditionId: obligation.conditionId, outcome: check.outcome,
                  runIds: check.attempts.map(attempt => attempt.runId),
                }))),
              })),
            })),
          };
        }),
      };
    }),
    state: gaps.length ? 'gaps' : 'evidenceReady',
  };
}

export function recordAssessment(root: string, input: AssessmentInput) {
  return withLock(root, 'release-records', () => {
    const report = assessRound(root, input);
    verifyRunSet(root, input);
    if (report.ineligible.length) throw new Error('Reconcile unavailable or changed retained run evidence before recording the assessment.');
    const record = { schemaVersion: 1, input, report };
    const path = `.local/qa-release/assessment-${digest(JSON.stringify(record))}.json`;
    const existing = load<unknown>(root, path, () => null);
    if (existing.revision === null) save(root, path, record, null);
    else if (JSON.stringify(existing.value) !== JSON.stringify(record)) throw new Error('The stored release assessment changed.');
    return { assessment: evidence(root, path), report };
  });
}

function runIndex(root: string, round: Evidence) {
  if (!/^[a-f0-9]{64}$/.test(round.sha256)) throw new Error('Supply the pinned testing round reference.');
  const path = `.local/qa-release/runs-${round.sha256}.json`;
  const current = load<{ schemaVersion: 1; runs: { id: string; ref: Evidence }[] }>(root, path, () => ({ schemaVersion: 1, runs: [] }));
  if (current.value?.schemaVersion !== 1) throw new Error('Use a version 1 round run index.');
  indexById(current.value.runs, 'retained run');
  return { path, ...current };
}

export function retainRun(root: string, input: { round: Evidence; run: Evidence }) {
  return withLock(root, 'release-records', () => {
    const scope = readRound(root, input.round), run = readRun(root, input.run, scope, input.round);
    const index = runIndex(root, input.round);
    const old = index.value.runs.find(row => row.id.toLowerCase() === run.id.toLowerCase());
    if (old) {
      if (old.ref.path !== input.run.path || old.ref.sha256 !== input.run.sha256) throw new Error('Retain the earlier run. Give the new attempt a distinct run ID.');
    } else {
      index.value.runs.push({ id: run.id, ref: input.run });
      save(root, index.path, index.value, index.revision);
    }
    return { round: input.round, runs: index.value.runs.map(row => row.ref) };
  });
}

export function retainedRuns(root: string, round: Evidence) {
  readRound(root, round);
  return { round, runs: runIndex(root, round).value.runs.map(row => row.ref) };
}

function verifyRunSet(root: string, input: AssessmentInput) {
  const retained = runIndex(root, input.round).value.runs;
  if (input.runs.length !== retained.length || retained.some(({ ref }) =>
    !input.runs.some(run => run.path === ref.path && run.sha256 === ref.sha256))) {
    throw new Error('Use every retained run for this round. Refresh the release assessment after a new run.');
  }
}

export function verifyAssessment(root: string, ref: Evidence, currentRunSet = false) {
  const record = pinned<{ schemaVersion: 1; input: AssessmentInput; report: ReturnType<typeof assessRound> }>(root, ref, 'release assessment');
  if (record?.schemaVersion !== 1) throw new Error('Use a version 1 release assessment.');
  if (currentRunSet) verifyRunSet(root, record.input);
  const actual = assessRound(root, record.input);
  if (JSON.stringify(record.report) !== JSON.stringify(actual)) throw new Error('The release evidence changed. Review the assessment again.');
  return actual;
}
