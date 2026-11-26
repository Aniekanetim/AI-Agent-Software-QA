import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { companyFixture } from './company-fixture.js';
import * as board from '../board/board.js';
import * as gh from '../github/github.js';
import { defectCompletion, prepareDispositionSources } from '../regression/fix.js';
import { prepareCompanyBasis } from '../company-context/runtime.js';
import { load, digest, evidence, save, type Evidence } from '../shared/store.js';
import { readObject } from '../company-context/store.js';
import { importHostCatalog, hostPageDigest } from '../slack/import.js';
import { refreshReceipt, receiptPath } from '../company-context/guards.js';
import { beginCatalog, reserveCatalogPage, commitCatalogPage, failCatalogPage, catalogProgress, catalogJobs } from '../company-context/catalog.js';
import { connection, prefix } from '../company-context/store.js';
import { recordConnection } from '../company-context/config.js';

export async function noChangeFixture() {
  const f = await companyFixture(); board.upgradeBoard(f.root, 'Synthetic correction fixture');
  writeFileSync(resolve(f.root, board.boardRoot, 'Retest/BUG-001.md'), '# BUG-001: Synthetic reported behavior\n\n| Type | Bug |\n');
  const bug = board.findTicket(f.root, 'BUG-001');
  const a = f.authorize({ assignment: { source: 'local', ticketId: bug.id } });
  const ownerDecision = f.put('owner.json', { assignment: a.assignment, decision: 'noProductChange', source: 'Synthetic requirements owner' });
  const target = { environment: 'staging', buildId: 'synthetic-build' };
  const targetObservation = f.put('target.json', { ...target, source: 'Synthetic served-build readback', observedAt: new Date().toISOString() });
  const packet = f.put('disposition-packet.json', { assignment: a.assignment, ticketRevision: bug.revision, ownerDecision,
    defectReport: f.put('defect.json', { source: 'Synthetic defect evidence' }), understanding: a.understanding, targetObservation });
  const review = f.put('disposition-review.json', { ...readObject<any>(f.root, packet), packet, target,
    gate: 'G5', decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic scoped disposition response' });
  const decision: board.Decision = { actor: 'Synthetic QA', source: 'Synthetic disposition review', reason: 'No product change', evidence: [review],
    scope: { kind: 'assignment' }, checkpoint: 'G5', nextOwner: 'Synthetic team', nextAction: 'Retain decision', handoff: 'Synthetic evidence only' };
  return { ...f, ...a, bug, packet, review, target, targetObservation, decision };
}

export async function dispatchFixture() {
  const f = await companyFixture(); board.upgradeBoard(f.root, 'Synthetic dispatch fixture');
  const rule: gh.RepositoryRule = { repository: 'fixture/product', branches: ['main'], labels: [], includeDrafts: false, reporting: 'localOnly' };
  const pr: gh.PullRequest = { repository: rule.repository, number: 1, title: 'Synthetic admission', url: 'https://github.com/fixture/product/pull/1', head: 'a'.repeat(40), base: 'main', labels: [], draft: false, mergeCommit: null, fromFork: false };
  gh.ingestPr(f.root, pr, rule, 'Synthetic observed PR');
  const ticket = board.findTicket(f.root, 'QA-001'), a = f.authorize();
  const observed = { id: 'staging', buildId: 'synthetic-build', commit: pr.head, observedAt: new Date().toISOString(), source: 'Synthetic served target' };
  const target = { ...observed, evidence: f.put('dispatch-target.json', observed) };
  const policy: gh.RegressionPolicy = { schemaVersion: 1, id: 'audit', revision: '1', approval: { path: '', sha256: '' }, repositories: [rule], allowForks: false, allowMergeCommit: false,
    suiteId: 'aggregate-fixture', suiteEvidence: [f.put('suite.json', { source: 'Synthetic aggregate suite' })], command: { executable: process.execPath, args: ['-e', 'process.exit(0)'] }, timeoutMs: 2000, targetId: target.id, dispatch: { workflow: 'fixture.yml', ref: 'main' } };
  policy.approval = f.put('policy.json', { decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic regression policy', policyDigest: gh.policyDigest(policy) });
  const key = digest(`${gh.assertRegression(f.root, policy, pr, target)}:${ticket.id}:${ticket.generation}`);
  const boundary = { purpose: 'execution' as const, id: key, target: { buildId: target.buildId, environment: target.id, commit: target.commit } };
  await prepareCompanyBasis(f.root, a.assignment, undefined, () => f.adapter, boundary);
  return { ...f, ...a, ticket, pr, policy, target, key, boundary };
}

test('RA-01 a current receipt alone cannot close a source-dependent no-change disposition', async () => {
  const f = await noChangeFixture();
  f.adapter.messages[0]!.editedTs = '999.000001'; f.adapter.messages[0]!.text = 'Current applicable rule changed upstream.';
  assert.throws(() => defectCompletion(f.root, f.assignment, f.bug.revision, { refutation: f.review }), /source|Prepare|disposition/i);
  assert.throws(() => board.transitionTicket(f.root, { id: 'no-change-close', ticketId: f.bug.id, expectedRevision: f.bug.revision,
    to: 'Tested-Ok', decision: f.decision, defect: { refutation: f.review } }), /source|Prepare|disposition/i);
  assert.equal(board.findTicket(f.root, f.bug.id).status, 'Retest');
});

test('RA-02 native page validation errors expose retained catalog progress', async () => {
  const f = await companyFixture(), first = f.adapter.page([f.adapter.channelList[0]!], 'second'), second = f.adapter.page([f.adapter.channelList[1]!]);
  const call = (name: string, cursor: string | null, page: typeof first, bad = false) => f.put(name, { connectionId: 'slack', cursor,
    identity: f.adapter.principal, source: 'Synthetic captured native operation', resultDigest: bad ? '0'.repeat(64) : hostPageDigest(page) });
  let failure: any;
  try { importHostCatalog(f.root, { connectionId: 'slack', source: 'Synthetic catalog import', pages: [
    { page: first, cursor: null, call: call('page-one.json', null, first) }, { page: second, cursor: 'second', call: call('page-two.json', 'second', second, true) }] }); }
  catch (error) { failure = error; }
  assert(failure?.progress, 'Return the already-retained progress on validation failure');
  const retained = readObject<any>(f.root, failure.progress); assert.equal(retained.cursor, 'second'); assert.equal(retained.channels.length, 1);
  assert(failure.message.includes(retained.operationId));
});

test('RA-03 remote invocation retains its exact source admission before dispatch', async () => {
  const f = await dispatchFixture(); let invoked = 0;
  await gh.dispatchRegression(f.root, f.policy, f.pr, f.target, async () => {
    invoked++; const record = load<any>(f.root, `.local/github-dispatch/${f.key}.json`, () => null).value;
    assert(record.companyAdmission, 'Pin company admission before invoking GitHub');
    const proof = readObject<any>(f.root, record.companyAdmission); assert.equal(proof.basis.sha256, f.basisRef.sha256);
    assert(proof.receipts.length); return 'Synthetic dispatch acknowledgement';
  });
  assert.equal(invoked, 1);
});

test('no-change G5 and post-decision closure perform separate reads and reuse the actual decision', async () => {
  const f = await noChangeFixture(), original = readFileSync(resolve(f.root, f.review.path));
  await prepareDispositionSources(f.root, { packet: f.packet }, () => f.adapter);
  assert.throws(() => defectCompletion(f.root, f.assignment, f.bug.revision, { refutation: f.review }), /Prepare/);
  const before = f.adapter.calls.length;
  await prepareDispositionSources(f.root, { packet: f.packet, close: f.review }, () => f.adapter);
  assert(f.adapter.calls.length > before);
  const prepared = f.adapter.calls.length;
  await prepareDispositionSources(f.root, { packet: f.packet, close: f.review }, () => f.adapter);
  assert.equal(f.adapter.calls.length, prepared);
  board.transitionTicket(f.root, { id: 'accepted-no-change', ticketId: f.bug.id, expectedRevision: f.bug.revision, to: 'Tested-Ok', decision: f.decision, defect: { refutation: f.review } });
  assert.equal(board.findTicket(f.root, f.bug.id).status, 'Tested-Ok');
  assert.deepEqual(readFileSync(resolve(f.root, f.review.path)), original);
});

test('upstream change after no-change G5 blocks preparation and local recovery preserves the observed move', async () => {
  const f = await noChangeFixture(); await prepareDispositionSources(f.root, { packet: f.packet }, () => f.adapter);
  await prepareDispositionSources(f.root, { packet: f.packet, close: f.review }, () => f.adapter);
  const pending = board.prepareTransition(f.root, { id: 'observed-no-change', ticketId: f.bug.id, expectedRevision: f.bug.revision,
    to: 'Tested-Ok', decision: f.decision, defect: { refutation: f.review } });
  writeFileSync(resolve(f.root, pending.to), pending.content); unlinkSync(resolve(f.root, pending.from));
  f.adapter.messages[0]!.editedTs = '999.000001'; f.adapter.messages[0]!.text = 'New applicable expectation after no-change G5';
  await f.run();
  await assert.rejects(prepareDispositionSources(f.root, { packet: f.packet, close: f.review }, () => f.adapter), /source changed/);
  const observed = board.recoverTransition(f.root, pending.id);
  assert.match(observed.releaseReviewRequired ?? '', /source changed/);
  assert.equal(board.findTicket(f.root, f.bug.id).status, 'Tested-Ok');
});

test('a dispatch proof is immutable through renewal, uncertainty and repeated invocation', async () => {
  for (const uncertain of [false, true]) {
    const f = await dispatchFixture(); let invokes = 0;
    const runner = async () => { invokes++; if (uncertain) throw new Error('Synthetic lost dispatch response'); return 'Synthetic acknowledgement'; };
    if (uncertain) await assert.rejects(gh.dispatchRegression(f.root, f.policy, f.pr, f.target, runner), /uncertain/);
    else await gh.dispatchRegression(f.root, f.policy, f.pr, f.target, runner);
    const original = load<any>(f.root, `.local/github-dispatch/${f.key}.json`, () => null).value;
    const proof = readObject<any>(f.root, original.companyAdmission);
    const oldReceipt = proof.receipts[0].receipt as Evidence;
    await f.run(); refreshReceipt(f.root, f.assignment);
    const current = load<any>(f.root, receiptPath(f.assignment, f.selected.id, f.claim), () => null).value;
    assert.notEqual(current.completions[0].sha256, readObject<any>(f.root, oldReceipt).completions[0].sha256);
    assert.equal(readObject<any>(f.root, original.companyAdmission).basis.sha256, f.basisRef.sha256);
    if (uncertain) await assert.rejects(gh.dispatchRegression(f.root, f.policy, f.pr, f.target, runner), /uncertain/);
    else assert.equal((await gh.dispatchRegression(f.root, f.policy, f.pr, f.target, runner)).action, 'unchanged');
    assert.equal(invokes, 1);
  }
});

test('local GitHub invocation pins source proof and proof persistence failure prevents invocation', async () => {
  const f = await dispatchFixture(); let calls = 0;
  const result = await gh.executeRegression(f.root, f.policy, f.pr, f.target, 'Synthetic local regression', async () => {
    calls++; const stored = load<any>(f.root, `.local/github-runs/${f.key}.json`, () => null).value;
    assert.equal(readObject<any>(f.root, stored.companyAdmission).basis.sha256, f.basisRef.sha256);
  });
  assert.equal(calls, 1); assert(result.record.companyAdmission);
  const blocked = await dispatchFixture(); let invoked = 0;
  writeFileSync(resolve(blocked.root, `${prefix}/admissions`), 'Synthetic unavailable proof directory');
  await assert.rejects(gh.executeRegression(blocked.root, blocked.policy, blocked.pr, blocked.target, 'Synthetic persistence failure', async () => { invoked++; }));
  assert.equal(invoked, 0);
  assert.equal(board.pendingOperations(blocked.root).length, 0);
});

test('native public CLI reports page-two progress and resumes from only that page', async () => {
  const f = await companyFixture(); const cli = resolve('.local/build/automation/cli.js');
  const first = f.adapter.page([f.adapter.channelList[0]!], 'second'), second = f.adapter.page([f.adapter.channelList[1]!]);
  const call = (name: string, cursor: string | null, page: typeof first, invalid = false) => f.put(name, { connectionId: 'slack', cursor,
    identity: f.adapter.principal, source: 'Synthetic native capture', resultDigest: invalid ? '0'.repeat(64) : hostPageDigest(page) });
  const input = f.put('cli-catalog.json', { connectionId: 'slack', source: 'Synthetic native import', pages: [
    { page: first, cursor: null, call: call('cli-first.json', null, first) }, { page: second, cursor: 'second', call: call('cli-bad.json', 'second', second, true) }] });
  const execute = (action: string, path?: string) => spawnSync(process.execPath, [cli, 'company-context', action, '--root', f.root,
    ...(path ? ['--input', path] : ['--connection', 'slack'])], { encoding: 'utf8', windowsHide: true });
  const failed = execute('import-host-catalog', input.path); assert.equal(failed.status, 1); assert.match(failed.stderr, /recorded output/);
  const progress = JSON.parse(failed.stdout).progress as Evidence, catalog = readObject<any>(f.root, progress);
  assert.equal(catalog.channels.length, 1); assert.equal(catalog.cursor, 'second');
  assert.equal(JSON.parse(execute('catalog-jobs').stdout).length, 1);
  const resumed = f.put('cli-resume.json', { connectionId: 'slack', source: 'Synthetic repaired capture', previous: progress,
    pages: [{ page: second, cursor: 'second', call: call('cli-valid.json', 'second', second) }] });
  const done = execute('import-host-catalog', resumed.path); assert.equal(done.status, 0, done.stderr);
  assert.equal(JSON.parse(done.stdout).channelCount, 2); assert.equal(JSON.parse(execute('catalog-jobs').stdout).length, 0);
});

test('catalog error decoration cannot clear another request in the same process', async () => {
  const f = await companyFixture(), catalog = beginCatalog(f.root, 'slack', 'Synthetic competing requests');
  const token = reserveCatalogPage(f.root, catalog);
  const decorated = failCatalogPage(f.root, catalog, new Error('Synthetic pre-reservation validation'), 'wrong-token');
  assert(decorated.progress); assert.equal(catalogProgress(f.root, catalog.operationId!).value.inFlight?.reservationId, token);
  assert.throws(() => commitCatalogPage(f.root, catalog, f.adapter.page([]), Date.now(), 'wrong-token'), /changed/);
  assert.equal(commitCatalogPage(f.root, catalog, f.adapter.page([]), Date.now(), token).complete, true);
});
