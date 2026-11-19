import test from 'node:test';
import assert from 'node:assert/strict';
import { companyFixture } from './company-fixture.js';
import { startCases, runApprovedCases, prepareCheckpoint, observeCheckpoint, readCaseBatch } from '../execution/cases.js';
import { readObject } from '../company-context/store.js';
import { assertCompanyBasis, refreshReceipt } from '../company-context/guards.js';
import { releaseFixture } from './release-fixture.js';
import { recordAssessment, retainRun } from '../release/round.js';
import { currentAssessment, reviewHandoff, currentReleaseRegression } from '../release/handoff.js';
import { regressionFixture } from './regression-fixture.js';
import { bindReleaseScope, releaseScope } from '../release/scope.js';
import { findTicket, transitionTicket } from '../board/board.js';
import { ingestPr } from '../github/github.js';
import { recordEquivalent } from '../company-context/knowledge.js';
import type { Claim } from '../company-context/types.js';

async function workflowFixture() {
  const f = await companyFixture(['C1', 'C2']); const a = f.authorize({ both: true });
  const target = { buildId: 'synthetic-build', environment: 'staging' };
  const observed = f.put('actual-target.json', { ...target, observedAt: new Date().toISOString(), source: 'Synthetic target observation' });
  const definition = f.put('case-definition.json', { steps: ['Observe starting state', 'Perform approved action'], expected: 'Applicable rule holds' });
  const checkpoints = [{ id: 'precondition', action: 'Verify actual state', expected: 'Expected actor/state' }, { id: 'result', action: 'Perform action', expected: 'Expected result' }];
  const batch = f.put('case-batch.json', { schemaVersion: 1, assignment: a.assignment, target, understanding: a.understanding,
    cases: [{ id: 'dependent', flowId: 'retry', checkId: 'retry', conditionId: 'retry', criteria: ['rule'], definition, dependsOn: [], checkpoints },
      { id: 'independent', flowId: 'list', checkId: 'list', conditionId: 'list', criteria: ['other'], definition, dependsOn: [], checkpoints }] });
  const approval = f.put('g2.json', { gate: 'G2', decision: 'Approved', assignment: a.assignment, reviewer: 'Synthetic QA', source: 'Synthetic actual informed batch approval', packet: a.packet, scopeReview: a.g1, understanding: a.understanding, caseBatch: batch });
  const observation = f.put('observation.json', { source: 'Synthetic runner state evidence' });
  return { ...f, ...a, batch, approval, observed, observation };
}
test('CC-27 changed decision prevents a dependent action before the runner executes', async () => {
  const f = await workflowFixture(); startCases(f.root, { id: 'blocked', batch: f.batch, approval: f.approval, target: f.observed });
  f.adapter.messages[0]!.editedTs = '600.000001'; f.adapter.messages[0]!.text = 'Changed expected behavior'; await f.run();
  const step = prepareCheckpoint(f.root, { id: 'blocked', caseId: 'dependent', target: f.observed }); assert.equal(step.state, 'Blocked');
  assert.equal(prepareCheckpoint(f.root, { id: 'blocked', caseId: 'independent', target: f.observed }).state, 'ready');
});
test('CC-28 approved multi-case batch preserves independent progress after source change', async () => {
  const f = await workflowFixture(); startCases(f.root, { id: 'batch', batch: f.batch, approval: f.approval, target: f.observed });
  f.adapter.messages[0]!.editedTs = '700.000001'; f.adapter.messages[0]!.text = 'Changed criterion'; await f.run();
  let actions = 0; const result = await runApprovedCases(f.root, 'batch', { target: () => f.observed, execute: () => { actions++; return { outcome: 'matched', evidence: [f.observation], source: 'Synthetic agent-operated checkpoint' }; } });
  assert.equal(actions, 2); assert.equal(result.session.attempts.find(item => item.caseId === 'dependent')!.status, 'Blocked'); assert.equal(result.session.attempts.find(item => item.caseId === 'independent')!.status, 'Pass');
});
test('CC-29 a reviewed batch runs to completion with zero routine approval prompts', async () => {
  const f = await workflowFixture(); startCases(f.root, { id: 'authorized', batch: f.batch, approval: f.approval, target: f.observed });
  const result = await runApprovedCases(f.root, 'authorized', { target: () => f.observed, execute: () => ({ outcome: 'matched', evidence: [f.observation], source: 'Synthetic runner' }) });
  assert(result.session.attempts.every(item => item.status === 'Pass')); assert.equal(result.session.finished, true);
});
test('CC-33/34 a changed decision blocks a previously valid release assessment before handoff', async () => {
  const f = await companyFixture(); const a = f.authorize(); const base = releaseFixture(f.root, 'QA-001'); base.bind();
  const run = base.put('passing-run.json', base.run('passing', 'Pass')); retainRun(f.root, { round: base.roundRef, run });
  const { assessment } = recordAssessment(f.root, { round: base.roundRef, runs: [run] });
  assert.equal(currentAssessment(f.root, assessment, a.assignment).target.buildId, base.target.buildId);
  f.adapter.messages[0]!.editedTs = '800.000001'; f.adapter.messages[0]!.text = 'New effective requirement'; await f.run();
  assert.throws(() => currentAssessment(f.root, assessment, a.assignment), /source changed/);
  assert.throws(() => reviewHandoff(f.root, { gate: 'G5', decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic actual G5', packet: a.packet, target: base.target,
    handoff: { assessment, route: { channel: 'recorded', destination: 'Synthetic handoff record', recipient: 'Synthetic release owner', acknowledgementRequired: false }, targetObservation: base.g5Target } }, assessment,
    { channel: 'recorded', destination: 'Synthetic handoff record', recipient: 'Synthetic release owner', acknowledgementRequired: false }, a.assignment), /source changed/);
});
test('CC-32 scoped fix review checks company context in addition to confirmation/regression', async () => {
  const f = await companyFixture(); f.authorize(); const fixed = regressionFixture(f.root, { source: 'local', ticketId: 'QA-001' }, 'synthetic-revision'); fixed.approve();
  await fixed.retain('confirmation', 'Pass'); await fixed.retain('regression', 'Pass');
  f.adapter.messages[0]!.editedTs = '900.000001'; f.adapter.messages[0]!.text = 'Changed acceptance policy'; await f.run();
  assert.throws(() => fixed.review(), /source changed/);
});
test('freshness holds resume under the original batch approval after valid unchanged source rereads', async () => {
  const f = await workflowFixture(); startCases(f.root, { id: 'first-attempt', batch: f.batch, approval: f.approval, target: f.observed });
  // A missing current receipt is a capability/evidence hold, not a changed product requirement.
  const { unlinkSync, readdirSync } = await import('node:fs'); const { resolve } = await import('node:path');
  const receipts = resolve(f.root, '.local/company-context/receipts'); for (const file of readdirSync(receipts)) unlinkSync(resolve(receipts, file));
  const first = await runApprovedCases(f.root, 'first-attempt', { target: () => f.observed, execute: () => { assert.fail('An unverified source allowed a product action.'); return { outcome: 'matched', evidence: [f.observation], source: 'Synthetic' }; } });
  assert(first.session.attempts.every(item => item.status === 'Blocked' && !item.reviewRequired));
  await f.run(); refreshReceipt(f.root, f.assignment);
  startCases(f.root, { id: 'resumed', batch: f.batch, approval: f.approval, target: f.observed, previous: first.receipt });
  const final = await runApprovedCases(f.root, 'resumed', { target: () => f.observed, execute: () => ({ outcome: 'matched', evidence: [f.observation], source: 'Synthetic original approved runner' }) });
  assert(final.session.attempts.every(item => item.status === 'Pass'));
});
test('source-bound case evidence reaches module-based G5 and an observed Tested-Ok handoff', async () => {
  const f = await companyFixture(); const a = f.authorize(); const base = releaseFixture(f.root, 'QA-001');
  const rule = { repository: 'fixture/product', branches: ['main'], labels: [], includeDrafts: false, reporting: 'localOnly' as const };
  ingestPr(f.root, { repository: rule.repository, number: 1, title: 'Synthetic source-bound release', url: 'https://github.com/fixture/product/pull/1', head: 'a'.repeat(40), base: 'main', labels: [], draft: false, mergeCommit: null, fromFork: false }, rule, 'Synthetic PR intake');
  const definition = base.put('source-bound-definition.json', { expected: 'Retry preserves one payment under the reviewed decision.' });
  const library = { ...base.library, conditions: [{ ...base.library.conditions[0]!, basis: a.claim }], checks: [{ ...base.library.checks[0]!, definition }] };
  const libraryRef = base.put('source-bound-library.json', library);
  const batch = base.put('source-bound-batch.json', { schemaVersion: 1, assignment: a.assignment, target: base.target, understanding: a.understanding,
    cases: [{ id: 'shared', flowId: 'retry', checkId: 'shared', conditionId: 'route', criteria: ['rule'], definition, dependsOn: [], checkpoints: [
      { id: 'precondition', action: 'Observe starting state', expected: 'One payment is saved' }, { id: 'result', action: 'Retry within reviewed synthetic scope', expected: 'One payment remains' }] }] });
  const applicability = base.put('source-bound-applicability.json', { ...readObject<any>(f.root, base.applicability), library: libraryRef });
  const round = { ...base.round, library: libraryRef, applicability, caseBatches: [batch] }, roundRef = base.put('source-bound-round.json', round);
  const previousApproval = readObject<any>(f.root, base.approvalFor('local', round, roundRef, 'source-bound'));
  const scopeReview = base.put('source-bound-g1.json', { ...readObject<any>(f.root, previousApproval.scopeReview), understanding: a.understanding });
  const approval = base.put('source-bound-g2.json', { ...previousApproval, scopeReview, understanding: a.understanding, caseBatch: batch });
  bindReleaseScope(f.root, { assignment: a.assignment, expectedRevision: releaseScope(f.root, a.assignment).revision, round: roundRef, approval, requireCases: true });
  const target = base.put('source-bound-target.json', { ...base.target, observedAt: new Date().toISOString(), source: 'Synthetic served-build observation' });
  startCases(f.root, { id: 'source-bound', batch, approval, target });
  const execution = await runApprovedCases(f.root, 'source-bound', { target: () => target, execute: () => ({ outcome: 'matched', source: 'Synthetic actual runner', evidence: [base.put('source-bound-observation.json', { source: 'Synthetic actual product-state observation' })] }) });
  const run = base.put('source-bound-run.json', { schemaVersion: 1, id: 'source-bound', round: roundRef, target: base.target, observedAt: new Date().toISOString(), targetEvidence: target,
    observations: [{ checkId: 'shared', conditionId: 'route', outcome: 'Pass', evidence: [execution.receipt], caseExecution: { receipt: execution.receipt, caseId: 'shared' } }] });
  retainRun(f.root, { round: roundRef, run }); const { assessment } = recordAssessment(f.root, { round: roundRef, runs: [run] });
  const ticket = findTicket(f.root, 'QA-001'), route = { channel: 'recorded' as const, recipient: 'Synthetic release owner', destination: 'Synthetic handoff evidence', acknowledgementRequired: false };
  const targetObservation = base.put('source-bound-g5-target.json', { ...base.target, observedAt: new Date().toISOString(), source: 'Synthetic G5 served-build readback' });
  const regressionDigest = currentReleaseRegression(f.root, a.assignment).digest;
  const decision = base.put('source-bound-g5.json', { gate: 'G5', decision: 'Approved', reviewer: 'Synthetic human QA', source: 'Synthetic actual informed G5', packet: a.packet,
    ticketId: ticket.id, ticketRevision: ticket.revision, target: base.target, handoff: { assessment, route, targetObservation, regressionDigest, understandings: [a.understanding] } });
  const delivery = base.put('source-bound-delivery.json', { decisionSha256: decision.sha256, recipient: route.recipient, destination: route.destination, state: 'delivered', source: 'Synthetic observed handoff delivery' });
  transitionTicket(f.root, { id: 'source-bound-close', ticketId: ticket.id, expectedRevision: ticket.revision, to: 'Tested-Ok', release: { decision, delivery, requireCases: true },
    decision: { actor: 'Synthetic human QA', source: 'Synthetic actual completion decision', reason: 'Reviewed module evidence and source basis', evidence: [decision], scope: { kind: 'assignment' }, checkpoint: 'G5 complete', nextOwner: route.recipient, nextAction: 'Review retained handoff', handoff: 'Synthetic handoff delivered' } });
  assert.equal(findTicket(f.root, ticket.id).status, 'Tested-Ok');
});
