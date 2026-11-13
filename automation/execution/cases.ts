import { contained, evidence, digest, load, requireText, sameEvidence, save, verifyEvidence, withLock, type Evidence } from '../shared/store.js';
import { identifier, indexById, pinned } from '../release/library.js';
import type { Assignment } from '../release/scope.js';
import type { Target } from '../release/round.js';
import { readdirSync, existsSync } from 'node:fs';

interface Source {
  id: string;
  authority: string;
  accepted: Evidence;
  current: Evidence;
}
interface Flow {
  id: string;
  featureId: string;
  relationshipIds: string[];
  actor: string;
  startingState: string;
  expectedFlow: string;
  criteria: string[];
  map?: Evidence;
  currentMap?: Evidence;
}
interface Understanding {
  schemaVersion: 1;
  assignment: Assignment;
  sources: Source[];
  flows: Flow[];
}
interface Checkpoint {
  id: string;
  action: string;
  expected: string;
  runner?: { kind: 'postman' | 'webmcp'; inputDigest: string };
}

export interface CaseCheckpoint {
  id: string;
  caseId: string;
  checkpoint: string;
}
export interface CaseDefinition {
  id: string;
  flowId: string;
  checkId: string;
  conditionId: string;
  criteria: string[];
  definition: Evidence;
  context?: Evidence;
  dependsOn: string[];
  prerequisiteKeys?: string[];
  checkpoints: Checkpoint[];
}
interface Batch {
  schemaVersion: 1;
  assignment: Assignment;
  target: Target;
  understanding: Evidence;
  cases: CaseDefinition[];
}
interface Decision {
  gate: 'G1' | 'G2' | 'G4';
  decision: string;
  assignment: Assignment;
  reviewer: string;
  source: string;
  packet: Evidence;
  understanding: Evidence;
  caseBatch?: Evidence;
  caseBatches?: Evidence[];
  scopeReview?: Evidence;
}
export interface CaseAuthorization {
  batch: Evidence;
  approval: Evidence;
}
export function verifyUnderstandingReview(root: string, decision: { understanding?: Evidence }, expected: Evidence) {
  if (!sameEvidence(decision.understanding, expected)) throw new Error('Review the exact feature understanding used for this decision.');
  verifyEvidence(root, expected);
}
type Status = 'Pass' | 'Fail' | 'Partial' | 'Blocked';
export interface CheckpointObservation {
  outcome: 'matched' | 'deviation' | 'invalid' | 'needsReview' | 'interrupted';
  source: string;
  evidence: Evidence[];
  issue?: string;
  detail?: string;
  prerequisite?: string;
}
interface Attempt {
  caseId: string;
  status?: Status;
  issue?: string;
  reviewRequired?: boolean;
  checkpoint?: string;
  invocation?: { checkpoint: string; id: string; kind: 'postman' | 'webmcp'; pid?: number };
  observations: (CheckpointObservation & { checkpoint: string; invocation?: Attempt['invocation']; runnerEvidence?: Evidence })[];
}
interface FlowIssue {
  id: string;
  flowId: string;
  reason: string;
  evidence: Evidence[];
}
interface Session extends CaseAuthorization {
  schemaVersion: 1;
  id: string;
  target: Evidence;
  previous?: Evidence;
  verifiedPrerequisites?: { caseId: string; basis: string; receipt: Evidence }[];
  local?: { ticketId: string; generation: string };
  cases: string[];
  attempts: Attempt[];
  flowIssues?: FlowIssue[];
  prerequisiteIssues?: { key: string; issue: string; reviewRequired: boolean }[];
  finished?: boolean;
}
const sameAssignment = (a: Assignment | undefined, b: Assignment) => a?.source === b.source && a.ticketId === b.ticketId;
const sameTarget = (a: Target | undefined, b: Target) => a?.buildId === b.buildId && a.environment === b.environment;
const sessionPath = (id: string) => `.local/case-executions/${identifier(id, 'case execution')}.json`;
const conclusive = (outcome: CheckpointObservation['outcome']) => outcome === 'matched' || outcome === 'deviation';

function runnerPath(invocation: NonNullable<Attempt['invocation']>) {
  const id = identifier(invocation.id, 'runner invocation');
  return invocation.kind === 'postman' ? `.local/postman/runs/${id}.json` : `.local/chrome-devtools/invocations/${id}.json`;
}

interface RunnerRecord {
  caseCheckpoint?: CaseCheckpoint;
  state?: string;
  outcome?: string;
  invocation?: string;
  assertions?: { total: number; failed: number };
  requests?: { total: number; failed: number };
  applicationOutcome?: string;
  verification?: { evidence: Evidence[] };
  inputs?: Evidence[];
}

function sameCheckpoint(record: RunnerRecord | null, request: CaseCheckpoint) {
  return record?.caseCheckpoint?.id === request.id && record.caseCheckpoint.caseId === request.caseId &&
    record.caseCheckpoint.checkpoint === request.checkpoint;
}

