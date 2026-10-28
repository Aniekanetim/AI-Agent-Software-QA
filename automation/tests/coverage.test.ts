import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assessCoverage, type CoverageSnapshot } from '../coverage/coverage.js';
import { evidence } from '../shared/store.js';
import { emptyState, readState } from '../onboarding/state.js';

function fixture() {
  const root = resolve('.local/coverage-fixtures', randomUUID()); mkdirSync(root, { recursive: true });
  writeFileSync(resolve(root, 'matrix.md'), '# Synthetic canonical conditions\n');
  writeFileSync(resolve(root, 'observations.md'), '# Synthetic observations, not product outcomes\n');
  const snapshot: CoverageSnapshot = {
    schemaVersion: 1, scopeId: 'SYNTHETIC-SCOPE', scopeRevision: '1', targetBuild: 'synthetic-build-a',
    sourceRecords: [evidence(root, 'matrix.md'), evidence(root, 'observations.md')],
    conditions: [{ id: 'C1', group: 'contract', basisId: 'SYNTHETIC-AC-1', basisState: 'accepted', definition: 'Synthetic valid upper limit', applicability: 'included' },
      { id: 'C2', group: 'contract', basisId: 'SYNTHETIC-AC-2', basisState: 'accepted', definition: 'Synthetic invalid upper limit', applicability: 'included' }],
    checks: [{ id: 'TC1', conditionIds: ['C1'], interface: 'API', objectives: ['functionality'], perspectives: ['positive', 'edge'], techniques: ['boundary-value analysis'], rationale: 'Synthetic boundary risk' },
      { id: 'TC2', conditionIds: ['C2'], interface: 'API', objectives: ['functionality', 'security'], perspectives: ['negative', 'edge'], techniques: ['boundary-value analysis'], rationale: 'Synthetic rejection risk' }],
    execution: { runId: 'SYNTHETIC-RUN', observedAt: '2026-10-28T12:00:00Z', scopeRevision: '1', targetBuild: 'synthetic-build-a', results: [] },
  };
  const result = (checkId: string, outcome: 'Pass' | 'Fail') => ({ checkId, outcome, exercisedConditionIds: snapshot.checks.find(c => c.id === checkId)!.conditionIds, evidence: [evidence(root, 'observations.md')] });
  return { root, snapshot, result };
}

test('coverage counts overlapping positive/negative/edge labels once and preserves a failure', () => {
  const f = fixture(); f.snapshot.execution!.results = [f.result('TC1', 'Pass'), f.result('TC2', 'Fail')];
  const report = assessCoverage(f.root, f.snapshot);
  assert.equal(report.status, 'recorded'); assert.equal(report.productVerdict, 'Not assessed');
  assert.deepEqual(report.recordedCounts.checks, { planned: 2, executed: 2, pass: 1, fail: 1, partial: 0, blocked: 0, notRun: 0 });
  assert.equal(report.currentCoverage?.conditions.exercised, 2); assert.equal(report.currentCoverage?.conditions.exercisedPercent, 100);
});

test('designed, blocked, partial and absent execution remain distinct', () => {
  const f = fixture(); f.snapshot.conditions.push({ ...f.snapshot.conditions[0]!, id: 'C3', definition: 'Another synthetic condition' });
  f.snapshot.checks[0]!.conditionIds.push('C3');
  f.snapshot.execution!.results = [{ ...f.result('TC1', 'Pass'), outcome: 'Partial', exercisedConditionIds: ['C1'], note: 'Synthetic observation ended before C3' },
    { checkId: 'TC2', outcome: 'Blocked', exercisedConditionIds: [], evidence: [], note: 'Synthetic dependency unavailable' }];
  let report = assessCoverage(f.root, f.snapshot);
  assert.equal(report.recordedCounts.conditions.designed, 3); assert.equal(report.recordedCounts.conditions.exercised, 1);
  assert.equal(report.recordedCounts.checks.executed, 1); assert.equal(report.recordedCounts.checks.blocked, 1);
  f.snapshot.execution!.results = []; report = assessCoverage(f.root, f.snapshot);
  assert.equal(report.recordedCounts.checks.notRun, 2); assert.equal(report.recordedCounts.conditions.exercised, 0);
});

test('planning has no execution and an empty denominator is undefined', () => {
  const f = fixture(); f.snapshot.execution = null;
  assert.equal(assessCoverage(f.root, f.snapshot).recordedCounts.conditions.exercised, 0);
  f.snapshot.checks = []; f.snapshot.conditions = []; f.snapshot.sourceRecords = [];
  const report = assessCoverage(f.root, f.snapshot);
  assert.equal(report.status, 'planning'); assert.equal(report.recordedCounts.conditions.exercisedPercent, null);
});

test('unknown intent permits observations but cannot become a correctness verdict', () => {
  const f = fixture(); f.snapshot.conditions[0]!.basisState = 'unresolved'; f.snapshot.execution!.results = [f.result('TC1', 'Pass')];
  assert.throws(() => assessCoverage(f.root, f.snapshot), /Unresolved intent/);
  f.snapshot.execution!.results[0] = { ...f.result('TC1', 'Pass'), outcome: 'Partial', note: 'Synthetic owner question remains open' };
  const report = assessCoverage(f.root, f.snapshot);
  assert.equal(report.recordedCounts.conditions.unresolved, 1); assert(report.limits.some(x => x.includes('Unresolved')));
});

