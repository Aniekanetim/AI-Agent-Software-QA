import test from 'node:test';
import assert from 'node:assert/strict';
import { companyFixture } from './company-fixture.js';
import { refreshReceipt, assertCompanyBasis, receiptPath } from '../company-context/guards.js';
import { discoverChannels } from '../company-context/config.js';
import { catalogProgress } from '../company-context/catalog.js';
import { startRefresh, refresh, inspectJob } from '../company-context/sync.js';
import { load, save, type Evidence } from '../shared/store.js';
import { prefix, readObject } from '../company-context/store.js';
import { prepareCompanyBasis } from '../company-context/runtime.js';
import { assertCompanyBoundary } from '../company-context/boundary.js';
import { releaseFixture } from './release-fixture.js';
import { recordAssessment, retainRun } from '../release/round.js';
import { currentAssessment, prepareReleaseSources, currentReleaseRegression, reviewHandoff } from '../release/handoff.js';
import { boundaryRequirement } from '../company-context/boundary.js';
import { importHostPage, hostPageDigest } from '../slack/import.js';
import { connection } from '../company-context/store.js';
import { ContextError } from '../company-context/types.js';

test('a partial relevant thread cannot renew an expired source receipt', async () => {
  const f = await companyFixture(), a = f.authorize(), now = Date.now() + 16 * 60_000;
  const known = f.adapter.messages.filter(m => m.channelId === 'C1');
  f.adapter.threadHook = async () => f.adapter.page(known, 'unread');
  assert.throws(() => assertCompanyBasis(f.root, a.assignment, undefined, undefined, now), /Refresh/);
  assert.equal((await f.run(2, { now: () => now })).job.state, 'partial');
  assert.throws(() => refreshReceipt(f.root, a.assignment, now), /complete|completed|pending|Refresh|Reread/i);
});

test('catalog page-two failure retains its page-one continuation and resumes without repeating it', async () => {
  const f = await companyFixture(); let firstPages = 0;
  f.adapter.channelHook = async cursor => { if (!cursor) { firstPages++; return f.adapter.page([f.adapter.channelList[0]!], 'second'); } throw new Error('Synthetic transport failure'); };
  let progress: Evidence | undefined;
  try { await discoverChannels(f.root, 'slack', f.adapter, { source: 'Synthetic interrupted catalog' }); assert.fail('Failure was hidden'); }
  catch (error) { progress = (error as { progress?: Evidence }).progress; }
  assert(progress); const catalog = readObject<any>(f.root, progress); assert.equal(catalog.cursor, 'second'); assert.equal(catalog.channels.length, 1);
  assert.equal(catalogProgress(f.root, catalog.operationId).value.catalog.sha256, progress.sha256);
  f.adapter.channelHook = async cursor => { assert.equal(cursor, 'second'); return f.adapter.page([f.adapter.channelList[1]!]); };
  const result = await discoverChannels(f.root, 'slack', f.adapter, { previous: progress, source: 'Synthetic continued catalog' });
  assert.equal(firstPages, 1); assert.equal(result.complete, true); assert.equal(result.channelCount, 2);
});

test('a new execution boundary rereads once, then reuses its completed proof without prompts', async () => {
  const f = await companyFixture(), a = f.authorize(), boundary = { purpose: 'execution' as const, id: 'batch-A', target: { buildId: 'build', environment: 'staging' } };
  assert.throws(() => assertCompanyBoundary(f.root, a.assignment, boundary), /Prepare/);
  const before = f.adapter.calls.length;
  await prepareCompanyBasis(f.root, a.assignment, undefined, () => f.adapter, boundary); assert(f.adapter.calls.length > before);
  const after = f.adapter.calls.length;
  await prepareCompanyBasis(f.root, a.assignment, undefined, () => f.adapter, boundary); assert.equal(f.adapter.calls.length, after);
  await prepareCompanyBasis(f.root, a.assignment, undefined, () => f.adapter, { ...boundary, id: 'resumed-batch' }); assert(f.adapter.calls.length > after);
});