function verifyRunnerOutcome(root: string, request: CaseCheckpoint, invocation: NonNullable<Attempt['invocation']>,
  observation: CheckpointObservation, startingEvidence: Evidence[], retained?: Evidence) {
  const path = runnerPath(invocation);
  if (retained && retained.path !== path) throw new Error('Link the runner result for this exact checkpoint.');
  const ref = retained ?? evidence(root, path);
  const record = pinned<RunnerRecord>(root, ref, 'runner result');
  if (!sameCheckpoint(record, request)) throw new Error('Link the runner result for this exact checkpoint.');
  const matched = observation.outcome === 'matched';
  if (invocation.kind === 'postman') {
    if (record.state !== 'completed' || record.outcome !== (matched ? 'passed' : 'failed') ||
        !record.assertions?.total || !record.requests?.total || (matched ? record.assertions.failed !== 0 : record.assertions.failed < 1)) {
      throw new Error('The Postman result does not establish this checkpoint verdict. Retain it as incomplete.');
    }
    if (!observation.evidence.some(item => sameEvidence(item, ref))) throw new Error('Link the matching Postman result in the checkpoint evidence.');
    requireText(observation.detail, 'Actual case-level assertion or observed product outcome');
    if (!observation.evidence.some(item => ![ref, ...startingEvidence, ...(record.inputs ?? [])].some(input => input.path === item.path))) {
      throw new Error('Link case-level outcome evidence beyond Postman aggregate totals and starting conditions.');
    }
  } else {
    const verified = record.verification?.evidence;
    if (['inProgress', 'awaitingSubmission'].includes(record.invocation ?? '') ||
        record.applicationOutcome !== (matched ? 'confirmed' : 'failed') || !verified?.length ||
        verified.some(expected => !observation.evidence.some(item => sameEvidence(item, expected))) ||
        !verified.some(item => item.path !== ref.path && !startingEvidence.some(start => start.path === item.path))) {
      throw new Error('Link the independently verified WebMCP application outcome and its evidence before recording the verdict.');
    }
  }
  return ref;
}

function earlierSessions(root: string, previous?: Evidence) {
  const history: { session: Session; receipt: Evidence }[] = [];
  const seen = new Set<string>();
  while (previous) {
    const session = pinned<Session>(root, previous, 'previous case execution');
    if (previous.path !== sessionPath(session.id) || !session.finished || seen.has(previous.path)) {
      throw new Error('Resume from a settled case execution with an intact history.');
    }
    seen.add(previous.path);
    history.push({ session, receipt: previous });
    previous = session.previous;
  }
  return history;
}

function reconciliationPath(request: CaseCheckpoint) {
  return `.local/case-reconciliations/${digest(JSON.stringify([request.id, request.caseId, request.checkpoint]))}.json`;
}

interface RunnerReconciliation extends CaseCheckpoint {
  invocationId: string;
  source: string;
  detail: string;
  outcome: 'notApplied';
  evidence: Evidence[];
}

