import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, unlinkSync, rmdirSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as b from '../board/board.js';
import * as s from '../shared/store.js';
import * as gh from '../github/github.js';
import { recordAssessment, retainRun } from '../release/round.js';
import { currentReleaseRegression } from '../release/handoff.js';
import { bindReleaseScope } from '../release/scope.js';
import { pinned } from '../release/library.js';
import { releaseFixture } from './release-fixture.js';
import { regressionFixture } from './regression-fixture.js';

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
function releaseTransition() {
  const f = fixture(), ticket = b.findTicket(f.root, 'QA-001'), pilot = releaseFixture(f.root, ticket.id);
  pilot.bind();
  const run = pilot.put('run.json', pilot.run('pass', 'Pass'));
  const { assessment } = recordAssessment(f.root, retainRun(f.root, { round: pilot.roundRef, run }));
  const route = { channel: 'recorded', destination: 'Synthetic review conversation', recipient: 'Release owner', acknowledgementRequired: false };
  const assignment = { source: 'local', ticketId: ticket.id };
  const approval = {
    gate: 'G5', decision: 'Approved', ticketId: ticket.id, ticketRevision: ticket.revision,
    reviewer: 'Synthetic reviewer', source: 'Synthetic G5 decision', packet: f.d.evidence[0],
    target: pilot.target, handoff: { assessment, route, targetObservation: pilot.g5Target, regressionDigest: currentReleaseRegression(f.root, assignment).digest },
  };
  const g5 = put(f.root, '.local/g5.json', approval);
  const request: b.Transition = { id: 'g5-transition', ticketId: ticket.id, expectedRevision: ticket.revision, to: 'Tested-Ok', decision: f.d };
  const delivery = put(f.root, 'delivery.json', {
    state: 'delivered', decisionSha256: g5.sha256, recipient: route.recipient, destination: route.destination, source: 'Synthetic delivery observation',
  });
  return { ...f, request, route, g5, delivery, pilot, assignment, approval };
}
test('local assignment completion always requires G5 and delivery, including with unset or removed settings', () => {
  const f = releaseTransition();
  assert.throws(() => b.transitionTicket(f.root, f.request), /reviewed G5 release and delivery/);
  put(f.root, '.local/reporting-settings.json', { releaseHandoff: f.route });
  put(f.root, '.local/reporting-settings.json', {});
  assert.throws(() => b.transitionTicket(f.root, f.request), /reviewed G5 release and delivery/);
  assert.throws(() => b.transitionTicket(f.root, { ...f.request, release: { decision: f.g5 } }), /handoff delivery/);
  b.transitionTicket(f.root, { ...f.request, release: { decision: f.g5, delivery: f.delivery } });
  const completed = b.findTicket(f.root, f.request.ticketId);
  assert.equal(completed.status, 'Tested-Ok');
  assert(completed.lifecycle?.evidence.some(ref => ref.sha256 === f.delivery.sha256));
});
test('an empty local release requires a current digest and a manifest change invalidates its G5 approval', () => {
  const f = releaseTransition();
  const legacy = put(f.root, '.local/legacy-g5.json', { ...f.approval, handoff: { ...f.approval.handoff, regressionDigest: undefined } });
  assert.throws(() => b.transitionTicket(f.root, { ...f.request, release: { decision: legacy } }), /G5 must review the current regression/);
  const draft = f.pilot.scopeRequest('local', f.pilot.round, f.pilot.roundRef, 'full-regression');
  const g2 = pinned<{ scopeReview: s.Evidence }>(f.root, draft.approval, 'G2 fixture');
  const g1 = pinned<{ changeManifest: s.Evidence }>(f.root, g2.scopeReview, 'G1 fixture');
  const manifest = pinned<{ policy: s.Evidence }>(f.root, g1.changeManifest, 'manifest fixture');
  const policy = pinned<{ critical: unknown[] }>(f.root, manifest.policy, 'policy fixture');
  const fullPolicy = f.pilot.put('full-policy.json', { ...policy, full: policy.critical });
  const updated = f.pilot.put('full-manifest.json', { ...manifest, coverage: 'full', policy: fullPolicy });
  const scopeReview = f.pilot.put('full-g1.json', { ...g1, changeManifest: updated });
  bindReleaseScope(f.root, { ...draft, approval: f.pilot.put('full-g2.json', { ...g2, scopeReview }) });
  assert.throws(() => b.transitionTicket(f.root, { ...f.request, release: { decision: f.g5, delivery: f.delivery } }), /G5 must review the current regression/);
  assert.equal(b.findTicket(f.root, f.request.ticketId).status, 'Ready for QA');
  const regressionDigest = currentReleaseRegression(f.root, f.assignment).digest;
  const decision = f.pilot.put('.local/updated-g5.json', { ...f.approval, handoff: { ...f.approval.handoff, regressionDigest } });
  const delivery = f.pilot.put('updated-delivery.json', { ...pinned<object>(f.root, f.delivery, 'delivery fixture'), decisionSha256: decision.sha256 });
  assert.equal(b.transitionTicket(f.root, { ...f.request, release: { decision, delivery } }).state, 'completed');
});
test('a parent in Retest still needs G5 and a scoped fix waits for its separate regression', () => {
  const f = fixture();
  f.move('Retest');
  assert.throws(() => f.move('Tested-Ok'), /reviewed G5 release and delivery/);
  put(f.root, `${b.boardRoot}/Retest/BUG-001.md`, '# BUG-001: Synthetic scoped defect\n\n| Type | Bug |\n');
  const bug = b.findTicket(f.root, 'BUG-001');
  const fix = regressionFixture(f.root, { source: 'local', ticketId: bug.id }, bug.revision);
  fix.approve();
  const move = { id: 'scoped-retest', ticketId: bug.id, expectedRevision: bug.revision, to: 'Tested-Ok', decision: f.d } as const;
  assert.throws(() => b.transitionTicket(f.root, move), /separate confirmation and regression/);
  const { status } = fix.retain('confirmation');
  assert.equal(status.state, 'regressionPending');
  assert.equal(b.defectRetestStatus(f.root, bug)?.[0]?.state, 'regressionPending');
  assert.throws(() => b.transitionTicket(f.root, { ...move, defect: { fix: fix.key } }), /every required regression check/);
  const wrongG3 = put(f.root, 'pass-g3.json', { gate: 'G3', decision: 'Approved' });
  assert.throws(() => b.transitionTicket(f.root, { ...move, to: 'Rework' }), /reviewed confirmation failure/);
  assert.throws(() => b.transitionTicket(f.root, { ...move, to: 'Rework', rework: { fix: fix.key, review: wrongG3 } }), /recorded failure of the original confirmation/);
  assert.equal(b.findTicket(f.root, bug.id).status, 'Retest');
  fix.retain('regression'); fix.review();
  b.transitionTicket(f.root, { ...move, defect: { fix: fix.key } });
  assert.equal(b.findTicket(f.root, bug.id).status, 'Tested-Ok');
});
test('Rework requires current G3 evidence and recovery preserves the actual outcome, including older reactivation records', () => {
  for (const outcome of ['current', 'unapplied', 'applied', 'legacy-reactivation']) {
    const f = fixture();
    put(f.root, `${b.boardRoot}/Retest/BUG-001.md`, '# BUG-001: Synthetic defect\n\n| Type | Bug |\n');
    let bug = b.findTicket(f.root, 'BUG-001');
    const assignment = { source: 'local', ticketId: bug.id };
    const fix = regressionFixture(f.root, assignment, bug.revision);
    fix.approve();
    const { status } = fix.retain('confirmation', 'Fail');
    if (outcome === 'legacy-reactivation') {
      b.transitionTicket(f.root, { id: 'defer-failure', ticketId: bug.id, expectedRevision: bug.revision, to: 'Deferred', decision: f.d });
      bug = b.findTicket(f.root, bug.id);
    }
    const review = { assignment, target: fix.base.target, ticketRevision: bug.revision, gate: 'G3', decision: 'Approved',
      reviewer: 'Fixture reviewer', source: 'Synthetic G3 decision', packet: fix.defectReport,
      rework: { fix: fix.key, assessmentDigest: status.assessment?.digest } };
    const request = { id: 'rework-move', ticketId: bug.id, expectedRevision: bug.revision, to: 'Rework', decision: f.d } as const;
    const stale = put(f.root, 'stale-g3.json', { ...review, ticketRevision: 'stale revision' });
    assert.throws(() => b.transitionTicket(f.root, { ...request, rework: { fix: fix.key, review: stale } }), /G3 must review/);
    const prepared = b.prepareTransition(f.root, { ...request, rework: { fix: fix.key, review: put(f.root, 'g3.json', review) } });
    if (outcome === 'legacy-reactivation') {
      delete prepared.rework;
      put(f.root, `.local/board-transitions/${prepared.id}.json`, prepared);
    } else if (outcome !== 'current') {
      regressionFixture(f.root, assignment, bug.revision, { base: fix.base, fixRevision: 'r2', supersedes: fix.key });
    }
    if (outcome === 'applied') put(f.root, prepared.to, prepared.content);
    const superseded = outcome === 'unapplied' || outcome === 'legacy-reactivation';
    assert.equal(b.recoverTransition(f.root, prepared.id).state, superseded ? 'superseded' : 'completed');
    const ticket = b.findTicket(f.root, bug.id);
    assert.equal(ticket.status, superseded ? bug.status : 'Rework');
    assert.equal(Boolean(ticket.releaseReviewRequired), outcome === 'applied');
    if (outcome === 'applied') assert.throws(() => b.assertExecutable(f.root, ticket.id, undefined, 'developer'), /Reconcile the observed move/);
  }
});
test('reactivation cannot send a passing confirmation to Rework while regression is pending', () => {
  const f = fixture();
  put(f.root, `${b.boardRoot}/Retest/BUG-001.md`, '# BUG-001: Synthetic defect\n\n| Type | Bug |\n');
  const bug = b.findTicket(f.root, 'BUG-001'), assignment = { source: 'local', ticketId: bug.id };
  const fix = regressionFixture(f.root, assignment, bug.revision);
  fix.approve();
  assert.equal(fix.retain('confirmation').status.state, 'regressionPending');
  const move = (to: b.Status, rework?: b.Transition['rework']) => b.transitionTicket(f.root, {
    id: randomUUID(), ticketId: bug.id, expectedRevision: b.findTicket(f.root, bug.id).revision, to, decision: f.d, rework,
  });
  move('Deferred');
  assert.throws(() => move('Rework'), /reviewed confirmation failure/);
  assert.throws(() => move('Rework', { fix: fix.key, review: f.d.evidence[0]! }), /recorded failure of the original confirmation/);
  assert.equal(b.findTicket(f.root, bug.id).status, 'Deferred');
  move('Retest');
  assert.equal(b.defectRetestStatus(f.root, b.findTicket(f.root, bug.id))?.[0]?.state, 'regressionPending');
});
test('recovery supersedes an unapplied legacy release move and flags one already applied', () => {
  for (const applied of [false, true]) {
    const f = releaseTransition();
    const journal = b.prepareTransition(f.root, { ...f.request, release: { decision: f.g5, delivery: f.delivery } });
    delete journal.release;
    put(f.root, `.local/board-transitions/${journal.id}.json`, journal);
    if (applied) put(f.root, journal.to, journal.content);
    const recovered = b.recoverTransition(f.root, journal.id);
    const ticket = b.findTicket(f.root, f.request.ticketId);
    assert.equal(b.pendingTransitions(f.root).length, 0);
    assert.equal(recovered.state, applied ? 'completed' : 'superseded');
    assert.equal(ticket.status, applied ? 'Tested-Ok' : 'Ready for QA');
    assert.equal(Boolean(ticket.releaseReviewRequired), applied);
  }
});
test('a superseded fix cannot replay an interrupted move into Tested-Ok', () => {
  const f = fixture();
  const path = `${b.boardRoot}/Retest/BUG-001.md`;
  put(f.root, path, '# BUG-001: Synthetic defect\n\n| Type | Bug |\n');
  const bug = b.findTicket(f.root, 'BUG-001'), defect = { source: 'local', ticketId: bug.id };
  const fix = regressionFixture(f.root, defect, bug.revision);
  fix.approve(); fix.retain('confirmation'); fix.retain('regression'); fix.review();
  const prepared = b.prepareTransition(f.root, { id: 'recover-fix', ticketId: bug.id, expectedRevision: bug.revision,
    to: 'Tested-Ok', decision: f.d, defect: { fix: fix.key } });
  regressionFixture(f.root, defect, bug.revision, { base: fix.base, fixRevision: 'r2', supersedes: fix.key });
  assert.equal(b.recoverTransition(f.root, prepared.id).state, 'superseded');
  assert.equal(b.findTicket(f.root, bug.id).status, 'Retest');
});
test('public review, closure and recovery enforce case evidence for an open fix', () => {
  for (const legacy of [true, false]) {
    const f = fixture();
    put(f.root, `${b.boardRoot}/Retest/BUG-001.md`, '# BUG-001: Synthetic open fix\n\n| Type | Bug |\n');
    const bug = b.findTicket(f.root, 'BUG-001');
    const fix = regressionFixture(f.root, { source: 'local', ticketId: bug.id }, bug.revision, { cases: !legacy, interruptConfirmation: !legacy });
    fix.approve(); fix.retain('confirmation');
    const close = { id: 'public-close', ticketId: bug.id, expectedRevision: bug.revision,
      to: 'Tested-Ok', decision: f.d, defect: { fix: fix.key } } as const;
    assert.throws(() => b.transitionTicket(f.root, close, true), /every required regression/);
    fix.retain('regression');
    const review = fix.review([], legacy);
    const cli = (args: string[], value?: unknown) => {
      const ref = value === undefined ? undefined : put(f.root, '.local/strict-fixture-input.json', value);
      return spawnSync(process.execPath, [resolve('.local/build/automation/cli.js'), '--root', f.root, ...args,
        ...(ref ? ['--input', ref.path] : [])], { encoding: 'utf8' });
    };
    const recorded = cli(['regression', 'record-review'], { fix: fix.key, review });
    const moved = cli(['board', 'transition'], close);
    assert.equal(recorded.status, legacy ? 1 : 0, recorded.stderr);
    assert.equal(moved.status, legacy ? 1 : 0, moved.stderr);
    assert.equal(b.findTicket(f.root, bug.id).status, legacy ? 'Retest' : 'Tested-Ok');
    if (legacy) {
      assert.match(recorded.stderr, /case batches/);
      assert.match(moved.stderr, /case batches/);
      const prepared = b.prepareTransition(f.root, { ...close, id: 'legacy-pending' });
      put(f.root, prepared.to, prepared.content);
      const recovered = cli(['board', 'recover', '--id', prepared.id]);
      assert.equal(recovered.status, 0, recovered.stderr);
      assert.match(JSON.parse(recovered.stdout).releaseReviewRequired, /case batches/);
      assert.equal(b.findTicket(f.root, bug.id).status, 'Tested-Ok');
    }
  }
});

