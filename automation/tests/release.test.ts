import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { browseLibrary } from '../release/library.js';
import { assessRound, recordAssessment, retainRun, verifyAssessment } from '../release/round.js';
import { currentAssessment, currentReleaseRegression, reviewHandoff, type Route } from '../release/handoff.js';
import { bindReleaseScope, invalidateReleaseScope, releaseScope } from '../release/scope.js';
import { releaseFixture } from './release-fixture.js';

function fixture() {
  const folder = resolve('output/release-fixtures');
  mkdirSync(folder, { recursive: true });
  const root = mkdtempSync(resolve(folder, 'run-'));
  return { root, ...releaseFixture(root, 'QA-001') };
}

test('the test library lists a shared check in two modules and the round counts one execution', () => {
  const f = fixture();
  const tree = browseLibrary(f.root, f.round.library);
  assert.deepEqual(tree.modules.map(module => module.testTypes[0]?.suites[0]?.checks[0]?.id), ['shared', 'shared']);
  const ref = f.put('passed.json', f.run('pass', 'Pass'));
  const report = assessRound(f.root, { round: f.roundRef, runs: [ref] });
  assert.equal(report.uniqueCheckExecutions, 1);
  assert.equal(report.state, 'evidenceReady');
  assert.deepEqual(report.modules.map(module => module.testTypes[0]?.obligations[0]?.outcome), ['Pass', 'Pass']);
  assert.deepEqual(report.modules.map(module => module.testTypes[0]?.suites[0]?.checks[0]?.results[0]?.runIds), [['pass'], ['pass']]);
});

test('missing module scope, wrong builds and unlinked passes cannot conceal a required gap', () => {
  const f = fixture();
  const failure = f.put('failure.json', f.run('failure', 'Fail'));
  const otherBuild = f.put('other.json', { ...f.run('other-build', 'Pass'), target: { ...f.target, buildId: 'build-2' } });
  const unlinked = f.put('unlinked.json', f.run('unlinked', 'Pass'));
  const report = assessRound(f.root, { round: f.roundRef, runs: [failure, otherBuild, unlinked] });
  assert.equal(report.ineligible.length, 1);
  assert.deepEqual(report.gaps.map(gap => gap.outcome), ['Fail', 'Fail']);
  const gapRound = f.put('round-incomplete.json', { ...f.round, obligations: f.round.obligations.slice(0, 1) });
  assert(assessRound(f.root, { round: gapRound, runs: [] }).gaps.some(gap => gap.id === 'reporting/type/api'));
});

test('an explicit eligible retest resolves a failure while retaining historical assessments', () => {
  const f = fixture();
  const failure = f.put('failure.json', f.run('failure', 'Fail'));
  retainRun(f.root, { round: f.roundRef, run: failure });
  assert.throws(() => recordAssessment(f.root, { round: f.roundRef, runs: [] }), /every retained run/);
  const prior = recordAssessment(f.root, { round: f.roundRef, runs: [failure] });
  const invalid = f.put('invalid-retest.json', f.run('invalid', 'Pass', 'missing'));
  assert.throws(() => retainRun(f.root, { round: f.roundRef, run: invalid }), /Retain the earlier run/);
  assert.equal(verifyAssessment(f.root, prior.assessment, true).state, 'gaps');
  const pass = f.put('retest.json', f.run('retest', 'Pass', 'failure'));
  const index = retainRun(f.root, { round: f.roundRef, run: pass });
  assert.equal(retainRun(f.root, { round: f.roundRef, run: pass }).runs.length, 2);
  assert.throws(() => verifyAssessment(f.root, prior.assessment, true), /Refresh/);
  assert.equal(verifyAssessment(f.root, prior.assessment).state, 'gaps');
  const current = recordAssessment(f.root, index);
  assert.equal(current.report.state, 'evidenceReady');
  const attempts = current.report.modules[0]?.testTypes[0]?.obligations[0]?.checks[0]?.attempts;
  assert.deepEqual(attempts?.map(attempt => attempt.observation.outcome), ['Fail', 'Pass']);
  const newLibrary = f.put('library-v2.json', { ...f.library, checks: [{ ...f.library.checks[0], name: 'Updated suite check' }] });
  assert.equal(browseLibrary(f.root, newLibrary).modules[0]?.testTypes[0]?.suites[0]?.checks[0]?.name, 'Updated suite check');
  assert.equal(verifyAssessment(f.root, current.assessment).library.sha256, f.round.library.sha256);
});

test('G5 can accept only scope-permitted gaps with evidence for every owner decision', () => {
  const f = fixture();
  const assignment = { source: 'local', ticketId: 'QA-001' };
  f.bind();
  const route: Route = { channel: 'recorded', destination: 'Fixture QA conversation', recipient: 'Release owner', acknowledgementRequired: false };
  const packet = f.put('packet.json', { source: 'Synthetic review packet' });
  const decision = { gate: 'G5', decision: 'Approved with limits', reviewer: 'Fixture reviewer', source: 'Synthetic reviewer decision', packet, target: f.target };
  const run = f.put('failure.json', f.run('failure', 'Fail'));
  const blocked = recordAssessment(f.root, retainRun(f.root, { round: f.roundRef, run }));
  const targetObservation = f.g5Target;
  assert.throws(() => reviewHandoff(f.root, { ...decision, handoff: { assessment: blocked.assessment, route, targetObservation } }, blocked.assessment, route, assignment), /blocking coverage gap/);
  const limited = { ...f.round, obligations: f.round.obligations.map(item => ({ ...item, exceptionAllowed: true })) };
  const limitedRound = f.put('round-limited.json', limited);
  f.bind('local', limited, limitedRound, 'limited');
  const failure = f.put('limited-failure.json', { ...f.run('limited-failure', 'Fail'), round: limitedRound });
  const { assessment, report } = recordAssessment(f.root, retainRun(f.root, { round: limitedRound, run: failure }));
  const handoff = { assessment, route, targetObservation, regressionDigest: currentReleaseRegression(f.root, assignment).digest,
    exceptions: report.gaps.map(gap => ({ gapId: gap.id, owner: 'Fixture risk owner', reason: 'Synthetic accepted limit', decision: packet })) };
  assert.throws(() => reviewHandoff(f.root, { ...decision, decision: 'Approved', handoff }, assessment, route, assignment), /Approved with limits/);
  assert.equal(reviewHandoff(f.root, { ...decision, handoff }, assessment, route, assignment).state, 'gaps');
});

