import test from 'node:test';
import assert from 'node:assert/strict';
import { companyFixture } from './company-fixture.js';
import { ContextError } from '../company-context/types.js';
import { prepareCompanyBasis } from '../company-context/runtime.js';
import { assertCompanyBoundary } from '../company-context/boundary.js';
import { connection, head } from '../company-context/store.js';
import { recordConnection } from '../company-context/config.js';
import { refresh } from '../company-context/sync.js';

test('a new independent boundary reads its channel despite an unrelated directory cooldown', async () => {
  const f = await companyFixture(['C1', 'C2']); f.configure([{ ...f.selected, directory: true }]); let directoryCalls = 0;
  f.adapter.directoryHook = async () => { directoryCalls++; throw new ContextError('RATE_LIMITED', 'Synthetic directory cooldown', new Date(Date.now() + 60_000).toISOString()); };
  const pending = await f.run(); const a = f.authorize({ both: true });
  const boundary = { purpose: 'execution' as const, id: 'independent-new-cycle', target: { buildId: 'B', environment: 'staging' } };
  const before = f.adapter.calls.length;
  await prepareCompanyBasis(f.root, a.assignment, ['other'], () => f.adapter, boundary);
  assertCompanyBoundary(f.root, a.assignment, boundary, ['other']);
  assert(f.adapter.calls.slice(before).some(call => call.kind === 'history' && call.channel === 'C2'));
  assert(!f.adapter.calls.slice(before).some(call => call.channel === 'C1' || call.kind === 'directory'));
  assert.equal(directoryCalls, 1); assert.equal(pending.job.state, 'partial');
  const after = f.adapter.calls.length;
  await prepareCompanyBasis(f.root, a.assignment, ['other'], () => f.adapter, boundary); assert.equal(f.adapter.calls.length, after);
});

test('an unfinished unrelated thread does not prevent a new independent channel generation', async () => {
  const f = await companyFixture(['C1', 'C2']), a = f.authorize({ both: true });
  f.adapter.threadHook = async channel => { if (channel === 'C1') throw new ContextError('SCOPE_DENIED', 'Synthetic unavailable thread'); return f.adapter.page(f.adapter.messages.filter(row => row.channelId === channel)); };
  await f.run();
  const boundary = { purpose: 'g5' as const, id: 'independent-review', target: { buildId: 'B', environment: 'staging' } };
  await prepareCompanyBasis(f.root, a.assignment, ['other'], () => f.adapter, boundary);
  assertCompanyBoundary(f.root, a.assignment, boundary, ['other']);
  assert.throws(() => assertCompanyBoundary(f.root, a.assignment, boundary, ['rule']), /gap/);
});

test('scoped reads honor a shared history-method cooldown even after access reinspection', async () => {
  const f = await companyFixture(['C1', 'C2']), a = f.authorize({ both: true }); let histories = 0;
  f.adapter.historyHook = async () => { histories++; throw new ContextError('RATE_LIMITED', 'Synthetic history-method cooldown', new Date(Date.now() + 60_000).toISOString()); };
  await f.run(); const before = histories;
  const boundary = { purpose: 'execution' as const, id: 'rate-limited-scope', target: { buildId: 'B', environment: 'staging' } };
  await assert.rejects(prepareCompanyBasis(f.root, a.assignment, ['other'], () => f.adapter, boundary), /read|Refresh|Reread|cooldown/i);
  assert.equal(histories, before, 'Changing job/channel must not evade an actual history cooldown');
  const actual = connection(f.root, 'slack'); recordConnection(f.root, { ...actual, source: 'Synthetic reverified same connection' }, Date.now());
  await assert.rejects(prepareCompanyBasis(f.root, a.assignment, ['other'], () => f.adapter, boundary), /read|Refresh|Reread|cooldown/i);
  assert.equal(histories, before, 'Reinspection must not reset a known provider cooldown');
});

test('finishing an older broad job preserves newer scoped channel coverage', async () => {
  const f = await companyFixture(['C1', 'C2']); f.configure([{ ...f.selected, directory: true }]);
  f.adapter.directoryHook = async () => { throw new ContextError('RATE_LIMITED', 'Synthetic directory cooldown', new Date(Date.now() + 60_000).toISOString()); };
  const old = await f.run(), a = f.authorize({ both: true });
  const boundary = { purpose: 'execution' as const, id: 'newer-channel', target: { buildId: 'B', environment: 'staging' } };
  await prepareCompanyBasis(f.root, a.assignment, ['other'], () => f.adapter, boundary);
  const coverage = structuredClone(head(f.root, f.adapter.principal).value.coverage.C2);
  f.adapter.directoryHook = async () => f.adapter.page([]);
  await refresh(f.root, old.job.id, f.adapter, { now: () => Date.now() + 61_000, retryFailures: true });
  assert.deepEqual(head(f.root, f.adapter.principal).value.coverage.C2, coverage);
  assertCompanyBoundary(f.root, a.assignment, boundary, ['other']);
});