test('a reviewed owner refutation can close without creating a product-fix record', () => {
  const f = fixture();
  put(f.root, `${b.boardRoot}/Retest/BUG-001.md`, '# BUG-001: Synthetic report\n\n| Type | Bug |\n');
  const bug = b.findTicket(f.root, 'BUG-001'), assignment = { source: 'local', ticketId: bug.id };
  const ownerDecision = put(f.root, 'owner.json', { assignment, decision: 'noProductChange', source: 'Synthetic requirements owner confirmation' });
  const refutation = put(f.root, 'no-change.json', { assignment, gate: 'G5', decision: 'Approved', reviewer: 'Fixture reviewer',
    source: 'Synthetic QA disposition', ticketRevision: bug.revision, ownerDecision, defectReport: f.d.evidence[0] });
  b.transitionTicket(f.root, { id: 'no-change-disposition', ticketId: bug.id, expectedRevision: bug.revision,
    to: 'Tested-Ok', decision: f.d, defect: { refutation } });
  assert.equal(b.findTicket(f.root, bug.id).status, 'Tested-Ok');
});
test('five-folder upgrades add only the new queues and are idempotent', () => {
  const f = fixture();
  for (const status of ['Deferred', 'Canceled']) { const path = s.contained(f.root, `${b.boardRoot}/${status}/.gitkeep`); unlinkSync(path); rmdirSync(dirname(path)); }
  const before = readFileSync(s.contained(f.root, f.ticket), 'utf8');
  assert.deepEqual(b.upgradeBoard(f.root, 'Synthetic upgrade').added, ['Deferred', 'Canceled']);
  assert.equal(b.statuses.length, 7); assert.equal(readFileSync(s.contained(f.root, f.ticket), 'utf8'), before);
  assert.deepEqual(b.upgradeBoard(f.root, 'Synthetic repeated upgrade').added, []);
});
test('deferral rebases its own navigation and proposes incoming repairs without rewriting evidence', () => {
  const f = fixture(); put(f.root, f.ticket, readFileSync(s.contained(f.root, f.ticket), 'utf8') + '\nDeveloper response: retain this.\n[Local note](notes.txt)\n');
  put(f.root, 'notes.md', `[Ticket](${encodeURI(f.ticket)}#findings--decisions--clarifications)\n`);
  const baseline = `[Ticket](../${encodeURI(f.ticket)})\n`; put(f.root, 'Project Context/source.md', baseline);
  const moved = f.move('Deferred');
  const t = b.findTicket(f.root, 'QA-001'); assert.equal(t.status, 'Deferred'); assert(t.text.includes('retain this')); assert(t.text.includes('../Ready%20for%20QA/notes.txt'));
  assert(t.lifecycle?.previousCheckpoint.startsWith('Intake;')); assert.equal(t.lifecycle?.checkpoint, f.d.checkpoint);
  assert(!existsSync(s.contained(f.root, f.ticket))); assert(readFileSync(s.contained(f.root, 'notes.md'), 'utf8').includes('/Ready%20for%20QA/'));
  assert.equal(moved.linkUpdates?.[0]?.path, 'notes.md');
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
  const f = fixture(), path = `${b.boardRoot}/README.md`;
  put(f.root, path, `<!-- qa-navigation:start -->\n[Ticket](Ready%20for%20QA/${f.ticket.split('/').at(-1)})\n<!-- qa-navigation:end -->\n`);
  const request: b.Transition = { id: 'conflict', ticketId: 'QA-001', expectedRevision: b.findTicket(f.root, 'QA-001').revision, to: 'Canceled', decision: f.d, navigation: [{ path, expectedRevision: s.revision(f.root, path)!, source: 'Synthetic explicit mutable-index maintenance' }] };
  const j = b.prepareTransition(f.root, request); put(f.root, path, 'Concurrent owner edit');
  assert.throws(() => b.recoverTransition(f.root, j.id), /changed/);
  assert.equal(readFileSync(s.contained(f.root, path), 'utf8'), 'Concurrent owner edit'); assert.equal(b.pendingTransitions(f.root).length, 1);
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
  put(f.root, 'coverage.md', 'Condition C-1: Included; Not run.\n'); const moved = f.move('Canceled');
  assert.equal(b.findTicket(f.root, 'BUG-001').status, 'Dev Todo'); assert(b.findTicket(f.root, 'BUG-001').text.includes('../Ready%20for%20QA/'));
  assert(moved.linkUpdates?.some(p => p.path === bug));
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
  const request = { ticketId: 'QA-001', actor: 'Synthetic observer', source: 'Synthetic observed stopped process', terminalState: 'stopped' as const, nextAction: 'retry' as const, retrySource: 'Synthetic explicit retry decision under the matching fixture policy', evidence: [put(f.root, '.local/legacy-observation.json', { synthetic: true, observedStopped: true })] };
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

test('ticket moves preserve their immutable Markdown decision snapshot', () => {
  const f = fixture(), path = 'reviews/decision.md';
  const ref = put(f.root, path, `# Synthetic decision\n[QA-001](../${encodeURI(f.ticket)})\nCancel only this fixture.\n`);
  f.move('Canceled', randomUUID(), { evidence: [ref] });
  assert.equal(s.revision(f.root, path), ref.sha256);
  s.verifyEvidence(f.root, b.findTicket(f.root, 'QA-001').lifecycle!.evidence[0]!);
});

test('canceling one ticket preserves approved Markdown suite evidence for unrelated active work', async () => {
  const f = fixture(), other = { ...pr(), number: 2 };
  gh.ingestPr(f.root, other, rule, 'Synthetic separate assignment');
  const ref = put(f.root, 'testware/suite.md', `# Synthetic suite\n[QA-001](../${encodeURI(f.ticket)})\n`);
  f.policy.suiteEvidence = [ref];
  f.policy.approval = put(f.root, '.local/approval.json', { decision: 'Approved', reviewer: 'Synthetic', source: 'Synthetic only', policyDigest: gh.policyDigest(f.policy) });
  let calls = 0;
  await gh.executeRegression(f.root, f.policy, other, f.target, 'Synthetic initial run', async () => { calls++; });
  f.move('Canceled');
  assert.equal(s.revision(f.root, ref.path), ref.sha256);
  const repeated = await gh.executeRegression(f.root, f.policy, other, f.target, 'Synthetic unchanged run', async () => { calls++; });
  assert.equal(repeated.action, 'unchanged'); assert.equal(calls, 1);
});

test('completed legacy results retain deduplication and their original exit code after reconciliation', async () => {
  for (const exitCode of [0, 1]) {
    const f = fixture(), base = gh.assertRegression(f.root, f.policy, pr(), f.target), path = `.local/github-runs/${base}.json`;
    const ref = put(f.root, path, { schemaVersion: 1, key: base, head: pr().head, testedCommit: f.target.commit, buildId: f.target.buildId, status: 'completed', exitCode, productVerdict: 'Not assessed', source: 'Synthetic old adapter' });
    gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ticketId: 'QA-001', actor: 'Synthetic observer', source: 'Synthetic actual completion', terminalState: 'completed', evidence: [put(f.root, '.local/terminal.json', { synthetic: true, exitCode })] });
    let calls = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic repeated invocation', async () => { calls++; });
      assert.equal(result.action, 'unchanged'); assert.equal(result.record.exitCode, exitCode); assert.equal(result.record.productVerdict, 'Not assessed');
    }
    assert.equal(calls, 0); assert.equal(s.revision(f.root, path), ref.sha256); assert.equal(b.operations(f.root, 'QA-001').length, 0);
  }
});