test('release scope binds the independently approved coverage and rejects omitted checks', () => {
  const f = fixture(), assignment = { source: 'local', ticketId: 'QA-001' };
  const omitted = f.put('round-omitted.json', { ...f.round, obligations: f.round.obligations.slice(0, 1) });
  const approval = f.approvalFor('local', f.round, omitted, 'omitted');
  assert.throws(() => bindReleaseScope(f.root, { assignment, expectedRevision: null, round: omitted, approval }), /every G1 coverage obligation/);
  const omittedCheck = f.put('round-missing-check.json', {
    ...f.round, obligations: f.round.obligations.map((row, index) => index ? row : { ...row, checkIds: [] }),
  });
  const approvalWithoutCheck = f.approvalFor('local', f.round, omittedCheck, 'omitted-check');
  assert.throws(() => bindReleaseScope(f.root, { assignment, expectedRevision: null, round: omittedCheck, approval: approvalWithoutCheck }), /every G1 coverage obligation/);
  assert.equal(releaseScope(f.root, assignment).revision, null);
});

test('G5 rejects an earlier or invalidated round while retaining historical assessment evidence', () => {
  const f = fixture(), assignment = { source: 'local', ticketId: 'QA-001' };
  f.bind();
  const run = f.put('run.json', f.run('run', 'Pass'));
  const { assessment } = recordAssessment(f.root, retainRun(f.root, { round: f.roundRef, run }));
  assert.equal(currentAssessment(f.root, assessment, assignment).state, 'evidenceReady');
  const original = releaseScope(f.root, assignment);
  const observation = f.put('material-change.json', { assignment, round: f.roundRef, reason: 'New build served', source: 'Synthetic observation' });
  invalidateReleaseScope(f.root, { assignment, expectedRevision: original.revision!, observation });
  assert.throws(() => currentAssessment(f.root, assessment, assignment), /current reviewed release round/);
  const next = { ...f.round, id: 'round-2', target: { ...f.target, buildId: 'build-2' } };
  const ref = f.put('round-2.json', next);
  f.bind('local', next, ref, 'next');
  assert.throws(() => currentAssessment(f.root, assessment, assignment), /current reviewed release round/);
  assert.equal(verifyAssessment(f.root, assessment).target.buildId, 'build-1');
  assert.throws(() => bindReleaseScope(f.root, { assignment, expectedRevision: releaseScope(f.root, assignment).revision,
    round: f.roundRef, approval: f.approvalFor('local', f.round, f.roundRef, 'initial') }), /renewed G2/);
});

test('scope requires the regression baseline and zero executions still cannot support G5', () => {
  const f = fixture(), assignment = { source: 'local', ticketId: 'QA-001' };
  const plan = { ...f.round, obligations: f.round.obligations.map(item => ({
    ...item, state: 'excluded' as const, checkIds: [], reason: 'Synthetic exclusion', decision: f.round.scope,
  })) };
  const round = f.put('excluded-round.json', plan);
  assert.throws(() => f.bind('local', plan, round), /omits the required regression check/);
  f.bind('local', f.round, f.roundRef, 'valid');
  const input = { round: f.roundRef, runs: [] };
  const { report } = recordAssessment(f.root, input);
  assert(report.gaps.some(gap => gap.outcome === 'No checks executed'));
  const legacy = f.put('legacy-assessment.json', { schemaVersion: 1, input, report: assessRound(f.root, input, 1) });
  assert.equal(verifyAssessment(f.root, legacy).uniqueCheckExecutions, 0);
  const route: Route = { channel: 'recorded', destination: 'Fixture QA conversation', recipient: 'Release owner', acknowledgementRequired: false };
  const decision = { gate: 'G5', decision: 'Approved', reviewer: 'Fixture reviewer', source: 'Synthetic reviewer decision',
    packet: f.round.scope, target: f.target, handoff: { assessment: legacy, route, targetObservation: f.g5Target } };
  assert.throws(() => reviewHandoff(f.root, decision, legacy, route, assignment), /Zero executed checks/);
});

test('assessment exposes a required applicability coordinate omitted from the reviewed round', () => {
  const f = fixture();
  const round = { ...f.round, applicability: f.applicability, obligations: f.round.obligations.slice(0, 1) };
  const roundRef = f.put('coverage-omission.json', round);
  const { report } = recordAssessment(f.root, { round: roundRef, runs: [] });
  assert.equal(report.state, 'gaps');
  assert(report.gaps.some(gap => gap.id === 'reporting/api/route' && !gap.exceptionAllowed));
});
