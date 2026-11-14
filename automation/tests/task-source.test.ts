import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { evidence, contained, digest } from '../shared/store.js';
import { activeSource, type BoardSelection, type LiveChoice } from '../task-source/config.js';
import { prepareWrite, readBoard, type Connection } from '../task-source/provider.js';
import * as live from '../task-source/work.js';
import { upgradeBoard, tickets } from '../board/board.js';
import * as menu from '../settings/menu.js';
import type { DataScope } from '../data/readiness.js';
import { recordAssessment, retainRun } from '../release/round.js';
import { releaseFixture } from './release-fixture.js';
import { regressionFixture } from './regression-fixture.js';

const time = '2026-01-01T00:00:00Z';
const approvedAt = '2026-01-01T00:11:00Z';
const epoch = String(Date.parse(time));
const jira: BoardSelection = { provider: 'jira', site: 'fixture.atlassian.net', jiraEmail: 'qa@example.test', scopeId: '11' };
const clickup: BoardSelection = { provider: 'clickup', scopeId: '11', clickupWorkspaceId: 'workspace' };
const linear: BoardSelection = { provider: 'linear', scopeId: '11', linearProjectId: '22' };
const asana: BoardSelection = { provider: 'asana', scopeId: '11' };
const env = { QA_JIRA_API_TOKEN: 'fixture', QA_CLICKUP_API_TOKEN: 'fixture', QA_LINEAR_API_KEY: 'fixture', QA_ASANA_ACCESS_TOKEN: 'fixture' };
type Transport = (url: URL, init: RequestInit) => unknown;
const mock = (run: Transport): typeof fetch => (async (url, init) => {
  const result = run(new URL(String(url)), init ?? {});
  return result instanceof Response ? result : Response.json(result);
}) as typeof fetch;
function unexpected(url: URL): never { throw new Error(`Unexpected fixture URL ${url.pathname}`); }

test('Jira uses the selected board columns and cursor pages, deduplicating issues', async () => {
  const row = { id: 'task', key: 'QA-1', fields: { summary: 'Test me', description: null, project: { id: '22' }, assignee: { accountId: 'account:11' }, status: { id: 'qa' }, created: time, updated: time } };
  let pages = 0;
  const transport = mock(url => {
    if (url.pathname.endsWith('/myself')) return { accountId: 'account:11', active: true };
    if (url.pathname.endsWith('/board/11/configuration')) return { id: 11, name: 'Sandbox', columnConfig: { columns: [{ name: 'QA', statuses: [{ id: 'qa' }, { id: 'qa-other' }] }] } };
    if (url.pathname === '/rest/software/1.0/board/11/issue') {
      pages++;
      return url.searchParams.get('nextPageToken') ? { issues: [row], isLast: true } : { issues: [row], nextPageToken: 'next' };
    }
    return unexpected(url);
  });
  const observed = await readBoard(jira, transport, env);
  assert.equal(pages, 2);
  assert.deepEqual(observed.states.map(s => s.id), ['qa', 'qa-other']);
  assert.equal(observed.tickets[0]?.url, 'https://fixture.atlassian.net/browse/QA-1');
  assert.equal(observed.tickets.length, 1);
});

test('ClickUp preserves home List identity for a multi-list task and reads later pages', async () => {
  const task = { id: 'task', name: 'A task', status: { status: 'QA', id: 'qa', type: 'custom' }, assignees: [{ id: 7 }], list: { id: 'other' }, date_created: epoch, date_updated: epoch };
  const transport = mock(url => {
    if (url.pathname.endsWith('/user')) return { user: { id: 7 } };
    if (url.pathname.endsWith('/team/workspace/space')) return { spaces: [{ id: 'space' }] };
    if (url.pathname.endsWith('/list/11')) return { id: '11', name: 'QA List', space: { id: 'space' }, statuses: [{ id: 'qa', status: 'QA' }] };
    if (url.pathname.endsWith('/list/11/task')) {
      assert.equal(url.searchParams.get('include_timl'), 'true');
      return url.searchParams.get('page') === '0' ? { tasks: [], last_page: false } : { tasks: [task], last_page: true };
    }
    return unexpected(url);
  });
  const observed = await readBoard(clickup, transport, env);
  assert.deepEqual(observed.tickets[0]?.assignees, ['7']);
  assert.equal(observed.tickets[0]?.state, 'qa');
  await assert.rejects(prepareWrite(clickup, observed.tickets[0]!, { action: 'move', destination: observed.states[0]! }, transport, env), /home List/);
});

test('Linear verifies organization, team and project, and rejects mismatched or partial results', async () => {
  let project = '22';
  const transport = mock((_url, init) => {
    const { query, variables } = JSON.parse(String(init.body));
    if (query.includes('viewer')) return { data: { viewer: { id: 'account' }, organization: { id: 'org' }, team: { id: '11', name: 'Team', archivedAt: null } } };
    if (query.includes('states')) return { data: { team: { states: { nodes: [{ id: 'qa', name: 'QA' }], pageInfo: { hasNextPage: false } } } } };
    if (query.includes('project(id:')) return { data: { project: { id: '22', name: 'Project', archivedAt: null } } };
    assert.equal(variables.filter.project.id.eq, '22');
    const issue = { id: 'task', title: 'Test me', url: 'https://linear.app/example/issue/QA-1', archivedAt: null, team: { id: '11' }, project: { id: project }, assignee: { id: 'account' }, state: { id: 'qa' }, createdAt: time, updatedAt: time };
    return { data: { team: { issues: { nodes: [issue], pageInfo: { hasNextPage: false } } } } };
  });
  assert.equal((await readBoard(linear, transport, env)).tickets.length, 1);
  project = 'outside';
  await assert.rejects(readBoard(linear, transport, env), /different/);
  await assert.rejects(readBoard(linear, mock(() => ({ data: {}, errors: [{ message: 'partial' }] })), env), /could not verify/);
});

test('Asana uses the selected project membership and detects section changes at the same timestamp', async () => {
  let state = 'qa';
  const page = (data: unknown[]) => ({ data, next_page: null });
  const transport = mock(url => {
    if (url.pathname.endsWith('/users/me')) return { data: { gid: 'account' } };
    if (url.pathname.endsWith('/projects/11')) return { data: { gid: '11', name: 'QA Project', workspace: { gid: 'workspace' }, archived: false } };
    if (url.pathname.endsWith('/sections')) return page([{ gid: 'qa', name: 'QA' }, { gid: 'retest', name: 'Retest' }]);
    if (url.pathname.endsWith('/tasks')) return page([{ gid: 'task', name: 'Test me', completed: false, assignee: { gid: 'account' }, created_at: time, modified_at: time, permalink_url: 'https://app.asana.com/0/11/task', memberships: [{ project: { gid: 'outside' }, section: { gid: 'outside' } }, { project: { gid: '11' }, section: { gid: state } }] }]);
    return unexpected(url);
  });
  const before = (await readBoard(asana, transport, env)).tickets[0]!;
  state = 'retest';
  const after = (await readBoard(asana, transport, env)).tickets[0]!;
  assert.equal(before.state, 'qa'); assert.equal(after.state, 'retest'); assert.notEqual(before.revision, after.revision);
});