test('ordinary EOF code fences do not block unrelated PR intake or active execution', async () => {
  for (const fence of ['```text', '~~~~markdown', '   ```javascript']) {
    const f = fixture();
    put(f.root, `${b.boardRoot}/Dev Todo/BUG-001-example.md`, `# BUG-001: Synthetic report\n\n${fence}\nSynthetic example until EOF\n`);
    assert.equal(gh.ingestPr(f.root, { ...pr(), number: 2 }, rule, 'Synthetic unrelated PR').action, 'created');
    let calls = 0; await gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic independent run', async () => { calls++; }); assert.equal(calls, 1);
  }
});

test('explicit board navigation maintenance edits only its mutable block and recovers idempotently', () => {
  const f = fixture(), path = `${b.boardRoot}/README.md`, link = `[QA-001](Ready%20for%20QA/${f.ticket.split('/').at(-1)})`;
  const historical = `# Retained history\n${link}\n\n\`\`\`\`markdown\n${link}\n\`\`\`\`\n`;
  put(f.root, path, historical + `\n<!-- qa-navigation:start -->\n${link}\n<!-- qa-navigation:end -->\n`);
  const t = b.findTicket(f.root, 'QA-001');
  const request: b.Transition = { id: 'mutable-index', ticketId: t.id, expectedRevision: t.revision, to: 'Deferred', decision: f.d, navigation: [{ path, expectedRevision: s.revision(f.root, path)!, source: 'Synthetic explicit mutable-index authorization' }] };
  const j = b.prepareTransition(f.root, request); assert.equal(j.patches.length, 1);
  b.recoverTransition(f.root, j.id); const changed = readFileSync(s.contained(f.root, path), 'utf8');
  assert(changed.startsWith(historical)); assert(changed.includes(`<!-- qa-navigation:start -->\n${link.replace('Ready%20for%20QA', 'Deferred')}`));
  const after = s.revision(f.root, path); b.recoverTransition(f.root, j.id); assert.equal(s.revision(f.root, path), after);
  assert(j.linkUpdates?.some(p => p.path === path), 'Historical links remain proposals, not rewritten evidence');
});

