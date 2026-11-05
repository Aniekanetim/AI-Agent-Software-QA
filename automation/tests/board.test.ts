import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, unlinkSync, rmdirSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as b from '../board/board.js';
import * as s from '../shared/store.js';
import * as gh from '../github/github.js';

function put(root: string, path: string, value: unknown) { const file = s.contained(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return s.evidence(root, path); }
const rule: gh.RepositoryRule = { repository: 'fixture/product', branches: ['main'], labels: [], includeDrafts: false, reporting: 'comment' };
const pr = (head = 'a'.repeat(40)): gh.PullRequest => ({ repository: rule.repository, number: 1, title: 'Synthetic change', url: 'https://github.com/fixture/product/pull/1', head, base: 'main', labels: [], draft: false, mergeCommit: null, fromFork: false });
function fixture() {
  const root = resolve('output/Board lifecycle fixtures', randomUUID()); mkdirSync(root, { recursive: true });
  b.upgradeBoard(root, 'Synthetic package fixture; no live task or human decision');
  const ticket = gh.ingestPr(root, pr(), rule, 'Synthetic PR event').ticket!;
  const decision = put(root, '.local/decision.json', { source: 'Synthetic decision evidence; not human approval' });
  const d: b.Decision = { actor: 'Synthetic owner', source: 'Synthetic-only test instruction', reason: 'Synthetic lifecycle test', evidence: [decision], scope: { kind: 'assignment' }, checkpoint: 'Synthetic G2 checkpoint', nextOwner: 'Synthetic QA', nextAction: 'Review recorded state', handoff: 'Synthetic fixture only; preserve results and create no real accounts.', review: { owner: 'Synthetic owner', dueAt: '2026-11-06T09:00:00+01:00', trigger: 'fixture-ready', resumeWhen: 'Actual reviewer authorizes resumption' } };
  const move = (to: b.Status, id = randomUUID(), changes: Partial<b.Decision> = {}) => b.transitionTicket(root, { id, ticketId: 'QA-001', expectedRevision: b.findTicket(root, 'QA-001').revision, to, decision: { ...d, ...changes } });
  const suite = put(root, '.local/suite.txt', 'Synthetic suite');
  const observation = { id: 'fixture', commit: pr().head, buildId: 'fixture-1', observedAt: new Date().toISOString(), source: 'Synthetic actual-target fixture' };
  const target: gh.ObservedTarget = { ...observation, evidence: put(root, '.local/target.json', observation) };
  const policy: gh.RegressionPolicy = { schemaVersion: 1, id: 'fixture', revision: '1', approval: { path: '.local/approval.json', sha256: '0'.repeat(64) }, repositories: [rule], allowForks: false, allowMergeCommit: false, suiteId: 'fixture', suiteEvidence: [suite], command: { executable: process.execPath, args: ['-e', 'process.exit(0)'] }, timeoutMs: 2000, targetId: target.id, dispatch: { workflow: 'fixture.yml', ref: 'main' } };
  policy.approval = put(root, '.local/approval.json', { decision: 'Approved', reviewer: 'Synthetic fixture', source: 'Synthetic-only policy', policyDigest: gh.policyDigest(policy) });
  return { root, ticket, d, move, policy, target };
}
test('five-folder upgrades add only the new queues and are idempotent', () => {
  const f = fixture();
  for (const status of ['Deferred', 'Canceled']) { const path = s.contained(f.root, `${b.boardRoot}/${status}/.gitkeep`); unlinkSync(path); rmdirSync(dirname(path)); }
  const before = readFileSync(s.contained(f.root, f.ticket), 'utf8');
  assert.deepEqual(b.upgradeBoard(f.root, 'Synthetic upgrade').added, ['Deferred', 'Canceled']);
  assert.equal(b.statuses.length, 7); assert.equal(readFileSync(s.contained(f.root, f.ticket), 'utf8'), before);
  assert.deepEqual(b.upgradeBoard(f.root, 'Synthetic repeated upgrade').added, []);
});
test('deferral moves the original ticket, preserves history and repairs authorized relative links', () => {
  const f = fixture(); put(f.root, f.ticket, readFileSync(s.contained(f.root, f.ticket), 'utf8') + '\nDeveloper response: retain this.\n[Local note](notes.txt)\n');
  put(f.root, 'notes.md', `[Ticket](${encodeURI(f.ticket)}#findings--decisions--clarifications)\n`);
  const baseline = `[Ticket](../${encodeURI(f.ticket)})\n`; put(f.root, 'Project Context/source.md', baseline);
  const moved = f.move('Deferred');
  const t = b.findTicket(f.root, 'QA-001'); assert.equal(t.status, 'Deferred'); assert(t.text.includes('retain this')); assert(t.text.includes('../Ready%20for%20QA/notes.txt'));
  assert(t.lifecycle?.previousCheckpoint.startsWith('Intake;')); assert.equal(t.lifecycle?.checkpoint, f.d.checkpoint);
  assert(!existsSync(s.contained(f.root, f.ticket))); assert(readFileSync(s.contained(f.root, 'notes.md'), 'utf8').includes('/Deferred/'));
  assert.equal(readFileSync(s.contained(f.root, 'Project Context/source.md'), 'utf8'), baseline); assert.equal(moved.ownerUpdates.length, 1);
  assert.throws(() => b.assertExecutable(f.root, t.id), /not eligible/);
});
test('missing or stale decisions and colliding destinations preserve the source', () => {
  const f = fixture(), t = b.findTicket(f.root, 'QA-001');
  const request: b.Transition = { id: 'fixture-move', ticketId: t.id, expectedRevision: t.revision, to: 'Deferred', decision: { ...f.d, review: undefined } };
  assert.throws(() => b.transitionTicket(f.root, request), /Deferral/);
  assert.throws(() => b.transitionTicket(f.root, { ...request, decision: f.d, expectedRevision: '0'.repeat(64) }), /revision/);
  put(f.root, f.ticket.replace('/Ready for QA/', '/Deferred/'), 'Another file: never overwrite');
  assert.throws(() => f.move('Deferred'), /stable ticket ID|destination|Duplicate/); assert.equal(s.revision(f.root, f.ticket), t.revision);
});
test('interrupted moves recover after an exclusive destination write without duplicates', () => {
  const f = fixture(), t = b.findTicket(f.root, 'QA-001');
  const request: b.Transition = { id: 'interrupted', ticketId: t.id, expectedRevision: t.revision, to: 'Canceled', decision: f.d };
  const journal = b.prepareTransition(f.root, request);
  assert.throws(() => b.tickets(f.root), /incomplete/);
  writeFileSync(s.contained(f.root, journal.to), journal.content, { flag: 'wx' });
  b.recoverTransition(f.root, journal.id); assert.equal(b.tickets(f.root).length, 1); assert.equal(b.findTicket(f.root, t.id).status, 'Canceled');
  assert.equal(b.transitionTicket(f.root, request).id, journal.id); assert.equal(b.tickets(f.root).length, 1);
});
test('link conflicts stop recovery without overwriting a concurrent edit', () => {
  const f = fixture(); put(f.root, 'links.md', `[Ticket](${encodeURI(f.ticket)})`);
  const request: b.Transition = { id: 'conflict', ticketId: 'QA-001', expectedRevision: b.findTicket(f.root, 'QA-001').revision, to: 'Canceled', decision: f.d };
  const j = b.prepareTransition(f.root, request); put(f.root, 'links.md', 'Concurrent owner edit');
  assert.throws(() => b.recoverTransition(f.root, j.id), /changed/);
  assert.equal(readFileSync(s.contained(f.root, 'links.md'), 'utf8'), 'Concurrent owner edit'); assert.equal(b.pendingTransitions(f.root).length, 1);
});
test('inactive assignments suppress repeated and changed PR events, and reserve their IDs', () => {
  for (const status of ['Deferred', 'Canceled'] as const) {
    const f = fixture(); f.move(status);
    assert.equal(gh.ingestPr(f.root, pr(), rule, 'Synthetic repeat').action, 'unchanged');
    assert.equal(gh.ingestPr(f.root, pr('b'.repeat(40)), rule, 'Synthetic new revision').action, 'updated');
    assert.equal(b.tickets(f.root).length, 1); assert.equal(b.findTicket(f.root, 'QA-001').status, status);
    const second = gh.ingestPr(f.root, { ...pr(), number: 2 }, rule, 'Synthetic other PR'); assert(second.ticket?.includes('QA-002-'));
  }
});
test('a revision-only cancellation permits a separately linked assignment for a new revision', () => {
  const f = fixture(); f.move('Canceled', randomUUID(), { scope: { kind: 'revision', revision: pr().head } });
  assert.equal(gh.ingestPr(f.root, pr('b'.repeat(40)), rule, 'Synthetic new revision').action, 'created');
  assert.equal(b.findTicket(f.root, 'QA-001').status, 'Canceled'); assert.equal(b.findTicket(f.root, 'QA-002').status, 'Ready for QA');
  assert.equal(gh.executionAssignment(f.root, pr('b'.repeat(40))).id, 'QA-002');
});
test('deferred review notices require actual acknowledgement and never resume execution', () => {
  const f = fixture(); f.move('Deferred');
  assert.equal(b.reviews(f.root, '2026-11-05T00:00:00Z').length, 0);
  const [due] = b.reviews(f.root, '2026-11-06T08:00:00Z'); assert(due && !due.reported);
  b.acknowledgeReview(f.root, due.ticketId, due.generation, 'Synthetic actual briefing reference');
  assert(b.reviews(f.root, '2026-11-06T08:00:00Z')[0]?.reported); assert.equal(b.findTicket(f.root, 'QA-001').status, 'Deferred');
  assert.equal(b.reviews(f.root, '2026-11-05T00:00:00Z', 'fixture-ready').length, 1);
});
test('reactivation keeps identity, invalidates old continuations and cannot become a pass', () => {
  const f = fixture(), before = b.assertExecutable(f.root, 'QA-001'); f.move('Canceled');
  assert.throws(() => f.move('Tested-Ok'), /Reactivate/);
  f.move('Ready for QA'); const t = b.assertExecutable(f.root, before.id); assert.notEqual(t.generation, before.generation);
  assert.throws(() => b.assertExecutable(f.root, before.id, before.generation), /lifecycle changed/); assert.equal(b.tickets(f.root).length, 1);
});
test('inactive work cannot reach local runners or workflow dispatch; reporting remains authorized', async () => {
  for (const status of ['Deferred', 'Canceled'] as const) {
    const f = fixture(); f.move(status); let called = 0;
    await assert.rejects(gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic', async () => { called++; }), /not eligible/);
    await assert.rejects(gh.dispatchRegression(f.root, f.policy, pr(), f.target, async () => { called++; return ''; }), /not eligible/);
    assert.equal(called, 0);
    put(f.root, '.local/report.md', 'Synthetic cancellation report');
    assert.equal((await gh.publishComment(f.root, f.policy, pr(), f.target, '.local/report.md', async () => { called++; return 'Synthetic receipt'; })).action, 'published'); assert.equal(called, 1);
  }
});
test('in-flight cancellation requests a stop, retains uncertainty and requires observed recovery', async () => {
  const f = fixture(); let received = false;
  const work = gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic in-flight fixture', async (_command, options) => {
    return new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => { received = true; reject(new Error('Synthetic abort acknowledgement is not process termination')); });
      queueMicrotask(() => f.move('Canceled'));
    });
  });
  await assert.rejects(work, /uncertain/); assert(received);
  const [op] = b.operations(f.root, 'QA-001'); assert(op && op.state === 'uncertain'); assert.throws(() => f.move('Ready for QA'), /unfinished/);
  const observation = put(f.root, '.local/stopped.json', { synthetic: true, processObservedStopped: true });
  b.settleOperation(f.root, { id: op.id, source: 'Synthetic explicit process observation', terminalState: 'stopped', evidence: [observation] });
  f.move('Ready for QA'); assert.equal(b.assertExecutable(f.root, 'QA-001').status, 'Ready for QA');
});
test('an acknowledged CI dispatch stays unresolved until its actual remote outcome is observed', async () => {
  const f = fixture(); await gh.dispatchRegression(f.root, f.policy, pr(), f.target, async () => 'Synthetic request receipt, no actual run identity');
  f.move('Deferred'); assert.throws(() => f.move('Ready for QA'), /unfinished/);
  assert.equal(b.operations(f.root, 'QA-001')[0]?.state, 'uncertain');
});
test('manual inactive moves without lifecycle metadata still block execution', async () => {
  const f = fixture(), destination = f.ticket.replace('/Ready for QA/', '/Canceled/');
  copyFileSync(s.contained(f.root, f.ticket), s.contained(f.root, destination)); unlinkSync(s.contained(f.root, f.ticket));
  assert.throws(() => gh.executionAssignment(f.root, pr()), /not eligible/);
});
test('allocation uses stable IDs rather than filenames and detects duplicate IDs in inactive queues', () => {
  const f = fixture(); put(f.root, f.ticket, '\uFEFF' + readFileSync(s.contained(f.root, f.ticket), 'utf8')); renameSync(s.contained(f.root, f.ticket), s.contained(f.root, `${b.boardRoot}/Ready for QA/task.md`));
  assert(gh.ingestPr(f.root, { ...pr(), number: 2 }, rule, 'Synthetic separate PR').ticket?.includes('QA-002-'));
  copyFileSync(s.contained(f.root, `${b.boardRoot}/Ready for QA/task.md`), s.contained(f.root, `${b.boardRoot}/Canceled/duplicate.md`));
  assert.throws(() => b.tickets(f.root), /Duplicate ticket IDs/);
});
test('malformed revision scope is not treated as permission to recreate canceled work', () => {
  const f = fixture(); f.move('Canceled'); const t = b.findTicket(f.root, 'QA-001');
  put(f.root, t.path, t.text.replace('"kind": "assignment"', '"kind": "revision"'));
  assert.throws(() => gh.ingestPr(f.root, pr('b'.repeat(40)), rule, 'Synthetic changed event'), /Unsupported lifecycle/);
});
test('lifecycle examples inside larger code fences cannot change the actual ticket state', () => {
  const f = fixture(); put(f.root, f.ticket, readFileSync(s.contained(f.root, f.ticket), 'utf8') + '\n````markdown\n```qa-lifecycle\n{"schemaVersion":99}\n```\n````\n');
  assert.equal(b.findTicket(f.root, 'QA-001').generation, 'legacy'); f.move('Deferred'); assert.equal(b.findTicket(f.root, 'QA-001').status, 'Deferred');
});
test('defects reactivate into their actual working queue and retain the original failure', () => {
  const f = fixture(); put(f.root, `${b.boardRoot}/Dev Todo/BUG-001-original-failure.md`, '# BUG-001: Original synthetic failure\n\nActual result: Fail; P1 remains known.\n');
  const move = (to: b.Status) => b.transitionTicket(f.root, { id: randomUUID(), ticketId: 'BUG-001', expectedRevision: b.findTicket(f.root, 'BUG-001').revision, to, decision: f.d });
  move('Deferred'); assert.throws(() => move('Ready for QA'), /working queue/); move('Retest');
  const bug = b.findTicket(f.root, 'BUG-001'); assert.equal(bug.status, 'Retest'); assert(bug.text.includes('Fail; P1 remains known'));
});
test('canceling a parent leaves linked defects and uncovered conditions visible', () => {
  const f = fixture(); const bug = `${b.boardRoot}/Dev Todo/BUG-001-known-risk.md`;
  put(f.root, bug, `# BUG-001: Known risk\nParent: [QA-001](../Ready%20for%20QA/${f.ticket.split('/').at(-1)})\nActual: Fail; risk acceptance Pending.\n`);
  put(f.root, 'coverage.md', 'Condition C-1: Included; Not run.\n'); f.move('Canceled');
  assert.equal(b.findTicket(f.root, 'BUG-001').status, 'Dev Todo'); assert(b.findTicket(f.root, 'BUG-001').text.includes('../Canceled/'));
  assert.equal(readFileSync(s.contained(f.root, 'coverage.md'), 'utf8'), 'Condition C-1: Included; Not run.\n');
});
test('a later execution approval cannot resume work canceled while review was pending', async () => {
  const f = fixture(); f.move('Canceled');
  f.policy.approval = put(f.root, '.local/approval.json', { decision: 'Approved', reviewer: 'Synthetic late reviewer', source: 'Synthetic delayed reply', policyDigest: gh.policyDigest(f.policy) });
  let calls = 0; await assert.rejects(gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic late continuation', async () => { calls++; }), /not eligible/); assert.equal(calls, 0);
});
test('the default local runner receives cancellation while process termination remains separately observed', async () => {
  const f = fixture(), pidFile = s.contained(f.root, '.local/child-pid.txt');
  f.policy.command.args = ['-e', `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(()=>{},10000);`];
  f.policy.timeoutMs = 5000; f.policy.approval = put(f.root, '.local/approval.json', { decision: 'Approved', reviewer: 'Synthetic fixture', source: 'Synthetic process-only scope', policyDigest: gh.policyDigest(f.policy) });
  const work = gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic real child process').then(() => 'unexpected completion', error => String(error));
  let pid = 0; const until = Date.now() + 4000;
  while (!pid && Date.now() < until) {
    const value = existsSync(pidFile) ? readFileSync(pidFile, 'utf8') : '';
    if (/^[1-9]\d*$/.test(value)) pid = Number(value);
    else await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert(Number.isInteger(pid) && pid > 0, 'The isolated synthetic child must actually publish its own process identity');
  f.move('Canceled'); assert.match(await work, /uncertain/);
  let stopped = false; const stopUntil = Date.now() + 2000;
  while (!stopped && Date.now() < stopUntil) { try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 25)); } catch (error: any) { if (error.code === 'ESRCH') stopped = true; else throw error; } }
  assert(stopped, 'This direct child must be observed stopped; no process-tree claim is made');
  assert.equal(b.operations(f.root, 'QA-001')[0]?.state, 'uncertain');
});
test('legacy execution reconciliation retains the old record and requires actual source evidence', async () => {
  const f = fixture(), base = gh.assertRegression(f.root, f.policy, pr(), f.target), path = `.local/github-runs/${base}.json`;
  const ref = put(f.root, path, { synthetic: true, status: 'uncertain', source: 'Old package fixture' }); let calls = 0;
  await assert.rejects(gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic', async () => { calls++; }), /reconcile-legacy/);
  const request = { ticketId: 'QA-001', actor: 'Synthetic observer', source: 'Synthetic observed stopped process', terminalState: 'stopped' as const, evidence: [put(f.root, '.local/legacy-observation.json', { synthetic: true, observedStopped: true })] };
  assert.throws(() => gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ...request, evidence: [] }));
  gh.reconcileLegacy(f.root, f.policy, pr(), f.target, request);
  await gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic reviewed continuation', async () => { calls++; });
  assert.equal(calls, 1); assert.equal(s.revision(f.root, path), ref.sha256);
});
test('recovery cannot write protected human context through normalized journal paths', () => {
  const f = fixture(), path = 'Project Context/owned.md'; put(f.root, path, 'Human baseline');
  const journal = b.prepareTransition(f.root, { id: 'protected-recovery', ticketId: 'QA-001', expectedRevision: b.findTicket(f.root, 'QA-001').revision, to: 'Canceled', decision: f.d });
  journal.patches.push({ path: './Project Context/owned.md', before: s.revision(f.root, path)!, content: 'Unauthorized replacement' });
  const stored = `.local/board-transitions/${journal.id}.json`; s.save(f.root, stored, journal, s.revision(f.root, stored));
  assert.throws(() => b.recoverTransition(f.root, journal.id), /out-of-scope/); assert.equal(readFileSync(s.contained(f.root, path), 'utf8'), 'Human baseline');
});
test('a pending move for another ticket does not cancel an independent running operation', async () => {
  const f = fixture(); gh.ingestPr(f.root, { ...pr(), number: 2 }, rule, 'Synthetic independent assignment'); let aborted = false, journalId = '';
  await gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic independent run', async (_command, options) => {
    options.signal.addEventListener('abort', () => { aborted = true; });
    queueMicrotask(() => {
      const other = b.findTicket(f.root, 'QA-002'); journalId = 'other-pending';
      b.prepareTransition(f.root, { id: journalId, ticketId: other.id, expectedRevision: other.revision, to: 'Canceled', decision: f.d });
    });
    await new Promise(resolve => setTimeout(resolve, 300));
  });
  assert.equal(aborted, false); b.recoverTransition(f.root, journalId);
  assert.equal(b.findTicket(f.root, 'QA-001').status, 'Ready for QA'); assert.equal(b.findTicket(f.root, 'QA-002').status, 'Canceled');
});
