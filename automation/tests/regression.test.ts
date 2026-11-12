import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { approveFixPlan, fixStatus, registerFix, requireVerifiedFix, retainFixResults } from '../regression/fix.js';
import { currentReleaseRegression, reviewHandoff, type Route } from '../release/handoff.js';
import { recordAssessment, retainRun } from '../release/round.js';
import { previewReleaseScope, releaseScope } from '../release/scope.js';
import { evidence } from '../shared/store.js';
import { regressionFixture } from './regression-fixture.js';
import { releaseFixture } from './release-fixture.js';

function fixture(linkIntake = true, linkBoard = true) {
  const folder = resolve('output/regression-fixtures');
  mkdirSync(folder, { recursive: true });
  const root = mkdtempSync(resolve(folder, 'run-'));
  const parent = { source: 'local', ticketId: 'QA-001' };
  const defect = { source: 'local', ticketId: 'BUG-001' };
  const base = releaseFixture(root, parent.ticketId);
  const child = resolve(root, 'QA task management Board', 'Retest', 'BUG-001.md');
  const parentLink = '| Parent assignment | [QA-001](../Ready%20for%20QA/QA-001.md) |\n';
  writeFileSync(child, '# BUG-001: Synthetic linked defect\n\n| Type | Bug |\n' + (linkBoard ? parentLink : ''));
  const fix = regressionFixture(root, defect, 'ticket-v1', { ...(linkIntake ? { parent } : {}), base });
  return { root, parent, defect, base, fix, child, parentLink };
}

test('duplicate intake resumes and same-build CI observations can satisfy multiple fixes without another run', () => {
  const { root, parent, defect, base, fix } = fixture();
  assert.equal(registerFix(root, { intake: fix.intake }).key, fix.key);
  fix.approve(); fix.retain('confirmation');
  const secondDefect = { ...defect, ticketId: 'BUG-002' };
  const second = regressionFixture(root, secondDefect, 'ticket-v1', { parent, base });
  second.approve(); second.retain('confirmation');
  const result = base.run('ci', 'Pass');
  result.observations[0]!.context = fix.context;
  const run = base.put('ci-run.json', result);
  retainRun(root, { round: base.roundRef, run });
  for (const item of [fix, second]) {
    const args = { fix: item.key, plan: item.plan, batchId: 'regression', round: base.roundRef, run };
    assert.equal(retainFixResults(root, args).state, 'reviewPending');
    assert.equal(retainFixResults(root, args).assessment?.batches[1]?.checks[0]?.attempts.length, 1);
    item.review();
    assert.equal(fixStatus(root, item.key).state, 'reviewed');
  }
});

test('wrong build and changed test context do not satisfy pending regression', () => {
  const { root, base, fix } = fixture();
  fix.approve(); fix.retain('confirmation');
  const result = base.run('changed-context', 'Pass');
  result.observations[0]!.context = base.put('different-context.json', { role: 'Different role' });
  const run = base.put('changed-context-run.json', result);
  retainRun(root, { round: base.roundRef, run });
  const args = { fix: fix.key, plan: fix.plan, batchId: 'regression', round: base.roundRef, run };
  assert.throws(() => retainFixResults(root, args), /matching check revision, condition and test context/);
  const target = { ...base.target, buildId: 'different-build' };
  const round = base.put('different-round.json', { ...base.round, id: 'different-round', target });
  const otherRun = base.put('different-build-run.json', { ...result, id: 'different-build', target, round,
    targetEvidence: base.put('different-build.json', { ...target, observedAt: '2026-01-01T00:00:00Z', source: 'Synthetic observation' }) });
  retainRun(root, { round, run: otherRun });
  assert.throws(() => retainFixResults(root, { ...args, round, run: otherRun }), /same observed build and environment/);
  assert.equal(fixStatus(root, fix.key).state, 'regressionPending');
  assert.throws(() => fix.review(), /every required regression check/);
});