test('navigation opt-in cannot designate decision evidence, arbitrary files or markers inside examples', () => {
  for (const mode of ['evidence', 'arbitrary', 'example', 'stale'] as const) {
    const f = fixture(), path = mode === 'arbitrary' ? 'suite.md' : `${b.boardRoot}/README.md`;
    const block = `<!-- qa-navigation:start -->\n[QA-001](${encodeURI(f.ticket)})\n<!-- qa-navigation:end -->\n`;
    const ref = put(f.root, path, mode === 'example' ? `\`\`\`\`markdown\n${block}\`\`\`\`\n` : block);
    const t = b.findTicket(f.root, 'QA-001');
    assert.throws(() => b.transitionTicket(f.root, { id: randomUUID(), ticketId: t.id, expectedRevision: t.revision, to: 'Canceled', decision: mode === 'evidence' ? { ...f.d, evidence: [ref] } : f.d, navigation: [{ path, expectedRevision: mode === 'stale' ? '0'.repeat(64) : ref.sha256, source: 'Synthetic maintenance only' }] }), /navigation|evidence|markers/);
    assert.equal(s.revision(f.root, path), ref.sha256); assert.equal(s.revision(f.root, f.ticket), t.revision); assert.equal(b.pendingTransitions(f.root).length, 0);
  }
});

