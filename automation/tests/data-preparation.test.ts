import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { evidence } from '../shared/store.js';
import { assessData, type DataPreparation } from '../data/preparation.js';
import { datasetDirectory, inspectDatasets, type Dataset } from '../data/datasets.js';
import { assertDataReady, type DataScope } from '../data/readiness.js';
import { preflightLocalData } from '../data/local.js';
import { previewIntake, registerIntake, type IntakeRequest } from '../data/intake.js';
import { findTicket, upgradeBoard } from '../board/board.js';

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

function write(root: string, path: string, value: unknown) {
  const file = resolve(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
  return evidence(root, path);
}

test('dataset inventory checks shared and private placement and file hashes without exposing values', () => {
  const f = fixture();
  const asset = write(f.root, `${datasetDirectory}/boundary/cases.json`, { value: 'synthetic fixture value' });
  const dataset: Dataset = { id: 'boundary', revision: '1', owner: 'Fixture QA', purpose: 'Boundary inputs', classification: 'synthetic',
    environments: ['synthetic-staging'], source: { kind: 'shared', files: [asset] } };
  const index = { schemaVersion: 1 as const, datasets: [dataset] };
  const result = inspectDatasets(f.root, index);
  assert.equal(result.datasets[0]?.status, 'filesVerified');
  assert(!JSON.stringify(result).includes('synthetic fixture value'));
  write(f.root, asset.path, { value: 'different' });
  assert.equal(inspectDatasets(f.root, index).datasets[0]?.status, 'needsReview');
  const privateAsset = write(f.root, '.local/test-data/rows.json', ['synthetic']);
  dataset.source = { kind: 'shared', files: [privateAsset] };
  assert.equal(inspectDatasets(f.root, index).datasets[0]?.status, 'needsReview');
  dataset.source.kind = 'private';
  assert.throws(() => inspectDatasets(f.root, index), /private file references/);
  assert.equal(inspectDatasets(f.root, index, true).datasets[0]?.status, 'filesVerified');
  dataset.source = { kind: 'external', reference: 'fixture-storage/datasets/boundaries/revision-1' };
  assert.equal(inspectDatasets(f.root, index).datasets[0]?.status, 'externalReference');
  dataset.source.reference = 'https://example.test/dataset?signature=fixture';
  assert.throws(() => inspectDatasets(f.root, index), /URL credentials, query or fragment/);
});

test('managed readiness holds only the selected checks whose data is blocked or unbound', () => {
  const f = fixture(); f.prepare();
  const blocked = { ...structuredClone(f.item), id: 'DATA-2', conditionIds: ['COND-2'], kind: 'externalState' as const,
    preparation: { ...f.item.preparation, status: 'blocked' as const },
    blocker: { reason: 'Settlement unavailable', attempts: 'Checked fixture', needed: 'Supply sandbox confirmation', owner: 'Fixture owner', questionReference: 'Q1' } };
  f.plan.items.push(blocked);
  const target = { environment: f.plan.environment, buildId: f.plan.build! };
  const scope: DataScope = { schemaVersion: 1, mode: 'required', checks: [{ id: 'READY', conditionIds: ['COND-1'], dataItemIds: ['DATA-1'] }],
    plan: write(f.root, '.local/plan.json', f.plan) };
  assert.deepEqual(assertDataReady(f.root, scope, target).items.map(item => item.id), ['DATA-1']);
  scope.checks.push({ id: 'HELD', conditionIds: ['COND-2'], dataItemIds: ['DATA-2'] });
  assert.throws(() => assertDataReady(f.root, scope, target), /Check HELD, data DATA-2: blocked.*Supply sandbox confirmation/);
  scope.checks[1]!.dataItemIds = [];
  assert.throws(() => assertDataReady(f.root, scope, target), /HELD must bind all data items/);
  assert.throws(() => assertDataReady(f.root, scope, { ...target, buildId: 'other' }), /environment and build/);
});

test('a reviewed dataset must retain its permitted environment, classification and exact file hashes', () => {
  const f = fixture(); f.prepare();
  const asset = write(f.root, `${datasetDirectory}/boundary/cases.json`, { amount: 100 });
  const dataset: Dataset = { id: 'boundary', revision: '1', owner: 'Fixture QA', purpose: 'Boundary inputs', classification: 'synthetic',
    environments: [f.plan.environment], source: { kind: 'shared', files: [asset] } };
  const index = write(f.root, `${datasetDirectory}/index.json`, { schemaVersion: 1, datasets: [dataset] });
  f.item.dataset = { index, id: dataset.id, revision: dataset.revision };
  const target = { environment: f.plan.environment, buildId: f.plan.build! };
  const scope: DataScope = { schemaVersion: 1, mode: 'required', checks: [{ id: 'READY', conditionIds: ['COND-1'], dataItemIds: ['DATA-1'] }],
    plan: write(f.root, '.local/plan.json', f.plan) };
  assert.deepEqual(assertDataReady(f.root, scope, target).items[0]?.dataset, f.item.dataset);
  write(f.root, asset.path, { amount: 101 });
  assert.throws(() => assertDataReady(f.root, scope, target), /selected dataset files and recorded hashes/);
});

test('new intake revisions remain usable alongside an earlier approved data scope', () => {
  const f = fixture(); f.prepare();
  const file = resolve(f.root, 'supplied.csv');
  writeFileSync(file, 'amount\n100\n');
  const request: IntakeRequest = {
    dataset: { id: 'boundary', revision: '1', owner: 'Fixture QA', purpose: 'Boundary inputs', classification: 'synthetic', environments: [f.plan.environment] },
    reference: 'fixture-source/boundary', mode: 'curate', source: { file }, fields: [{ from: 1, to: 'amount' }],
  };
  const register = () => registerIntake(f.root, request, previewIntake(f.root, request).previewSha256, 'Synthetic review reference');
  const first = register();
  f.item.dataset = { index: first.index, id: first.id, revision: first.revision };
  const scope: DataScope = {
    schemaVersion: 1, mode: 'required', checks: [{ id: 'READY', conditionIds: ['COND-1'], dataItemIds: ['DATA-1'] }],
    plan: write(f.root, '.local/approved-plan.json', f.plan),
  };
  const target = { environment: f.plan.environment, buildId: f.plan.build! };
  const before = assertDataReady(f.root, scope, target);
  request.dataset.revision = '2';
  writeFileSync(file, 'amount\n101\n');
  assert.notEqual(register().index.path, first.index.path);
  assert.deepEqual(assertDataReady(f.root, scope, target), before);
});

test('a refreshed starting state must match the reviewed plan, identity, target and validity window', () => {
  const f = fixture(); f.item.kind = 'applicationState'; f.item.approach = 'reuse'; f.item.authorization = [f.ref];
  f.prepare(); f.item.identity = { mode: 'reuse', originalReference: f.item.preparation.dataReference };
  f.verify();
  const target = { environment: f.plan.environment, buildId: f.plan.build! };
  const now = Date.parse('2026-01-01T00:00:30Z');
  f.item.stateVerification.observedAt = '2000-01-01T00:00:00Z';
  f.item.stateVerification.recheckAfter = '2000-01-01T00:01:00Z';
  const scope: DataScope = { schemaVersion: 1, mode: 'required', checks: [{ id: 'RETEST', conditionIds: ['COND-1'], dataItemIds: ['DATA-1'] }],
    plan: write(f.root, '.local/plan.json', f.plan), maxStateAgeMs: 60_000 };
  assert.throws(() => assertDataReady(f.root, scope, target, [], now), /observe the starting state again/);
  const refreshed = { ...f.item.stateVerification, observedAt: '2026-01-01T00:00:00Z', recheckAfter: '2026-01-01T00:01:00Z' };
  const observation = (verification: typeof refreshed, planSha256 = scope.plan!.sha256) => write(f.root, '.local/state.json', { planSha256, itemId: f.item.id, verification });
  assert.equal(assertDataReady(f.root, scope, target, [observation(refreshed)], now).items[0]?.dataReference, 'synthetic-record-1');
  assert.throws(() => assertDataReady(f.root, scope, target, [observation({ ...refreshed, dataReference: 'replacement' })], now), /needsStateVerification/);
  assert.throws(() => assertDataReady(f.root, scope, target, [observation({ ...refreshed, recheckAfter: '2026-01-01T00:02:00Z' })], now), /validity window/);
  assert.throws(() => assertDataReady(f.root, scope, target, [observation(refreshed, 'different-plan')], now), /approved plan hash/);
});

test('reviewed local data preflight tolerates unrelated ticket notes and checks the current generation', () => {
  const f = fixture(); upgradeBoard(f.root, 'Synthetic folder layout');
  const ticketId = 'DATA-10', path = `QA task management Board/Ready for QA/${ticketId}.md`;
  writeFileSync(resolve(f.root, path), `# ${ticketId}: Synthetic local task\n`);
  const ticket = findTicket(f.root, ticketId);
  const target = { ticketId, generation: ticket.generation, environment: f.plan.environment, buildId: f.plan.build!, source: 'Fixture observation', observedAt: '2026-01-01T00:00:00Z' };
  const dataScope: DataScope = { schemaVersion: 1, mode: 'none', checks: [{ id: 'UI', conditionIds: ['COND-1'], dataItemIds: [] }] };
  const gates = { G2: write(f.root, '.local/g2.json', { ticketId, generation: ticket.generation, target, gate: 'G2', decision: 'Approved', packet: f.ref, reviewer: 'Fixture QA', source: 'Fixture response', dataScope }) };
  const request = { ticketId, generation: ticket.generation, gates, target: write(f.root, '.local/target.json', target) };
  writeFileSync(resolve(f.root, path), `# ${ticketId}: Synthetic local task\n\nUnrelated note.\n`);
  assert.equal(preflightLocalData(f.root, request).data.mode, 'none');
  assert.throws(() => preflightLocalData(f.root, { ...request, generation: 'previous' }), /lifecycle changed/);
  assert.throws(() => assertDataReady(f.root, { ...dataScope, plan: f.ref }, target), /data-independent scope/);
});
