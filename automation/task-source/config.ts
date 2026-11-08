import { assertNonsecret, load, requireText } from '../shared/store.js';

export const providers = ['jira', 'clickup', 'linear', 'asana'] as const;
export type Provider = typeof providers[number];
export const outcomes = ['ready', 'retest', 'devTodo', 'rework', 'testedOk', 'deferred', 'canceled'] as const;
export type Queue = typeof outcomes[number];
export const actions = ['comment', 'move', 'createDefect'] as const;
export type Action = typeof actions[number];

export interface BoardSelection {
  provider: Provider;
  scopeId: string;
  site?: string;
  jiraEmail?: string;
  jiraDefect?: { issueTypeId: string; transitionId: string };
  clickupWorkspaceId?: string;
  linearProjectId?: string;
  asanaFieldId?: string;
}
export interface LiveChoice {
  kind: 'live';
  board: BoardSelection;
  queues: Partial<Record<Queue, string[]>> & { ready: string[]; retest: string[] };
  actions: Action[];
}
export type Choice = { kind: 'local' } | LiveChoice;
export interface Identity { accountId: string; workspaceId: string; scopeId: string; scopeName: string }
export interface Active {
  schemaVersion: 1;
  choice: Choice;
  source?: string;
  identity?: Identity;
}
export const sourcePath = '.local/task-source.json';

export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,149}$/.test(value)) throw new Error('Use a stable provider ID.');
  return value;
}
export function validateBoard(board: BoardSelection) {
  if (!board || !providers.includes(board.provider)) throw new Error('Choose a supported task app.');
  const extra = { jira: ['site', 'jiraEmail', 'jiraDefect'], clickup: ['clickupWorkspaceId'], linear: ['linearProjectId'], asana: ['asanaFieldId'] }[board.provider];
  if (Object.keys(board).some(key => !['provider', 'scopeId', ...extra].includes(key))) throw new Error('Use the fields supported by the selected task app.');
  id(board.scopeId);
  if (board.provider === 'jira') {
    if (!board.site || !/^[a-z0-9-]+\.atlassian\.net$/.test(board.site)) throw new Error('Use the Jira Cloud site hostname.');
    if (!board.jiraEmail || !/^[^\s:@]+@[^\s:@]+$/.test(board.jiraEmail)) throw new Error('Supply the Jira account email for API-token authentication.');
  }
  if (board.jiraDefect !== undefined) {
    id(board.jiraDefect?.issueTypeId); id(board.jiraDefect?.transitionId);
    if (Object.keys(board.jiraDefect).length !== 2) throw new Error('Use the reviewed Jira issue type and create transition IDs.');
  }
  if (board.provider === 'clickup') id(board.clickupWorkspaceId);
  if (board.linearProjectId !== undefined) id(board.linearProjectId);
  if (board.asanaFieldId !== undefined) id(board.asanaFieldId);
}
export function validateChoice(choice: Choice) {
  assertNonsecret(choice);
  if (choice?.kind === 'local') {
    if (Object.keys(choice).length !== 1) throw new Error('The local task manager needs only the local source choice.');
    return;
  }
  if (choice?.kind !== 'live' || Object.keys(choice).some(k => !['kind', 'board', 'queues', 'actions'].includes(k))) throw new Error('Choose the local task manager or a live task app.');
  validateBoard(choice.board);
  if (!choice.queues || !choice.queues.ready?.length || !choice.queues.retest?.length) throw new Error('Map both initial QA and retest statuses.');
  const used = new Set<string>();
  for (const [queue, values] of Object.entries(choice.queues)) {
    if (!outcomes.includes(queue as Queue) || !Array.isArray(values) || !values.length) throw new Error('Map supported queues to explicit status IDs.');
    for (const value of values) {
      if (used.has(id(value))) throw new Error('Each status may route to only one QA queue.');
      used.add(value);
    }
  }
  if (!Array.isArray(choice.actions) || new Set(choice.actions).size !== choice.actions.length || choice.actions.some(action => !actions.includes(action))) throw new Error('Choose the permitted board actions explicitly.');
  if (choice.actions.includes('createDefect') && choice.queues.devTodo?.length !== 1) throw new Error('Defect creation needs one unambiguous Dev Todo destination.');
  if (choice.actions.includes('createDefect') && choice.board.provider === 'jira' && !choice.board.jiraDefect) throw new Error('Select the Jira defect issue type and create transition.');
}
export function activeSource(root: string) {
  const current = load<Active>(root, sourcePath, () => ({ schemaVersion: 1, choice: { kind: 'local' } }));
  if (current.value?.schemaVersion !== 1) throw new Error('Task source settings need reconciliation.');
  validateChoice(current.value.choice);
  if (current.value.choice.kind === 'live') {
    const identity = current.value.identity;
    if (!identity || identity.scopeId !== current.value.choice.board.scopeId) throw new Error('The live task source needs an exact verified account and scope.');
    id(identity.accountId); id(identity.workspaceId); requireText(identity.scopeName);
    requireText(current.value.source, 'Recorded source decision');
  }
  return current;
}
export function requireLocalSource(root: string) {
  if (activeSource(root).value.choice.kind !== 'local') throw new Error('This operation uses the local task manager. Consult the active live board and its supported operations.');
}