test('older prepared broad-repair journals cannot write evidence during recovery', () => {
  const f = fixture(), path = 'reviews/frozen.md', ref = put(f.root, path, 'Immutable synthetic evidence');
  const j = b.prepareTransition(f.root, { id: 'old-prepared', ticketId: 'QA-001', expectedRevision: b.findTicket(f.root, 'QA-001').revision, to: 'Canceled', decision: f.d });
  j.schemaVersion = 1; j.patches.push({ path, before: ref.sha256, content: 'Old broad repair would change this' });
  const stored = `.local/board-transitions/${j.id}.json`; s.save(f.root, stored, j, s.revision(f.root, stored));
  const source = s.revision(f.root, j.from), journalHash = s.revision(f.root, stored);
  assert.throws(() => b.recoverTransition(f.root, j.id), /old broad link-repair/);
  assert.equal(s.revision(f.root, path), ref.sha256); assert.equal(s.revision(f.root, j.from), source); assert.equal(s.revision(f.root, j.to), null); assert.equal(s.revision(f.root, stored), journalHash);
});

test('prepared recovery rejects undeclared writes outside mutable navigation before moving the ticket', () => {
  const f = fixture(), path = 'testware/frozen.md', ref = put(f.root, path, 'Immutable suite');
  const j = b.prepareTransition(f.root, { id: 'undeclared-patch', ticketId: 'QA-001', expectedRevision: b.findTicket(f.root, 'QA-001').revision, to: 'Canceled', decision: f.d });
  j.patches.push({ path, before: ref.sha256, content: 'Wrong repair', original: 'Immutable suite', source: 'Synthetic request cannot override scope' });
  const stored = `.local/board-transitions/${j.id}.json`; s.save(f.root, stored, j, s.revision(f.root, stored));
  assert.throws(() => b.recoverTransition(f.root, j.id), /out-of-scope/); assert.equal(s.revision(f.root, path), ref.sha256); assert(existsSync(s.contained(f.root, f.ticket)));
});

