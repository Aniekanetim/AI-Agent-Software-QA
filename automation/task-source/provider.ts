import { digest, requireText } from '../shared/store.js';
import { id, validateBoard, type BoardSelection, type Identity, type Action } from './config.js';

export interface State { id: string; name: string }
export interface Ticket {
  id: string; title: string; url: string; state: string | null; assignees: string[];
  closed: boolean; createdAt: string; updatedAt?: string; priority: number; revision: string; projectId?: string; homeListId?: string;
}
export interface Connection { identity: Identity; states: State[]; tickets: Ticket[]; descriptions?: Record<string, unknown> }
export type BoardReader = (board: BoardSelection) => Promise<Connection>;
export const tokenVariables = {
  jira: 'QA_JIRA_API_TOKEN', clickup: 'QA_CLICKUP_API_TOKEN',
  linear: 'QA_LINEAR_API_KEY', asana: 'QA_ASANA_ACCESS_TOKEN',
};
export const linearOAuthVariable = 'QA_LINEAR_ACCESS_TOKEN';

// Provider response shape is verified at the normalization boundary.
type Payload = Record<string, any>;
function object(value: unknown): Payload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The provider returned an incomplete object.');
  return value as Payload;
}
function list(value: unknown): Payload[] {
  if (!Array.isArray(value)) throw new Error('The provider returned an incomplete list.');
  return value.map(object);
}
function key(value: unknown) { return id(Number.isSafeInteger(value) ? String(value) : value); }
function label(value: unknown) { requireText(value, 'Provider name'); return value; }
const part = (value: string) => encodeURIComponent(id(value));
const scope = (actual: unknown, expected: string) => { if (key(actual) !== expected) throw new Error('The response identifies a different board or account.'); };
function iso(value: unknown) {
  const time = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) throw new Error('The provider did not supply a valid ticket timestamp.');
  return new Date(time).toISOString();
}
function assignee(value: unknown, field: string): string[] { return value === null ? [] : [key(object(value)[field])]; }
function ticket(value: Omit<Ticket, 'revision' | 'updatedAt'>, detail: unknown, updatedAt: unknown): Ticket {
  const url = new URL(value.url);
  if (url.protocol !== 'https:' || url.username || url.password || !(url.hostname.endsWith('.atlassian.net') || ['app.clickup.com', 'linear.app', 'app.asana.com'].includes(url.hostname))) throw new Error('Use a safe native ticket URL.');
  const { assignees } = value;
  const stable = { ...value, assignees: [...new Set(assignees)].sort() };
  return { ...stable, updatedAt: iso(updatedAt), revision: digest(JSON.stringify({ ...stable, detail })) };
}
const byId = (items: State[], expected: string) => {
  const found = items.filter(item => item.id === expected);
  if (found.length !== 1) throw new Error('A mapped status is missing or ambiguous.');
  return found[0]!;
};
function pager() {
  const seen = new Set<string>();
  return (cursor: unknown) => {
    if (typeof cursor !== 'string' || !cursor || seen.has(cursor) || seen.size >= 99) throw new Error('The provider did not complete pagination.');
    seen.add(cursor); return cursor;
  };
}
function collect(identity: Identity, states: State[], tickets: Ticket[], descriptions: Record<string, unknown>): Connection {
  for (const state of states) byId(states, state.id);
  const unique = new Map<string, Ticket>();
  for (const row of tickets) {
    const current = unique.get(row.id);
    if (current && (current.revision !== row.revision || current.updatedAt !== row.updatedAt)) throw new Error('A ticket changed during pagination. Refresh the board.');
    unique.set(row.id, row);
  }
  return { identity, states, tickets: [...unique.values()], descriptions };
}