test('reviewed regression failures require separate findings and blocking ones prevent parent handoff', () => {
  const { root, parent, defect, base, fix } = fixture();
  fix.approve(); fix.retain('confirmation'); fix.retain('regression', 'Fail');
  assert.throws(() => fix.review(), /each failing check/);
  const ticket = { source: 'local', ticketId: 'BUG-002' };
  const finding = { checkId: 'shared', conditionId: 'route', ticket, impact: 'blocking',
    evidence: base.put('new-bug-observation.json', { fix: fix.key, ticket, destination: 'Dev Todo', source: 'Synthetic readback' }) };
  fix.review([finding]);
  assert.equal(requireVerifiedFix(root, fix.key, defect).review.findings.length, 1);
  base.bind('local', base.round, base.roundRef, 'initial', [{ defect, fixRevision: 'r1' }]);
  assert.throws(() => currentReleaseRegression(root, parent), /blocks release/);
});

test('scope preview and binding catch an omitted fix through the canonical board alone, and G5 catches a new link', () => {
  const { root, parent, defect, base, fix, child, parentLink } = fixture(false, false);
  fix.approve(); fix.retain('confirmation');
  const run = base.put('parent-pass.json', base.run('parent-pass', 'Pass'));
  const { assessment } = recordAssessment(root, retainRun(root, { round: base.roundRef, run }));
  const route: Route = { channel: 'recorded', destination: 'Fixture QA discussion', recipient: 'Fixture owner', acknowledgementRequired: false };
  base.bind();
  const decision = { gate: 'G5', decision: 'Approved', reviewer: 'Fixture reviewer', source: 'Synthetic decision', packet: base.round.scope, target: base.target,
    handoff: { assessment, route, targetObservation: base.g5Target, regressionDigest: currentReleaseRegression(root, parent).digest } };
  assert.equal(reviewHandoff(root, decision, assessment, route, parent).state, 'evidenceReady');
  appendFileSync(child, parentLink);
  const current = releaseScope(root, parent);
  assert.throws(() => previewReleaseScope(root, { assignment: parent, round: base.roundRef,
    changeManifest: evidence(root, 'manifest-initial.json') }), /omits a known linked fix/);
  assert.throws(() => base.bind('local', base.round, base.roundRef, 'new-link'), /omits a known linked fix/);
  assert.throws(() => base.bind('local', base.round, base.roundRef, 'conflicting-revisions',
    [{ defect, fixRevision: 'r1' }, { defect, fixRevision: 'different-revision' }]), /one current fix revision per defect/);
  assert.equal(releaseScope(root, parent).revision, current.revision);
  assert.throws(() => reviewHandoff(root, decision, assessment, route, parent), /omits a known linked fix/);
  base.bind('local', base.round, base.roundRef, 'included', [{ defect, fixRevision: 'r1' }]);
  assert.throws(() => reviewHandoff(root, decision, assessment, route, parent), /reviewed confirmation and regression results/);
  fix.retain('regression'); fix.review();
  const regression = currentReleaseRegression(root, parent);
  assert.throws(() => reviewHandoff(root, decision, assessment, route, parent), /G5 must review the current regression/);
  const approved = { ...decision, handoff: { ...decision.handoff, regressionDigest: regression.digest } };
  assert.equal(reviewHandoff(root, approved, assessment, route, parent).state, 'evidenceReady');
  appendFileSync(child, '\nSynthetic child revision changed.\n');
  assert.throws(() => reviewHandoff(root, approved, assessment, route, parent), /G5 must review the current regression/);
});

