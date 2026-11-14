import { digest, evidence, load, requireText, sameEvidence, save, verifyEvidence, withLock, type Evidence } from '../shared/store.js';
import { identifier, indexById, pinned, readLibrary, references } from './library.js';
import { caseResult, readCaseBatch } from '../execution/cases.js';

export interface Target { buildId: string; environment: string }
interface CoverageCoordinate { moduleId: string; testTypeId: string; conditionId: string }
interface Applicability {
  schemaVersion: 1; library: Evidence;
  modules: { id: string; owner: string; decision: Evidence; coordinates: (CoverageCoordinate & {
    state: 'required' | 'excluded' | 'unresolved'; reason: string; basis: Evidence;
  })[] }[];
}
const coverageKey = ({ moduleId, testTypeId, conditionId }: CoverageCoordinate) => `${moduleId}/${testTypeId}/${conditionId}`;
interface Obligation {
  id: string; moduleId: string; testTypeId: string; conditionId: string;
  state: 'required' | 'excluded' | 'unresolved'; checkIds: string[];
  reason?: string; decision?: Evidence; exceptionAllowed?: boolean;
}
export interface Round {
  schemaVersion: 1; id: string; library: Evidence; scope: Evidence; changes: Evidence;
  target: Target; assignmentIds: string[]; moduleIds: string[]; obligations: Obligation[];
  caseBatches?: Evidence[];
  applicability?: Evidence;
}
type Outcome = 'Pass' | 'Fail' | 'Blocked' | 'Partial' | 'Not run';
interface Observation {
  checkId: string; conditionId: string; outcome: Outcome; evidence: Evidence[];
  note?: string; previousRunId?: string; context?: Evidence;
  caseExecution?: { receipt: Evidence; caseId: string };
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

export function readRound(root: string, ref: Evidence) {
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
  if (round.caseBatches) {
    if (!Array.isArray(round.caseBatches) || !round.caseBatches.length) throw new Error('Pin the case batches covering this round.');
    const covered = new Set<string>();
    for (const ref of round.caseBatches) {
      const { batch, cases } = readCaseBatch(root, ref);
      if (!sameTarget(batch.target, round.target) || !round.assignmentIds.includes(batch.assignment.ticketId)) {
        throw new Error('Case batches must cover the approved round assignments and target.');
      }
      for (const item of cases.values()) {
        const key = `${item.checkId}/${item.conditionId}`;
        if (!required.has(key) || !sameEvidence(item.definition, catalogue.checks.get(item.checkId)?.definition)) {
          throw new Error('Match approved cases to the round check definitions and conditions.');
        }
        covered.add(key);
      }
    }
    if ([...required].some(key => !covered.has(key))) throw new Error('Every required check and condition needs an approved case in the round.');
  }
  const applicability = round.applicability ? pinned<Applicability>(root, round.applicability, 'reviewed coverage applicability') : undefined;
  const missingCoverage: string[] = [];
  if (applicability) {
    if (applicability.schemaVersion !== 1 || !sameEvidence(applicability.library, round.library)) {
      throw new Error('Use independently reviewed coverage applicability for this library revision.');
    }
    const modules = indexById(applicability.modules, 'applicability module');
    const supplied = new Map(round.obligations.map(row => [coverageKey(row), row]));
    for (const moduleId of round.moduleIds) {
      const reviewed = modules.get(moduleId);
      if (!reviewed) { missingCoverage.push(`${moduleId}/applicability`); continue; }
      const module = catalogue.modules.get(moduleId)!;
      requireText(reviewed.owner, 'Coverage decision owner');
      verifyEvidence(root, reviewed.decision);
      if (!Array.isArray(reviewed.coordinates) || !reviewed.coordinates.length) throw new Error('Record the reviewed coverage coordinates.');
      const seen = new Set<string>();
      for (const coordinate of reviewed.coordinates) {
        const key = coverageKey(coordinate);
        if (coordinate.moduleId !== moduleId || !module.testTypeIds.includes(coordinate.testTypeId) ||
            !module.conditionIds.includes(coordinate.conditionId) || seen.has(key) ||
            !['required', 'excluded', 'unresolved'].includes(coordinate.state)) throw new Error(`Review coverage applicability for ${key}.`);
        seen.add(key);
        requireText(coordinate.reason, 'Coverage applicability reason');
        verifyEvidence(root, coordinate.basis);
        const obligation = supplied.get(key);
        if (!obligation || obligation.state !== coordinate.state) missingCoverage.push(key);
      }
      for (const [key, row] of supplied) if (row.moduleId === moduleId && !seen.has(key)) missingCoverage.push(key);
    }
  }
  return { round, catalogue, required, missingCoverage };
}

function readRun(root: string, ref: Evidence, scope: ReturnType<typeof readRound>, roundRef: Evidence, current = false, chronology = true) {
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
    if (observation.context) verifyEvidence(root, observation.context);
    const execution = observation.caseExecution;
    if (scope.round.caseBatches && ['Pass', 'Fail'].includes(observation.outcome) && !execution) {
      throw new Error('Retain the settled case checkpoint evidence for each conclusive verdict. Aggregate runner output cannot support it.');
    }
    if (execution) {
      const result = caseResult(root, execution.receipt, execution.caseId, { ...observation, target: run.target }, current);
      if (chronology && (result.targetObservedAt > Date.parse(run.observedAt) ||
          result.checkpointObservedAt > Date.parse(run.observedAt))) {
        throw new Error('The case target or checkpoint was observed after the claimed run outcome.');
      }
      if (scope.round.caseBatches && !scope.round.caseBatches.some(batch => sameEvidence(batch, result.batch))) {
        throw new Error('The case verdict came from a different approved batch.');
      }
      if (!scope.round.assignmentIds.includes(result.assignment.ticketId) ||
          !sameEvidence(result.design.definition, scope.catalogue.checks.get(observation.checkId)?.definition)) {
        throw new Error('The case result must cover the exact assignment and check definition.');
      }
    }
  }
  return run;
}

