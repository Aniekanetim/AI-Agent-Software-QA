import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { browseLibrary } from '../release/library.js';
import { assessRound, recordAssessment, retainRun, verifyAssessment } from '../release/round.js';
import { reviewHandoff, type Route } from '../release/handoff.js';
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
  const route: Route = { channel: 'recorded', destination: 'Fixture QA conversation', recipient: 'Release owner', acknowledgementRequired: false };
  const packet = f.put('packet.json', { source: 'Synthetic review packet' });
  const decision = { gate: 'G5', decision: 'Approved with limits', reviewer: 'Fixture reviewer', source: 'Synthetic reviewer decision', packet, target: f.target };
  const blocked = recordAssessment(f.root, { round: f.roundRef, runs: [] });
  assert.throws(() => reviewHandoff(f.root, { ...decision, handoff: { assessment: blocked.assessment, route } }, blocked.assessment, route, 'QA-001'), /blocking coverage gap/);
  const limitedRound = f.put('round-limited.json', { ...f.round, obligations: f.round.obligations.map(item => ({ ...item, exceptionAllowed: true })) });
  const { assessment, report } = recordAssessment(f.root, { round: limitedRound, runs: [] });
  const handoff = { assessment, route, exceptions: report.gaps.map(gap => ({ gapId: gap.id, owner: 'Fixture risk owner', reason: 'Synthetic accepted limit', decision: packet })) };
  assert.throws(() => reviewHandoff(f.root, { ...decision, decision: 'Approved', handoff }, assessment, route, 'QA-001'), /Approved with limits/);
  assert.equal(reviewHandoff(f.root, { ...decision, handoff }, assessment, route, 'QA-001').state, 'gaps');
});
