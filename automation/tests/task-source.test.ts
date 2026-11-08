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
    if (query.includes('viewer')) return { data: { viewer: { id: 'account' }, organization: { id: 'org' }, team: { id: '11', name: 'Team' } } };
    if (query.includes('states')) return { data: { team: { states: { nodes: [{ id: 'qa', name: 'QA' }], pageInfo: { hasNextPage: false } } } } };
    if (query.includes('project(id:')) return { data: { project: { id: '22', name: 'Project' } } };
    assert.equal(variables.filter.project.id.eq, '22');
    const issue = { id: 'task', title: 'Test me', url: 'https://linear.app/example/issue/QA-1', archivedAt: null, project: { id: project }, assignee: { id: 'account' }, state: { id: 'qa' }, createdAt: time, updatedAt: time };
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
  await assert.rejects(live.checkIn(f.root, async () => { throw new Error('expired'); }), /expired/);
  f.board.identity.accountId = 'qa-agent';
  await assert.rejects(live.checkIn(f.root, f.reader), /changed/);
});
test('Claims are exclusive and status, assignment and pending work control continuation', async () => {
  const f = fixture(); await f.select();
  const result = await Promise.allSettled([f.claim(), f.claim()]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  const claim = result.find(r => r.status === 'fulfilled')!.value;
  const fallback = await live.preview(f.root, { kind: 'local' }, f.reader);
  await assert.rejects(live.configure(f.root, { choice: { kind: 'local' }, previewDigest: fallback.digest, source: 'Synthetic switch' }, f.reader), /active live claims/);
  f.board.tickets[0]!.assignees = ['another'];
  await assert.rejects(live.recheck(f.root, claim.id, f.reader), /changed/);
  f.board.tickets[0]!.assignees = ['qa-agent'];
  f.board.tickets[0]!.state = 'done';
  await assert.rejects(live.recheck(f.root, claim.id, f.reader), /changed/);
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