test('an actual malformed lifecycle is isolated but blocks its own assignment and continuation', async () => {
  const f = fixture();
  put(f.root, f.ticket, readFileSync(s.contained(f.root, f.ticket), 'utf8') + '\n```qa-lifecycle\n{"schemaVersion":99}\n```\n');
  const invalid = b.findTicket(f.root, 'QA-001'); assert(invalid.issues.some(i => i.includes('Unsupported lifecycle')));
  assert.throws(() => b.assertExecutable(f.root, invalid.id), /Reconcile lifecycle/);
  assert.throws(() => b.assertContinuation(f.root, invalid.id, 'legacy'), /Unsupported lifecycle/);
  assert.throws(() => gh.ingestPr(f.root, pr(), rule, 'Synthetic affected intake'), /Reconcile lifecycle/);
  const other = { ...pr(), number: 2 }; assert.equal(gh.ingestPr(f.root, other, rule, 'Synthetic independent intake').action, 'created');
  let calls = 0; await gh.executeRegression(f.root, f.policy, other, f.target, 'Synthetic independent execution', async () => { calls++; }); assert.equal(calls, 1);
});

test('ordinary EOF examples permit reading a ticket but cannot hide appended lifecycle metadata', () => {
  const f = fixture(); put(f.root, f.ticket, readFileSync(s.contained(f.root, f.ticket), 'utf8') + '\n~~~~markdown\nSynthetic EOF example\n');
  const before = b.assertExecutable(f.root, 'QA-001');
  assert.throws(() => f.move('Canceled'), /could not be placed/);
  assert.equal(s.revision(f.root, f.ticket), before.revision); assert.equal(b.pendingTransitions(f.root).length, 0);
});