test('linked defects outside the target need reviewed exclusions and same-build exclusions are rejected', () => {
  const { root, parent, defect, base } = fixture(false);
  const target = { ...base.target, buildId: 'build-2' };
  const round = { ...base.round, id: 'build-2', target };
  const roundRef = base.put('next-round.json', round);
  const evidence = base.put('deployment.json', { source: 'Synthetic deployment manifest' });
  assert.throws(() => base.bind('local', round, roundRef, 'unresolved'), /linked defect BUG-001 is included in this exact build/);
  const exclusion = (build: typeof target, name: string) => base.put(name, {
    assignment: parent, defect, target: build, reviewer: 'Fixture reviewer', source: 'Synthetic actual decision',
    reason: 'Fix is deployed in a different build.', evidence,
  });
  const stale = exclusion(base.target, 'stale-exclusion.json');
  assert.throws(() => base.bind('local', round, roundRef, 'stale', [], { exclusions: [stale] }), /exact assignment, defect and target/);
  base.bind('local', round, roundRef, 'excluded', [], { exclusions: [exclusion(target, 'exclusion.json')] });
  assert.equal(currentReleaseRegression(root, parent).relationships[0]?.exclusion?.path, 'exclusion.json');
  assert.throws(() => base.bind('local', base.round, base.roundRef, 'same-build', [{ defect, fixRevision: 'r1' }], { exclusions: [stale] }), /conflicts with evidence/);
});

test('a new fix revision invalidates active completion while preserving the original receipt', () => {
  const { root, parent, defect, base, fix } = fixture();
  fix.approve(); fix.retain('confirmation'); fix.retain('regression');
  const receipt = fix.review();
  const replacement = regressionFixture(root, defect, 'ticket-v2', { parent, base, fixRevision: 'r2', supersedes: fix.key });
  assert.equal(fixStatus(root, replacement.key).state, 'scopePending');
  assert.throws(() => requireVerifiedFix(root, fix.key, defect), /superseded/);
  assert.throws(() => approveFixPlan(root, { fix: fix.key, plan: fix.plan, approval: fix.g4 }), /superseded/);
  assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
});

test('a later matching failure in a linked CI round cannot be left out of the fix disposition', () => {
  const { root, defect, base, fix } = fixture();
  fix.approve(); fix.retain('confirmation');
  const passed = base.run('ci-pass', 'Pass');
  passed.observations[0]!.context = fix.context;
  const run = base.put('ci-pass.json', passed);
  retainRun(root, { round: base.roundRef, run });
  retainFixResults(root, { fix: fix.key, plan: fix.plan, batchId: 'regression', round: base.roundRef, run });
  fix.review();
  const failed = base.run('ci-failed', 'Fail');
  failed.observedAt = '2026-01-01T00:03:00Z';
  failed.observations[0]!.context = fix.context;
  const failure = base.put('ci-failure.json', failed);
  retainRun(root, { round: base.roundRef, run: failure });
  assert.equal(fixStatus(root, fix.key).assessment?.batches[1]?.checks[0]?.outcome, 'Fail');
  assert.throws(() => requireVerifiedFix(root, fix.key, defect), /current fix assessment/);
});

test('an earlier blocking regression needs a disposition even after a later build passes the originating checks', () => {
  const { root, parent, defect, base, fix } = fixture();
  fix.approve(); fix.retain('confirmation'); fix.retain('regression', 'Fail');
  const ticket = { source: 'local', ticketId: 'BUG-002' };
  fix.review([{ checkId: 'shared', conditionId: 'route', ticket, impact: 'blocking',
    evidence: base.put('blocking-regression.json', { fix: fix.key, ticket, destination: 'Dev Todo', source: 'Synthetic readback' }) }]);
  const target = { ...base.target, buildId: 'build-2' };
  const round = { ...base.round, id: 'build-2', target };
  const roundRef = base.put('next-release-round.json', round);
  const targetEvidence = base.put('next-target.json', { ...target, observedAt: '2026-01-01T00:00:00Z', source: 'Synthetic target inspection' });
  const replacement = regressionFixture(root, defect, 'ticket-v2', {
    parent, base: { ...base, target, targetEvidence, round, roundRef }, fixRevision: 'r2', supersedes: fix.key,
  });
  replacement.approve(); replacement.retain('confirmation'); replacement.retain('regression'); replacement.review();
  base.bind('local', round, roundRef, 'next', [{ defect, fixRevision: 'r2' }]);
  assert.throws(() => currentReleaseRegression(root, parent), /prior blocking regression BUG-002 still needs/);
});