test('G5 rereads an upstream change even when the prior receipt is unexpired', async () => {
  const f = await companyFixture(), a = f.authorize(), base = releaseFixture(f.root, a.assignment.ticketId); base.bind();
  const run = base.put('passing.json', base.run('passing', 'Pass')); retainRun(f.root, { round: base.roundRef, run });
  const { assessment } = recordAssessment(f.root, { round: base.roundRef, runs: [run] });
  assert.throws(() => currentAssessment(f.root, assessment, a.assignment), /Prepare/);
  f.adapter.messages[0]!.editedTs = '900.000001'; f.adapter.messages[0]!.text = 'New current-release requirement';
  const before = f.adapter.calls.length;
  await assert.rejects(prepareReleaseSources(f.root, { assignment: a.assignment, assessment }, () => f.adapter), /source changed/);
  assert(f.adapter.calls.length > before);
  assert.throws(() => currentAssessment(f.root, assessment, a.assignment), /source changed/);
});

test('an incomplete unrelated channel does not block a complete reviewed dependency', async () => {
  const f = await companyFixture(['C1', 'C2']), a = f.authorize({ both: true });
  f.adapter.threadHook = async (channel, ts) => f.adapter.page(f.adapter.messages.filter(m => m.channelId === channel && (m.ts === ts || m.threadTs === ts)), channel === 'C1' ? 'more' : null);
  await f.run(5);
  refreshReceipt(f.root, a.assignment, Date.now(), ['other']); assertCompanyBasis(f.root, a.assignment, ['other']);
});

test('head writes without a committed completion do not establish a new boundary', async () => {
  const f = await companyFixture(), a = f.authorize(); const job = startRefresh(f.root, 'company').job;
  const result = await refresh(f.root, job.id, f.adapter, { budget: 1 }); assert.equal(result.job.state, 'partial');
  const boundary = { purpose: 'execution' as const, id: 'not-completed', target: { buildId: 'build', environment: 'staging' } };
  assert.throws(() => assertCompanyBoundary(f.root, a.assignment, boundary), /Prepare/);
  const stored = inspectJob(f.root, job.id); assert(stored.value.operationEvidence.length); assert(stored.value.units.some(unit => !unit.done));
});

test('catalog cursor history survives one-page resumptions', async () => {
  const f = await companyFixture();
  f.adapter.channelHook = async cursor => f.adapter.page([], cursor === 'A' ? 'B' : 'A');
  const a = await discoverChannels(f.root, 'slack', f.adapter, { budget: 1, source: 'Synthetic first page' });
  const b = await discoverChannels(f.root, 'slack', f.adapter, { budget: 1, previous: a.catalog, source: 'Synthetic resume' });
  await assert.rejects(discoverChannels(f.root, 'slack', f.adapter, { budget: 1, previous: b.catalog, source: 'Synthetic cycle' }), /pagination/);
});

test('a same-clock pre-boundary job cannot be relabeled as a new actual read', async () => {
  const f = await companyFixture(), a = f.authorize();
  const boundary = { purpose: 'execution' as const, id: 'same-clock', target: { buildId: 'build', environment: 'staging' } };
  // Even an earlier/equal wall-clock timestamp cannot erase the causal ordering of operation identities.
  boundaryRequirement(f.root, a.assignment, boundary, true, f.now);
  assert.throws(() => assertCompanyBoundary(f.root, a.assignment, boundary), /Reread/);
  await prepareCompanyBasis(f.root, a.assignment, undefined, () => f.adapter, boundary);
  assertCompanyBoundary(f.root, a.assignment, boundary);
});

test('native-host request-bound page imports complete the same execution boundary', async () => {
  const f = await companyFixture(), a = f.authorize();
  const boundary = { purpose: 'execution' as const, id: 'native-run', target: { buildId: 'build', environment: 'staging' } };
  await assert.rejects(prepareCompanyBasis(f.root, a.assignment, undefined, undefined, boundary), /actual native Slack/);
  let job = startRefresh(f.root, f.selected.id).job;
  const requestCount = f.adapter.calls.length;
  while (job.state !== 'complete') {
    const unit = [...job.units.slice(job.cursor), ...job.units.slice(0, job.cursor)].find(u => !u.done && !u.issue)!;
    const page = unit.kind === 'history' ? await f.adapter.history(unit.channelId!, unit.oldest!, job.cutoff, unit.cursor) : await f.adapter.thread(unit.channelId!, unit.ts!, unit.cursor);
    const request = { jobId: job.id, operation: unit.kind, channelId: unit.channelId, cursor: unit.cursor,
      ...(unit.kind === 'history' ? { oldest: unit.oldest, latest: job.cutoff } : { ts: unit.ts }) };
    const call = f.put(f.next(), { ...request, identity: f.adapter.principal, source: 'Synthetic actual native tool capture', resultDigest: hostPageDigest(page) });
    job = (await importHostPage(f.root, { ...request, page, call })).job;
  }
  refreshReceipt(f.root, a.assignment); assertCompanyBoundary(f.root, a.assignment, boundary);
  assert(f.adapter.calls.length > requestCount);
  const before = f.adapter.calls.length;
  await prepareCompanyBasis(f.root, a.assignment, undefined, undefined, boundary); assert.equal(f.adapter.calls.length, before);
});

