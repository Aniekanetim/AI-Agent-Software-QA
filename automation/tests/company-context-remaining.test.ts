import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { companyFixture } from './company-fixture.js';
import * as board from '../board/board.js';
import * as gh from '../github/github.js';
import { defectCompletion } from '../regression/fix.js';
import { prepareCompanyBasis } from '../company-context/runtime.js';
import { load, digest, type Evidence } from '../shared/store.js';
import { readObject } from '../company-context/store.js';
import { importHostCatalog, hostPageDigest } from '../slack/import.js';

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