export function reconcileCaseRunner(root: string, request: RunnerReconciliation) {
  requireText(request.source, 'Who verified the original runner stopped and the action was not applied');
  requireText(request.detail, 'How the original runner and target state were independently checked');
  if (request.outcome !== 'notApplied' || !request.evidence?.length) {
    throw new Error('Link independent evidence that the original runner stopped and the action was not applied.');
  }
  return withLock(root, 'case-execution', () => {
    const session = inspectCases(root, request.id);
    const attempt = session.attempts.find(row => row.caseId === request.caseId);
    const observed = attempt?.observations.find(row => row.checkpoint === request.checkpoint);
    const invocation = observed?.invocation ?? attempt?.invocation;
    if (!observed || conclusive(observed.outcome) || invocation?.id !== request.invocationId || invocation.checkpoint !== request.checkpoint) {
      throw new Error('Identify the original unresolved runner invocation on the interrupted checkpoint.');
    }
    if (invocation.pid) {
      let active = true;
      try { process.kill(invocation.pid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') active = false; }
      const record = load<RunnerRecord | null>(root, runnerPath(invocation), () => null).value;
      if (active && (!sameCheckpoint(record, request) ||
          (invocation.kind === 'postman' ? record?.state !== 'completed' : record?.invocation === 'inProgress' || record?.invocation === 'awaitingSubmission'))) {
        throw new Error('The original runner may still be active. Verify its termination before recording a retry decision.');
      }
    }
    const path = reconciliationPath(request);
    const existing = load<RunnerReconciliation | null>(root, path, () => null);
    for (const ref of request.evidence) {
      if (ref.path === runnerPath(invocation) || ref.path === sessionPath(session.id) || ref.path === session.target.path) {
        throw new Error('Supply independent evidence of the stopped runner and unaffected application state.');
      }
      verifyEvidence(root, ref);
    }
    if (existing.value && JSON.stringify(existing.value) !== JSON.stringify(request)) {
      throw new Error('Preserve the existing runner reconciliation.');
    }
    if (!existing.value) save(root, path, request, null);
    return evidence(root, path);
  });
}

function priorRunnerHold(root: string, session: Session, design: Design, item: CaseDefinition): string | undefined {
  const history = earlierSessions(root, session.previous).map(row => row.session);
  const folder = '.local/case-executions';
  const known = new Set([session.id, ...history.map(row => row.id)]);
  for (const name of readdirSync(contained(root, folder))) {
    if (!name.endsWith('.json') || known.has(name.slice(0, -5))) continue;
    const prior = load<Session>(root, `${folder}/${name}`, () => { throw new Error('Recheck the existing case executions.'); }).value;
    if (!prior.attempts.some(row => row.caseId === item.id &&
        (row.invocation || row.observations.some(observed => observed.invocation && !conclusive(observed.outcome))))) continue;
    const previous = pinned<Batch>(root, prior.batch, 'original runner batch');
    if (sameAssignment(previous.assignment, design.batch.assignment) && previous.target.environment === design.batch.target.environment) {
      history.push(prior);
    }
  }
  for (const prior of history) {
    for (const attempt of prior.attempts.filter(row => row.caseId === item.id)) {
      if (attempt.invocation) return `runner-${attempt.invocation.id}`;
      for (const observed of attempt.observations) {
        if (!observed.invocation || conclusive(observed.outcome)) continue;
        const request = { id: prior.id, caseId: attempt.caseId, checkpoint: observed.checkpoint };
        const path = reconciliationPath(request);
        const reviewed = load<RunnerReconciliation | null>(root, path, () => null).value;
        if (!reviewed || reviewed.id !== prior.id || reviewed.caseId !== item.id || reviewed.checkpoint !== observed.checkpoint ||
            reviewed.invocationId !== observed.invocation.id || reviewed.outcome !== 'notApplied' || !reviewed.evidence?.length) return `runner-${observed.invocation.id}`;
        try { reviewed.evidence.forEach(ref => verifyEvidence(root, ref)); }
        catch { return `runner-${observed.invocation.id}`; }
      }
    }
  }
}

function names(values: string[], label: string, optional = false) {
  if (!Array.isArray(values) || !optional && !values.length || new Set(values).size !== values.length) throw new Error(`Use distinct ${label}.`);
  for (const value of values) requireText(value, label);
}

function rejectConcurrent(root: string, design: Design, request: CaseAuthorization & { previous?: Evidence; local?: Session['local'] }) {
  const folder = contained(root, '.local/case-executions');
  if (!existsSync(folder)) return;
  for (const name of readdirSync(folder).filter(name => name.endsWith('.json'))) {
    const prior = load<Session | null>(root, `.local/case-executions/${name}`, () => null).value;
    if (!prior) continue;
    const sameLocal = request.local && prior.local?.ticketId === request.local.ticketId;
    const sameApproval = sameEvidence(prior.batch, request.batch) && sameEvidence(prior.approval, request.approval);
    const samePrevious = request.previous && sameEvidence(prior.previous, request.previous) && request.previous.path !== sessionPath(prior.id);
    if (samePrevious || (sameLocal || sameApproval) && !prior.finished || sameApproval && !request.previous) {
      throw new Error(`Reconcile the existing approved execution ${prior.id} for ${design.batch.assignment.ticketId} before another attempt.`);
    }
  }
}

export function readCaseBatch(root: string, ref: Evidence) {
  const batch = pinned<Batch>(root, ref, 'case batch');
  if (batch?.schemaVersion !== 1) throw new Error('Use a version 1 case batch.');
  requireText(batch.assignment?.source, 'Canonical task source');
  requireText(batch.assignment.ticketId, 'Assignment ID');
  requireText(batch.target?.buildId, 'Approved build');
  requireText(batch.target.environment, 'Approved environment');
  const understanding = pinned<Understanding>(root, batch.understanding, 'feature-flow understanding');
  if (understanding?.schemaVersion !== 1 || !sameAssignment(understanding.assignment, batch.assignment)) throw new Error('Use the understanding for this assignment.');
  const sources = indexById(understanding.sources, 'criterion');
  const flows = indexById(understanding.flows, 'flow');
  const cases = indexById(batch.cases, 'case');
  if (!cases.size) throw new Error('Include the cases covered by this batch.');
  for (const source of sources.values()) {
    requireText(source.authority, 'Accepted criterion authority and section');
    verifyEvidence(root, source.accepted);
    if (source.accepted.sha256 !== source.current?.sha256) throw new Error(`Capture the exact accepted source revision for ${source.id}.`);
  }
  for (const flow of flows.values()) {
    for (const value of [flow.featureId, flow.actor, flow.startingState, flow.expectedFlow]) requireText(value, 'Feature, actor, starting state and expected flow');
    names(flow.relationshipIds, 'relationship IDs', true);
    names(flow.criteria, 'flow criteria');
    if (flow.criteria.some(id => !sources.has(id))) throw new Error(`Link accepted criteria for flow ${flow.id}.`);
    if (flow.map) verifyEvidence(root, flow.map);
    if (flow.map?.sha256 !== flow.currentMap?.sha256 || flow.relationshipIds.length && !flow.map) throw new Error(`Capture the exact map revision for flow ${flow.id}.`);
  }
  const coordinates = new Set<string>();
  for (const item of cases.values()) {
    requireText(item.checkId, 'Check ID');
    requireText(item.conditionId, 'Condition ID');
    const key = JSON.stringify([item.checkId, item.conditionId]);
    if (coordinates.has(key)) throw new Error('Give each approved check and condition one case identity in this batch.');
    coordinates.add(key);
    verifyEvidence(root, item.definition);
    if (item.context) verifyEvidence(root, item.context);
    names(item.criteria, 'case criteria');
    names(item.dependsOn, 'prerequisite cases', true);
    if (item.prerequisiteKeys) names(item.prerequisiteKeys, 'shared prerequisite IDs');
    const flow = flows.get(item.flowId);
    if (!flow || item.criteria.some(id => !flow.criteria.includes(id))) throw new Error(`Link applicable criteria and flow for case ${item.id}.`);
    const checkpoints = indexById(item.checkpoints, 'checkpoint');
    if (checkpoints.size < 2 || item.checkpoints[0]!.id !== 'precondition') throw new Error(`Include a read-only precondition and an expected result for case ${item.id}.`);
    for (const checkpoint of checkpoints.values()) {
      requireText(checkpoint.action, 'Reviewed action');
      requireText(checkpoint.expected, 'Reviewed expected result');
      if (checkpoint.runner && (checkpoint.id === 'precondition' || !['postman', 'webmcp'].includes(checkpoint.runner.kind) ||
          !/^[a-f0-9]{64}$/.test(checkpoint.runner.inputDigest))) {
        throw new Error('Pin the supported runner and its input digest on the reviewed action checkpoint.');
      }
    }
  }
  const remaining = new Set(cases.keys());
  while (remaining.size) {
    const ready = [...remaining].filter(id => cases.get(id)!.dependsOn.every(dep => cases.has(dep) && !remaining.has(dep)));
    if (!ready.length) throw new Error('Case prerequisites must reference existing cases without cycles.');
    for (const id of ready) remaining.delete(id);
  }
  return { batch, flows, sources, cases };
}

export function verifyCaseAuthorization(root: string, authorization: CaseAuthorization, expected?: { assignment?: Assignment; target?: Target; gate?: 'G2' | 'G4' }) {
  const design = readCaseBatch(root, authorization?.batch);
  const approval = pinned<Decision>(root, authorization.approval, 'case execution decision');
  const { batch } = design;
  if (!['G2', 'G4'].includes(approval?.gate) || expected?.gate && approval.gate !== expected.gate ||
      !sameAssignment(approval.assignment, batch.assignment) || expected?.assignment && !sameAssignment(batch.assignment, expected.assignment) ||
      expected?.target && !sameTarget(batch.target, expected.target) ||
      !(sameEvidence(approval.caseBatch, authorization.batch) ||
        Array.isArray(approval.caseBatches) && approval.caseBatches.some(ref => sameEvidence(ref, authorization.batch))) ||
      !sameEvidence(approval.understanding, batch.understanding)) {
    throw new Error('Approve this exact case batch, feature understanding and assignment at G2 or G4.');
  }
  validateDecision(root, approval);
  const scope = pinned<Decision>(root, approval.scopeReview!, 'G1 feature understanding decision');
  if (scope?.gate !== 'G1' || !sameAssignment(scope.assignment, batch.assignment) || !sameEvidence(scope.understanding, batch.understanding)) {
    throw new Error('Link the G1 decision for this exact feature understanding.');
  }
  validateDecision(root, scope);
  return design;
}

function validateDecision(root: string, decision: Decision) {
  if (!['Approved', 'Approved with limits'].includes(decision.decision)) throw new Error('Record the actual approval for the feature understanding.');
  requireText(decision.reviewer, 'Actual reviewer');
  requireText(decision.source, 'Actual decision source');
  verifyEvidence(root, decision.packet);
}

type Design = ReturnType<typeof readCaseBatch>;
function verifyCurrentCase(root: string, design: Design, item: CaseDefinition) {
  const flow = design.flows.get(item.flowId)!;
  for (const id of flow.criteria) verifyEvidence(root, design.sources.get(id)!.current);
  if (flow.currentMap) verifyEvidence(root, flow.currentMap);
}

function flagFlow(session: Session, item: CaseDefinition, issue: FlowIssue) {
  const issues = session.flowIssues ??= [];
  if (!issues.some(row => row.id === issue.id && row.flowId === item.flowId)) issues.push(issue);
}

export function caseBasis(design: Design, item: CaseDefinition) {
  const flow = design.flows.get(item.flowId)!;
  return digest(JSON.stringify({
    definition: item.definition.sha256, context: item.context?.sha256, checkId: item.checkId, conditionId: item.conditionId,
    feature: flow.featureId, relationships: flow.relationshipIds, actor: flow.actor, startingState: flow.startingState,
    flow: flow.expectedFlow, map: flow.map?.sha256, criteria: flow.criteria.map(id => [id, design.sources.get(id)!.accepted.sha256]),
    caseCriteria: item.criteria,
    prerequisites: item.prerequisiteKeys ?? [], dependencies: item.dependsOn, checkpoints: item.checkpoints,
  }));
}

function targetObservation(root: string, ref: Evidence, target: Target) {
  const observed = pinned<Target & { id?: string; observedAt: string; source: string }>(root, ref, 'case target observation');
  if (!sameTarget({ buildId: observed?.buildId, environment: observed?.environment ?? observed?.id! }, target) ||
      !Number.isFinite(Date.parse(observed.observedAt))) throw new Error('Observe the exact approved case target.');
  requireText(observed.source, 'Actual case target source');
}

export function startCases(root: string, request: CaseAuthorization & { id: string; target: Evidence; caseIds?: string[]; previous?: Evidence; local?: Session['local'] }) {
  const design = verifyCaseAuthorization(root, request);
  targetObservation(root, request.target, design.batch.target);
  const cases = request.caseIds ?? [...design.cases.keys()];
  const verifiedPrerequisites: NonNullable<Session['verifiedPrerequisites']> = [];
  names(cases, 'selected case IDs');
  if (cases.some(id => !design.cases.has(id))) throw new Error('Select cases from the approved batch.');
  if (request.previous) {
    const previous = pinned<Session>(root, request.previous, 'previous case execution');
    const priorDesign = verifyCaseAuthorization(root, previous);
    if (request.previous.path !== sessionPath(previous.id) || !previous.finished || !sameAssignment(priorDesign.batch.assignment, design.batch.assignment)) throw new Error('Settle the earlier execution before resuming the same assignment.');
    for (const id of cases) {
      const old = previous.attempts.find(item => item.caseId === id);
      const oldCase = priorDesign.cases.get(id);
      const disputed = oldCase && previous.flowIssues?.find(issue => issue.flowId === oldCase.flowId);
      const shared = previous.prerequisiteIssues?.find(issue => issue.reviewRequired && oldCase?.prerequisiteKeys?.includes(issue.key));
      if (old?.status === 'Pass' || old?.status === 'Fail') throw new Error(`Preserve the completed result for ${id}. Use the reviewed retry procedure for a new attempt.`);
      if (oldCase && (old?.reviewRequired || disputed || shared) && (sameEvidence(previous.approval, request.approval) ||
          caseBasis(priorDesign, oldCase) === caseBasis(design, design.cases.get(id)!))) {
        throw new Error(`Resolve ${old?.issue ?? disputed?.id ?? shared?.issue} in a revised case or feature understanding before resuming ${id}.`);
      }
    }
    if (sameTarget(priorDesign.batch.target, design.batch.target)) {
      const receipts = new Map(previous.verifiedPrerequisites?.map(item => [item.caseId, item.receipt]));
      for (const attempt of previous.attempts) {
        if (attempt.status === 'Pass') receipts.set(attempt.caseId, request.previous);
        else if (attempt.status || attempt.observations.length) receipts.delete(attempt.caseId);
      }
      // Keep receipts for any approved dependency, even if this resume selects unrelated cases.
      const needed = new Set([...design.cases.values()].flatMap(item => item.dependsOn));
      for (const [id, receipt] of receipts) {
        if (!needed.has(id) || cases.includes(id)) continue;
        const item = design.cases.get(id)!;
        if (previous.flowIssues?.some(issue => issue.flowId === item.flowId) ||
            previous.prerequisiteIssues?.some(issue => item.prerequisiteKeys?.includes(issue.key))) continue;
        try {
          const checked = caseResult(root, receipt, id, { ...item, target: design.batch.target, outcome: 'Pass' }, true);
          if (checked.basis === caseBasis(design, item)) verifiedPrerequisites.push({ caseId: id, basis: checked.basis, receipt });
        } catch { /* Stale prerequisites remain blocked. Independent cases can resume. */ }
      }
    }
  }
  return withLock(root, 'case-execution', () => {
    const path = sessionPath(request.id);
    const stored = load<Session | null>(root, path, () => null).value;
    if (stored) {
      if (!sameEvidence(stored.batch, request.batch) || !sameEvidence(stored.approval, request.approval) ||
          !sameEvidence(stored.target, request.target) || JSON.stringify(stored.cases) !== JSON.stringify(cases) ||
          JSON.stringify(stored.local) !== JSON.stringify(request.local) ||
          (stored.previous || request.previous) && !sameEvidence(stored.previous, request.previous)) {
        throw new Error('This case execution ID already has different inputs.');
      }
      return stored;
    }
    if (request.previous && !sameEvidence(request.previous, evidence(root, request.previous.path))) throw new Error('The previous case receipt changed.');
    rejectConcurrent(root, design, request);
    const session: Session = { schemaVersion: 1, id: request.id, batch: request.batch, approval: request.approval, target: request.target,
      previous: request.previous, local: request.local, cases, attempts: [],
      ...(verifiedPrerequisites.length ? { verifiedPrerequisites } : {}) };
    save(root, path, session, null);
    return session;
  });
}

export function assertCaseInputs(root: string, id: string, refs: Evidence[], target?: Target) {
  const session = inspectCases(root, id);
  if (session.finished) throw new Error('The case execution is already settled.');
  const design = verifyCaseAuthorization(root, session, { target });
  if (session.cases.some(caseId => !refs.some(ref => sameEvidence(design.cases.get(caseId)?.definition, ref)))) {
    throw new Error('The runner inputs do not match the reviewed case definitions.');
  }
  return design;
}

function checkCaseCheckpoint(root: string, session: Session, design: Design, request: CaseCheckpoint, refs: Evidence[], target: Target) {
  if (!sameTarget(design.batch.target, target)) throw new Error('Use the exact approved case target.');
  const item = design.cases.get(request.caseId);
  const attempt = session.attempts.find(item => item.caseId === request.caseId);
  if (!attempt?.checkpoint || attempt.checkpoint !== request.checkpoint) throw new Error('Reserve the reviewed case checkpoint before invoking its runner.');
  if (request.checkpoint === 'precondition') throw new Error('Verify the actual starting state before invoking the test runner.');
  if (!item || !refs.some(ref => sameEvidence(item.definition, ref))) throw new Error('The runner inputs must include the approved case definition.');
  verifyCurrentCase(root, design, item);
  if (priorRunnerHold(root, session, design, item)) throw new Error('Reconcile the original runner outcome before dispatching another action.');
  if (dependencyHold(root, session, design, item) || session.flowIssues?.some(issue => issue.flowId === item.flowId) ||
      session.prerequisiteIssues?.some(issue => item.prerequisiteKeys?.includes(issue.key))) {
    throw new Error('A prerequisite or flow for this case changed or is blocked.');
  }
  return { item, attempt };
}

export function verifyCaseCheckpoint(root: string, request: CaseCheckpoint, refs: Evidence[], target: Target) {
  const session = inspectCases(root, request.id);
  if (session.finished) throw new Error('The case execution is already settled.');
  checkCaseCheckpoint(root, session, verifyCaseAuthorization(root, session), request, refs, target);
}

export function claimCaseCheckpoint(root: string, request: CaseCheckpoint, refs: Evidence[], target: Target,
  invocation: { kind: 'postman' | 'webmcp'; id: string; inputDigest: string }) {
  return updateSession(root, request.id, (session, design) => {
    const { item, attempt } = checkCaseCheckpoint(root, session, design, request, refs, target);
    const runner = item.checkpoints[attempt.observations.length]?.runner;
    if (runner?.kind !== invocation.kind || runner.inputDigest !== invocation.inputDigest) {
      throw new Error('Use the exact runner and inputs approved for this checkpoint.');
    }
    if (attempt.invocation) throw new Error('This checkpoint already has a runner invocation. Reconcile its actual outcome before retrying.');
    attempt.invocation = { kind: invocation.kind, id: invocation.id, checkpoint: request.checkpoint, pid: process.pid };
  });
}

function updateSession<T>(root: string, id: string, update: (session: Session, design: Design) => T) {
  return withLock(root, 'case-execution', () => {
    const path = sessionPath(id), stored = load<Session>(root, path, () => { throw new Error('Start the approved case execution first.'); });
    if (stored.value.finished) throw new Error('This case execution is already settled.');
    const result = update(stored.value, verifyCaseAuthorization(root, stored.value));
    save(root, path, stored.value, stored.revision);
    return result;
  });
}

function dependencyHold(root: string, session: Session, design: Design, item: CaseDefinition, seen = new Set<string>()): string | undefined {
  for (const id of item.dependsOn) {
    if (seen.has(id)) continue;
    seen.add(id);
    const prerequisite = design.cases.get(id)!;
    const attempt = session.attempts.find(row => row.caseId === id);
    const retained = session.verifiedPrerequisites?.find(row => row.caseId === id);
    const disputed = session.flowIssues?.find(issue => issue.flowId === prerequisite.flowId);
    const shared = session.prerequisiteIssues?.find(issue => prerequisite.prerequisiteKeys?.includes(issue.key));
    if (disputed || shared) return disputed?.id ?? shared!.issue;
    if (attempt?.status !== 'Pass' && !retained) return attempt?.issue ?? id;
    if (retained) {
      try {
        const result = caseResult(root, retained.receipt, id, { ...prerequisite, target: design.batch.target, outcome: 'Pass' }, true);
        if (result.basis !== caseBasis(design, prerequisite)) return id;
      } catch { return id; }
    }
    try { verifyCurrentCase(root, design, prerequisite); }
    catch { return `flow-${prerequisite.flowId}`; }
    const inherited = dependencyHold(root, session, design, prerequisite, seen);
    if (inherited) return inherited;
  }
}

export function prepareCheckpoint(root: string, request: { id: string; caseId: string; target: Evidence }) {
  return updateSession(root, request.id, (session, design) => {
    if (!session.cases.includes(request.caseId)) throw new Error('This case is outside the selected execution.');
    const item = design.cases.get(request.caseId)!;
    let attempt = session.attempts.find(row => row.caseId === item.id);
    if (!attempt) { attempt = { caseId: item.id, observations: [] }; session.attempts.push(attempt); }
    if (attempt.checkpoint) throw new Error('The checkpoint has an unresolved action. Observe its outcome before retrying or advancing.');
    if (attempt.status) return { state: attempt.status, issue: attempt.issue };
    const dependency = dependencyHold(root, session, design, item);
    const disputed = session.flowIssues?.find(issue => issue.flowId === item.flowId);
    const shared = session.prerequisiteIssues?.find(issue => item.prerequisiteKeys?.includes(issue.key));
    if (dependency || disputed || shared) return { state: 'Blocked' as const, issue: dependency ?? disputed?.id ?? shared!.issue };
    targetObservation(root, request.target, design.batch.target);
    try { verifyCurrentCase(root, design, item); }
    catch {
      attempt.status = attempt.observations.length ? 'Partial' : 'Blocked';
      attempt.issue = `flow-${item.flowId}`;
      attempt.reviewRequired = true;
      flagFlow(session, item, { id: attempt.issue, flowId: item.flowId, reason: 'Applicable accepted source or map revision changed.', evidence: [] });
      return { state: attempt.status, issue: attempt.issue };
    }
    const checkpoint = item.checkpoints[attempt.observations.length]!;
    const unresolved = priorRunnerHold(root, session, design, item);
    if (unresolved) return { state: 'Blocked' as const, issue: unresolved };
    attempt.checkpoint = checkpoint.id;
    return { state: 'ready' as const, caseId: item.id, checkpoint, criteria: item.criteria, flow: design.flows.get(item.flowId)! };
  });
}

export function observeCheckpoint(root: string, request: CheckpointObservation & { id: string; caseId: string; checkpoint: string }) {
  const { id, caseId, checkpoint, ...observation } = request;
  requireText(observation.source, 'Actual checkpoint observation');
  if (!['matched', 'deviation', 'invalid', 'needsReview', 'interrupted'].includes(observation.outcome) ||
      !Array.isArray(observation.evidence) || !observation.evidence.length) throw new Error('Retain evidence for the actual checkpoint outcome.');
  for (const ref of observation.evidence) verifyEvidence(root, ref);
  if (observation.outcome === 'needsReview') {
    requireText(observation.issue, 'Shared clarification ID');
    requireText(observation.detail, 'Observation, affected flow and question for the responsible owner');
  }
  return updateSession(root, id, (session, design) => {
    const attempt = session.attempts.find(row => row.caseId === caseId);
    if (!attempt?.checkpoint || attempt.checkpoint !== checkpoint) throw new Error('Observe the exact reserved checkpoint once.');
    const item = design.cases.get(caseId)!;
    if (observation.prerequisite && (!['invalid', 'needsReview'].includes(observation.outcome) || !item.prerequisiteKeys?.includes(observation.prerequisite))) {
      throw new Error('Use a reviewed shared prerequisite ID for an invalid or disputed starting condition.');
    }
    if (item.checkpoints[attempt.observations.length]?.runner && !attempt.invocation &&
        ['matched', 'deviation'].includes(observation.outcome)) {
      throw new Error('Run the approved checkpoint through its recorded runner before retaining a conclusive observation.');
    }
    const runnerEvidence = attempt.invocation && conclusive(observation.outcome)
      ? verifyRunnerOutcome(root, { id, caseId, checkpoint }, attempt.invocation, observation,
        [session.target, item.definition, ...attempt.observations[0]!.evidence])
      : undefined;
    attempt.observations.push({ ...observation, checkpoint, invocation: attempt.invocation, runnerEvidence });
    delete attempt.checkpoint;
    delete attempt.invocation;
    let stale = false;
    try { verifyCurrentCase(root, design, item); } catch { stale = true; }
    const dependency = dependencyHold(root, session, design, item);
    const disputed = session.flowIssues?.find(issue => issue.flowId === item.flowId);
    const shared = session.prerequisiteIssues?.find(issue => item.prerequisiteKeys?.includes(issue.key));
    if (stale || dependency || disputed || shared || observation.outcome === 'needsReview' || observation.outcome === 'interrupted') {
      attempt.status = checkpoint === 'precondition' ? 'Blocked' : 'Partial';
      attempt.issue = stale ? `flow-${item.flowId}` : dependency ?? disputed?.id ?? shared?.issue ?? observation.issue;
      attempt.reviewRequired = stale || !!disputed || observation.outcome === 'needsReview';
      if (attempt.reviewRequired) flagFlow(session, item, { id: attempt.issue!, flowId: item.flowId,
        reason: observation.detail ?? 'Applicable accepted source or map revision needs review.', evidence: observation.evidence });
    } else if (observation.outcome === 'invalid' || checkpoint === 'precondition' && observation.outcome === 'deviation') {
      attempt.status = checkpoint === 'precondition' ? 'Blocked' : 'Partial';
    } else if (observation.outcome === 'deviation') attempt.status = 'Fail';
    else if (attempt.observations.length === item.checkpoints.length) attempt.status = 'Pass';
    if (observation.prerequisite) {
      const holds = session.prerequisiteIssues ??= [];
      if (!holds.some(row => row.key === observation.prerequisite)) holds.push({ key: observation.prerequisite,
        issue: observation.issue ?? observation.prerequisite, reviewRequired: observation.outcome === 'needsReview' });
    }
    return attempt;
  });
}

export function finishCases(root: string, id: string) {
  const prior = inspectCases(root, id);
  if (prior.finished) return { session: prior, receipt: evidence(root, sessionPath(id)) };
  const session = updateSession(root, id, record => {
    if (record.attempts.some(item => item.checkpoint)) throw new Error('Resolve the in-flight checkpoint using actual evidence before settling.');
    record.finished = true;
    return record;
  });
  return { session, receipt: evidence(root, sessionPath(id)) };
}

export async function runApprovedCases(root: string, id: string, adapter: {
  target: () => Evidence | Promise<Evidence>;
  beforeCheckpoint?: () => void | Promise<void>;
  execute: (step: Extract<ReturnType<typeof prepareCheckpoint>, { state: 'ready' }>) => CheckpointObservation | Promise<CheckpointObservation>;
}) {
  const session = inspectCases(root, id);
  if (session.finished) return finishCases(root, id);
  let pending = session.pending;
  while (pending.length) {
    let progressed = false;
    for (const caseId of pending) {
      for (;;) {
        const target = await adapter.target();
        await adapter.beforeCheckpoint?.();
        const step = prepareCheckpoint(root, { id, caseId, target });
        if (step.state !== 'ready') break;
        progressed = true;
        const observed = await adapter.execute(step);
        observeCheckpoint(root, { ...observed, id, caseId, checkpoint: step.checkpoint.id });
      }
    }
    if (!progressed) break;
    pending = inspectCases(root, id).pending;
  }
  return finishCases(root, id);
}

export function inspectCases(root: string, id: string) {
  const record = load<Session>(root, sessionPath(id), () => { throw new Error('Case execution was not found.'); }).value;
  const design = readCaseBatch(root, record.batch);
  const flowReviews = record.flowIssues?.map(issue => {
    const flow = design.flows.get(issue.flowId)!;
    return { ...issue, featureId: flow.featureId, relationshipIds: flow.relationshipIds,
      caseIds: record.cases.filter(id => design.cases.get(id)?.flowId === issue.flowId) };
  });
  return { ...record, pending: record.cases.filter(id => !record.attempts.find(item => item.caseId === id)?.status),
    issues: [...new Set(record.attempts.flatMap(item => item.issue ? [item.issue] : []))], ...(flowReviews ? { flowReviews } : {}) };
}

export function caseResult(root: string, receipt: Evidence, caseId: string, expected: { target: Target; checkId: string; conditionId: string; outcome: string; context?: Evidence },
  requireCurrent = false) {
  const session = pinned<Session>(root, receipt, 'case execution receipt');
  if (receipt.path !== sessionPath(session.id) || !session.finished) throw new Error('Link the settled case execution from its operational record.');
  const design = verifyCaseAuthorization(root, session, { target: expected.target });
  const item = design.cases.get(caseId);
  const attempt = session.attempts.find(row => row.caseId === caseId);
  if (!session.cases.includes(caseId) || !item || item.checkId !== expected.checkId || item.conditionId !== expected.conditionId ||
      (item.context || expected.context) && !sameEvidence(item.context, expected.context) ||
      !attempt || attempt.status !== expected.outcome || !attempt.observations.length) throw new Error('The claimed verdict has no matching case checkpoint evidence.');
  targetObservation(root, session.target, design.batch.target);
  const observations = attempt.observations;
  if (observations.some((row, i) => row.checkpoint !== item.checkpoints[i]?.id || !row.evidence.length ||
      i < observations.length - 1 && row.outcome !== 'matched')) throw new Error('The checkpoint evidence does not follow the approved case.');
  const last = observations.at(-1)!;
  if (expected.outcome === 'Pass' && (observations.length !== item.checkpoints.length || last.outcome !== 'matched') ||
      expected.outcome === 'Fail' && (observations.length < 2 || last.outcome !== 'deviation')) throw new Error('The observations do not establish the claimed case verdict.');
  for (const row of observations) for (const ref of row.evidence) verifyEvidence(root, ref);
  if (requireCurrent) {
    for (const [index, row] of observations.entries()) {
      const runner = item.checkpoints[index]?.runner;
      if (runner && conclusive(row.outcome)) {
        if (row.invocation?.kind !== runner.kind) throw new Error('Link the reviewed runner invocation for the checkpoint.');
        verifyRunnerOutcome(root, { id: session.id, caseId, checkpoint: row.checkpoint }, row.invocation, row,
          [session.target, item.definition, ...observations[0]!.evidence], row.runnerEvidence);
      }
    }
    verifyCurrentCase(root, design, item);
    if (session.flowIssues?.some(issue => issue.flowId === item.flowId)) throw new Error('The feature flow used for this verdict needs review.');
    if (session.prerequisiteIssues?.some(issue => item.prerequisiteKeys?.includes(issue.key))) {
      throw new Error('A shared prerequisite for the case verdict needs review.');
    }
    if (dependencyHold(root, session, design, item)) throw new Error('A prerequisite for the case evidence needs review.');
  }
  return { batch: session.batch, approval: session.approval, basis: caseBasis(design, item), design: item, assignment: design.batch.assignment };
}
