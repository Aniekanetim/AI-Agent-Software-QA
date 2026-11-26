import { prepareCompanyBasis } from '../company-context/runtime.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { companyFixture } from './company-fixture.js';
import { startCases, runApprovedCases, prepareCheckpoint, observeCheckpoint, readCaseBatch } from '../execution/cases.js';
import { readObject, immutable } from '../company-context/store.js';
import { assertCompanyBasis, refreshReceipt, bindBasis } from '../company-context/guards.js';
import { releaseFixture } from './release-fixture.js';
import { recordAssessment, retainRun } from '../release/round.js';
import { currentAssessment, reviewHandoff, currentReleaseRegression, prepareReleaseSources } from '../release/handoff.js';
import { regressionFixture } from './regression-fixture.js';
import { bindReleaseScope, releaseScope } from '../release/scope.js';
import { findTicket, transitionTicket } from '../board/board.js';
import { ingestPr } from '../github/github.js';
import { recordEquivalent } from '../company-context/knowledge.js';
import type { Claim } from '../company-context/types.js';
import { readState, writeState } from '../onboarding/state.js';
import * as menu from '../settings/menu.js';
import * as config from '../company-context/config.js';
import { recordAnalysis, inspectedSources } from '../company-context/knowledge.js';
import { retainFixResults, recordFixReview, fixStatus, prepareFixSources, defectCompletion } from '../regression/fix.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  await prepareCompanyBasis(f.root, f.assignment, ['other'], () => f.adapter, { purpose: 'execution', id: 'blocked', target: { buildId: 'synthetic-build', environment: 'staging' } });
  assert.equal(prepareCheckpoint(f.root, { id: 'blocked', caseId: 'independent', target: f.observed }).state, 'ready');
});
test('CC-28 approved multi-case batch preserves independent progress after source change', async () => {
  const f = await workflowFixture(); startCases(f.root, { id: 'batch', batch: f.batch, approval: f.approval, target: f.observed });
  f.adapter.messages[0]!.editedTs = '700.000001'; f.adapter.messages[0]!.text = 'Changed criterion'; await f.run();
  let actions = 0; const result = await runApprovedCases(f.root, 'batch', { companyAdapter: () => f.adapter, target: () => f.observed, execute: () => { actions++; return { outcome: 'matched', evidence: [f.observation], source: 'Synthetic agent-operated checkpoint' }; } });
  assert.equal(actions, 2); assert.equal(result.session.attempts.find(item => item.caseId === 'dependent')!.status, 'Blocked'); assert.equal(result.session.attempts.find(item => item.caseId === 'independent')!.status, 'Pass');
});
test('CC-29 a reviewed batch runs to completion with zero routine approval prompts', async () => {
  const f = await workflowFixture(); startCases(f.root, { id: 'authorized', batch: f.batch, approval: f.approval, target: f.observed });
  const result = await runApprovedCases(f.root, 'authorized', { companyAdapter: () => f.adapter, target: () => f.observed, execute: () => ({ outcome: 'matched', evidence: [f.observation], source: 'Synthetic runner' }) });
  assert(result.session.attempts.every(item => item.status === 'Pass')); assert.equal(result.session.finished, true);
});
test('CC-33/34 a changed decision blocks a previously valid release assessment before handoff', async () => {
  const f = await companyFixture(); const a = f.authorize(); const base = releaseFixture(f.root, 'QA-001'); base.bind();
  const run = base.put('passing-run.json', base.run('passing', 'Pass')); retainRun(f.root, { round: base.roundRef, run });
  const { assessment } = recordAssessment(f.root, { round: base.roundRef, runs: [run] });
  await prepareReleaseSources(f.root, { assignment: a.assignment, assessment }, () => f.adapter);
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
  const final = await runApprovedCases(f.root, 'resumed', { companyAdapter: () => f.adapter, target: () => f.observed, execute: () => ({ outcome: 'matched', evidence: [f.observation], source: 'Synthetic original approved runner' }) });
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
  const execution = await runApprovedCases(f.root, 'source-bound', { companyAdapter: () => f.adapter, target: () => target, execute: () => ({ outcome: 'matched', source: 'Synthetic actual runner', evidence: [base.put('source-bound-observation.json', { source: 'Synthetic actual product-state observation' })] }) });
  const run = base.put('source-bound-run.json', { schemaVersion: 1, id: 'source-bound', round: roundRef, target: base.target, observedAt: new Date().toISOString(), targetEvidence: target,
    observations: [{ checkId: 'shared', conditionId: 'route', outcome: 'Pass', evidence: [execution.receipt], caseExecution: { receipt: execution.receipt, caseId: 'shared' } }] });
  retainRun(f.root, { round: roundRef, run }); const { assessment } = recordAssessment(f.root, { round: roundRef, runs: [run] });
  await prepareReleaseSources(f.root, { assignment: a.assignment, assessment }, () => f.adapter);
  const ticket = findTicket(f.root, 'QA-001'), route = { channel: 'recorded' as const, recipient: 'Synthetic release owner', destination: 'Synthetic handoff evidence', acknowledgementRequired: false };
  const targetObservation = base.put('source-bound-g5-target.json', { ...base.target, observedAt: new Date().toISOString(), source: 'Synthetic G5 served-build readback' });
  const regressionDigest = currentReleaseRegression(f.root, a.assignment).digest;
  const decision = base.put('source-bound-g5.json', { gate: 'G5', decision: 'Approved', reviewer: 'Synthetic human QA', source: 'Synthetic actual informed G5', packet: a.packet,
    ticketId: ticket.id, ticketRevision: ticket.revision, target: base.target, handoff: { assessment, route, targetObservation, regressionDigest, understandings: [a.understanding] } });
  const delivery = base.put('source-bound-delivery.json', { decisionSha256: decision.sha256, recipient: route.recipient, destination: route.destination, state: 'delivered', source: 'Synthetic observed handoff delivery' });
  await prepareReleaseSources(f.root, { assignment: a.assignment, assessment, action: 'close', id: ticket.revision, decision }, () => f.adapter);
  transitionTicket(f.root, { id: 'source-bound-close', ticketId: ticket.id, expectedRevision: ticket.revision, to: 'Tested-Ok', release: { decision, delivery, requireCases: true },
    decision: { actor: 'Synthetic human QA', source: 'Synthetic actual completion decision', reason: 'Reviewed module evidence and source basis', evidence: [decision], scope: { kind: 'assignment' }, checkpoint: 'G5 complete', nextOwner: route.recipient, nextAction: 'Review retained handoff', handoff: 'Synthetic handoff delivered' } });
  assert.equal(findTicket(f.root, ticket.id).status, 'Tested-Ok');
});

