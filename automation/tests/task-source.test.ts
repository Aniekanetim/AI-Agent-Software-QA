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

const time = '2026-01-01T00:00:00Z';
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
  live.closeClaim(f.root, { claimId: claim.id, source: 'Synthetic verified disposition', evidence: [f.put('.local/disposition.json', { checked: true })] });
  f.board.tickets[0]!.state = 'qa';
  assert.deepEqual((await live.checkIn(f.root, f.reader)).candidates, []);
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
  const failRetest = async (claimId: string, id: string) => {
    const proposal = { id, claimId, action: 'move' as const, to: 'rework' as const };
    const { publicationDigest } = await live.publicationPreview(f.root, proposal, reader);
    const decision = f.put('.local/' + id + '.json', { claimId, ticketRevision: original.revision, gate: 'G3', decision: 'Approved', reviewer: 'Synthetic QA', source: 'Synthetic disposition', packet, publicationDigest });
    return live.publish(f.root, { ...proposal, decision, source: 'Synthetic reviewed publication' }, reader, async () => async () => {
      state = 'rework';
      return { remoteId: 'task' };
    });
  };
  await failRetest(first.id, 'first-rework');
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
  assert.equal((await failRetest(second.id, 'second-rework')).state, 'confirmed');
});

test('settings keeps the existing numeric close shortcut and offers Task source at 12', () => {
  const f = fixture();
  const shown = menu.openMenu(f.root, 'Synthetic settings request');
  assert.deepEqual(shown.choices.slice(10), [{ id: 'close', label: 'Close settings' }, { id: 'taskSource', label: 'Task source' }]);
  assert.equal(menu.chooseArea(f.root, '11').action, 'closed');
  menu.openMenu(f.root, 'Synthetic settings request');
  assert.equal(menu.chooseArea(f.root, '12').area, 'Task source');
});

test('a newer native update reopens a manually handed off Retest without duplicating the old observation', async () => {
  const f = fixture(), ticket = f.board.tickets[0]!;
  ticket.state = 'retest'; ticket.updatedAt = time;
  await f.select();
  const first = await f.claim();
  live.closeClaim(f.root, { claimId: first.id, source: 'Synthetic manual retest disposition', evidence: [f.put('.local/manual-handoff.json', { state: 'Rework' })] });
  assert.deepEqual((await live.checkIn(f.root, f.reader)).candidates, []);
  ticket.updatedAt = '2026-01-01T00:01:00Z';
  assert.equal((await live.checkIn(f.root, f.reader)).candidates?.[0]?.ticket.id, ticket.id);
  const second = await f.claim();
  assert.notEqual(second.id, first.id);
  live.closeClaim(f.root, { claimId: second.id, source: 'Synthetic second disposition', evidence: [f.put('.local/second-handoff.json', { state: 'Tested-Ok' })] });
  assert.deepEqual((await live.checkIn(f.root, f.reader)).candidates, []);
});
