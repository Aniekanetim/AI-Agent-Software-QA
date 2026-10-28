import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { evidence } from '../shared/store.js';
import { emptyState, readState } from '../onboarding/state.js';
import { validateFlowMap, traceFlowMap, type FlowMapSnapshot, type Relationship } from '../flow-map/flow-map.js';

function fixture() {
  const root = resolve('.local/flow-map-fixtures', randomUUID()); mkdirSync(root, { recursive: true });
  for (const file of ['inventory.md', 'relationships.md', 'basis.md', 'cases.md']) writeFileSync(resolve(root, file), `# Synthetic ${file}; no application knowledge or approval\n`);
  const observations = { AB: { note: 'Synthetic cart total' }, BC: { note: 'Synthetic charge' }, CD: { note: 'Synthetic order' }, DE: { note: 'Synthetic refund' }, SB: { note: 'Synthetic shared dependency' }, SX: { note: 'Synthetic other feature' } };
  writeFileSync(resolve(root, 'observations.json'), JSON.stringify(observations));
  const map: FlowMapSnapshot = { schemaVersion: 1, mapId: 'SYNTHETIC-MAP', revision: '1', targetBuild: 'synthetic-build',
    sourceRecords: [evidence(root, 'inventory.md'), evidence(root, 'relationships.md')],
    features: ['A', 'B', 'C', 'D', 'E', 'S', 'X'].map(id => ({ id, name: `Synthetic ${id}`, kind: id === 'S' ? 'component' : 'feature', state: 'active', references: [evidence(root, 'inventory.md')], testLinkIds: [], gaps: [] })),
    relationships: [], testLinks: ['TC-A', 'TC-C', 'TC-E', 'TC-X', 'COND-AB', 'RISK-D', 'CHARTER-D'].map(id => ({ id, kind: id.startsWith('COND') ? 'condition' : id.startsWith('RISK') ? 'risk' : id.startsWith('CHARTER') ? 'charter' : 'check', reference: evidence(root, 'cases.md') })) };
  function edge(id: keyof typeof observations, from: string, to: string): Relationship {
    return { id, from, to, type: id.startsWith('S') ? 'sharedDependency' : 'data', state: 'active', transfer: `Synthetic transfer ${id}`, applicability: 'Synthetic authorized test role and configuration', recovery: 'Unknown; synthetic gap only',
      intended: { state: 'accepted', references: [evidence(root, 'basis.md')] }, observed: { state: 'observed', evidence: [evidence(root, 'observations.json', '/' + id)], environment: 'synthetic-fixture', build: 'synthetic-build', observedAt: '2026-10-28T12:00:00Z' },
      inference: null, discrepancy: null, gaps: [], refreshWhen: 'Synthetic source or build changes', testLinkIds: [] };
  }
  map.relationships = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C'), edge('CD', 'C', 'D'), edge('DE', 'D', 'E'), edge('SB', 'S', 'B'), edge('SX', 'S', 'X')];
  map.features.find(f => f.id === 'A')!.testLinkIds = ['TC-A']; map.features.find(f => f.id === 'C')!.testLinkIds = ['TC-C'];
  map.features.find(f => f.id === 'X')!.testLinkIds = ['TC-X']; map.relationships[0]!.testLinkIds = ['COND-AB']; map.relationships[1]!.testLinkIds = ['TC-C']; map.relationships[3]!.testLinkIds = ['TC-E'];
  return { root, map, observations };
}
const selected = (report: ReturnType<typeof traceFlowMap>) => report.recordedCandidates.features.map(f => f.id).sort();

test('map preserves separate intended/observed states without issuing a product verdict', () => {
  const f = fixture(); f.map.relationships[0]!.intended = { state: 'unknown', references: [] };
  const report = traceFlowMap(f.root, f.map, { features: ['A'] });
  assert.equal(report.productVerdict, 'Not assessed'); assert(report.uncertainties.some(x => x.includes('intended relationship is unknown')));
  assert.equal(report.recordedCandidates.relationships[0]!.observed.state, 'observed');
});

