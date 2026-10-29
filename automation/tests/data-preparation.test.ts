import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { evidence } from '../shared/store.js';
import { assessData, type DataPreparation } from '../data/preparation.js';

function fixture() {
  const root = resolve('.local/data-fixtures', randomUUID()); mkdirSync(root, { recursive: true });
  writeFileSync(resolve(root, 'source.md'), '# Synthetic data rules and preparation scope only; no actual permission or application state.');
  const ref = evidence(root, 'source.md');
  const plan: DataPreparation = { schemaVersion: 1, id: 'SYNTHETIC-DATA', revision: '1', task: ref, environment: 'synthetic-staging', build: 'synthetic-build', items: [{ id: 'DATA-1', conditionIds: ['COND-1'], requiredState: 'Synthetic local boundary and invalid inputs', kind: 'localInput', approach: 'generate', classification: 'synthetic', basis: [ref], authorization: [], preparation: { status: 'planned', method: 'Generate synthetic boundary values from the named rule', dataReference: null, generationRules: 'Synthetic min/max and invalid equivalents', evidence: [] }, stateVerification: { status: 'notVerified', dataReference: null, environment: null, build: null, evidence: [] }, identity: { mode: 'none', originalReference: null }, controls: { isolation: 'Private fixture per run', concurrency: 'Unique run reference', retention: 'Preserve failed attempt evidence', cleanup: 'No application deletion authorized' }, blocker: null }] };
  const item = plan.items[0]!;
  const prepare = () => { item.preparation = { ...item.preparation, status: 'prepared', dataReference: 'synthetic-record-1', evidence: [ref] }; };
  const verify = () => { item.stateVerification = { status: 'verified', dataReference: item.preparation.dataReference, environment: plan.environment, build: plan.build, evidence: [ref] }; };
  return { root, ref, plan, item, prepare, verify };
}
test('missing attached data can be generated locally within the task instead of automatically blocking', () => {
  const f = fixture(), result = assessData(f.root, f.plan); assert.equal(result.items[0]!.status, 'canPrepare'); assert.equal(result.productVerdict, 'Not assessed');
  f.prepare(); assert.equal(assessData(f.root, f.plan).items[0]!.status, 'inputsPrepared');
});
test('prepared application records require permission and verified starting state', () => {
  const f = fixture(); f.item.kind = 'applicationState'; f.item.approach = 'create';
  assert.equal(assessData(f.root, f.plan).items[0]!.status, 'needsAuthorization');
  f.item.authorization = [f.ref]; assert.equal(assessData(f.root, f.plan).items[0]!.status, 'canPrepare');
  f.prepare(); assert.equal(assessData(f.root, f.plan).items[0]!.status, 'needsStateVerification');
  f.verify(); assert.equal(assessData(f.root, f.plan).status, 'preparedForReview');
});
test('generating values never establishes externally confirmed state', () => {
  const f = fixture(); f.item.kind = 'externalState'; f.item.authorization = [f.ref]; f.prepare();
  assert.equal(assessData(f.root, f.plan).items[0]!.status, 'needsStateVerification');
});
test('unknown data rules remain a clarification rather than fabricated valid inputs', () => {
  const f = fixture(); f.item.basis = []; assert.equal(assessData(f.root, f.plan).items[0]!.status, 'needsClarification');
  f.prepare(); f.verify(); assert.notEqual(assessData(f.root, f.plan).status, 'preparedForReview');
});
test('continuation requires the exact original reference and preserves fresh-state distinctions', () => {
  const f = fixture(); f.item.approach = 'reuse'; f.item.identity = { mode: 'reuse', originalReference: 'original-identity' }; f.item.authorization = [f.ref]; f.prepare(); f.verify();
  assert.notEqual(assessData(f.root, f.plan).status, 'preparedForReview');
  f.item.preparation.dataReference = 'original-identity'; f.verify(); assert.equal(assessData(f.root, f.plan).status, 'preparedForReview');
  f.item.identity.originalReference = null; assert.notEqual(assessData(f.root, f.plan).status, 'preparedForReview');
});
test('state evidence must refer to the same identity, environment and build', () => {
  const f = fixture(); f.item.kind = 'applicationState'; f.item.authorization = [f.ref]; f.prepare(); f.verify();
  f.item.stateVerification.dataReference = 'different-identity'; assert.notEqual(assessData(f.root, f.plan).status, 'preparedForReview');
  f.verify(); f.plan.environment = 'different-environment'; assert.notEqual(assessData(f.root, f.plan).status, 'preparedForReview');
  f.verify(); f.plan.build = 'different-build'; assert.notEqual(assessData(f.root, f.plan).status, 'preparedForReview');
});
test('a restricted item carries precise assistance while another item remains independently preparable', () => {
  const f = fixture(); f.plan.items.push({ ...structuredClone(f.item), id: 'DATA-2', kind: 'externalState', preparation: { ...f.item.preparation, status: 'blocked' }, blocker: { reason: 'Synthetic external settlement unavailable', attempts: 'Checked approved sandbox; no authorized confirmation operation exists', needed: 'Provide a sandbox-confirmed settlement or approved simulator', owner: 'Fixture technical owner', questionReference: 'SYNTHETIC-TICKET#Q1' } });
  const result = assessData(f.root, f.plan); assert.equal(result.items[0]!.status, 'canPrepare'); assert.equal(result.items[1]!.status, 'blocked'); assert(result.items[1]!.blocker?.needed.includes('settlement'));
});
test('blocked records require details and cannot claim ready state at the same time', () => {
  const f = fixture(); f.item.preparation.status = 'blocked'; assert.throws(() => assessData(f.root, f.plan), /specific owner question/);
  f.item.blocker = { reason: 'Synthetic', attempts: 'No authorized mechanism', needed: 'Approved dataset', owner: 'Fixture owner', questionReference: 'Q1' }; f.item.stateVerification.status = 'verified';
  assert.throws(() => assessData(f.root, f.plan), /blocked preparation/);
});
test('changed source or missing preparation evidence prevents a current readiness claim', () => {
  const f = fixture(); f.prepare(); f.item.preparation.evidence = []; assert.equal(assessData(f.root, f.plan).items[0]!.status, 'needsPreparation');
  f.item.preparation.evidence = [f.ref]; writeFileSync(resolve(f.root, 'source.md'), '# Changed synthetic source'); assert.notEqual(assessData(f.root, f.plan).status, 'preparedForReview');
});
test('secret fields, unsupported schemas and duplicate identities are rejected', () => {
  const f = fixture(); assert.throws(() => assessData(f.root, { ...f.plan, schemaVersion: 2 } as any));
  assert.throws(() => assessData(f.root, { ...f.plan, items: [...f.plan.items, ...f.plan.items] }));
  assert.throws(() => assessData(f.root, { ...f.plan, accessToken: 'synthetic' } as any));
});
test('repeated assessment preserves source, input and prior failed-attempt evidence without data creation', () => {
  const f = fixture(); writeFileSync(resolve(f.root, 'prior-failure.md'), '# Synthetic retained failure');
  writeFileSync(resolve(f.root, 'plan.json'), JSON.stringify(f.plan)); const before = readFileSync(resolve(f.root, 'plan.json')); const files = readdirSync(f.root);
  assert.deepEqual(assessData(f.root, f.plan), assessData(f.root, f.plan)); assert.deepEqual(readFileSync(resolve(f.root, 'plan.json')), before); assert.deepEqual(readdirSync(f.root), files); assert(readFileSync(resolve(f.root, 'prior-failure.md'), 'utf8').includes('retained'));
});
