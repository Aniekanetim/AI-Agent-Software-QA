import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { caseResult, finishCases, inspectCases, observeCheckpoint, prepareCheckpoint, runApprovedCases, startCases, verifyCaseAuthorization, verifyCaseCheckpoint } from '../execution/cases.js';
import { recordAssessment, retainRun, verifyAssessment } from '../release/round.js';
import { releaseFixture } from './release-fixture.js';
import { pinned } from '../release/library.js';
import { currentAssessment, verifyHandoffCases } from '../release/handoff.js';
import { preflightLocalData, prepareLocalCase, runLocalCases } from '../data/local.js';
import { boardRoot, findTicket } from '../board/board.js';
import type { Evidence } from '../shared/store.js';

function fixture() {
  const folder = resolve('output/case-execution-fixtures');
  mkdirSync(folder, { recursive: true });
  const root = mkdtempSync(resolve(folder, 'run-'));
  const base = releaseFixture(root, 'QA-001');
  const assignment = { source: 'local', ticketId: 'QA-001' };
  const definition = base.library.checks[0]!.definition;
  const original = base.library.conditions[0]!.basis;
  const current = base.put('current-settings.json', { requirement: 'A saved reporting route governs handoff delivery.' });
  const other = base.put('other-rule.json', { requirement: 'The reporting list loads independently.' });
  const log = base.put('observed.json', { source: 'Synthetic test observation' });
  const checkpoint = [{ id: 'precondition', action: 'Inspect approved starting state', expected: 'Role and state match' },
    { id: 'result', action: 'Perform reviewed action', expected: 'Approved outcome occurs' }];
  const cases = [
    { id: 'first', flowId: 'route', checkId: 'shared', conditionId: 'route', criteria: ['route-rule'], definition, dependsOn: [], checkpoints: checkpoint },
    { id: 'dependent', flowId: 'route', checkId: 'dependent-check', conditionId: 'route', criteria: ['route-rule'], definition,
      dependsOn: ['first'], checkpoints: checkpoint },
    { id: 'same-flow', flowId: 'route', checkId: 'same-flow-check', conditionId: 'route', criteria: ['route-rule'], definition, dependsOn: [], checkpoints: checkpoint },
    { id: 'independent', flowId: 'list', checkId: 'independent-check', conditionId: 'list', criteria: ['list-rule'], definition,
      dependsOn: [], checkpoints: checkpoint },
  ];
  function authorize(selected = cases, suffix = 'original', accepted = original, liveSource = current, flow = 'Save a route and deliver using that route.') {
    const understanding = base.put(`understanding-${suffix}.json`, { schemaVersion: 1, assignment,
      sources: [{ id: 'route-rule', authority: 'Reviewed reporting rule', accepted, current: liveSource },
        { id: 'list-rule', authority: 'Reviewed listing rule', accepted: other, current: other }],
      flows: [{ id: 'route', featureId: 'reporting', relationshipIds: [], actor: 'Release reviewer', startingState: 'Approved target',
        expectedFlow: flow, criteria: ['route-rule'] },
      { id: 'list', featureId: 'reporting-list', relationshipIds: [], actor: 'Release reviewer', startingState: 'Approved target',
        expectedFlow: 'Read the list', criteria: ['list-rule'] }] });
    const batch = base.put(`batch-${suffix}.json`, { schemaVersion: 1, assignment, target: base.target, understanding, cases: selected });
    const record = { assignment, decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic review', packet: base.round.scope, understanding };
    const scopeReview = base.put(`g1-${suffix}.json`, { ...record, gate: 'G1' });
    const approval = base.put(`g2-${suffix}.json`, { ...record, gate: 'G2', scopeReview, caseBatch: batch });
    return { batch, approval, understanding, scopeReview, record };
  }
  const observation = { source: 'Synthetic case runner', evidence: [log] };
  return { root, base, assignment, cases, authorize, current, observation, definition };
}

test('one reviewed batch runs cases autonomously and holds only dependencies after a clear failure', async () => {
  const f = fixture(), approval = f.authorize();
  startCases(f.root, { ...approval, id: 'batch', target: f.base.targetEvidence });
  const actions: string[] = [];
  const result = await runApprovedCases(f.root, 'batch', {
    target: () => f.base.targetEvidence,
    execute: step => {
      actions.push(`${step.caseId}/${step.checkpoint.id}`);
      return { ...f.observation, outcome: step.caseId === 'first' && step.checkpoint.id === 'result' ? 'deviation' : 'matched' };
    },
  });
  assert.deepEqual(actions, ['first/precondition', 'first/result', 'same-flow/precondition', 'same-flow/result', 'independent/precondition', 'independent/result']);
  assert.equal(result.session.attempts.find(item => item.caseId === 'first')?.status, 'Fail');
  assert.equal(result.session.attempts.find(item => item.caseId === 'independent')?.status, 'Pass');
  assert.equal(inspectCases(f.root, 'batch').attempts.find(item => item.caseId === 'dependent')?.observations.length, 0);
  assert.throws(() => startCases(f.root, { ...approval, id: 'duplicate', target: f.base.targetEvidence }), /existing approved execution/);
});

test('ambiguous flow pauses dependent cases, retains already observed evidence and resumes after revised review', async () => {
  const f = fixture(), approval = f.authorize();
  startCases(f.root, { ...approval, id: 'batch', target: f.base.targetEvidence });
  const result = await runApprovedCases(f.root, 'batch', { target: () => f.base.targetEvidence, execute: step =>
    step.caseId === 'first' && step.checkpoint.id === 'result'
      ? { ...f.observation, outcome: 'needsReview', issue: 'routing-branch', detail: 'Which saved route applies to an archived destination?' }
      : { ...f.observation, outcome: 'matched' } });
  const status = inspectCases(f.root, 'batch');
  assert.deepEqual(status.flowReviews?.[0]?.caseIds, ['first', 'dependent', 'same-flow']);
  assert.equal(status.attempts.find(item => item.caseId === 'independent')?.status, 'Pass');
  assert.throws(() => startCases(f.root, { ...approval, id: 'blind-resume', target: f.base.targetEvidence,
    previous: result.receipt, caseIds: ['same-flow'] }), /revised case or feature understanding/);
  const revised = f.authorize(f.cases, 'clarified', undefined, undefined, 'An archived destination uses the approved replacement route.');
  startCases(f.root, { ...revised, id: 'resumed', target: f.base.targetEvidence, previous: result.receipt, caseIds: ['first', 'dependent', 'same-flow'] });
  const resumed = await runApprovedCases(f.root, 'resumed', { target: () => f.base.targetEvidence, execute: () => ({ ...f.observation, outcome: 'matched' }) });
  assert.deepEqual(resumed.session.attempts.map(item => item.status), ['Pass', 'Pass', 'Pass']);
});

test('changed criteria and interrupted actions cannot advance silently and independent cases can run', async () => {
  const f = fixture(), approval = f.authorize();
  startCases(f.root, { ...approval, id: 'batch', target: f.base.targetEvidence });
  const next = () => prepareCheckpoint(f.root, { id: 'batch', caseId: 'first', target: f.base.targetEvidence });
  assert.equal(next().state, 'ready');
  assert.throws(next, /unresolved action/);
  assert.throws(() => finishCases(f.root, 'batch'), /in-flight checkpoint/);
  observeCheckpoint(f.root, { ...f.observation, id: 'batch', caseId: 'first', checkpoint: 'precondition', outcome: 'matched' });
  assert.equal(next().state, 'ready');
  f.base.put(f.current.path, { requirement: 'Approved replacement expectation' });
  assert.equal(observeCheckpoint(f.root, { ...f.observation, id: 'batch', caseId: 'first', checkpoint: 'result', outcome: 'matched' }).status, 'Partial');
  const result = await runApprovedCases(f.root, 'batch', { target: () => f.base.targetEvidence, execute: () => ({ ...f.observation, outcome: 'matched' }) });
  assert.equal(result.session.attempts.find(item => item.caseId === 'independent')?.status, 'Pass');
  assert.equal(inspectCases(f.root, 'batch').issues[0], 'flow-route');
});

test('an invalid shared prerequisite holds other affected cases across flow boundaries', async () => {
  const f = fixture(), cases = f.cases.map(item => item.id === 'first' || item.id === 'independent'
    ? { ...item, prerequisiteKeys: ['shared-account'] } : item);
  const approval = f.authorize(cases);
  startCases(f.root, { ...approval, id: 'batch', target: f.base.targetEvidence });
  const actions: string[] = [];
  const result = await runApprovedCases(f.root, 'batch', { target: () => f.base.targetEvidence, execute: step => {
    actions.push(`${step.caseId}/${step.checkpoint.id}`);
    return step.caseId === 'first'
      ? { ...f.observation, outcome: 'invalid', prerequisite: 'shared-account' }
      : { ...f.observation, outcome: 'matched' };
  } });
  assert.deepEqual(actions, ['first/precondition', 'same-flow/precondition', 'same-flow/result']);
  assert.equal(result.session.attempts.find(item => item.caseId === 'first')?.status, 'Blocked');
  assert.deepEqual(inspectCases(f.root, 'batch').prerequisiteIssues, [{ key: 'shared-account', issue: 'shared-account', reviewRequired: false }]);
});

test('a reviewed round requires case evidence for verdicts and preserves historical assessment after source drift', async () => {
  const f = fixture(), auth = f.authorize([f.cases[0]!]);
  const round = { ...f.base.round, caseBatches: [auth.batch] };
  const roundRef = f.base.put('case-round.json', round);
  const scope = f.base.scopeRequest('local', round, roundRef, 'case-round');
  const oldG2 = pinned<{ scopeReview: Evidence }>(f.root, scope.approval, 'fixture G2');
  const oldG1 = pinned<object>(f.root, oldG2.scopeReview, 'fixture G1');
  const g1 = f.base.put('case-round-g1.json', { ...oldG1, understanding: auth.understanding });
  const g2 = f.base.put('case-round-g2.json', { ...oldG2, caseBatch: auth.batch, understanding: auth.understanding, scopeReview: g1 });
  const { bindReleaseScope } = await import('../release/scope.js');
  bindReleaseScope(f.root, { ...scope, approval: g2, requireCases: true });
  const aggregate = { ...f.base.run('aggregate', 'Pass'), round: roundRef };
  assert.throws(() => retainRun(f.root, { round: roundRef, run: f.base.put('aggregate.json', aggregate) }), /Aggregate runner output/);
  startCases(f.root, { batch: auth.batch, approval: g2, id: 'cases', target: f.base.targetEvidence });
  const { receipt } = await runApprovedCases(f.root, 'cases', { target: () => f.base.targetEvidence, execute: () => ({ ...f.observation, outcome: 'matched' }) });
  assert.throws(() => caseResult(f.root, receipt, 'first', { target: f.base.target, checkId: 'shared', conditionId: 'route', outcome: 'Fail' }), /no matching/);
  const run = f.base.put('detailed.json', { ...aggregate, id: 'detailed', observations: [{ ...aggregate.observations[0],
    caseExecution: { receipt, caseId: 'first' } }] });
  const { assessment } = recordAssessment(f.root, retainRun(f.root, { round: roundRef, run }));
  assert.equal(currentAssessment(f.root, assessment, f.assignment).state, 'evidenceReady');
  const decision = { gate: 'G5', decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic G5', packet: f.base.round.scope,
    handoff: { assessment, route: { channel: 'recorded' as const, destination: 'Synthetic QA', recipient: 'Owner', acknowledgementRequired: false },
      targetObservation: f.base.g5Target } };
  assert.throws(() => verifyHandoffCases(f.root, decision), /current reviewed feature understanding/);
  verifyHandoffCases(f.root, { ...decision, handoff: { ...decision.handoff, understandings: [auth.understanding] } });
  f.base.put(f.current.path, { requirement: 'Changed source after execution' });
  assert.equal(verifyAssessment(f.root, assessment).state, 'evidenceReady');
  assert.throws(() => currentAssessment(f.root, assessment, f.assignment), /evidence is missing or changed/);
});

test('local preflight and scripted checkpoints use the current ticket generation and exact G2 approval', async () => {
  const f = fixture(), auth = f.authorize([f.cases[0]!]);
  writeFileSync(resolve(f.root, boardRoot, 'Ready for QA', 'QA-001.md'), '# QA-001: Case execution\n\n| Type | Assignment |\n');
  const ticket = findTicket(f.root, 'QA-001');
  const target = f.base.put('.local/local-target.json', { ...f.base.target, ticketId: ticket.id, generation: ticket.generation,
    observedAt: '2026-01-01T00:00:00Z', source: 'Synthetic build evidence' });
  const g2 = f.base.put('.local/local-g2.json', { ...auth.record, gate: 'G2', scopeReview: auth.scopeReview, caseBatch: auth.batch,
    ticketId: ticket.id, generation: ticket.generation, target: f.base.target,
    dataScope: { schemaVersion: 1, mode: 'none', checks: [{ id: 'shared', conditionIds: ['route'], dataItemIds: [] }] } });
  const request = { ticketId: ticket.id, generation: ticket.generation, target, gates: { G2: g2 }, caseExecution: { id: 'local' } };
  assert.throws(() => verifyCaseAuthorization(f.root, { batch: auth.batch, approval: g2 }, { target: { ...f.base.target, buildId: 'other' } }), /exact case batch/);
  assert.equal(preflightLocalData(f.root, request).cases?.id, 'local');
  assert.throws(() => prepareLocalCase(f.root, { id: 'local', caseId: 'other', target }), /outside the selected execution/);
  const result = await runLocalCases(f.root, 'local', { target: () => target, execute: () => ({ ...f.observation, outcome: 'matched' }) });
  assert.equal(result.session.attempts[0]?.status, 'Pass');
});

test('a runner can invoke only the reserved action after preconditions and source validation', () => {
  const f = fixture(), auth = f.authorize([f.cases[0]!]);
  startCases(f.root, { ...auth, id: 'runner', target: f.base.targetEvidence });
  const request = { id: 'runner', caseId: 'first', target: f.base.targetEvidence };
  const action = { ...request, checkpoint: 'result' };
  const invoke = () => verifyCaseCheckpoint(f.root, action, [f.definition], f.base.target);
  assert.throws(invoke, /Reserve/);
  prepareCheckpoint(f.root, request);
  assert.throws(() => verifyCaseCheckpoint(f.root, { ...request, checkpoint: 'precondition' }, [f.definition], f.base.target), /starting state/);
  observeCheckpoint(f.root, { ...f.observation, ...request, checkpoint: 'precondition', outcome: 'matched' });
  prepareCheckpoint(f.root, request);
  invoke();
  f.base.put(f.current.path, { requirement: 'Changed before invocation' });
  assert.throws(invoke, /evidence is missing or changed/);
});

test('resuming an interrupted dependent case reuses a valid prerequisite and rechecks starting state', async () => {
  const f = fixture(), auth = f.authorize(f.cases.slice(0, 2));
  startCases(f.root, { ...auth, id: 'original', target: f.base.targetEvidence });
  const result = await runApprovedCases(f.root, 'original', { target: () => f.base.targetEvidence, execute: step =>
    ({ ...f.observation, outcome: step.caseId === 'dependent' && step.checkpoint.id === 'result' ? 'interrupted' : 'matched' }) });
  assert.deepEqual(result.session.attempts.map(item => item.status), ['Pass', 'Partial']);
  startCases(f.root, { ...auth, id: 'resumed', target: f.base.targetEvidence, previous: result.receipt, caseIds: ['dependent'] });
  const checkpoints: string[] = [];
  const resumed = await runApprovedCases(f.root, 'resumed', { target: () => f.base.targetEvidence, execute: step => {
    checkpoints.push(step.checkpoint.id);
    return { ...f.observation, outcome: 'matched' };
  } });
  assert.deepEqual(checkpoints, ['precondition', 'result']);
  assert.equal(resumed.session.attempts[0]?.status, 'Pass');
});