test('changed build or scope retains historical counts without a current coverage claim', () => {
  for (const field of ['targetBuild', 'scopeRevision'] as const) {
    const f = fixture(); f.snapshot.execution!.results = [f.result('TC1', 'Pass')]; f.snapshot[field] = 'changed';
    const report = assessCoverage(f.root, f.snapshot);
    assert.equal(report.status, 'needsReview'); assert.equal(report.currentCoverage, null);
    assert.equal(report.recordedCounts.checks.pass, 1); assert(report.issues.length);
  }
});

test('changed source or result evidence requires impact review and does not rewrite the snapshot', () => {
  const f = fixture(); f.snapshot.execution!.results = [f.result('TC1', 'Pass')]; const before = JSON.stringify(f.snapshot);
  writeFileSync(resolve(f.root, 'matrix.md'), '# Synthetic changed requirement basis\n');
  let report = assessCoverage(f.root, f.snapshot); assert.equal(report.status, 'needsReview'); assert.equal(report.currentCoverage, null);
  writeFileSync(resolve(f.root, 'observations.md'), '# Synthetic amended observation\n');
  report = assessCoverage(f.root, f.snapshot); assert(report.issues.some(x => x.startsWith('Result TC1')));
  assert.equal(JSON.stringify(f.snapshot), before);
});

test('undisclosed build is labelled without inventing exact-revision verification', () => {
  const f = fixture(); f.snapshot.targetBuild = null; f.snapshot.execution!.targetBuild = null;
  const report = assessCoverage(f.root, f.snapshot); assert.equal(report.revisionIdentified, false);
  assert(report.limits.some(x => x.includes('undisclosed'))); assert.equal(report.productVerdict, 'Not assessed');
});

test('exclusions remain visible with reasons and cannot inflate included coverage', () => {
  const f = fixture(); f.snapshot.conditions.push({ ...f.snapshot.conditions[0]!, id: 'C3', applicability: 'excluded', reason: 'Synthetic reviewed exclusion reference' });
  const report = assessCoverage(f.root, f.snapshot); assert.equal(report.recordedCounts.conditions.included, 2); assert.equal(report.recordedCounts.conditions.excluded, 1);
  delete f.snapshot.conditions[2]!.reason; assert.throws(() => assessCoverage(f.root, f.snapshot), /reason/);
});

test('duplicate cases, conditions and attempts or dangling links are rejected', () => {
  const f = fixture(); f.snapshot.checks.push({ ...f.snapshot.checks[0]! }); assert.throws(() => assessCoverage(f.root, f.snapshot), /Duplicate check/); f.snapshot.checks.pop();
  f.snapshot.conditions.push({ ...f.snapshot.conditions[0]! }); assert.throws(() => assessCoverage(f.root, f.snapshot), /Duplicate condition/); f.snapshot.conditions.pop();
  f.snapshot.checks[0]!.conditionIds = ['UNKNOWN']; assert.throws(() => assessCoverage(f.root, f.snapshot), /Unknown condition/); f.snapshot.checks[0]!.conditionIds = ['C1'];
  f.snapshot.execution!.results = [f.result('TC1', 'Pass'), f.result('TC1', 'Fail')]; assert.throws(() => assessCoverage(f.root, f.snapshot), /Duplicate result/);
});

test('unsupported schema and unjustified completion cannot produce totals', () => {
  const f = fixture(); assert.throws(() => assessCoverage(f.root, { ...f.snapshot, schemaVersion: 2 } as unknown as CoverageSnapshot), /Unsupported/);
  f.snapshot.execution!.results = [{ ...f.result('TC1', 'Pass'), exercisedConditionIds: [] }]; assert.throws(() => assessCoverage(f.root, f.snapshot), /actual evidence/);
  f.snapshot.execution!.results = [{ ...f.result('TC1', 'Pass'), evidence: [] }]; assert.throws(() => assessCoverage(f.root, f.snapshot), /actual evidence/);
  f.snapshot.execution!.results = [{ ...f.result('TC1', 'Pass'), outcome: 'Blocked', note: 'Synthetic block' }]; assert.throws(() => assessCoverage(f.root, f.snapshot), /cannot imply/);
});

test('multiple objectives/groups do not multiply check counts and shared conditions are deduplicated', () => {
  const f = fixture(); f.snapshot.conditions[1]!.group = 'authorization'; f.snapshot.checks[0]!.conditionIds.push('C2');
  f.snapshot.execution!.results = [f.result('TC1', 'Pass'), f.result('TC2', 'Pass')];
  const report = assessCoverage(f.root, f.snapshot);
  assert.equal(report.recordedCounts.conditions.exercised, 2); assert.equal(report.recordedCounts.checks.executed, 2);
  assert.equal(report.recordedCounts.groups.length, 2);
});

test('assessment resumes from existing records without modifying prior onboarding answers or run state', () => {
  const f = fixture(); mkdirSync(resolve(f.root, '.local')); const state = emptyState(); state.roadmapShown = true; state.roadmapSource = 'Synthetic prior conversation';
  writeFileSync(resolve(f.root, '.local/onboarding-state.json'), JSON.stringify(state));
  f.snapshot.execution!.results = [f.result('TC1', 'Pass')];
  const before = readFileSync(resolve(f.root, '.local/onboarding-state.json'), 'utf8');
  assert.deepEqual(assessCoverage(f.root, f.snapshot), assessCoverage(f.root, JSON.parse(JSON.stringify(f.snapshot))));
  assert.equal(readState(f.root).value.roadmapSource, state.roadmapSource);
  assert.equal(readFileSync(resolve(f.root, '.local/onboarding-state.json'), 'utf8'), before);
  assert.deepEqual(readdirSync(resolve(f.root, '.local')), ['onboarding-state.json']);
});