test('direct and transitive candidates retain representative explanation paths', () => {
  const f = fixture(), report = traceFlowMap(f.root, f.map, { features: ['A'], direction: 'downstream' });
  assert.deepEqual(selected(report), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(report.recordedCandidates.paths.find(p => p.featureId === 'E')?.relationshipIds, ['AB', 'BC', 'CD', 'DE']);
  assert.equal(report.selectionStatus, 'candidates'); assert(report.currentCandidates);
});

test('both directions do not reverse mid-path into unrelated co-producers and their consumers', () => {
  const f = fixture(); const report = traceFlowMap(f.root, f.map, { features: ['A'], direction: 'both' });
  assert(!selected(report).includes('S')); assert(!selected(report).includes('X'));
  const upstream = traceFlowMap(f.root, f.map, { features: ['C'], direction: 'upstream' });
  assert.deepEqual(selected(upstream), ['A', 'B', 'C', 'S']); assert(!selected(upstream).includes('X'));
});

test('a shared component seeds its distinct consumers and deduplicates linked tests', () => {
  const f = fixture(); const report = traceFlowMap(f.root, f.map, { features: ['S'], direction: 'downstream' });
  assert.deepEqual(selected(report), ['B', 'C', 'D', 'E', 'S', 'X']);
  const links = report.recordedCandidates.testLinks.map(t => t.id);
  assert.equal(links.filter(id => id === 'TC-C').length, 1); assert(links.includes('TC-X'));
});

test('runtime cycles terminate and retain the connection without duplicating features', () => {
  const f = fixture(); f.map.relationships.push({ ...f.map.relationships[0]!, id: 'LOOP', from: 'D', to: 'B' });
  const report = traceFlowMap(f.root, f.map, { features: ['A'] });
  assert.equal(selected(report).length, new Set(selected(report)).size);
  assert(report.recordedCandidates.relationships.some(r => r.id === 'LOOP')); assert.equal(report.truncated, false);
});

test('a self-loop is retained and is not mistaken for no mapped connection', () => {
  const f = fixture(); f.map.relationships = [{ ...f.map.relationships[0]!, id: 'SELF', from: 'A', to: 'A' }];
  const report = traceFlowMap(f.root, f.map, { features: ['A'] });
  assert.equal(report.recordedCandidates.relationships.length, 1); assert(!report.limits.some(x => x.startsWith('No mapped path')));
});

test('a connection back into the reached graph at the depth limit retains its uncertainty', () => {
  const f = fixture(); f.map.relationships = [f.map.relationships[0]!, { ...f.map.relationships[0]!, id: 'BOUNDARY-LOOP', from: 'B', to: 'A', discrepancy: 'Synthetic conditional recovery conflict' }];
  const report = traceFlowMap(f.root, f.map, { features: ['A'], direction: 'downstream', maxDepth: 1 });
  assert.equal(report.truncated, false); assert(report.recordedCandidates.relationships.some(r => r.id === 'BOUNDARY-LOOP'));
  assert.equal(report.currentCandidates, null); assert(report.relevantIssues.some(i => i.id === 'BOUNDARY-LOOP'));
});

test('conditional, unknown and not-yet-observed paths remain visible for semantic review', () => {
  const f = fixture(), edge = f.map.relationships[0]!; edge.applicability = 'Only managers with an enabled flag; selected role unknown';
  edge.observed = { state: 'notObserved', evidence: edge.observed.evidence, environment: 'synthetic-fixture', build: 'synthetic-build', observedAt: '2026-10-28T12:00:00Z' };
  edge.inference = 'Synthetic candidate association'; edge.gaps = ['Confirm exact role with owner'];
  const report = traceFlowMap(f.root, f.map, { features: ['A'] });
  assert(selected(report).includes('E')); assert(report.recordedCandidates.relationships[0]!.applicability.includes('Only managers'));
  assert(report.uncertainties.some(x => x.includes('notObserved'))); assert(report.uncertainties.some(x => x.includes('Confirm exact role')));
});

test('an intended/observed discrepancy suppresses current candidates while retaining evidence', () => {
  const f = fixture(); f.map.relationships[0]!.discrepancy = 'Synthetic observed result conflicts with source; QA assessment pending';
  const report = traceFlowMap(f.root, f.map, { features: ['A'] });
  assert.equal(report.selectionStatus, 'needsReview'); assert.equal(report.currentCandidates, null); assert(report.recordedCandidates.relationships.length);
  assert.equal(report.productVerdict, 'Not assessed');
});

test('changed canonical sources prevent current claims without deleting historical candidates', () => {
  const f = fixture(); writeFileSync(resolve(f.root, 'relationships.md'), '# Synthetic changed canonical register\n');
  const report = traceFlowMap(f.root, f.map, { features: ['A'] });
  assert.equal(report.currentCandidates, null); assert(report.relevantIssues.some(i => i.kind === 'map')); assert(selected(report).includes('E'));
});

test('only affected stale observations block a selection; unrelated history stays visible', () => {
  const f = fixture(); f.observations.SX.note = 'Synthetic revised unrelated evidence'; writeFileSync(resolve(f.root, 'observations.json'), JSON.stringify(f.observations));
  const independent = traceFlowMap(f.root, f.map, { features: ['A'] });
  assert.equal(independent.assessment.status, 'needsReview'); assert.equal(independent.selectionStatus, 'candidates'); assert(independent.currentCandidates);
  const affected = traceFlowMap(f.root, f.map, { features: ['S'] }); assert.equal(affected.currentCandidates, null);
});

test('different observed build needs review and undisclosed identity remains explicit', () => {
  const f = fixture(); f.map.relationships[0]!.observed.build = 'synthetic-old-build';
  assert.equal(traceFlowMap(f.root, f.map, { features: ['A'] }).currentCandidates, null);
  f.map.targetBuild = null; f.map.relationships.forEach(r => r.observed.build = null);
  const report = traceFlowMap(f.root, f.map, { features: ['A'] }); assert(report.limits.some(x => x.includes('undisclosed')));
});

test('depth limits expose unvisited impact and cannot present a complete current selection', () => {
  const f = fixture(); const report = traceFlowMap(f.root, f.map, { features: ['A'], maxDepth: 1 });
  assert.equal(report.truncated, true); assert.equal(report.currentCandidates, null); assert.deepEqual(selected(report), ['A', 'B']);
  for (const maxDepth of [0, -1, 1.5, 33, NaN]) assert.throws(() => traceFlowMap(f.root, f.map, { features: ['A'], maxDepth }), /Depth/);
});

test('an isolated feature retains direct checks without claiming independence', () => {
  const f = fixture(); f.map.relationships = f.map.relationships.filter(r => r.from !== 'A');
  const report = traceFlowMap(f.root, f.map, { features: ['A'] });
  assert.deepEqual(report.recordedCandidates.testLinks.map(t => t.id), ['TC-A']); assert(report.limits.some(x => x.includes('independence is not established')));
});

test('duplicates, missing endpoints and missing coverage links are rejected', () => {
  const f = fixture(); f.map.features.push({ ...f.map.features[0]! }); assert.throws(() => validateFlowMap(f.root, f.map), /Duplicate map ID/); f.map.features.pop();
  f.map.relationships[0]!.to = 'MISSING'; assert.throws(() => validateFlowMap(f.root, f.map), /missing feature endpoint/); f.map.relationships[0]!.to = 'B';
  f.map.relationships[0]!.testLinkIds = ['MISSING']; assert.throws(() => validateFlowMap(f.root, f.map), /Missing coverage/);
});

test('unsupported schemas, ambiguous authority and unsupported observation claims are rejected', () => {
  const f = fixture(); assert.throws(() => validateFlowMap(f.root, { ...f.map, schemaVersion: 2 } as unknown as FlowMapSnapshot), /Unsupported/);
  f.map.relationships[0]!.intended.references = []; assert.throws(() => validateFlowMap(f.root, f.map), /Accepted intent/);
  f.map.relationships[0]!.intended = { state: 'unknown', references: [] }; f.map.relationships[0]!.observed.evidence = [];
  assert.throws(() => validateFlowMap(f.root, f.map), /actual evidence/);
});

test('retirement preserves IDs and history without automatically redirecting a seed', () => {
  const f = fixture(); f.map.features[0]!.state = 'retired'; f.map.features[0]!.replacementId = 'X';
  assert.throws(() => validateFlowMap(f.root, f.map), /retired features/); f.map.relationships[0]!.state = 'retired';
  validateFlowMap(f.root, f.map); assert.throws(() => traceFlowMap(f.root, f.map, { features: ['A'] }), /missing or retired/);
  assert(!traceFlowMap(f.root, f.map, { features: ['S'] }).recordedCandidates.relationships.some(r => r.id === 'AB'));
});

test('replacement cycles are invalid while feature display-name changes keep their identity', () => {
  const f = fixture(); f.map.features[0]!.name = 'Renamed synthetic feature';
  assert(traceFlowMap(f.root, f.map, { features: ['A'] }).recordedCandidates.features.some(x => x.name === 'Renamed synthetic feature'));
  f.map.relationships = []; f.map.features[0]!.state = 'retired'; f.map.features[1]!.state = 'retired';
  f.map.features[0]!.replacementId = 'B'; f.map.features[1]!.replacementId = 'A'; assert.throws(() => validateFlowMap(f.root, f.map), /cycle/);
});

test('missing seeds and invalid directions cannot become a false no-impact result', () => {
  const f = fixture(); assert.throws(() => traceFlowMap(f.root, f.map, { features: [] }), /Select/);
  assert.throws(() => traceFlowMap(f.root, f.map, { features: ['MISSING'] }), /missing or retired/);
  assert.throws(() => traceFlowMap(f.root, f.map, { features: ['A', 'A'] }), /duplicates/);
  assert.throws(() => traceFlowMap(f.root, f.map, { features: ['A'], direction: 'sideways' as 'both' }), /upstream/);
});

test('empty templates remain unconfigured and secret-bearing projections are rejected', () => {
  const f = fixture(); f.map.features = []; f.map.relationships = []; f.map.testLinks = []; f.map.sourceRecords = []; f.map.targetBuild = null;
  assert.equal(validateFlowMap(f.root, f.map).status, 'unconfigured');
  assert.throws(() => validateFlowMap(f.root, { ...f.map, accessToken: 'synthetic-not-a-real-token' } as FlowMapSnapshot), /credential reference/);
});

test('repeated tracing preserves corrections, existing onboarding state and input bytes', () => {
  const f = fixture(); mkdirSync(resolve(f.root, '.local')); const state = emptyState(); state.roadmapSource = 'Synthetic previous human conversation';
  writeFileSync(resolve(f.root, '.local/onboarding-state.json'), JSON.stringify(state));
  writeFileSync(resolve(f.root, 'corrections.md'), '# Synthetic original question and actual reply retained\n');
  const before = JSON.stringify(f.map), stateBefore = readFileSync(resolve(f.root, '.local/onboarding-state.json'), 'utf8');
  const first = traceFlowMap(f.root, f.map, { features: ['A'] }), resumed = traceFlowMap(f.root, JSON.parse(before), { features: ['A'] });
  assert.deepEqual(first, resumed); assert.equal(JSON.stringify(f.map), before);
  assert.equal(readState(f.root).value.roadmapSource, state.roadmapSource); assert.equal(readFileSync(resolve(f.root, '.local/onboarding-state.json'), 'utf8'), stateBefore);
  assert(readFileSync(resolve(f.root, 'corrections.md'), 'utf8').includes('actual reply retained')); assert.deepEqual(readdirSync(resolve(f.root, '.local')), ['onboarding-state.json']);
});