function fixture() {
  const root = resolve('output/test-fixtures', randomUUID());
  mkdirSync(root, { recursive: true });
  upgradeBoard(root, 'Synthetic folder layout');
  const choice: LiveChoice = { kind: 'live', board: clickup, queues: { ready: ['qa'], retest: ['retest'], testedOk: ['done'], devTodo: ['dev'] }, actions: ['comment', 'move', 'createDefect'] };
  const board: Connection = { identity: { accountId: 'qa-agent', workspaceId: 'workspace', scopeId: '11', scopeName: 'Sandbox' }, states: [{ id: 'qa', name: 'QA' }, { id: 'retest', name: 'Retest' }, { id: 'done', name: 'Done' }, { id: 'dev', name: 'Dev Todo' }], tickets: [{ id: 'task', title: 'Synthetic task', url: 'https://app.clickup.com/t/task', state: 'qa', assignees: ['qa-agent'], closed: false, createdAt: time, priority: 1, revision: digest('snapshot') }] };
  board.descriptions = { task: null };
  const reader = async () => structuredClone(board);
  const put = (path: string, value: unknown) => {
    const file = contained(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
    return evidence(root, path);
  };
  const select = async () => {
    const preview = await live.preview(root, choice, reader);
    return live.configure(root, { choice, previewDigest: preview.digest, source: 'Synthetic selection' }, reader);
  };
  const claim = async () => live.claim(root, { ticketId: 'task', ticketRevision: board.tickets[0]!.revision, source: 'Synthetic intake' }, reader);
  return { root, choice, board, reader, put, select, claim };
}
test('a reviewed G5 handoff uses the saved board route and gates completion after uncertain delivery', async () => {
  const f = fixture();
  await f.select();
  const claim = await f.claim(), pilot = releaseFixture(f.root, claim.ticket.id);
  const scopeInventory = pilot.inventory(claim.sourceKey, 'scope');
  const boardInventory = pilot.inventory(claim.sourceKey, 'handoff');
  await live.bindCurrentReleaseScope(f.root, pilot.scopeRequest(claim.sourceKey, pilot.round, pilot.roundRef, 'initial', [], { boardInventory: scopeInventory }), f.reader);
  const run = pilot.put('run.json', pilot.run('pass', 'Pass'));
  const { assessment } = recordAssessment(f.root, retainRun(f.root, { round: pilot.roundRef, run }));
  const preference = { channel: 'taskBoard', recipient: 'Release owner', acknowledgementRequired: true };
  f.put('.local/reporting-settings.json', { releaseHandoff: preference });
  const comment = { id: 'g5-comment', claimId: claim.id, action: 'comment', purpose: 'releaseHandoff', assessment, boardInventory, body: 'Synthetic reviewed release handoff' } as const;
  const move = { id: 'g5-move', claimId: claim.id, action: 'move', to: 'testedOk', assessment, boardInventory } as const;
  const prepared = await live.publicationPreview(f.root, comment, f.reader);
  const completion = await live.publicationPreview(f.root, move, f.reader);
  assert.equal(prepared.release?.route.destination, claim.ticket.url);
  assert.equal(prepared.release?.route.recipient, preference.recipient);
  const packet = f.put('handoff.json', { note: 'Synthetic release packet' });
  const decision = f.put('.local/g5.json', {
    claimId: claim.id, ticketRevision: claim.ticket.revision, gate: 'G5', decision: 'Approved',
    reviewer: 'Synthetic reviewer', source: 'Synthetic actual decision', packet, target: pilot.target, approvedAt,
    handoff: { assessment, route: prepared.release!.route, targetObservation: pilot.g5Target, boardInventory, regressionDigest: prepared.releaseRegression?.digest },
    publicationDigests: [prepared.publicationDigest, completion.publicationDigest],
  });
  const args = (id: string, reviewed = decision) => ({ decision: reviewed, source: 'Synthetic reviewed publication',
    inventoryRecheck: pilot.recheck(claim.sourceKey, 'publish', id, reviewed) });
  const writer = async () => async () => {
    f.board.tickets[0]!.state = 'done';
    return { remoteId: claim.ticket.id };
  };
  await assert.rejects(live.publish(f.root, { ...move, ...args(move.id) }, f.reader, writer), /Confirm the reviewed G5 board handoff/);
  const wrongGate = f.put('.local/g3-handoff.json', {
    claimId: claim.id, ticketRevision: claim.ticket.revision, gate: 'G3', decision: 'Approved',
    reviewer: 'Synthetic reviewer', source: 'Synthetic G3 decision', packet, publicationDigest: prepared.publicationDigest,
  });
  await assert.rejects(live.publish(f.root, { ...comment, ...args(comment.id, wrongGate) }, f.reader, writer), /G5 approval/);
  assert.throws(() => live.closeClaim(f.root, { claimId: claim.id, source: 'Synthetic close', evidence: [packet], disposition: 'completed' }), /confirmed G5 move/);
  f.put('.local/reporting-settings.json', { releaseHandoff: { ...preference, recipient: 'Other owner' } });
  await assert.rejects(live.publish(f.root, { ...comment, ...args(comment.id) }, f.reader, writer), /exact board publication/);
  f.put('.local/reporting-settings.json', { releaseHandoff: preference });
  let sent = 0;
  const interrupted = async () => async () => { sent++; throw new Error('Synthetic interruption'); };
  await assert.rejects(live.publish(f.root, { ...comment, ...args(comment.id) }, f.reader, interrupted), /uncertain outcome/);
  await assert.rejects(live.publish(f.root, { ...comment, ...args(comment.id) }, f.reader, interrupted), /pending board write/);
  assert.equal(sent, 1);
  const observedComment = await live.reconcileCurrentPublication(f.root, { id: comment.id, state: 'confirmed', remoteId: 'comment-1',
    source: 'Synthetic provider observation', evidence: [packet], inventoryRecheck: pilot.recheck(claim.sourceKey, 'reconcile', comment.id, decision) }, f.reader);
  assert.equal(observedComment.reviewRequired, undefined);
  f.board.tickets[0]!.updatedAt = '2026-01-01T00:05:00Z';
  await assert.rejects(live.publish(f.root, { ...move, ...args(move.id) }, f.reader, writer), /recipient acknowledgement/);
  const newRun = pilot.put('new-run.json', pilot.run('new-pass', 'Pass'));
  const current = recordAssessment(f.root, retainRun(f.root, { round: pilot.roundRef, run: newRun })).assessment;
  const newComment = { ...comment, id: 'g5-comment-current', assessment: current };
  const newMove = { ...move, assessment: current };
  const newPrepared = await live.publicationPreview(f.root, newComment, f.reader);
  const newCompletion = await live.publicationPreview(f.root, newMove, f.reader);
  const newDecision = f.put('.local/g5-current.json', {
    claimId: claim.id, ticketRevision: claim.ticket.revision, gate: 'G5', decision: 'Approved',
    reviewer: 'Synthetic reviewer', source: 'Synthetic review of newly retained evidence', packet, target: pilot.target, approvedAt,
    handoff: { assessment: current, route: newPrepared.release!.route, targetObservation: pilot.g5Target, boardInventory,
      regressionDigest: newPrepared.releaseRegression?.digest },
    publicationDigests: [newPrepared.publicationDigest, newCompletion.publicationDigest],
  });
  await assert.rejects(live.publish(f.root, { ...newMove, ...args(newMove.id, newDecision) }, f.reader, writer), /Confirm the reviewed G5 board handoff/);
  const refreshed = await live.publish(f.root, { ...newComment, ...args(newComment.id, newDecision) }, f.reader, async () => async () => ({ remoteId: 'comment-2' }));
  assert.equal(refreshed.remoteId, 'comment-2');
  const acknowledgement = f.put('ack.json', { state: 'accepted', decisionSha256: newDecision.sha256, recipient: preference.recipient, destination: claim.ticket.url, source: 'Synthetic recipient reply' });
  await assert.rejects(live.publish(f.root, { ...newMove, ...args(newMove.id, newDecision), acknowledgement }, f.reader, async () => async () => {
    await (await writer())();
    throw new Error('Synthetic response interruption after the move');
  }), /uncertain outcome/);
  const confirmation = { id: newMove.id, state: 'confirmed', remoteId: claim.ticket.id, source: 'Synthetic provider observation', evidence: [packet] } as const;
  assert.throws(() => live.reconcilePublication(f.root, { ...confirmation, evidence: [packet] }), /native move observation/);
  const moveObservation = f.put('actual-move.json', { ticketId: claim.ticket.id, destinationId: 'done', publicationId: newMove.id, source: 'Synthetic actual board view' });
  const confirmed = await live.reconcileCurrentPublication(f.root, { ...confirmation, evidence: [packet], moveObservation }, f.reader);
  assert.equal(confirmed.handoff?.kind, 'completion');
  assert.match(confirmed.reviewRequired ?? '', /fresh authoritative inventory recheck/);
  const closure = { claimId: claim.id, source: 'Synthetic G5 closure', evidence: [packet], disposition: 'completed' as const };
  await assert.rejects(live.closeCurrentClaim(f.root, closure, f.reader), /fresh authoritative inventory recheck/);
  const inventoryRecheck = pilot.recheck(claim.sourceKey, 'close', claim.id, newDecision);
  const closed = await live.closeCurrentClaim(f.root, { ...closure, inventoryRecheck }, f.reader);
  assert.equal(closed.terminal?.disposition, 'completed');
  assert(closed.terminal?.evidence.some(ref => ref.sha256 === inventoryRecheck.sha256));
});
test('unset and removed settings cannot bypass a live parent release, including a return through Retest', async () => {
  const f = fixture();
  await f.select();
  const claim = await f.claim();
  const move = { id: 'generic-move', claimId: claim.id, action: 'move', to: 'testedOk' } as const;
  const packet = f.put('release-packet.json', { checked: true });
  await assert.rejects(live.publicationPreview(f.root, move, f.reader), /reviewed release assessment/);
  f.put('.local/reporting-settings.json', { releaseHandoff: { channel: 'taskBoard', recipient: 'Release owner', acknowledgementRequired: false } });
  f.put('.local/reporting-settings.json', {});
  await assert.rejects(live.publicationPreview(f.root, move, f.reader), /reviewed release assessment/);
  assert.throws(() => live.closeClaim(f.root, { claimId: claim.id, source: 'Synthetic premature close', evidence: [packet] }), /confirmed G5 move/);
  live.closeClaim(f.root, { claimId: claim.id, source: 'Synthetic claim release', evidence: [packet], disposition: 'released' });
  f.board.tickets[0]!.state = 'retest';
  const retest = await f.claim();
  const defect = f.put('.local/incorrect-defect-scope.json', { claimId: retest.id, ticketRevision: retest.ticket.revision, gate: 'G4',
    decision: 'Approved', reviewer: 'Synthetic reviewer', source: 'Synthetic scoped review', packet, defectReport: packet });
  await assert.rejects(live.publicationPreview(f.root, { ...move, claimId: retest.id, defect }, f.reader), /parent assignment/);
});

test('a read-only board records actual G5 delivery and native status before closing the release', async () => {
  const f = fixture();
  f.choice.actions = [];
  await f.select();
  const claim = await f.claim(), pilot = releaseFixture(f.root, claim.ticket.id);
  const assignment = { source: claim.sourceKey, ticketId: claim.ticket.id };
  const boardInventory = pilot.inventory(claim.sourceKey, 'handoff');
  await live.bindCurrentReleaseScope(f.root, pilot.scopeRequest(claim.sourceKey, pilot.round, pilot.roundRef, 'initial', [],
    { boardInventory: pilot.inventory(claim.sourceKey, 'scope') }), f.reader);
  const regression = await live.reconcileReleaseBoard(f.root, { ...assignment, boardInventory }, f.reader);
  const run = pilot.put('run.json', pilot.run('pass', 'Pass'));
  const { assessment } = recordAssessment(f.root, retainRun(f.root, { round: pilot.roundRef, run }));
  const route = { channel: 'taskBoard', destination: claim.ticket.url, recipient: 'Release owner', acknowledgementRequired: true };
  const decision = f.put('.local/observed-g5.json', { claimId: claim.id, ticketRevision: claim.ticket.revision, gate: 'G5',
    decision: 'Approved', reviewer: 'Fixture reviewer', source: 'Synthetic G5 decision', packet: pilot.round.scope, target: pilot.target, approvedAt,
    handoff: { route, assessment, targetObservation: pilot.g5Target, boardInventory, regressionDigest: regression.digest } });
  const request = { id: 'observed-move', claimId: claim.id, source: 'Synthetic board observation', decision,
    inventoryRecheck: pilot.recheck(claim.sourceKey, 'observe', 'observed-move', decision) };
  await assert.rejects(live.observeReleaseCompletion(f.root, request, f.reader), /configured Tested-Ok destination/);
  f.board.tickets[0]!.state = 'done';
  assert.throws(() => live.closeClaim(f.root, { ...request, evidence: [pilot.round.scope], disposition: 'completed' }), /confirmed G5 move/);
  await assert.rejects(live.observeReleaseCompletion(f.root, request, f.reader), /handoff delivery/);
  const base = { decisionSha256: decision.sha256, destination: route.destination, recipient: route.recipient, source: 'Synthetic actual record' };
  const delivery = f.put('delivered.json', { ...base, state: 'delivered' });
  await assert.rejects(live.observeReleaseCompletion(f.root, { ...request, delivery }, f.reader), /recipient acknowledgement/);
  const acknowledgement = f.put('accepted.json', { ...base, state: 'accepted' });
  const verified = await live.observeReleaseCompletion(f.root, { ...request, delivery, acknowledgement }, f.reader);
  assert.equal(verified.handoff?.observed, true);
  await assert.rejects(live.closeCurrentClaim(f.root, { ...request, evidence: [pilot.round.scope], disposition: 'completed' }, f.reader), /exact release action/);
  assert.equal((await live.closeCurrentClaim(f.root, { ...request, evidence: [pilot.round.scope], disposition: 'completed',
    inventoryRecheck: pilot.recheck(claim.sourceKey, 'close', claim.id, decision) }, f.reader)).terminal?.disposition, 'completed');
});

test('live G5 reconciles linked children, filtered tickets and later board changes before closure', async () => {
  const f = fixture();
  await f.select();
  const claim = await f.claim(), pilot = releaseFixture(f.root, claim.ticket.id);
  const assignment = { source: claim.sourceKey, ticketId: claim.ticket.id };
  const defect = { ...assignment, ticketId: 'child' };
  const child = { ...claim.ticket, id: defect.ticketId, url: 'https://app.clickup.com/t/child', state: 'retest', revision: digest('child-v1') };
  const fix = regressionFixture(f.root, defect, child.revision, { base: pilot });
  fix.approve(); fix.retain('confirmation');
  const scopeInventory = pilot.inventory(claim.sourceKey, 'scope', [child.id]);
  const scopeRequest = (suffix: string, fixes: unknown[], boardInventory?: typeof scopeInventory) =>
    pilot.scopeRequest(claim.sourceKey, pilot.round, pilot.roundRef, suffix, fixes, { boardInventory });
  await assert.rejects(live.bindCurrentReleaseScope(f.root, scopeRequest('no-inventory', []), f.reader), /authoritative live-board inventory for release scope/);
  const initiallyStandalone = pilot.inventory(claim.sourceKey, 'scope', [], undefined, 'initially-standalone');
  await live.bindCurrentReleaseScope(f.root, scopeRequest('standalone', [], initiallyStandalone), f.reader);
  const newlyLinkedOutsideView = pilot.inventory(claim.sourceKey, 'handoff', [child.id], undefined, 'new-hidden-child');
  await assert.rejects(live.reconcileReleaseBoard(f.root, assignment, f.reader), /authoritative live-board inventory for release handoff/);
  await assert.rejects(live.reconcileReleaseBoard(f.root, { ...assignment, boardInventory: newlyLinkedOutsideView }, f.reader), /inventory changed/);
  f.board.tickets.push(child);
  f.board.descriptions![child.id] = 'Originating QA ticket: ' + claim.ticket.url;
  await assert.rejects(live.bindCurrentReleaseScope(f.root, scopeRequest('omitted', [], scopeInventory), f.reader), /omits a known linked fix for child/);

  const fixes = [{ defect, fixRevision: 'r1' }];
  await live.bindCurrentReleaseScope(f.root, scopeRequest('included', fixes, scopeInventory), f.reader);
  f.board.tickets.pop();
  const handoffInventory = pilot.inventory(claim.sourceKey, 'handoff', [child.id]);
  await assert.rejects(live.reconcileReleaseBoard(f.root, assignment, f.reader), /authoritative live-board inventory for release handoff/);
  await assert.rejects(live.reconcileReleaseBoard(f.root, { ...assignment, boardInventory: scopeInventory }, f.reader), /Refresh the authoritative live-board inventory/);
  await assert.rejects(live.reconcileReleaseBoard(f.root, { ...assignment, boardInventory: handoffInventory }, f.reader), /authoritative ticket readback/);
  const emptyInventory = pilot.inventory(claim.sourceKey, 'handoff', [], undefined, 'empty-handoff');
  await assert.rejects(live.reconcileReleaseBoard(f.root, { ...assignment, boardInventory: emptyInventory }, f.reader), /inventory changed/);
  const raw = f.put('native-child.json', { id: child.id, url: child.url, revision: child.revision, parent: claim.ticket.url });
  const readbackRecord = { assignment, defect, target: pilot.target, linked: true, revision: child.revision,
    source: 'Synthetic native ticket readback', evidence: raw };
  const oldReadback = f.put('old-board-readback.json', { ...readbackRecord, observedAt: '2026-01-01T00:00:00Z' });
  const staleBoardInventory = pilot.inventory(claim.sourceKey, 'handoff', [child.id], [oldReadback], 'old-readback');
  await assert.rejects(live.reconcileReleaseBoard(f.root, { ...assignment, boardInventory: staleBoardInventory }, f.reader), /within the current G5 observation window/);
  const readback = f.put('board-readback.json', { ...readbackRecord, observedAt: '2026-01-01T00:10:00Z' });
  const boardInventory = pilot.inventory(claim.sourceKey, 'handoff', [child.id], [readback], 'filtered');
  const releaseRequest = { ...assignment, boardInventory };
  await assert.rejects(live.reconcileReleaseBoard(f.root, releaseRequest, f.reader), /reviewed confirmation and regression/);
  fix.retain('regression'); fix.review();
  const filtered = await live.reconcileReleaseBoard(f.root, releaseRequest, f.reader);
  assert.equal(filtered.relationships[0]?.readback?.sha256, readback.sha256);

  f.board.tickets.push(child);
  f.board.descriptions![child.id] = null;
  assert.equal((await live.reconcileReleaseBoard(f.root, releaseRequest, f.reader)).digest, filtered.digest);
  f.board.descriptions![child.id] = 'Parent assignment: another-release';
  await assert.rejects(live.reconcileReleaseBoard(f.root, releaseRequest, f.reader), /Refresh the authoritative board readback/);
  f.board.descriptions![child.id] = 'Originating QA ticket: ' + claim.ticket.url;
  const run = pilot.put('parent-run.json', pilot.run('parent-pass', 'Pass'));
  const { assessment } = recordAssessment(f.root, retainRun(f.root, { round: pilot.roundRef, run }));
  const route = { channel: 'recorded', destination: 'Synthetic QA conversation', recipient: 'Release owner', acknowledgementRequired: false };
  const decision = f.put('.local/g5-linked.json', { claimId: claim.id, ticketRevision: claim.ticket.revision, gate: 'G5', decision: 'Approved',
    reviewer: 'Fixture reviewer', source: 'Synthetic G5 decision', packet: pilot.round.scope, target: pilot.target, approvedAt,
    handoff: { route, assessment, targetObservation: pilot.g5Target, boardInventory, regressionDigest: filtered.digest } });
  const delivery = f.put('delivered.json', { state: 'delivered', decisionSha256: decision.sha256, destination: route.destination,
    recipient: route.recipient, source: 'Synthetic delivery observation' });
  const freshReadback = f.put('fresh-board-readback.json', { ...readbackRecord, observedAt: new Date().toISOString() });
  f.board.tickets[0]!.state = 'done';
  await live.observeReleaseCompletion(f.root, { id: 'linked-move', claimId: claim.id, source: 'Synthetic native readback', decision, delivery,
    inventoryRecheck: pilot.recheck(claim.sourceKey, 'observe', 'linked-move', decision, { linkedTicketIds: [child.id], boardReadbacks: [freshReadback] }) }, f.reader);
  child.revision = digest('child-v2');
  await assert.rejects(live.closeCurrentClaim(f.root, { claimId: claim.id, source: 'Synthetic disposition', evidence: [delivery], disposition: 'completed' }, f.reader), /Refresh the authoritative board readback/);
});

test('a new link outside the filtered board blocks publication and closure when the authoritative inventory changes', async () => {
  const f = fixture();
  await f.select();
  const claim = await f.claim(), pilot = releaseFixture(f.root, claim.ticket.id);
  const assignment = { source: claim.sourceKey, ticketId: claim.ticket.id };
  const defect = { ...assignment, ticketId: 'hidden-child' };
  const fix = regressionFixture(f.root, defect, 'hidden-child-v1', { base: pilot });
  fix.approve();
  assert.equal(fix.retain('confirmation').status.state, 'regressionPending');
  await live.bindCurrentReleaseScope(f.root, pilot.scopeRequest(claim.sourceKey, pilot.round, pilot.roundRef, 'initial', [],
    { boardInventory: pilot.inventory(claim.sourceKey, 'scope') }), f.reader);
  const run = pilot.put('run.json', pilot.run('pass', 'Pass'));
  const { assessment } = recordAssessment(f.root, retainRun(f.root, { round: pilot.roundRef, run }));
  const route = { channel: 'recorded', destination: 'Synthetic discussion', recipient: 'Synthetic owner', acknowledgementRequired: false } as const;
  const boardInventory = pilot.inventory(claim.sourceKey, 'handoff');
  const move = { id: 'release-move', claimId: claim.id, action: 'move', to: 'testedOk', assessment, route, boardInventory } as const;
  const prepared = await live.publicationPreview(f.root, move, f.reader);
  const decision = f.put('.local/g5-hidden.json', { claimId: claim.id, ticketRevision: claim.ticket.revision, gate: 'G5',
    decision: 'Approved', reviewer: 'Synthetic reviewer', source: 'Synthetic approval', packet: pilot.round.scope, target: pilot.target, approvedAt,
    publicationDigest: prepared.publicationDigest, handoff: { assessment, route, boardInventory, targetObservation: pilot.g5Target,
      regressionDigest: prepared.releaseRegression?.digest } });
  const delivery = f.put('delivery.json', { decisionSha256: decision.sha256, state: 'delivered', recipient: route.recipient,
    destination: route.destination, source: 'Synthetic delivery' });
  const request = { ...move, decision, delivery, source: 'Synthetic publication' };
  const recheck = (options?: Parameters<typeof pilot.recheck>[4]) => pilot.recheck(claim.sourceKey, 'publish', move.id, decision, options);
  let writes = 0;
  const writer = async () => async () => { writes++; f.board.tickets[0]!.state = 'done'; return { remoteId: claim.ticket.id }; };
  await assert.rejects(live.publish(f.root, request, f.reader, writer), /fresh authoritative inventory recheck/);
  await assert.rejects(live.publish(f.root, { ...request, inventoryRecheck: boardInventory }, f.reader, writer), /exact release action/);
  const expired = recheck({ observedAt: new Date(Date.now() - 6 * 60_000).toISOString() });
  await assert.rejects(live.publish(f.root, { ...request, inventoryRecheck: expired }, f.reader, writer), /within five minutes/);
  const recycled = recheck({ capture: pilot.round.changes });
  await assert.rejects(live.publish(f.root, { ...request, inventoryRecheck: recycled }, f.reader, writer), /newly observed authoritative source/);
  const linkedTicketIds = [defect.ticketId];
  await assert.rejects(live.publish(f.root, { ...request, inventoryRecheck: recheck({ linkedTicketIds }) }, f.reader, writer), /inventory changed/);
  assert.equal(writes, 0);
  const close = { claimId: claim.id, source: 'Synthetic closure', disposition: 'completed' as const, evidence: [delivery] };
  const premature = pilot.recheck(claim.sourceKey, 'close', claim.id, decision);
  const capture = f.put('observed-before-publication.json', { observedAt: new Date().toISOString(), linkedTicketIds: [] });
  assert.equal((await live.publish(f.root, { ...request, inventoryRecheck: recheck({ capture }) }, f.reader, writer)).state, 'confirmed');
  assert.equal(writes, 1);
  await assert.rejects(live.closeCurrentClaim(f.root, { ...close, inventoryRecheck: premature }, f.reader), /preceding release action/);
  const reusedCapture = pilot.recheck(claim.sourceKey, 'close', claim.id, decision, { capture });
  await assert.rejects(live.closeCurrentClaim(f.root, { ...close, inventoryRecheck: reusedCapture }, f.reader), /newly observed authoritative source/);
  const laterChange = pilot.recheck(claim.sourceKey, 'close', claim.id, decision, { linkedTicketIds });
  await assert.rejects(live.closeCurrentClaim(f.root, { ...close, inventoryRecheck: laterChange }, f.reader), /inventory changed/);
  const unchanged = pilot.recheck(claim.sourceKey, 'close', claim.id, decision);
  assert.equal((await live.closeCurrentClaim(f.root, { ...close, inventoryRecheck: unchanged }, f.reader)).terminal?.disposition, 'completed');
});

test('a live fix uses two batches under one G4, then closes only with reviewed regression evidence', async () => {
  const f = fixture();
  f.board.tickets[0]!.state = 'retest';
  await f.select();
  const claim = await f.claim();
  const fix = regressionFixture(f.root, { source: claim.sourceKey, ticketId: claim.ticket.id }, claim.ticket.revision, { claimId: claim.id });
  fix.approve();
  const packet = fix.defectReport;
  const review = { claimId: claim.id, ticketRevision: claim.ticket.revision, decision: 'Approved',
    reviewer: 'Fixture reviewer', source: 'Synthetic scoped decision', packet };
  const g1 = f.put('.local/fix-g1.json', { ...review, gate: 'G1' });
  const g2 = f.put('.local/fix-g2.json', { ...review, gate: 'G2', target: fix.base.target });
  const target = f.put('.local/fix-target.json', { claimId: claim.id, ticketRevision: claim.ticket.revision, ...fix.base.target,
    source: 'Synthetic actual target', observedAt: '2026-01-01T00:00:00Z' });
  const defect = fix.g4;
  const request = { claimId: claim.id, gates: { G1: g1, G2: g2, G4: defect }, target, buildId: fix.base.target.buildId };
  const regression = { ...request, id: 'run-regression', fixBatch: { fix: fix.key, batchId: 'regression' } };
  await assert.rejects(live.beginExecution(f.root, regression, f.reader), /Complete confirmation/);
  const confirmation = { ...request, id: 'run-confirmation', fixBatch: { fix: fix.key, batchId: 'confirmation' } };
  assert.equal((await live.beginExecution(f.root, confirmation, f.reader)).fixBatch?.phase, 'confirmation');
  live.settleExecution(f.root, { id: confirmation.id, state: 'completed', source: 'Fixture completion', evidence: [packet] });
  await assert.rejects(live.beginExecution(f.root, { ...confirmation, id: 'duplicate-confirmation' }, f.reader), /already ran/);
  fix.retain('confirmation');
  assert.equal((await live.checkIn(f.root, f.reader)).resume?.[0]?.fixVerification?.[0]?.state, 'regressionPending');
  assert.throws(() => live.closeClaim(f.root, { claimId: claim.id, source: 'Synthetic premature close', evidence: [packet], defect }), /confirmed G5 move/);
  const move = { id: 'scoped-defect-move', claimId: claim.id, action: 'move', to: 'testedOk', defect, completion: { fix: fix.key } } as const;
  await assert.rejects(live.publicationPreview(f.root, move, f.reader), /every required regression check/);
  assert.equal((await live.beginExecution(f.root, regression, f.reader)).fixBatch?.phase, 'regression');
  await assert.rejects(live.beginExecution(f.root, { ...regression, id: 'duplicate-regression' }, f.reader), /execution outcome|execution already|pending write/);
  live.settleExecution(f.root, { id: regression.id, state: 'completed', source: 'Fixture completion', evidence: [packet] });
  fix.retain('regression');
  await assert.rejects(live.publicationPreview(f.root, { ...move, requireCases: true }, f.reader), /case batches/);
  const preview = await live.publicationPreview(f.root, move, f.reader);
  assert.equal(preview.release, undefined);
  const fixReview = fix.review();
  const decision = f.put('.local/defect-g5.json', { ...review, gate: 'G5', publicationDigest: preview.publicationDigest, fixReview });
  await assert.rejects(live.publish(f.root, { ...move, decision, source: 'Synthetic scoped publication' }, f.reader, async () => async () => {
    f.board.tickets[0]!.state = 'done';
    throw new Error('Synthetic interrupted response after native move');
  }), /uncertain outcome/);
  const confirmationOfMove = { id: move.id, state: 'confirmed' as const, remoteId: claim.ticket.id,
    source: 'Synthetic observed native move', evidence: [packet] };
  assert.throws(() => live.reconcilePublication(f.root, confirmationOfMove), /native move observation/);
  const moveObservation = f.put('fix-move.json', { ticketId: claim.ticket.id, destinationId: 'done',
    publicationId: move.id, source: 'Synthetic native board readback' });
  const recovered = live.reconcilePublication(f.root, { ...confirmationOfMove, moveObservation, requireCases: true });
  assert.match(recovered.reviewRequired ?? '', /case batches/);
  assert.throws(() => live.closeClaim(f.root, { claimId: claim.id, source: 'Synthetic scoped closure',
    evidence: [packet], disposition: 'completed', defect, requireCases: true }), /case batches/);
  const requestClose = { claimId: claim.id, source: 'Synthetic scoped closure', evidence: [packet], disposition: 'completed' as const, defect };
  f.board.tickets[0]!.state = 'retest';
  await assert.rejects(live.closeCurrentClaim(f.root, requestClose, f.reader), /current ticket.*Tested-Ok/);
  assert.equal(live.claimHistory(f.root, claim.id).claim.state, 'open');
  f.board.tickets[0]!.state = 'done';
  const closed = await live.closeCurrentClaim(f.root, requestClose, f.reader);
  assert.equal(closed.terminal?.disposition, 'completed');
});
test('Preview leaves the old source active; save binds the reviewed account and never falls back', async () => {
  const f = fixture(), preview = await live.preview(f.root, f.choice, f.reader);
  assert.equal(preview.candidates[0]?.eligible, true);
  assert.equal(activeSource(f.root).revision, null);
  f.board.identity.accountId = 'different';
  await assert.rejects(live.configure(f.root, { choice: f.choice, previewDigest: preview.digest, source: 'Synthetic selection' }, f.reader), /changed/);
  assert.equal(activeSource(f.root).value.choice.kind, 'local');
  await f.select();
  assert.throws(() => tickets(f.root), /live board/);
  await assert.rejects(live.checkIn(f.root, async () => { throw new Error('expired'); }), error => {
    assert(error instanceof live.LiveCheckInError);
    assert.equal(error.message, 'expired');
    assert.equal(error.guidance.reasonCode, 'sourceUnavailable');
    assert(!('candidates' in error.guidance));
    return true;
  });
  f.board.identity.accountId = 'qa-agent';
  await assert.rejects(live.checkIn(f.root, f.reader), /changed/);
});
test('Claims are exclusive and status, assignment and pending work control continuation', async () => {
  const f = fixture(); await f.select();
  const result = await Promise.allSettled([f.claim(), f.claim()]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  const claim = result.find(r => r.status === 'fulfilled')!.value;
  const resume = async () => (await live.checkIn(f.root, f.reader)).resume?.[0];
  assert.equal((await resume())?.eligible, true);
  assert.equal((await resume())?.reasonCode, 'eligible');
  const fallback = await live.preview(f.root, { kind: 'local' }, f.reader);
  await assert.rejects(live.configure(f.root, { choice: { kind: 'local' }, previewDigest: fallback.digest, source: 'Synthetic switch' }, f.reader), /active live claims/);
  const ticket = f.board.tickets[0]!;
  ticket.assignees = ['another'];
  assert.equal((await resume())?.reasonCode, 'ownerChanged');
  assert.equal((await resume())?.eligible, false);
  assert.match((await resume())?.nextAction ?? '', /current assignment/);
  await assert.rejects(live.recheck(f.root, claim.id, f.reader), /changed/);
  ticket.assignees = ['qa-agent'];
  ticket.revision = digest('new ticket revision');
  assert.equal((await resume())?.reasonCode, 'revisionChanged');
  assert.match((await resume())?.nextAction ?? '', /Refresh the native ticket evidence/);
  await assert.rejects(live.recheck(f.root, claim.id, f.reader), /changed/);
  ticket.revision = claim.ticket.revision;
  ticket.state = 'done';
  assert.equal((await resume())?.reasonCode, 'outsideQaQueue');
  await assert.rejects(live.recheck(f.root, claim.id, f.reader), /changed/);
  ticket.closed = true;
  assert.equal((await resume())?.reasonCode, 'ticketClosed');
  ticket.closed = false;
  f.board.tickets = [];
  assert.equal((await resume())?.reasonCode, 'ticketMissing');
  f.board.tickets = [ticket];
  live.closeClaim(f.root, { claimId: claim.id, source: 'Synthetic verified disposition', evidence: [f.put('.local/disposition.json', { checked: true })], disposition: 'released' });
  f.board.tickets[0]!.state = 'qa';
  assert.equal((await live.checkIn(f.root, f.reader)).candidates?.[0]?.ticket.id, claim.ticket.id);
});

test('live execution holds a required data dependency before reservation and records an approved independent run', async () => {
  const f = fixture(); await f.select(); const claim = await f.claim();
  const packet = f.put('.local/packet.json', { scope: 'Synthetic gate packet' });
  const observed = { claimId: claim.id, ticketRevision: claim.ticket.revision, buildId: 'B-1', environment: 'staging', source: 'Synthetic target', observedAt: time };
  const target = f.put('.local/target.json', observed);
  const plan = f.put('.local/plan.json', {
    schemaVersion: 1, id: 'fixture-plan', revision: '1', task: packet, environment: observed.environment, build: observed.buildId,
    items: [{ id: 'DATA-1', conditionIds: ['COND-1'], requiredState: 'Confirmed settlement', kind: 'externalState', approach: 'supplied', classification: 'synthetic',
      basis: [packet], authorization: [packet], identity: { mode: 'none', originalReference: null },
      controls: { isolation: 'fixture', concurrency: 'exclusive', retention: 'retain evidence', cleanup: 'none' },
      preparation: { status: 'blocked', method: 'Approved fixture', dataReference: null, generationRules: null, evidence: [] },
      stateVerification: { status: 'notVerified', dataReference: null, environment: null, build: null, evidence: [] },
      blocker: { reason: 'Settlement unavailable', attempts: 'Checked sandbox', needed: 'Supply confirmed settlement', owner: 'Fixture owner', questionReference: 'Q1' } }],
  });
  const decisions = (dataScope: DataScope) => {
    const decision = { claimId: claim.id, ticketRevision: claim.ticket.revision, decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic response', packet };
    return { G1: f.put('.local/g1.json', { ...decision, gate: 'G1' }), G2: f.put('.local/g2.json', { ...decision, gate: 'G2', target: observed, dataScope }) };
  };
  const blocked = decisions({ schemaVersion: 1, mode: 'required', plan, checks: [{ id: 'SETTLEMENT', conditionIds: ['COND-1'], dataItemIds: ['DATA-1'] }] });
  const request = { id: 'run', claimId: claim.id, target, buildId: observed.buildId };
  await assert.rejects(live.beginExecution(f.root, { ...request, gates: blocked }, f.reader), /SETTLEMENT.*Supply confirmed settlement/);
  assert.equal(live.claimHistory(f.root, claim.id).executions.length, 0);
  const independent = decisions({ schemaVersion: 1, mode: 'none', checks: [{ id: 'INPUT-VALIDATION', conditionIds: ['COND-2'], dataItemIds: [] }] });
  const run = await live.beginExecution(f.root, { ...request, gates: independent }, f.reader);
  assert.equal(run.data?.checks[0]?.id, 'INPUT-VALIDATION');
  assert.deepEqual(live.claimHistory(f.root, claim.id).executions[0]?.data, run.data);
});

test('a managed live retest requires matching G2 and G4 data decisions', async () => {
  const f = fixture();
  f.board.tickets[0]!.state = 'retest';
  await f.select(); const claim = await f.claim();
  const packet = f.put('.local/packet.json', { scope: 'Synthetic retest' });
  const observed = { claimId: claim.id, ticketRevision: claim.ticket.revision, buildId: 'B-1', environment: 'staging', source: 'Synthetic target', observedAt: time };
  const target = f.put('.local/target.json', observed);
  const dataScope: DataScope = { schemaVersion: 1, mode: 'none', checks: [{ id: 'RETEST', conditionIds: ['COND-1'], dataItemIds: [] }] };
  const decision = (gate: live.Gate['gate'], scope?: DataScope) => f.put(`.local/${gate}.json`, {
    claimId: claim.id, ticketRevision: claim.ticket.revision, decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic response', packet,
    gate, target: observed, dataScope: scope,
  });
  const gates = { G1: decision('G1'), G2: decision('G2', dataScope), G4: decision('G4') };
  const request = { id: 'run', claimId: claim.id, target, buildId: observed.buildId, gates };
  await assert.rejects(live.beginExecution(f.root, request, f.reader), /must agree/);
  assert.equal(live.claimHistory(f.root, claim.id).executions.length, 0);
  gates.G4 = decision('G4', dataScope);
  assert.equal((await live.beginExecution(f.root, request, f.reader)).data?.mode, 'none');
});

test('Execution and publication bind actual review evidence, and uncertain publication cannot be repeated', async () => {
  const f = fixture(); await f.select(); const claim = await f.claim();
  const packet = f.put('.local/packet.json', { scope: 'Synthetic gate packet' });
  const decision = (gate: live.Gate['gate'], extra: Partial<live.Gate> = {}) => f.put(`.local/${gate}.json`, { claimId: claim.id, ticketRevision: claim.ticket.revision, gate, decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic response', packet, ...extra });
  const gates = { G1: decision('G1'), G2: decision('G2', { target: { buildId: 'B-1', environment: 'staging' } }) };
  const target = f.put('.local/target.json', { claimId: claim.id, ticketRevision: claim.ticket.revision, buildId: 'B-1', environment: 'staging', source: 'Synthetic build observation', observedAt: time });
  await assert.rejects(live.beginExecution(f.root, { id: 'run', claimId: claim.id, gates, target, buildId: 'B-2' }, f.reader), /actual target/);
  await live.beginExecution(f.root, { id: 'run', claimId: claim.id, gates, target, buildId: 'B-1' }, f.reader);
  const running = (await live.checkIn(f.root, f.reader)).resume?.[0];
  assert.equal(running?.eligible, false);
  assert.equal(running?.reasonCode, 'executionUnresolved');
  assert.equal(running?.relatedId, 'run');
  assert.equal((await live.recheck(f.root, claim.id, f.reader)).claim.id, claim.id);
  await assert.rejects(live.beginExecution(f.root, { id: 'another-run', claimId: claim.id, gates, target, buildId: 'B-1' }, f.reader), /execution already/);
  live.settleExecution(f.root, { id: 'run', state: 'completed', source: 'Synthetic completion', evidence: [packet] });
  await assert.rejects(live.beginExecution(f.root, { id: 'another-run', claimId: claim.id, gates, target, buildId: 'B-1' }, f.reader), /already ran/);
  const action = { id: 'post', claimId: claim.id, action: 'comment' as const, body: 'Synthetic reviewed results.' };
  const proposal = await live.publicationPreview(f.root, action, f.reader);
  const request = { ...action, source: 'Synthetic authorization', decision: decision('G3', { publicationDigest: proposal.publicationDigest }) };
  let calls = 0;
  const writer = async () => async () => { calls++; throw new Error('Synthetic timeout'); };
  await assert.rejects(live.publish(f.root, { ...request, body: 'Altered' }, f.reader, writer), /exact board publication/);
  await assert.rejects(live.publish(f.root, request, f.reader, writer), /uncertain/);
  const pending = (await live.checkIn(f.root, f.reader)).resume?.[0];
  assert.equal(pending?.eligible, false);
  assert.equal(pending?.reasonCode, 'pendingPublication');
  assert.equal(pending?.relatedId, 'post');
  await assert.rejects(live.publish(f.root, request, f.reader, writer), /pending board write/);
  assert.equal(calls, 1);
  assert.equal(live.claimHistory(f.root, claim.id).publications[0]?.state, 'pending');
  live.reconcilePublication(f.root, { id: 'post', state: 'confirmed', remoteId: 'comment', source: 'Synthetic observation', evidence: [packet] });
  await assert.rejects(live.publish(f.root, { ...request, id: 'post-again' }, f.reader, writer), /already recorded/);
  assert.equal(calls, 1);
});

test('Malformed optional task-source state keeps settings navigation available', () => {
  const f = fixture();
  writeFileSync(absolutePrivate(f.root), '{broken');
  menu.openMenu(f.root, 'Synthetic settings request');
  assert.match(String(menu.chooseArea(f.root, 'taskSource').current[0]?.value), /reconciliation/);
  assert.equal(menu.cancelEdit(f.root, true).action, 'chooseArea');
  assert.equal(menu.chooseArea(f.root, 'browser').action, 'editArea');
});
function absolutePrivate(root: string) {
  const file = contained(root, '.local/task-source.json');
  mkdirSync(dirname(file), { recursive: true });
  return file;
}


test('Provider write adapters translate a reviewed comment into the native API request', async () => {
  const urls = ['/rest/api/3/issue/task/comment', '/api/v2/task/task/comment', '/graphql', '/api/1.0/tasks/task/stories'];
  for (const [index, selection] of [jira, clickup, linear, asana].entries()) {
    const f = fixture();
    let calls = 0;
    const transport = mock((url, init) => {
      calls++;
      assert.equal(url.pathname, urls[index]);
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      const payload = JSON.parse(String(init.body));
      if (selection.provider === 'jira') { assert.equal(payload.body.content[0].content[0].text, 'QA result'); return { id: 'comment' }; }
      if (selection.provider === 'clickup') { assert.deepEqual(payload, { comment_text: 'QA result', notify_all: false }); return { id: 'comment' }; }
      if (selection.provider === 'linear') {
        assert.deepEqual(payload.variables.input, { issueId: 'task', body: 'QA result' });
        return { data: { commentCreate: { success: true, comment: { id: 'comment' } } } };
      }
      assert.deepEqual(payload, { data: { text: 'QA result' } });
      return { data: { gid: 'comment' } };
    });
    const write = await prepareWrite(selection, f.board.tickets[0]!, { action: 'comment', body: 'QA result' }, transport, env);
    assert.equal(calls, 0);
    assert.deepEqual(await write(), { remoteId: 'comment' });
    assert.equal(calls, 1);
  }
});

test('A live source switch preserves claimed local work and in-flight reminders', async () => {
  const f = fixture();
  const path = 'QA task management Board/Ready for QA/QA-001.md';
  writeFileSync(contained(f.root, path), '# QA-001: Synthetic task\n\n| Owner / claimed at | Local agent |\n');
  await assert.rejects(f.select(), /claimed local tickets/);
  writeFileSync(contained(f.root, path), '# QA-001: Synthetic task\n\n| Owner / claimed at | Unassigned |\n');
  f.put('.local/attention/delivery-state.json', { schemaVersion: 1, deliveries: [{ id: 'original', state: 'presenting', members: [] }], controls: [] });
  await assert.rejects(f.select(), /local blocker reminder/);
  assert.equal(activeSource(f.root).value.choice.kind, 'local');
});


test('ClickUp resolves a home-List status when the catalogue omits native status IDs', async () => {
  const task = { id: 'one', name: 'QA task', status: { status: 'QA', id: 'qa', type: 'custom' }, assignees: [], list: { id: '11' }, date_created: epoch, date_updated: epoch };
  const transport = mock(url => {
    if (url.pathname.endsWith('/user')) return { user: { id: 7 } };
    if (url.pathname.endsWith('/team/workspace/space')) return { spaces: [{ id: 'space' }] };
    if (url.pathname.endsWith('/list/11')) return { id: '11', name: 'QA List', space: { id: 'space' }, statuses: [{ status: 'QA', orderindex: 0, type: 'open' }] };
    if (url.pathname.endsWith('/list/11/task')) return { tasks: [task, { ...task, id: 'two', list: { id: 'other' } }], last_page: true };
    return unexpected(url);
  });
  const observed = await readBoard(clickup, transport, env);
  assert.deepEqual(observed.states[0], { name: 'QA', id: 'name-' + digest('QA') });
  assert.equal(observed.tickets[0]?.state, observed.states[0]?.id);
  assert.equal(observed.tickets[1]?.state, null);
});


test('Scoped Jira tokens go only to the verified Cloud ID gateway', async () => {
  const board = { ...jira, jiraCloudId: 'tenant' };
  let tenant = 'tenant', gatewayCalls = 0;
  const transport = mock((url, init) => {
    const headers = new Headers(init.headers);
    if (url.hostname === 'fixture.atlassian.net') {
      assert.equal(url.pathname, '/_edge/tenant_info');
      assert.equal(headers.has('authorization'), false);
      return { cloudId: tenant };
    }
    gatewayCalls++;
    assert.equal(url.hostname, 'api.atlassian.com');
    assert.match(url.pathname, /^\/ex\/jira\/tenant\//);
    assert.match(headers.get('authorization') ?? '', /^Basic /);
    if (url.pathname.endsWith('/myself')) return { accountId: 'qa', active: true };
    if (url.pathname.endsWith('/configuration')) return { id: 11, name: 'QA', columnConfig: { columns: [] } };
    if (url.pathname.endsWith('/issue')) return { issues: [], isLast: true };
    return unexpected(url);
  });
  assert.equal((await readBoard(board, transport, env)).identity.workspaceId, 'fixture.atlassian.net');
  assert.equal(gatewayCalls, 3);
  tenant = 'different';
  await assert.rejects(readBoard(board, transport, env), /different/);
  assert.equal(gatewayCalls, 3);
});

test('Linear accepts an OAuth access token using the documented Bearer header', async () => {
  const transport = mock((_url, init) => {
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer fixture-oauth');
    return Response.json({ errors: [{ message: 'Synthetic denied permission' }] });
  });
  await assert.rejects(readBoard({ ...linear, linearAuth: 'oauth' }, transport, { QA_LINEAR_ACCESS_TOKEN: 'fixture-oauth' }), /could not verify/);
});

test('a returned Retest ticket gets a new claim and can move to Rework again', async () => {
  const f = fixture();
  f.choice.queues.rework = ['rework'];
  const states = [...f.board.states, { id: 'rework', name: 'Rework' }];
  let state = 'retest', updated = Date.parse(time);
  const transport = mock(url => {
    if (url.pathname.endsWith('/user')) return { user: { id: 'qa-agent' } };
    if (url.pathname.endsWith('/team/workspace/space')) return { spaces: [{ id: 'space' }] };
    if (url.pathname.endsWith('/list/11')) return { id: '11', name: 'Sandbox', space: { id: 'space' }, statuses: states.map(s => ({ id: s.id, status: s.name })) };
    if (url.pathname.endsWith('/list/11/task')) return { last_page: true, tasks: [{
      id: 'task', name: 'Synthetic defect', description: 'Original reproduction',
      status: { id: state, status: state, type: 'custom' }, assignees: [{ id: 'qa-agent' }],
      list: { id: '11' }, date_created: epoch, date_updated: String(updated),
    }] };
    return unexpected(url);
  });
  const reader = (selection: BoardSelection) => readBoard(selection, transport, env);
  const preview = await live.preview(f.root, f.choice, reader);
  await live.configure(f.root, { choice: f.choice, previewDigest: preview.digest, source: 'Synthetic selection' }, reader);
  const original = (await reader(clickup)).tickets[0]!;
  const pickup = () => live.claim(f.root, { ticketId: 'task', ticketRevision: original.revision, source: 'Synthetic retest intake' }, reader);
  const packet = f.put('.local/retest-packet.json', { outcome: 'Synthetic failed retest' });

  const first = await pickup();
  updated += 1000;
  assert.equal((await live.recheck(f.root, first.id, reader)).claim.id, first.id);
  const assignment = { source: first.sourceKey, ticketId: original.id }, base = releaseFixture(f.root, original.id);
  const rework = (claimId: string, id: string) => ({ id, claimId, action: 'move' as const, to: 'rework' as const });
  await assert.rejects(live.publicationPreview(f.root, rework(first.id, 'no-failure'), reader), /recorded confirmation failure/);
  const passing = regressionFixture(f.root, assignment, original.revision, { base, claimId: first.id });
  passing.approve(); passing.retain('confirmation');
  await assert.rejects(live.publicationPreview(f.root, { ...rework(first.id, 'pass-pending'), failedFix: passing.key }, reader), /recorded failure of the original confirmation/);
  const failRetest = async (claimId: string, id: string, supersedes: string) => {
    const fix = regressionFixture(f.root, assignment, original.revision, { base, claimId, fixRevision: id, supersedes });
    fix.approve(); fix.retain('confirmation', 'Fail');
    const proposal = { ...rework(claimId, id), failedFix: fix.key };
    const { publicationDigest, failed } = await live.publicationPreview(f.root, proposal, reader);
    const decision = f.put('.local/' + id + '.json', { claimId, assignment, target: base.target, ticketRevision: original.revision, gate: 'G3',
      decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic disposition', packet, publicationDigest,
      rework: { fix: fix.key, assessmentDigest: failed?.assessmentDigest } });
    const publication = await live.publish(f.root, { ...proposal, decision, source: 'Synthetic reviewed publication' }, reader, async () => async () => {
      state = 'rework';
      return { remoteId: 'task' };
    });
    return { publication, fix };
  };
  const returned = await failRetest(first.id, 'first-rework', passing.key);
  state = 'retest';
  await assert.rejects(live.recheck(f.root, first.id, reader), /handoff already completed/);
  const handedOff = await live.checkIn(f.root, reader);
  assert.deepEqual(handedOff.candidates, []);
  assert.equal(handedOff.resume?.[0]?.reasonCode, 'handoffCompleted');
  assert.equal(handedOff.resume?.[0]?.relatedId, 'first-rework');
  live.closeClaim(f.root, { claimId: first.id, source: 'Synthetic handoff completed', evidence: [packet] });

  const queue = await live.checkIn(f.root, reader);
  assert.equal(queue.candidates?.[0]?.ticket.revision, original.revision);
  const second = await pickup();
  assert.notEqual(second.id, first.id);
  await assert.rejects(pickup(), /already exists/);
  assert.equal((await failRetest(second.id, 'second-rework', returned.fix.key)).publication.state, 'confirmed');
});

test('settings keeps the existing numeric close shortcut and offers Task source at 12', () => {
  const f = fixture();
  const shown = menu.openMenu(f.root, 'Synthetic settings request');
  assert.deepEqual(shown.choices.slice(10), [
    { id: 'close', label: 'Close settings' }, { id: 'taskSource', label: 'Task source' }, { id: 'testData', label: 'Test data and datasets' },
  ]);
  assert.equal(menu.chooseArea(f.root, '11').action, 'closed');
  menu.openMenu(f.root, 'Synthetic settings request');
  assert.equal(menu.chooseArea(f.root, '12').area, 'Task source');
});

test('a manually handed-off native Retest stays resumable and cannot be marked verified by generic closure', async () => {
  const f = fixture(), ticket = f.board.tickets[0]!;
  ticket.state = 'retest'; ticket.updatedAt = time;
  await f.select();
  const first = await f.claim();
  const packet = f.put('.local/manual-handoff.json', { state: 'Rework' });
  const reviewedDefect = (claimId: string) => f.put(`.local/${claimId}-g4.json`, { claimId, ticketRevision: ticket.revision, gate: 'G4',
    decision: 'Approved', reviewer: 'Synthetic reviewer', source: 'Synthetic scope', packet, defectReport: packet });
  const attempt = { claimId: first.id, source: 'Synthetic manual retest disposition', evidence: [packet], defect: reviewedDefect(first.id) };
  assert.throws(() => live.closeClaim(f.root, attempt), /confirmed G5 move/);
  ticket.state = 'rework';
  live.closeClaim(f.root, { ...attempt, disposition: 'released' });
  assert.deepEqual((await live.checkIn(f.root, f.reader)).candidates, []);
  ticket.state = 'retest';
  ticket.updatedAt = '2026-01-01T00:01:00Z';
  assert.equal((await live.checkIn(f.root, f.reader)).candidates?.[0]?.ticket.id, ticket.id);
  const second = await f.claim();
  assert.notEqual(second.id, first.id);
  assert.throws(() => live.closeClaim(f.root, { claimId: second.id, source: 'Synthetic second disposition',
    evidence: [f.put('.local/second-handoff.json', { state: 'Tested-Ok' })], defect: reviewedDefect(second.id), disposition: 'completed' }), /confirmation and regression evidence/);
  assert.equal((await live.checkIn(f.root, f.reader)).resume?.[0]?.claim.id, second.id);
});

test('connected execution refuses a data decision for a different case and rechecks the queue at runner admission', async () => {
  const f = fixture(); await f.select(); const claim = await f.claim();
  const base = releaseFixture(f.root, claim.ticket.id);
  const assignment = { source: claim.sourceKey, ticketId: claim.ticket.id };
  const packet = base.round.scope, definition = base.library.checks[0]!.definition;
  const understanding = f.put('.local/understanding.json', { schemaVersion: 1, assignment,
    sources: [{ id: 'rule', authority: 'Fixture', accepted: packet, current: packet }],
    flows: [{ id: 'flow', featureId: 'fixture', actor: 'QA', startingState: 'Ready', expectedFlow: 'Run one case', criteria: ['rule'], relationshipIds: [] }],
  });
  const inputDigest = digest('fixture case inputs');
  const batch = f.put('.local/case-batch.json', { schemaVersion: 1, assignment, understanding, target: base.target,
    cases: [{ id: 'case', flowId: 'flow', checkId: 'shared', conditionId: 'route', definition, criteria: ['rule'], dependsOn: [],
      checkpoints: [{ id: 'precondition', action: 'Observe state', expected: 'Ready' },
        { id: 'result', action: 'Run case', expected: 'Expected state', runner: { kind: 'postman', inputDigest } }] }],
  });
  const basis = { assignment, claimId: claim.id, ticketRevision: claim.ticket.revision, decision: 'Approved', reviewer: 'Fixture QA',
    source: 'Fixture reply', packet, understanding };
  const G1 = f.put('.local/scope.json', { ...basis, gate: 'G1' });
  const design = (id: string, checkId: string) => f.put(`.local/${id}.json`, { ...basis, gate: 'G2', target: base.target, caseBatch: batch, scopeReview: G1,
    dataScope: { schemaVersion: 1, mode: 'none', checks: [{ id: checkId, conditionIds: ['route'], dataItemIds: [] }] } });
  const target = f.put('.local/case-target.json', { ...base.target, claimId: claim.id, ticketRevision: claim.ticket.revision, source: 'Fixture build', observedAt: time });
  const request = { id: 'execution', claimId: claim.id, buildId: base.target.buildId, target, requireCaseBatch: true };
  await assert.rejects(live.beginExecution(f.root, { ...request, gates: { G1, G2: design('wrong', 'unrelated') } }, f.reader), /case case.*shared.route/);
  await live.beginExecution(f.root, { ...request, gates: { G1, G2: design('actual', 'shared') } }, f.reader);
  const next = { id: request.id, caseId: 'case', target };
  const { claimCaseCheckpoint, observeCheckpoint } = await import('../execution/cases.js');
  assert.equal((await live.prepareLiveCase(f.root, next, f.reader)).state, 'ready');
  observeCheckpoint(f.root, { ...next, checkpoint: 'precondition', outcome: 'matched', source: 'Fixture', evidence: [packet] });
  assert.equal((await live.prepareLiveCase(f.root, next, f.reader)).state, 'ready');
  f.board.tickets[0]!.state = 'retest';
  let calls = 0;
  const fresh = await live.readConnectedCase(f.root, request.id, f.reader);
  assert.throws(() => claimCaseCheckpoint(f.root, { ...next, checkpoint: 'result' }, [definition], base.target,
    { kind: 'postman', id: 'should-not-run', inputDigest }, fresh, () => ++calls), /connected assignment/);
  assert.equal(calls, 0);
});
