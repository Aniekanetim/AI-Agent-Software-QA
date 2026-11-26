import test from 'node:test';
import assert from 'node:assert/strict';
import { companyFixture } from './company-fixture.js';
import * as live from '../task-source/work.js';
import type { LiveChoice } from '../task-source/config.js';
import type { Connection } from '../task-source/provider.js';
import { readObject } from '../company-context/store.js';
import { prepareCompanyBasis } from '../company-context/runtime.js';
import { prepareDispositionSources } from '../regression/fix.js';
import { digest } from '../shared/store.js';
import { upgradeBoard } from '../board/board.js';

async function connectedFixture(retest = false) {
  const f = await companyFixture();
  upgradeBoard(f.root, 'Synthetic source-switch fixture');
  const choice: LiveChoice = { kind: 'live', board: { provider: 'clickup', scopeId: '11', clickupWorkspaceId: 'company' },
    queues: { ready: ['qa'], retest: ['retest'], testedOk: ['done'], devTodo: ['dev'] }, actions: ['comment', 'move', 'createDefect'] };
  const remote: Connection = { identity: { accountId: 'qa', workspaceId: 'company', scopeId: '11', scopeName: 'Synthetic board' },
    states: [{ id: 'qa', name: 'QA' }, { id: 'retest', name: 'Retest' }, { id: 'done', name: 'Done' }, { id: 'dev', name: 'Dev Todo' }],
    descriptions: { task: null }, tickets: [{ id: 'task', title: 'Synthetic task', url: 'https://app.clickup.com/t/task', state: retest ? 'retest' : 'qa',
      assignees: ['qa'], closed: false, createdAt: '2026-01-01T00:00:00Z', priority: 1, revision: digest('Synthetic revision') }] };
  const reader = async () => structuredClone(remote);
  const preview = await live.preview(f.root, choice, reader); await live.configure(f.root, { choice, previewDigest: preview.digest, source: 'Synthetic board selection' }, reader);
  const claim = await live.claim(f.root, { ticketId: 'task', ticketRevision: remote.tickets[0]!.revision, source: 'Synthetic intake' }, reader);
  const a = f.authorize({ assignment: { source: claim.sourceKey, ticketId: claim.ticket.id } });
  return { ...f, ...a, claim, remote, reader };
}

test('connected aggregate admission pins exact source evidence before execution', async () => {
  const f = await connectedFixture();
  const targetValue = { claimId: f.claim.id, ticketRevision: f.claim.ticket.revision, buildId: 'B-1', environment: 'staging', source: 'Synthetic readback', observedAt: new Date().toISOString() };
  const target = f.put('live-target.json', targetValue);
  const gate = (kind: 'G1' | 'G2') => f.put(`live-${kind}.json`, { claimId: f.claim.id, ticketRevision: f.claim.ticket.revision, gate: kind,
    decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic informed decision', packet: f.packet, understanding: f.understanding,
    ...(kind === 'G2' ? { target: targetValue, dataScope: { schemaVersion: 1, mode: 'none', checks: [{ id: 'check', conditionIds: ['rule'], dataItemIds: [] }] } } : {}) });
  const gates = { G1: gate('G1'), G2: gate('G2') };
  const boundary = { purpose: 'execution' as const, id: 'connected-run', target: targetValue };
  await prepareCompanyBasis(f.root, f.assignment, undefined, () => f.adapter, boundary);
  const run = await live.beginExecution(f.root, { id: 'connected-run', claimId: f.claim.id, gates, target, buildId: 'B-1' }, f.reader);
  assert(run.companyAdmission); assert.equal(readObject<any>(f.root, run.companyAdmission).basis.sha256, f.basisRef.sha256);
  live.settleExecution(f.root, { id: run.id, state: 'completed', source: 'Synthetic actual aggregate outcome', evidence: [target] });
  assert.equal(live.claimHistory(f.root, f.claim.id).executions[0]!.companyAdmission?.sha256, run.companyAdmission.sha256);
});

test('connected no-change closure enforces sources and records an already-observed move with missing proof', async () => {
  const f = await connectedFixture(true), defectReport = f.put('defect.json', { source: 'Synthetic original defect' });
  const ownerDecision = f.put('owner.json', { assignment: f.assignment, decision: 'noProductChange', source: 'Synthetic owner clarification' });
  const target = { buildId: 'B-1', environment: 'staging' }, targetObservation = f.put('target.json', { ...target, observedAt: new Date().toISOString(), source: 'Synthetic readback' });
  const packet = f.put('no-change-packet.json', { assignment: f.assignment, ticketRevision: f.claim.ticket.revision, defectReport, ownerDecision, understanding: f.understanding, targetObservation });
  const refutation = f.put('refutation.json', { ...readObject<any>(f.root, packet), packet, target, gate: 'G5', decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic actual scoped review' });
  const g4 = f.put('g4.json', { claimId: f.claim.id, ticketRevision: f.claim.ticket.revision, gate: 'G4', decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic actual retest scope', packet, defectReport });
  const request = { id: 'no-change-publish', claimId: f.claim.id, action: 'move' as const, to: 'testedOk' as const, defect: g4, completion: { refutation } };
  const proposed = await live.publicationPreview(f.root, request, f.reader);
  const decision = f.put('live-g5.json', { claimId: f.claim.id, ticketRevision: f.claim.ticket.revision, gate: 'G5', decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic actual publication decision', packet, target, fixReview: refutation, publicationDigest: proposed.publicationDigest });
  let writes = 0;
  await assert.rejects(live.publish(f.root, { ...request, decision, source: 'Synthetic reviewed publication' }, f.reader, async () => async () => { writes++; return { remoteId: 'task' }; }), /Prepare/);
  assert.equal(writes, 0);
  await prepareDispositionSources(f.root, { packet }, () => f.adapter);
  f.adapter.messages[0]!.editedTs = '999.000001'; f.adapter.messages[0]!.text = 'New current rule after no-change review';
  await assert.rejects(prepareDispositionSources(f.root, { packet, close: refutation }, () => f.adapter), /source changed/);
  // The provider reports a manual move despite missing/stale review evidence: retain it, never resend.
  f.remote.tickets[0]!.state = 'done';
  const observed = await live.observeReleaseCompletion(f.root, { id: 'observed-no-change', claimId: f.claim.id, decision,
    source: 'Synthetic independent provider readback', defect: g4, completion: { refutation } }, f.reader);
  assert.equal(observed.state, 'confirmed'); assert.match(observed.reviewRequired ?? '', /source changed/); assert.equal(writes, 0);
  await assert.rejects(live.closeCurrentClaim(f.root, { claimId: f.claim.id, disposition: 'completed', source: 'Synthetic close', evidence: [decision] }, f.reader), /source changed|disposition/);
});
