import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { companyFixture } from './company-fixture.js';
import { discoverChannels, recordConnection, previewConfiguration, markEdit } from '../company-context/config.js';
import { connection, readObject, prefix, status } from '../company-context/store.js';
import { inspectedSources, recordClaim } from '../company-context/knowledge.js';
import { recordImpactDisposition } from '../company-context/impact.js';
import { assertCompanyBasis, refreshReceipt } from '../company-context/guards.js';
import { ContextError, type Claim } from '../company-context/types.js';
import * as menu from '../settings/menu.js';
import { readState, writeState } from '../onboarding/state.js';
import { prepareCompanyBasis } from '../company-context/runtime.js';
import { startCases, runApprovedCases } from '../execution/cases.js';

test('CC-03/04/43 account mismatch and revoked relevant reads do not impersonate current access', async () => {
  const f = await companyFixture(['C1', 'C2']), a = f.authorize({ both: true });
  const actual = connection(f.root, 'slack');
  assert.throws(() => recordConnection(f.root, { ...actual, identity: { ...actual.identity, userId: 'OTHER' }, source: 'Synthetic different account' }), /new connection ID/);
  assert.equal(connection(f.root, 'slack').identity.userId, actual.identity.userId);
  f.adapter.historyHook = async channel => { if (channel === 'C1') throw new ContextError('AUTH_REQUIRED', 'Synthetic revoked access'); return f.adapter.page([]); };
  await f.run(); assert.throws(() => assertCompanyBasis(f.root, a.assignment, ['rule']), /gap/);
  refreshReceipt(f.root, a.assignment, Date.now(), ['other']); assertCompanyBasis(f.root, a.assignment, ['other']);
});

test('CC-10 empty readable history records coverage without claiming learned requirements', async () => {
  const f = await companyFixture(); f.adapter.channelList.push({ id: 'EMPTY', name: 'empty', type: 'public', archived: false, member: true, shared: false });
  const catalog = await discoverChannels(f.root, 'slack', f.adapter, { source: 'Synthetic current catalog' });
  f.configure([{ ...f.selected, selection: { ...f.selected.selection, channelIds: ['EMPTY'], catalog: catalog.catalog } }]);
  const result = await f.run(); assert.equal(result.job.state, 'complete');
  assert.equal(status(f.root).bindings[0]!.sourceCount, 0); assert.equal(status(f.root).bindings[0]!.analyzedSourceCount, 0);
  assert.equal(status(f.root).bindings[0]!.channels![0]!.access, 'verifiedForRecordedCoverage');
});

test('CC-13 archive metadata is explicit and a same-name new ID is not an inferred migration', async () => {
  const f = await companyFixture(); f.adapter.channelList[0]!.archived = true;
  const archived = await discoverChannels(f.root, 'slack', f.adapter, { source: 'Synthetic archive observation' });
  assert.equal(readObject<any>(f.root, archived.catalog).channels[0].archived, true);
  f.adapter.channelList[0] = { ...f.adapter.channelList[0]!, id: 'NEW_ID', archived: false };
  const renamed = await discoverChannels(f.root, 'slack', f.adapter, { source: 'Synthetic different identity' });
  assert.throws(() => previewConfiguration(f.root, { source: 'Synthetic unverified ID migration', bindings: [{ ...f.selected, selection: { ...f.selected.selection, catalog: renamed.catalog } }] }), /catalog|channel/i);
});

test('CC-14 failed company Settings edit can be canceled without discarding completed onboarding', async () => {
  const f = await companyFixture(); const state = readState(f.root); state.value.completed = true; writeState(f.root, state.value, state.revision);
  menu.openMenu(f.root, 'Synthetic Settings'); menu.chooseArea(f.root, 'companyContext');
  menu.startEdit(f.root, { id: 'conflicting-edit', prompt: 'Which channels?', file: '.local/company-context.json', source: 'Synthetic user request' });
  menu.presentEdit(f.root); markEdit(f.root, 'asked', 'Synthetic presentation');
  const preview = previewConfiguration(f.root, { bindings: [f.selected], source: 'Synthetic earlier preview' });
  f.configure([]);
  assert.throws(() => menu.saveCompanyEdit(f.root, { preview: preview.preview, digest: preview.digest,
    response: f.put('settings-reply.json', { source: 'Synthetic actual response' }), source: 'Synthetic stale save' }), /changed/);
  menu.cancelEdit(f.root); menu.closeMenu(f.root); assert.equal(readState(f.root).value.completed, true);
});

test('CC-17 directory cooldown does not prevent completed independent channel use', async () => {
  const f = await companyFixture(['C1', 'C2']); f.configure([{ ...f.selected, directory: true }]); let directoryCalls = 0;
  f.adapter.directoryHook = async () => { directoryCalls++; throw new ContextError('RATE_LIMITED', 'Synthetic directory cooldown', new Date(Date.now() + 60_000).toISOString()); };
  const result = await f.run(); assert.equal(result.job.state, 'partial'); assert.deepEqual(result.job.completedChannels.sort(), ['C1', 'C2']);
  const a = f.authorize({ both: true }); assertCompanyBasis(f.root, a.assignment); assert.equal(directoryCalls, 1);
});