export function assessRound(root: string, input: AssessmentInput, reportVersion: 1 | 2 | 3 = 3) {
  const scope = readRound(root, input.round), { round, catalogue } = scope;
  if (!Array.isArray(input.runs)) throw new Error('Supply the run references for this round.');
  const eligible: { ref: Evidence; run: Run }[] = [];
  const ineligible: { ref: Evidence; reason: string }[] = [];
  const supplied = new Set<string>();
  for (const ref of input.runs) {
    if (supplied.has(ref.sha256)) throw new Error('Supply each run once.');
    supplied.add(ref.sha256);
    try { eligible.push({ ref, run: readRun(root, ref, scope, input.round, false, reportVersion >= 3) }); }
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
    if (['Pass', 'Fail', 'Partial'].includes(observation.outcome)) {
      const execution = reportVersion >= 3 ? observation.caseExecution : undefined;
      executions.add(execution
        ? `case:${execution.receipt.sha256}/${execution.caseId}`
        : `run:${run.id}/${observation.checkId}`);
    }
  }
  const current = new Map<string, Outcome>();
  const precedence: Outcome[] = ['Fail', 'Blocked', 'Partial', 'Not run', 'Pass'];
  for (const [key, rows] of attempts) {
    const superseded = new Set<string>();
    for (const row of rows) if (row.observation.previousRunId !== undefined) {
      const prior = rows.find(candidate => candidate.runId === row.observation.previousRunId);
      if (!prior || Date.parse(prior.observedAt) >= Date.parse(row.observedAt)) throw new Error(`Retest for ${key} must reference an earlier eligible observation in this round.`);
      const currentCase = row.observation.caseExecution, previousCase = prior.observation.caseExecution;
      if (reportVersion >= 3 && currentCase && previousCase && currentCase.caseId === previousCase.caseId &&
          currentCase.receipt.sha256 === previousCase.receipt.sha256) {
        throw new Error(`Use a distinct case execution for the reviewed retest of ${key}.`);
      }
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
  if (reportVersion >= 3) {
    for (const id of scope.missingCoverage) gaps.push({ id, outcome: 'Missing or conflicting coverage applicability', exceptionAllowed: false });
    if (round.caseBatches && !round.applicability) gaps.push({ id: 'round/applicability', outcome: 'Missing reviewed coverage applicability', exceptionAllowed: false });
  }
  if (reportVersion >= 2 && !executions.size) gaps.push({ id: 'round/execution', outcome: 'No checks executed', exceptionAllowed: false });
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
    const record = { schemaVersion: 3, input, report };
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
      for (const observation of run.observations) {
        if (observation.previousRunId === undefined) continue;
        const prior = index.value.runs.find(row => row.id === observation.previousRunId);
        if (!prior) throw new Error('Retain the earlier run before recording its retest.');
        const earlier = readRun(root, prior.ref, scope, input.round);
        if (Date.parse(earlier.observedAt) >= Date.parse(run.observedAt) || !earlier.observations.some(item =>
          item.checkId === observation.checkId && item.conditionId === observation.conditionId &&
          (!observation.caseExecution || !item.caseExecution || observation.caseExecution.caseId !== item.caseExecution.caseId ||
            observation.caseExecution.receipt.sha256 !== item.caseExecution.receipt.sha256))) {
          throw new Error('Link the retest to an earlier eligible observation for the same check and condition.');
        }
      }
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

export function retainedRun(root: string, round: Evidence, ref: Evidence) {
  if (!runIndex(root, round).value.runs.some(row => row.ref.path === ref.path && row.ref.sha256 === ref.sha256 && !ref.pointer)) {
    throw new Error('Link a retained source run for these observations.');
  }
  const scope = readRound(root, round);
  return { run: readRun(root, ref, scope, round), catalogue: scope.catalogue };
}

function verifyRunSet(root: string, input: AssessmentInput) {
  const retained = runIndex(root, input.round).value.runs;
  if (input.runs.length !== retained.length || retained.some(({ ref }) =>
    !input.runs.some(run => run.path === ref.path && run.sha256 === ref.sha256))) {
    throw new Error('Use every retained run for this round. Refresh the release assessment after a new run.');
  }
}

export function verifyAssessment(root: string, ref: Evidence, currentRunSet = false, expectedRound?: Evidence) {
  const record = pinned<{ schemaVersion: 1 | 2 | 3; input: AssessmentInput; report: ReturnType<typeof assessRound> }>(root, ref, 'release assessment');
  if (record?.schemaVersion !== 1 && record?.schemaVersion !== 2 && record?.schemaVersion !== 3) throw new Error('Use a supported release assessment.');
  if (expectedRound && (record.input.round.path !== expectedRound.path || record.input.round.sha256 !== expectedRound.sha256)) {
    throw new Error('Use the assessment for this assignment’s current reviewed release round.');
  }
  if (currentRunSet) {
    verifyRunSet(root, record.input);
    const scope = readRound(root, record.input.round);
    if (scope.round.caseBatches && (!scope.round.applicability || record.schemaVersion !== 3)) {
      throw new Error('Refresh current release scope and assessment with independently reviewed coverage applicability.');
    }
    if (scope.round.caseBatches) for (const run of record.input.runs) readRun(root, run, scope, record.input.round, true);
  }
  const actual = assessRound(root, record.input, record.schemaVersion);
  if (JSON.stringify(record.report) !== JSON.stringify(actual)) throw new Error('The release evidence changed. Review the assessment again.');
  if (currentRunSet && actual.ineligible.length) throw new Error('Reconcile the ineligible retained run evidence before sign-off.');
  return actual;
}

export function verifyCurrentCaseEvidence(root: string, assessment: Evidence) {
  const { input } = pinned<{ input: AssessmentInput }>(root, assessment, 'current release assessment');
  const scope = readRound(root, input.round);
  if (!scope.round.caseBatches) throw new Error('Current sign-off needs a reviewed case batch and case-level evidence.');
  return scope.round.caseBatches.map(ref => readCaseBatch(root, ref).batch.understanding);
}