test('a legacy dispatch receipt is never redispatched as a result of completion reconciliation', async () => {
  const f = fixture(), base = gh.assertRegression(f.root, f.policy, pr(), f.target), path = `.local/github-dispatch/${base}.json`;
  const ref = put(f.root, path, { key: base, state: 'dispatched', head: pr().head, observation: 'Synthetic receipt only' }); let calls = 0;
  await assert.rejects(gh.dispatchRegression(f.root, f.policy, pr(), f.target, async () => { calls++; return ''; }), /reconcile-legacy/);
  gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ticketId: 'QA-001', actor: 'Synthetic observer', source: 'Synthetic observed remote terminal state', terminalState: 'completed', evidence: [put(f.root, '.local/remote.json', { synthetic: true, terminalObserved: true })] });
  assert.equal((await gh.dispatchRegression(f.root, f.policy, pr(), f.target, async () => { calls++; return ''; })).action, 'unchanged');
  assert.equal(calls, 0); assert.equal(s.revision(f.root, path), ref.sha256); assert.equal(b.operations(f.root, 'QA-001').length, 0);
});

test('legacy terminal observation alone cannot authorize retries and both execution kinds need separate outcomes', async () => {
  const f = fixture(), base = gh.assertRegression(f.root, f.policy, pr(), f.target);
  const local = put(f.root, `.local/github-runs/${base}.json`, { status: 'uncertain', source: 'Synthetic old launch' });
  const remote = put(f.root, `.local/github-dispatch/${base}.json`, { state: 'dispatched', source: 'Synthetic old receipt' });
  const request = { ticketId: 'QA-001', actor: 'Synthetic observer', source: 'Synthetic stop observation', terminalState: 'stopped' as const, evidence: [put(f.root, '.local/terminal.json', { synthetic: true, stopped: true })] };
  assert.throws(() => gh.reconcileLegacy(f.root, f.policy, pr(), f.target, request), /kind/);
  gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ...request, kind: 'localRegression' }); let calls = 0;
  await assert.rejects(gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic no retry decision', async () => { calls++; }), /no new attempt/);
  await assert.rejects(gh.dispatchRegression(f.root, f.policy, pr(), f.target, async () => { calls++; return ''; }), /reconcile-legacy/);
  assert.throws(() => gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ...request, kind: 'localRegression', nextAction: 'retry' }), /retry decision/);
  gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ...request, kind: 'localRegression', nextAction: 'retry', retrySource: 'Synthetic separately authorized new attempt' });
  await assert.rejects(gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic remote still unknown', async () => { calls++; }), /reconcile-legacy/);
  assert.equal(calls, 0); assert.equal(b.operations(f.root, 'QA-001').length, 0);
  gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ...request, kind: 'workflowDispatch', source: 'Synthetic separately observed remote stop' });
  assert.equal((await gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic approved retry', async () => { calls++; })).action, 'executed');
  assert.equal(calls, 1); assert.equal(s.revision(f.root, local.path), local.sha256); assert.equal(s.revision(f.root, remote.path), remote.sha256);
});

