import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync, readdirSync, unlinkSync, rmdirSync, writeFileSync } from 'node:fs';
import { companyFixture } from './company-fixture.js';
import { startRefresh, refresh, recoverRefresh, inspectJob } from '../company-context/sync.js';
import { head, prefix, connection, readObject } from '../company-context/store.js';
import { boundaryRequirement, assertCompanyBoundary } from '../company-context/boundary.js';
import { prepareCompanyBasis } from '../company-context/runtime.js';
import { refreshReceipt } from '../company-context/guards.js';
import { beginCatalog, catalogProgress } from '../company-context/catalog.js';
import { recordConnection } from '../company-context/config.js';

function worker(root: string, mode: string, id: string) {
  const child = fork(resolve('.local/build/automation/tests/company-context-worker.js'), [root, mode, id], { execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const messages: any[] = []; child.on('message', value => messages.push(value));
  const exit = new Promise<number | null>(done => child.once('exit', done));
  const next = (stage: string) => new Promise<any>((done, reject) => {
    const prior = messages.find(value => value.stage === stage); if (prior) return done(prior);
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Synthetic child never reached ${stage}`)); }, 45_000);
    const listen = (value: any) => { if (value.stage === stage || value.stage === 'error') { clearTimeout(timer); child.off('message', listen); value.stage === 'error' ? reject(new Error(value.message)) : done(value); } };
    child.on('message', listen);
  });
  return { child, exit, next };
}
function releaseDeadTestLocks(root: string, pid: number) {
  // Exact disposable fixture paths; never recursive deletion or a live/user lock.
  assert(root.includes('output')); assert.throws(() => process.kill(pid, 0));
  const folder = resolve(root, '.local/locks');
  for (const entry of readdirSync(folder)) {
    const lock = resolve(folder, entry), ownerFile = resolve(lock, 'owner.json');
    const owner = JSON.parse(readFileSync(ownerFile, 'utf8'));
    if (owner.pid !== pid) continue;
    unlinkSync(ownerFile); rmdirSync(lock);
  }
}

for (const mode of ['head-crash', 'completion-crash']) test(`actual ${mode} cannot certify a prepared new boundary before recovery`, async () => {
  const f = await companyFixture(), a = f.authorize();
  const boundary = { purpose: 'execution' as const, id: mode, target: { buildId: 'build', environment: 'staging' } };
  boundaryRequirement(f.root, a.assignment, boundary, true);
  const before = head(f.root, f.adapter.principal).revision;
  const job = startRefresh(f.root, f.selected.id).job;
  const work = worker(f.root, mode, job.id); assert.equal(await work.exit, 73);
  const progress = inspectJob(f.root, job.id).value;
  assert.notEqual(head(f.root, f.adapter.principal).revision, before, 'The actual head write happened');
  assert.throws(() => { refreshReceipt(f.root, a.assignment); assertCompanyBoundary(f.root, a.assignment, boundary); }, /Reread|completed|progress|Refresh/);
  releaseDeadTestLocks(f.root, work.child.pid!);
  if (mode === 'head-crash') {
    assert(progress.inFlight); assert.equal(Object.keys(progress.observedSources!).length, 0, 'Page progress was not committed');
    recoverRefresh(f.root, job.id, 'Synthetic confirmed child exit at head/progress seam');
  } else { assert.equal(progress.state, 'complete'); assert(progress.channelCompletedAt?.C1); }
  const result = await refresh(f.root, job.id, f.adapter);
  refreshReceipt(f.root, a.assignment); assertCompanyBoundary(f.root, a.assignment, boundary);
  assert.equal(result.job.state, 'complete');
  if (mode === 'completion-crash') assert.equal(result.job.channelCompletedAt!.C1, progress.channelCompletedAt!.C1);
});

test('two catalog processes cannot steal ownership and reconnection rejects the old response', async () => {
  const f = await companyFixture(), catalog = beginCatalog(f.root, 'slack', 'Synthetic process contention');
  const first = worker(f.root, 'catalog', catalog.operationId!); const reservation = await first.next('reserved');
  const second = worker(f.root, 'catalog', catalog.operationId!); assert.equal(await second.exit, 1);
  assert.equal(catalogProgress(f.root, catalog.operationId!).value.inFlight?.reservationId, reservation.token);
  const actual = connection(f.root, 'slack'); recordConnection(f.root, { ...actual, source: 'Synthetic actual reconnection' }, Date.now() + 1);
  first.child.send('commit'); await first.next('rejected'); assert.equal(await first.exit, 0);
  assert.equal(readObject<any>(f.root, catalogProgress(f.root, catalog.operationId!).value.catalog).complete, false);
  assert.equal(catalogProgress(f.root, catalog.operationId!).value.inFlight, undefined);
});

test('Settings removal in another process cannot be undone by the in-flight history response', async () => {
  const f = await companyFixture(); const oldHead = head(f.root, f.adapter.principal).value;
  const job = startRefresh(f.root, f.selected.id).job, work = worker(f.root, 'inflight', job.id);
  await work.next('reading'); f.configure([]); work.child.send('return-page');
  assert.equal((await work.next('completed')).state, 'superseded'); assert.equal(await work.exit, 0);
  assert.deepEqual(head(f.root, f.adapter.principal).value.sources, oldHead.sources);
});