test('replaying an older completed job cannot replace the latest completion generation', async () => {
  const f = await companyFixture(), a = f.authorize();
  const first = await f.run(); const second = await f.run();
  assert(second.job.generation! > first.job.generation!);
  await refresh(f.root, first.job.id, f.adapter);
  const result = refreshReceipt(f.root, a.assignment);
  const receipt = readObject<any>(f.root, result.receipts[0]!);
  assert.equal(readObject<any>(f.root, receipt.completions[0]).jobId, second.job.id);
});

test('catalog cooldown survives retry and retains the original successful page', async () => {
  const f = await companyFixture(); let calls = 0, progress: Evidence | undefined;
  f.adapter.channelHook = async cursor => { calls++; if (!cursor) return f.adapter.page([f.adapter.channelList[0]!], 'more'); throw new ContextError('RATE_LIMITED', 'Synthetic provider cooldown', new Date(Date.now() + 60_000).toISOString()); };
  try { await discoverChannels(f.root, 'slack', f.adapter, { source: 'Synthetic paginated inventory' }); } catch (error) { progress = (error as { progress?: Evidence }).progress; }
  assert(progress); assert.equal(readObject<any>(f.root, progress).channels.length, 1);
  await assert.rejects(discoverChannels(f.root, 'slack', f.adapter, { previous: progress, source: 'Synthetic early retry' }), /cooldown/);
  assert.equal(calls, 2);
});

test('legacy receipts stay historical and obtain current proof without replacing approval', async () => {
  const f = await companyFixture(), a = f.authorize();
  const path = receiptPath(a.assignment, f.selected.id, a.claim), stored = load<any>(f.root, path, () => null);
  delete stored.value.completions; save(f.root, path, stored.value, stored.revision);
  assert.throws(() => assertCompanyBasis(f.root, a.assignment), /legacy/);
  const boundary = { purpose: 'execution' as const, id: 'legacy-open-work', target: { buildId: 'build', environment: 'staging' } };
  await prepareCompanyBasis(f.root, a.assignment, undefined, () => f.adapter, boundary);
  assertCompanyBoundary(f.root, a.assignment, boundary);
  assert.equal(readObject<any>(f.root, a.g1).decision, 'Approved');
});

test('post-G5 actual source change prevents publication preparation despite fresh earlier receipts', async () => {
  const f = await companyFixture(), a = f.authorize(), base = releaseFixture(f.root, a.assignment.ticketId); base.bind();
  const run = base.put('run.json', base.run('passing', 'Pass')); retainRun(f.root, { round: base.roundRef, run });
  const { assessment } = recordAssessment(f.root, { round: base.roundRef, runs: [run] });
  await prepareReleaseSources(f.root, { assignment: a.assignment, assessment }, () => f.adapter);
  const route = { channel: 'recorded' as const, destination: 'Synthetic handoff', recipient: 'Synthetic owner', acknowledgementRequired: false };
  const value = { gate: 'G5', decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic actual review', packet: a.packet, target: base.target,
    handoff: { assessment, route, targetObservation: base.g5Target, regressionDigest: currentReleaseRegression(f.root, a.assignment).digest } };
  reviewHandoff(f.root, value, assessment, route, a.assignment);
  const decision = f.put('g5.json', value);
  f.adapter.messages[0]!.editedTs = '950.000001'; f.adapter.messages[0]!.text = 'New effective rule after G5';
  await assert.rejects(prepareReleaseSources(f.root, { assignment: a.assignment, assessment, action: 'publish', id: 'delivery-1', decision }, () => f.adapter), /source changed/);
  assert.throws(() => currentAssessment(f.root, assessment, a.assignment), /source changed/);
});