test('CC-25/44 repeated identical impact assessment retains one source-linked clarification record', async () => {
  const f = await companyFixture(), a = f.authorize(), question = f.put('owner-question.json', { id: 'Q-1', owner: 'Synthetic product owner', question: 'Which current retry policy applies?', source: a.claim });
  const input = { basis: a.basisRef, state: 'needsClarification' as const, reason: 'One material scope question', source: 'Synthetic assessment of existing Q-1', evidence: [question] };
  recordImpactDisposition(f.root, input); const folder = resolve(f.root, prefix, 'impacts'); const names = readdirSync(folder), bytes = readFileSync(resolve(folder, names[0]!));
  recordImpactDisposition(f.root, input); assert.deepEqual(readdirSync(folder), names); assert.deepEqual(readFileSync(resolve(folder, names[0]!)), bytes);
});

test('CC-26 actual date and environment applicability exclude future or other-environment decisions', async () => {
  const f = await companyFixture(), a = f.authorize(), old = readObject<Claim>(f.root, a.claim);
  for (const [id, effectiveScope] of [['later', { startsAt: new Date(Date.now() + 86_400_000).toISOString() }], ['production', { environment: 'production' }]] as const) {
    recordClaim(f.root, { bindingId: f.selected.id, claim: { ...old, id, supersedes: [old.id], effectiveScope } });
  }
  assertCompanyBasis(f.root, a.assignment);
  recordClaim(f.root, { bindingId: f.selected.id, claim: { ...old, id: 'current', supersedes: [old.id], effectiveScope: { environment: 'staging', startsAt: '2026-01-01T00:00:00Z' } } });
  assert.throws(() => assertCompanyBasis(f.root, a.assignment), /replacement decision/);
});

test('CC-28 a source change during an actual checkpoint preserves its effect and independent progress', async () => {
  const f = await companyFixture(['C1', 'C2']), a = f.authorize({ both: true }), targetValue = { buildId: 'B', environment: 'staging' };
  const target = f.put('target.json', { ...targetValue, observedAt: new Date().toISOString(), source: 'Synthetic actual target' });
  const observed = f.put('observed-effect.json', { source: 'Synthetic actual effect retained' });
  const definition = f.put('case.json', { source: 'Synthetic approved assertion' });
  const batch = f.put('batch.json', { schemaVersion: 1, assignment: a.assignment, target: targetValue, understanding: a.understanding, cases: ['dependent', 'independent'].map((id, index) => ({
    id, flowId: index ? 'list' : 'retry', checkId: id, conditionId: id, criteria: [index ? 'other' : 'rule'], definition, dependsOn: [],
    checkpoints: [{ id: 'precondition', action: 'Observe', expected: 'Reviewed state' }, { id: 'result', action: 'Act', expected: 'Reviewed result' }] })) });
  const approval = f.put('g2.json', { gate: 'G2', decision: 'Approved', assignment: a.assignment, reviewer: 'Synthetic QA', source: 'Synthetic batch review', packet: a.packet, scopeReview: a.g1, understanding: a.understanding, caseBatch: batch });
  startCases(f.root, { id: 'inflight', batch, approval, target }); let calls = 0;
  const result = await runApprovedCases(f.root, 'inflight', { companyAdapter: () => f.adapter, target: () => target, execute: async step => {
    calls++; if (step.caseId === 'dependent' && step.checkpoint.id === 'result') { f.adapter.messages[0]!.editedTs = '999.000001'; f.adapter.messages[0]!.text = 'Changed during the observed action'; await f.run(); }
    return { outcome: 'matched', source: 'Synthetic actual observation', evidence: [observed] };
  } });
  const dependent = result.session.attempts.find(c => c.caseId === 'dependent')!;
  assert.equal(dependent.status, 'Partial'); assert.equal(dependent.observations.length, 2); assert.equal(result.session.attempts.find(c => c.caseId === 'independent')!.status, 'Pass'); assert.equal(calls, 4);
});

test('CC-36 two consumers share permitted source storage without leaking their channel selections', async () => {
  const a = await companyFixture(), b = await companyFixture(['C2']);
  const shared = resolve(a.root, 'shared-source-store'); const { mkdirSync } = await import('node:fs'); mkdirSync(shared);
  for (const f of [a, b]) {
    const authorization = f.put('shared-authorization.json', { root: shared, bindingId: f.selected.id, source: 'Synthetic actual storage authorization', policy: 'Same verified principal; channel filtering' });
    f.configure([{ ...f.selected, sharedStore: { root: shared, authorization } }]); await f.run();
  }
  assert(inspectedSources(a.root, a.selected.id).every(s => s.content.message.channelId === 'C1'));
  assert(inspectedSources(b.root, b.selected.id).every(s => s.content.message.channelId === 'C2'));
  a.configure([]);
  // The shared source index survives another consumer's removal; no invented C1 rule is needed for B.
  assert(inspectedSources(b.root, b.selected.id).some(s => s.content.message.channelId === 'C2'));
});