test('retained legacy bindings preserve immutable observation history across later reconciliation', async () => {
  const f = fixture(), base = gh.assertRegression(f.root, f.policy, pr(), f.target);
  put(f.root, `.local/github-runs/${base}.json`, { schemaVersion: 1, key: base, head: pr().head, testedCommit: f.target.commit, buildId: f.target.buildId, status: 'completed', exitCode: 1, productVerdict: 'Not assessed' });
  const request = { ticketId: 'QA-001', actor: 'Synthetic observer', source: 'Synthetic first completion', terminalState: 'completed' as const, evidence: [put(f.root, '.local/complete.json', { synthetic: true, exitCode: 1 })] };
  gh.reconcileLegacy(f.root, f.policy, pr(), f.target, request);
  const first = await gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic retain', async () => { assert.fail('Must not run'); });
  gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ...request, source: 'Synthetic later observation' });
  const second = await gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic retain again', async () => { assert.fail('Must not rerun'); });
  assert('retained' in first && 'retained' in second); assert.deepEqual(first.retained, second.retained); assert.equal(second.record.exitCode, 1);
  gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ...request, nextAction: 'retry', retrySource: 'Synthetic new request needs distinct reviewed scope' });
  await assert.rejects(gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic same generation', async () => { assert.fail('Must not replace history'); }), /already retains/);
});

test('observed legacy completion never invents a missing suite result or exit code', async () => {
  const f = fixture(), base = gh.assertRegression(f.root, f.policy, pr(), f.target);
  const ref = put(f.root, `.local/github-runs/${base}.json`, { schemaVersion: 1, key: base, head: pr().head, testedCommit: f.target.commit, buildId: f.target.buildId, status: 'uncertain', productVerdict: 'Not assessed', source: 'Synthetic interrupted result capture' });
  gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ticketId: 'QA-001', actor: 'Synthetic observer', source: 'Synthetic process terminal observation only', terminalState: 'completed', evidence: [put(f.root, '.local/terminal.json', { synthetic: true, processComplete: true, suiteResultKnown: false })] });
  const result = await gh.executeRegression(f.root, f.policy, pr(), f.target, 'Synthetic retain unknown result', async () => { assert.fail('Migration must not execute the suite'); });
  assert.equal(result.action, 'unchanged'); assert.equal(result.record.status, 'uncertain'); assert.equal(result.record.exitCode, undefined); assert.equal(result.record.productVerdict, 'Not assessed'); assert.equal(s.revision(f.root, ref.path), ref.sha256);
});

test('later legacy observations cannot replace a newer ticket-bound dispatch receipt', async () => {
  const f = fixture(), base = gh.assertRegression(f.root, f.policy, pr(), f.target);
  put(f.root, `.local/github-dispatch/${base}.json`, { key: base, head: pr().head, state: 'dispatched', observation: 'Synthetic OLD receipt' });
  const request = { ticketId: 'QA-001', actor: 'Synthetic observer', source: 'Synthetic observed stop', terminalState: 'stopped' as const, evidence: [put(f.root, '.local/stop.json', { synthetic: true, stopped: true })] };
  gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ...request, nextAction: 'retry', retrySource: 'Synthetic separately authorized new dispatch' });
  let calls = 0; await gh.dispatchRegression(f.root, f.policy, pr(), f.target, async () => { calls++; return 'Synthetic NEW receipt'; });
  for (const terminalState of ['completed', 'stopped'] as const) {
    gh.reconcileLegacy(f.root, f.policy, pr(), f.target, { ...request, terminalState, source: 'Synthetic later observation of the old attempt' });
    const repeated = await gh.dispatchRegression(f.root, f.policy, pr(), f.target, async () => { calls++; return 'Must not send'; });
    assert.equal(repeated.action, 'unchanged'); assert(!('retained' in repeated)); assert(JSON.stringify(repeated).includes('Synthetic NEW receipt')); assert.equal(calls, 1); assert.equal(b.operations(f.root, 'QA-001').length, 1);
  }
});