type Send = (path: string, body?: unknown, method?: string) => Promise<Payload>;
function sender(base: string, token: string, transport: typeof fetch): Send {
  const origin = new URL(base).origin;
  return async (path, body, method) => {
    const url = new URL(path, base);
    if (url.origin !== origin || !url.pathname.startsWith(new URL(base).pathname)) throw new Error('Provider request escaped the selected API.');
    let response: Response;
    try {
      response = await transport(url, {
        method: method ?? (body === undefined ? 'GET' : 'POST'), redirect: 'error',
        headers: { ...(token ? { Authorization: token } : {}), Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
      });
    } catch { throw new Error('The task provider connection failed or timed out.'); }
    if (!response.ok) throw new Error(`Task provider request failed (HTTP ${response.status}).`);
    if (response.status === 204) return {};
    try { return object(await response.json()); } catch { throw new Error('The provider response could not be verified.'); }
  };
}

function jira(board: BoardSelection, send: Send) {
  const boardId = part(board.scopeId);
  return async () => {
    const [account, configuration] = await Promise.all([send('rest/api/3/myself'), send(`rest/agile/1.0/board/${boardId}/configuration`)]);
    scope(configuration.id, board.scopeId);
    if (account.active !== true) throw new Error('The Jira account is inactive.');
    const states = list(object(configuration.columnConfig).columns).flatMap(column => list(column.statuses).map(state => ({ id: key(state.id), name: label(column.name) })));
    const rows: Ticket[] = [], descriptions: Record<string, unknown> = Object.create(null), next = pager();
    const params = new URLSearchParams({ maxResults: '50', fields: 'summary,description,assignee,status,created,updated,priority,project,issuetype' });
    for (;;) {
      const page = await send(`rest/software/1.0/board/${boardId}/issue?${params}`);
      for (const raw of list(page.issues)) {
        const f = object(raw.fields);
        descriptions[key(raw.id)] = f.description ?? null;
        rows.push(ticket({
          id: key(raw.id), title: label(f.summary), url: `https://${board.site}/browse/${part(raw.key)}`, state: key(object(f.status).id),
          assignees: assignee(f.assignee, 'accountId'), createdAt: iso(f.created), closed: f.status.statusCategory?.key === 'done', projectId: key(object(f.project).id),
          priority: ['Highest', 'High', 'Medium', 'Low', 'Lowest'].indexOf(f.priority?.name) + 1 || 99,
        }, { description: f.description, project: f.project?.id, type: f.issuetype?.id }, f.updated));
      }
      if (page.isLast === true && !page.nextPageToken) break;
      params.set('nextPageToken', next(page.nextPageToken));
    }
    return collect({ accountId: key(account.accountId), workspaceId: board.site!, scopeId: board.scopeId, scopeName: label(configuration.name) }, states, rows, descriptions);
  };
}
function clickup(board: BoardSelection, send: Send) {
  const listId = part(board.scopeId);
  return async () => {
    const workspace = board.clickupWorkspaceId!;
    const [identity, selected, locations] = await Promise.all([send('user'), send(`list/${listId}`), send(`team/${part(workspace)}/space?archived=false`)]);
    scope(selected.id, board.scopeId);
    if (selected.archived === true) throw new Error('The ClickUp List is archived.');
    const space = list(locations.spaces).find(row => key(row.id) === key(object(selected.space).id));
    if (!space) throw new Error('The List is outside the selected ClickUp Workspace or is inaccessible.');
    const states = list(selected.statuses ?? space.statuses).map(state => {
      const name = label(state.status);
      const native = state.id == null ? null : key(state.id);
      return { id: native ?? 'name-' + digest(name), name, native };
    });
    const rows: Ticket[] = [], descriptions: Record<string, unknown> = Object.create(null);
    for (let index = 0; index < 100; index++) {
      const page = await send(`list/${listId}/task?include_closed=true&include_timl=true&page=${index}`);
      const tasks = list(page.tasks);
      for (const raw of tasks) {
        const status = object(raw.status);
        descriptions[key(raw.id)] = raw.description ?? null;
        const homeListId = key(object(raw.list).id);
        const native = status.id == null ? null : key(status.id);
        const matches = states.filter(state => state.native !== null && state.native === native ||
          homeListId === board.scopeId && (native === null || state.native === null) && state.name === status.status);
        rows.push(ticket({
          id: key(raw.id), title: label(raw.name), url: `https://app.clickup.com/t/${part(raw.id)}`,
          state: matches.length === 1 ? matches[0]!.id : null, assignees: list(raw.assignees).map(user => key(user.id)),
          createdAt: iso(raw.date_created), closed: status.type === 'closed', priority: Number(raw.priority?.id) || 99, homeListId,
        }, { description: raw.description, status: status.status, homeList: raw.list?.id }, raw.date_updated));
      }
      if (page.last_page === true || page.last_page === undefined && tasks.length < 100) {
        return collect({ accountId: key(object(identity.user).id), workspaceId: workspace, scopeId: board.scopeId, scopeName: label(selected.name) }, states.map(({ id, name }) => ({ id, name })), rows, descriptions);
      }
    }
    throw new Error('ClickUp did not complete pagination.');
  };
}

function linear(board: BoardSelection, send: Send) {
  const query = async (operation: string, variables: Payload) => {
    return linearQuery(send, operation, variables);
  };
  async function pages(operation: string, variables: Payload, extract: (data: Payload) => unknown) {
    const next = pager(), rows: Payload[] = [];
    let after: string | null = null;
    for (;;) {
      const page = object(extract(await query(operation, { ...variables, after })));
      rows.push(...list(page.nodes));
      if (object(page.pageInfo).hasNextPage === false) return rows;
      after = next(page.pageInfo.endCursor);
    }
  }
  return async () => {
    const result = await query('query($team: String!) { viewer { id } organization { id } team(id: $team) { id name archivedAt } }', { team: board.scopeId });
    scope(object(result.team).id, board.scopeId);
    if (result.team.archivedAt !== null) throw new Error('The Linear team is archived or could not be verified.');
    const states = (await pages('query($team: String!, $after: String) { team(id: $team) { states(first: 50, after: $after) { nodes { id name } pageInfo { hasNextPage endCursor } } } }', { team: board.scopeId }, data => object(data.team).states)).map(state => ({ id: key(state.id), name: label(state.name) }));
    const projectId = board.linearProjectId;
    const project = projectId ? object((await query('query($project: String!) { project(id: $project) { id name archivedAt } }', { project: projectId })).project) : null;
    if (project && projectId) {
      scope(project.id, projectId);
      if (project.archivedAt !== null) throw new Error('The Linear project is archived or could not be verified.');
    }
    const issues = await pages('query($team: String!, $after: String, $filter: IssueFilter) { team(id: $team) { issues(first: 50, after: $after, filter: $filter, includeSubTeams: false) { nodes { id title url description priority createdAt updatedAt archivedAt team { id } state { id type } assignee { id } project { id } } pageInfo { hasNextPage endCursor } } } }', { team: board.scopeId, filter: projectId ? { project: { id: { eq: projectId } } } : null }, data => object(data.team).issues);
    const rows = issues.map(raw => {
      scope(object(raw.team).id, board.scopeId);
      if (projectId) scope(object(raw.project).id, projectId);
      return ticket({
        id: key(raw.id), title: label(raw.title), url: label(raw.url), state: key(object(raw.state).id),
        assignees: assignee(raw.assignee, 'id'), closed: raw.archivedAt !== null || ['canceled', 'completed'].includes(raw.state.type), createdAt: iso(raw.createdAt), priority: Number(raw.priority) || 99,
      }, { description: raw.description, project: raw.project?.id }, raw.updatedAt);
    });
    return collect({ accountId: key(object(result.viewer).id), workspaceId: key(object(result.organization).id), scopeId: board.scopeId, scopeName: project ? `${label(result.team.name)} / ${label(project.name)}` : label(result.team.name) }, states, rows, Object.fromEntries(issues.map(issue => [key(issue.id), issue.description ?? null])));
  };
}

function asana(board: BoardSelection, send: Send) {
  const project = part(board.scopeId);
  async function pages(path: string, fields: string) {
    const next = pager(), rows: Payload[] = [];
    const params = new URLSearchParams({ limit: '100', opt_fields: fields });
    for (;;) {
      const page = await send(`${path}?${params}`);
      rows.push(...list(page.data));
      if (page.next_page === null) return rows;
      params.set('offset', next(object(page.next_page).offset));
    }
  }
  return async () => {
    const [viewer, selection] = await Promise.all([send('users/me'), send(`projects/${project}?opt_fields=gid,name,workspace.gid,archived`)]);
    const selected = object(selection.data);
    scope(selected.gid, board.scopeId);
    if (selected.archived !== false) throw new Error('The Asana project is archived or could not be verified.');
    const field = board.asanaFieldId;
    const sources = field
      ? await pages(`projects/${project}/custom_field_settings`, 'custom_field.gid,custom_field.enum_options.gid,custom_field.enum_options.name,custom_field.enum_options.enabled')
      : await pages(`projects/${project}/sections`, 'gid,name');
    const selectedField = field ? sources.find(item => item.custom_field?.gid === field)?.custom_field : null;
    const states = (field ? list(object(selectedField).enum_options).filter(option => option.enabled === true) : sources).map(state => ({ id: key(state.gid), name: label(state.name) }));
    const tasks = await pages(`projects/${project}/tasks`, 'gid,name,notes,completed,assignee.gid,created_at,modified_at,permalink_url,memberships.project.gid,memberships.section.gid,custom_fields.gid,custom_fields.enum_value.gid');
    const rows = tasks.flatMap(raw => {
      const members = list(raw.memberships).filter(member => member.project?.gid === board.scopeId);
      if (members.length === 0) return [];
      if (members.length !== 1 || typeof raw.completed !== 'boolean') throw new Error('The Asana task membership or completion state changed.');
      const state = field ? list(raw.custom_fields).find(value => value.gid === field)?.enum_value?.gid : members[0]!.section?.gid;
      return ticket({
        id: key(raw.gid), title: label(raw.name), url: label(raw.permalink_url), state: state == null ? null : key(state),
        assignees: assignee(raw.assignee, 'gid'), closed: raw.completed, createdAt: iso(raw.created_at), priority: 99,
      }, { notes: raw.notes, section: members[0]!.section?.gid }, raw.modified_at);
    });
    return collect({ accountId: key(object(viewer.data).gid), workspaceId: key(object(selected.workspace).gid), scopeId: board.scopeId, scopeName: label(selected.name) }, states, rows, Object.fromEntries(tasks.map(task => [key(task.gid), task.notes ?? null])));
  };
}

function boardSender(board: BoardSelection, transport: typeof fetch, env: NodeJS.ProcessEnv) {
  validateBoard(board);
  const linearOAuth = board.provider === 'linear' && board.linearAuth === 'oauth';
  const variable = linearOAuth ? linearOAuthVariable : tokenVariables[board.provider], token = env[variable];
  requireText(token, `Credential in ${variable}`);
  const api = {
    jira: [board.jiraCloudId ? `https://api.atlassian.com/ex/jira/${part(board.jiraCloudId)}/` : `https://${board.site}/`, 'Basic ' + Buffer.from(`${board.jiraEmail}:${token}`).toString('base64')],
    clickup: ['https://api.clickup.com/api/v2/', token],
    linear: ['https://api.linear.app/', linearOAuth ? `Bearer ${token}` : token],
    asana: ['https://app.asana.com/api/1.0/', `Bearer ${token}`],
  }[board.provider];
  return sender(api[0]!, api[1]!, transport);
}
export async function readBoard(board: BoardSelection, transport: typeof fetch = fetch, env = process.env): Promise<Connection> {
  const send = boardSender(board, transport, env);
  if (board.provider === 'jira' && board.jiraCloudId) {
    const tenant = await sender(`https://${board.site}/`, '', transport)('_edge/tenant_info');
    scope(tenant.cloudId, board.jiraCloudId);
  }
  return { jira, clickup, linear, asana }[board.provider](board, send)();
}


async function linearQuery(send: Send, operation: string, variables: Payload) {
  const response = await send('graphql', { query: operation, variables });
  if (response.errors?.length) throw new Error('Linear could not verify the requested operation.');
  return object(response.data);
}
const adf = (text: string) => ({
  version: 1, type: 'doc', content: text.split(/\r?\n/).map(line => ({
    type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [],
  })),
});
export type Mutation =
  | { action: Extract<Action, 'comment'>; body: string }
  | { action: Extract<Action, 'move'>; destination: State }
  | { action: Extract<Action, 'createDefect'>; destination: State; title: string; body: string };
export type WriteReceipt = { remoteId: string };
export type BoardWriter = (board: BoardSelection, ticket: Ticket, mutation: Mutation) => Promise<() => Promise<WriteReceipt>>;

/** Read any provider-specific prerequisites before reserving the actual write. */
export async function prepareWrite(board: BoardSelection, ticket: Ticket, mutation: Mutation, transport: typeof fetch = fetch, env = process.env): Promise<() => Promise<WriteReceipt>> {
  const send = boardSender(board, transport, env), taskId = part(ticket.id);
  const destination = mutation.action === 'comment' ? null : mutation.destination;
  if (board.provider === 'jira') {
    const issue = `rest/api/3/issue/${taskId}`;
    if (mutation.action === 'comment') return async () => ({ remoteId: key((await send(`${issue}/comment`, { body: adf(mutation.body) })).id) });
    if (mutation.action === 'move') {
      const transitions = list((await send(`${issue}/transitions`)).transitions).filter(t => t.to?.id === destination!.id);
      if (transitions.length !== 1) throw new Error('The Jira workflow needs one available transition to the mapped status.');
      const transition = { id: key(transitions[0]!.id) };
      return async () => { await send(`${issue}/transitions`, { transition }); return { remoteId: ticket.id }; };
    }
    const defect = board.jiraDefect;
    if (!defect || !ticket.projectId) throw new Error('Select the issue type and workflow transition in the original Jira project.');
    return async () => ({ remoteId: key((await send('rest/api/3/issue', {
      fields: { project: { id: ticket.projectId }, issuetype: { id: defect.issueTypeId }, summary: mutation.title, description: adf(mutation.body) },
      transition: { id: defect.transitionId },
    })).id) });
  }
  if (board.provider === 'clickup') {
    if (mutation.action === 'comment') return async () => ({ remoteId: key((await send(`task/${taskId}/comment`, { comment_text: mutation.body, notify_all: false })).id) });
    if (mutation.action === 'move') {
      if (ticket.homeListId !== board.scopeId) throw new Error('Move this multi-list task from its home List workflow.');
      return async () => ({ remoteId: key((await send(`task/${taskId}`, { status: destination!.name }, 'PUT')).id) });
    }
    return async () => ({ remoteId: key((await send(`list/${part(board.scopeId)}/task`, { name: mutation.title, description: mutation.body, status: destination!.name, check_required_custom_fields: true, notify_all: false })).id) });
  }
  if (board.provider === 'linear') {
    const run = async (query: string, variables: Payload, operation: string, record: string) => {
      const result = object((await linearQuery(send, query, variables))[operation]);
      if (result.success !== true) throw new Error('Linear did not confirm the write.');
      return { remoteId: key(object(result[record]).id) };
    };
    if (mutation.action === 'comment') return () => run('mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id } } }', { input: { issueId: ticket.id, body: mutation.body } }, 'commentCreate', 'comment');
    if (mutation.action === 'move') return () => run('mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id } } }', { id: ticket.id, input: { stateId: destination!.id } }, 'issueUpdate', 'issue');
    return () => run('mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id } } }', { input: { teamId: board.scopeId, projectId: board.linearProjectId, stateId: destination!.id, title: mutation.title, description: mutation.body } }, 'issueCreate', 'issue');
  }
  if (mutation.action === 'comment') return async () => ({ remoteId: key(object((await send(`tasks/${taskId}/stories`, { data: { text: mutation.body } })).data).gid) });
  const field = board.asanaFieldId;
  if (mutation.action === 'move') return async () => {
    if (field) await send(`tasks/${taskId}`, { data: { custom_fields: { [field]: destination!.id } } }, 'PUT');
    else await send(`sections/${part(destination!.id)}/addTask`, { data: { task: ticket.id } });
    return { remoteId: ticket.id };
  };
  const placement = field
    ? { projects: [board.scopeId], custom_fields: { [field]: destination!.id } }
    : { memberships: [{ project: board.scopeId, section: destination!.id }] };
  return async () => ({ remoteId: key(object((await send('tasks', { data: { name: mutation.title, notes: mutation.body, ...placement } })).data).gid) });
}