test('complete synthetic adoption, changed context, reviewed continuation, fix regression and handoff', async () => {
  const f = await workflowFixture();
  const state = readState(f.root); state.value.completed = true; writeState(f.root, state.value, state.revision);
  let actions = 0;
  const runner = { companyAdapter: () => f.adapter, target: () => f.observed, execute: () => { actions++; return { outcome: 'matched' as const, source: 'Synthetic observed approved action', evidence: [f.observation] }; } };
  startCases(f.root, { id: 'onboarded', batch: f.batch, approval: f.approval, target: f.observed });
  const original = await runApprovedCases(f.root, 'onboarded', runner); assert(original.session.attempts.every(a => a.status === 'Pass')); assert.equal(actions, 4);

  f.adapter.channelList.push({ id: 'C3', name: 'company-operations', type: 'public', member: true, archived: false, shared: false });
  f.adapter.messages.push({ channelId: 'C3', ts: '104.000001', authorId: 'U2', text: 'Office opening hours; unrelated to the synthetic payment criteria.' });
  const catalog = await config.discoverChannels(f.root, 'slack', f.adapter, { source: 'Synthetic current workspace inventory' });
  menu.openMenu(f.root, 'Synthetic user adds a channel'); menu.chooseArea(f.root, 'companyContext');
  menu.startEdit(f.root, { id: 'add-operations', prompt: 'Follow company operations too?', source: 'Synthetic informed selection', file: '.local/company-context.json' });
  menu.presentEdit(f.root); config.markEdit(f.root, 'asked', 'Synthetic actual presentation');
  const selected = { ...f.selected, selection: { ...f.selected.selection, channelIds: ['C1', 'C2', 'C3'], catalog: catalog.catalog } };
  const preview = config.previewConfiguration(f.root, { bindings: [selected], source: 'Synthetic proposed channel expansion' });
  menu.saveCompanyEdit(f.root, { preview: preview.preview, digest: preview.digest, response: f.put('add-channel-response.json', { source: 'Synthetic actual user selection' }), source: 'Synthetic confirmed channel expansion' }); menu.closeMenu(f.root);
  assert.equal(readState(f.root).value.completed, true);
  assert.equal((await f.run(1)).job.state, 'partial'); assert.equal((await f.run(1)).job.state, 'partial'); assert.equal((await f.run()).job.state, 'complete');
  const beforeChange = f.authorize({ both: true });
  const rebind = (name: string, basis: ReturnType<typeof f.authorize>, batchInput: any) => {
    const batch = f.put(name + '-batch.json', { ...batchInput, understanding: basis.understanding });
    const approval = f.put(name + '-g2.json', { gate: 'G2', decision: 'Approved', assignment: basis.assignment, understanding: basis.understanding, scopeReview: basis.g1, caseBatch: batch, packet: basis.packet, reviewer: 'Synthetic human QA', source: 'Synthetic informed batch review' });
    return { batch, approval };
  };
  const old = rebind('before-change', beforeChange, readObject(f.root, f.batch));
  startCases(f.root, { id: 'changed-sources', ...old, target: f.observed });
  f.adapter.messages[0]!.editedTs = '900.000001'; f.adapter.messages[0]!.text = 'Retry must preserve payment identity and show the original reference.';
  const changed = await runApprovedCases(f.root, 'changed-sources', runner);
  assert.equal(changed.session.attempts.find(a => a.caseId === 'dependent')!.status, 'Blocked');
  assert.equal(changed.session.attempts.find(a => a.caseId === 'independent')!.status, 'Pass');
  const revised = f.authorize({ both: true, statement: f.adapter.messages[0]!.text });
  const continued = rebind('revised', revised, readObject(f.root, f.batch));
  startCases(f.root, { id: 'reviewed-continuation', ...continued, target: f.observed });
  assert((await runApprovedCases(f.root, 'reviewed-continuation', runner)).session.attempts.every(a => a.status === 'Pass'));

  const base = releaseFixture(f.root, 'QA-001'), defect = { source: 'local', ticketId: 'BUG-001' };
  ingestPr(f.root, { repository: 'fixture/product', number: 1, title: 'Synthetic integrated release', url: 'https://github.com/fixture/product/pull/1', head: 'a'.repeat(40), base: 'main', labels: [], draft: false, mergeCommit: null, fromFork: false },
    { repository: 'fixture/product', branches: ['main'], labels: [], includeDrafts: false, reporting: 'localOnly' }, 'Synthetic observed PR intake');
  mkdirSync(resolve(f.root, 'QA task management Board/Retest'), { recursive: true });
  writeFileSync(resolve(f.root, 'QA task management Board/Retest/BUG-001.md'), '# BUG-001: Synthetic reference display defect\n\n| Type | Bug |\n| Parent assignment | QA-001 |\n');
  const child = { ...revised, basis: { ...revised.basis, assignment: defect } };
  const childBasis = immutable(f.root, 'basis', { ...child.basis, dependencies: child.basis.dependencies.map(d => ({ ...d, criterionIds: d.criterionIds.map(id => id === 'rule' ? 'route-rule' : id) })) });
  const childUnderstanding = f.put('child-understanding.json', { ...readObject<any>(f.root, child.understanding), assignment: defect, companyContext: childBasis,
    sources: readObject<any>(f.root, child.understanding).sources.map((s: any) => ({ ...s, id: s.id === 'rule' ? 'route-rule' : s.id })),
    flows: readObject<any>(f.root, child.understanding).flows.map((s: any) => ({ ...s, id: s.id === 'retry' ? 'route' : s.id, criteria: s.criteria.map((id: string) => id === 'rule' ? 'route-rule' : id) })) });
  const childG1 = f.put('child-g1.json', { ...readObject<any>(f.root, child.g1), assignment: defect, understanding: childUnderstanding });
  bindBasis(f.root, { basis: childBasis, approval: childG1, source: 'Synthetic reviewed mapped fix criteria' }); refreshReceipt(f.root, defect);
  const bug = findTicket(f.root, defect.ticketId);
  const fixed = regressionFixture(f.root, defect, bug.revision, { parent: revised.assignment, base, cases: true, understanding: childUnderstanding }); fixed.approve();
  const target = f.put('served-release-target.json', { ...base.target, source: 'Synthetic observed release build', observedAt: new Date().toISOString() });
  const plan = readObject<any>(f.root, fixed.plan);
  for (const phase of ['confirmation', 'regression']) {
    const batch = plan.caseBatches.find((b: any) => b.batchId === phase).batch;
    const id = 'fix-' + phase; startCases(f.root, { id, batch, approval: fixed.g4, target });
    const result = await runApprovedCases(f.root, id, { ...runner, target: () => target }); assert(result.session.attempts.every(a => a.status === 'Pass'));
    const design = readCaseBatch(f.root, batch);
    const run = f.put(id + '-run.json', { schemaVersion: 1, id, round: fixed.roundRef, target: base.target, observedAt: new Date().toISOString(), targetEvidence: target,
      observations: [...design.cases.values()].map(c => ({ checkId: c.checkId, conditionId: c.conditionId, context: c.context, outcome: 'Pass', evidence: [result.receipt], caseExecution: { receipt: result.receipt, caseId: c.id } })) });
    retainRun(f.root, { round: fixed.roundRef, run }); retainFixResults(f.root, { fix: fixed.key, plan: fixed.plan, batchId: phase, round: fixed.roundRef, run });
    if (phase === 'confirmation') { assert.equal(findTicket(f.root, defect.ticketId).status, 'Retest'); assert.throws(() => fixed.review(), /regression|confirmation|Complete/); }
  }
  await prepareFixSources(f.root, { fix: fixed.key }, () => f.adapter);
  const draftFixDecision = fixed.review([], false);
  const fixDecision = f.put('observed-fix-review.json', { ...readObject<any>(f.root, draftFixDecision), targetObservation: f.put('fix-review-build.json', { ...base.target, fixRevision: 'r1', source: 'Synthetic served fix readback after both batches', observedAt: new Date().toISOString() }) });
  recordFixReview(f.root, { fix: fixed.key, review: fixDecision, requireCases: true }); assert.equal(fixStatus(f.root, fixed.key).state, 'reviewed');
  assert.throws(() => defectCompletion(f.root, defect, bug.revision, { fix: fixed.key }, undefined, false, true), /Prepare/);
  await prepareFixSources(f.root, { fix: fixed.key, close: fixDecision }, () => f.adapter);
  transitionTicket(f.root, { id: 'integrated-fix-close', ticketId: bug.id, expectedRevision: bug.revision, to: 'Tested-Ok', defect: { fix: fixed.key },
    decision: { actor: 'Synthetic QA', source: 'Synthetic reviewed fix closure', reason: 'Original confirmation and authorized regression passed', evidence: [fixDecision], scope: { kind: 'assignment' }, checkpoint: 'Scoped G5 complete', nextOwner: 'Synthetic release owner', nextAction: 'Include verified fix evidence in release', handoff: 'Synthetic scoped fix evidence retained' } });
  assert.equal(findTicket(f.root, bug.id).status, 'Tested-Ok');

  const definition = f.put('release-definition.json', { expected: revised.basis.dependencies[0]!.claim, action: 'Retry preserves identity and displays original reference' });
  const library = { ...base.library, conditions: [{ ...base.library.conditions[0]!, basis: revised.claim }], checks: [{ ...base.library.checks[0]!, definition }] };
  const libraryRef = f.put('release-library.json', library);
  const final = rebind('release', revised, { schemaVersion: 1, assignment: revised.assignment, target: base.target, cases: [{ id: 'shared', flowId: 'retry', checkId: 'shared', conditionId: 'route', criteria: ['rule'], definition, dependsOn: [], checkpoints: [{ id: 'precondition', action: 'Observe payment', expected: 'Saved payment exists' }, { id: 'result', action: 'Retry', expected: 'Original reference displayed; one payment remains' }] }] });
  const applicability = f.put('release-applicability.json', { ...readObject<any>(f.root, base.applicability), library: libraryRef });
  const round = { ...base.round, library: libraryRef, applicability, caseBatches: [final.batch] }, roundRef = f.put('release-round.json', round);
  const approval = f.put('release-scope-g2.json', { ...readObject<any>(f.root, base.approvalFor('local', round, roundRef, 'integrated', [{ defect, fixRevision: 'r1' }])), ...readObject<any>(f.root, final.approval),
    scopeReview: f.put('release-scope-g1.json', { ...readObject<any>(f.root, readObject<any>(f.root, base.approvalFor('local', round, roundRef, 'integrated', [{ defect, fixRevision: 'r1' }])).scopeReview), understanding: revised.understanding }), round: roundRef });
  bindReleaseScope(f.root, { assignment: revised.assignment, round: roundRef, approval, expectedRevision: releaseScope(f.root, revised.assignment).revision, requireCases: true });
  startCases(f.root, { id: 'final-release', batch: final.batch, approval, target });
  const result = await runApprovedCases(f.root, 'final-release', { ...runner, target: () => target }); assert(result.session.attempts.every(a => a.status === 'Pass'));
  const run = f.put('final-run.json', { schemaVersion: 1, id: 'final-run', round: roundRef, target: base.target, targetEvidence: target, observedAt: new Date().toISOString(), observations: [{ checkId: 'shared', conditionId: 'route', outcome: 'Pass', evidence: [result.receipt], caseExecution: { receipt: result.receipt, caseId: 'shared' } }] });
  retainRun(f.root, { round: roundRef, run }); const { assessment } = recordAssessment(f.root, { round: roundRef, runs: [run] });
  await prepareReleaseSources(f.root, { assignment: revised.assignment, assessment }, () => f.adapter);
  const ticket = findTicket(f.root, 'QA-001'), route = { channel: 'recorded' as const, recipient: 'Synthetic release owner', destination: 'Synthetic handoff record', acknowledgementRequired: false };
  const decision = f.put('integrated-g5.json', { gate: 'G5', decision: 'Approved', reviewer: 'Synthetic human QA', source: 'Synthetic informed release review', packet: revised.packet, ticketId: ticket.id, ticketRevision: ticket.revision, target: base.target,
    handoff: { assessment, route, targetObservation: f.put('g5-build.json', { ...base.target, observedAt: new Date().toISOString(), source: 'Synthetic served-build recheck' }), regressionDigest: currentReleaseRegression(f.root, revised.assignment).digest, understandings: [revised.understanding] } });
  f.adapter.messages.push({ channelId: 'C1', ts: '105.000001', threadTs: '100.000001', authorId: 'U2', text: 'Meeting moved to Thursday; no change to the payment rule.' });
  await assert.rejects(prepareReleaseSources(f.root, { assignment: revised.assignment, assessment, action: 'close', id: ticket.revision, decision }, () => f.adapter), /Analyze/);
  recordAnalysis(f.root, { bindingId: f.selected.id, sources: inspectedSources(f.root, f.selected.id).map(s => s.ref), reason: 'Synthetic owner follow-up concerns meeting time; reviewed payment expectation is unchanged.', source: 'Synthetic actual context analysis' });
  await prepareReleaseSources(f.root, { assignment: revised.assignment, assessment, action: 'close', id: ticket.revision, decision }, () => f.adapter);
  const delivery = f.put('integrated-delivery.json', { decisionSha256: decision.sha256, recipient: route.recipient, destination: route.destination, state: 'delivered', source: 'Synthetic observed authorized handoff' });
  transitionTicket(f.root, { id: 'integrated-close', ticketId: ticket.id, expectedRevision: ticket.revision, to: 'Tested-Ok', release: { decision, delivery, requireCases: true }, decision: { actor: 'Synthetic QA', source: 'Synthetic actual closure decision', reason: 'Reviewed module coverage, source basis and included fix regression', evidence: [decision], scope: { kind: 'assignment' }, checkpoint: 'G5 complete', nextOwner: route.recipient, nextAction: 'Review handoff', handoff: 'Synthetic delivery observed' } });
  assert.equal(findTicket(f.root, ticket.id).status, 'Tested-Ok'); assert.equal(readState(f.root).value.completed, true);
  assert(original.session.attempts.every(a => a.status === 'Pass')); assert.equal(actions, 16);
});
