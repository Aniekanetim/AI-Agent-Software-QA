import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, unlinkSync, lstatSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { contained, digest, load, save, replace, revision, withLock, verifyEvidence, requireText, assertNonsecret, type Evidence } from '../shared/store.js';

export const boardRoot = 'QA task management Board';
export const statuses = ['Ready for QA', 'Dev Todo', 'Tested-Ok', 'Retest', 'Rework', 'Deferred', 'Canceled'] as const;
export type Status = typeof statuses[number];
export const inactive = (status: Status) => status === 'Deferred' || status === 'Canceled';
export interface Review { owner: string; dueAt: string | null; trigger: string | null; resumeWhen: string }
export interface Decision {
  actor: string; source: string; reason: string; evidence: Evidence[];
  scope: { kind: 'assignment' } | { kind: 'revision'; revision: string };
  checkpoint: string; nextOwner: string; nextAction: string; review?: Review;
  handoff: string; waitingOn?: string;
}
export interface Transition { id: string; ticketId: string; expectedRevision: string; to: Status; decision: Decision; navigation?: { path: string; expectedRevision: string; source: string }[] }
export interface Lifecycle extends Decision { schemaVersion: 1; id: string; at: string; from: Status; to: Status; previousOwner: string; previousWaiting: string; previousCheckpoint: string }
export interface Ticket { id: string; path: string; status: Status; text: string; revision: string; lifecycle: Lifecycle | null; generation: string; issues: string[] }
interface Patch { path: string; before: string; content: string; original?: string; source?: string }
interface Journal { schemaVersion: 1 | 2; id: string; requestHash: string; ticketId: string; from: string; to: string; before: string; content: string; patches: Patch[]; ownerUpdates: { path: string; destination: string }[]; linkUpdates?: { path: string; destination: string; expectedRevision: string }[]; state: 'prepared' | 'completed' }
const validId = (id: string) => /^[A-Z][A-Z0-9]{0,15}-\d{1,9}$/.test(id);
function safeKey(id: string) { if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('Use a unique safe lifecycle operation ID.'); return id; }
function entries(root: string, folder: string) { const path = contained(root, folder); return existsSync(path) ? readdirSync(path).filter(n => n.endsWith('.json')).map(n => `${folder}/${n}`) : []; }
function regularDirectory(root: string, path: string) { const target = contained(root, path); if (existsSync(target) && (!lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink())) throw new Error('Board directories must be regular directories, not file or link aliases.'); }
export function missingFolders(root: string) {
  regularDirectory(root, boardRoot);
  return statuses.filter(s => { const path = `${boardRoot}/${s}`; regularDirectory(root, path); return !existsSync(contained(root, path)); });
}
export function upgradeBoard(root: string, source: string) {
  requireText(source, 'Actual upgrade instruction');
  return withLock(root, 'qa-board', () => {
    const added = missingFolders(root);
    for (const status of statuses) {
      const folder = contained(root, `${boardRoot}/${status}`); mkdirSync(folder, { recursive: true });
      if (!readdirSync(folder).length) writeFileSync(contained(root, `${boardRoot}/${status}/.gitkeep`), '', { flag: 'wx' });
    }
    return { added, source, existingTickets: 'Preserved; no classification, approval or schedule was changed.' };
  });
}
export function pendingTransitions(root: string) { return entries(root, '.local/board-transitions').filter(p => load<Journal>(root, p, () => { throw new Error('Missing transition.'); }).value.state !== 'completed'); }
export function assertBoardStable(root: string) {
  if (missingFolders(root).length) throw new Error('Upgrade the QA board to all seven status folders with board upgrade; existing tickets must be preserved.');
  if (pendingTransitions(root).length) throw new Error('A board transition is incomplete; recover its recorded operation before selecting or executing work.');
}
function field(text: string, name: string) { const prefix = `| ${name} |`, line = text.split(/\r?\n/).find(l => l.startsWith(prefix)); return line ? line.slice(prefix.length).replace(/\|\s*$/, '').trim().replace(/\\\|/g, '|') : 'Not recorded'; }
function zonedTime(value: string) { return /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)); }
function setField(text: string, name: string, value: string) { return text.replace(new RegExp(`^\\| ${name} \\|[^\\r\\n]*`, 'm'), `| ${name} | ${value.replaceAll('|', '\\|').replace(/[\r\n]/g, ' ')} |`); }
function lifecycle(text: string): Lifecycle | null {
  const blocks: string[] = []; let fence: { char: string; length: number; capture: boolean; lines: string[] } | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!fence) {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (opening) fence = { char: opening[1]![0]!, length: opening[1]!.length, capture: opening[2]!.trim() === 'qa-lifecycle', lines: [] };
    } else if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(line)) {
      if (fence.capture) blocks.push(fence.lines.join('\n')); fence = null;
    } else if (fence.capture) fence.lines.push(line);
  }
  if (fence?.capture) throw new Error('Unclosed lifecycle block; preserve it and reconcile the affected ticket.');
  if (!blocks.length) return null;
  let entry: Lifecycle;
  try { entry = JSON.parse(blocks.at(-1)!); } catch { throw new Error('Unreadable lifecycle history; preserve it for reconciliation.'); }
  if (entry.schemaVersion !== 1 || !statuses.includes(entry.from) || !statuses.includes(entry.to) || !entry.id || !entry.source || !entry.actor || !entry.reason || !entry.checkpoint || !entry.nextOwner || !entry.nextAction || !entry.handoff || !entry.evidence?.length || !Number.isFinite(Date.parse(entry.at)) || !entry.scope || !['assignment', 'revision'].includes(entry.scope.kind) || entry.scope.kind === 'revision' && !/^[a-f0-9]{40}$/.test(entry.scope.revision)) throw new Error('Unsupported lifecycle history; do not infer execution eligibility.');
  if (entry.to === 'Deferred' && (!entry.review?.owner || !entry.review.resumeWhen || !entry.review.dueAt && !entry.review.trigger || entry.review.dueAt && !zonedTime(entry.review.dueAt))) throw new Error('Deferred history lacks actual review ownership/conditions; reconcile it before intake.');
  return entry;
}
export function tickets(root: string): Ticket[] {
  assertBoardStable(root);
  const found = statuses.flatMap(status => readdirSync(contained(root, `${boardRoot}/${status}`), { withFileTypes: true }).filter(e => {
    if (e.name.endsWith('.md') && e.isSymbolicLink()) throw new Error('Use regular Markdown ticket files; reconcile symbolic links before board intake.');
    return e.isFile() && e.name.endsWith('.md');
  }).map(e => {
    const path = `${boardRoot}/${status}/${e.name}`, text = readFileSync(contained(root, path), 'utf8');
    const id = text.match(/^\uFEFF?#\s+([A-Z][A-Z0-9]{0,15}-\d{1,9})(?=[:\s]|$)/m)?.[1];
    if (!id || !validId(id)) throw new Error(`Record a stable ticket ID in the heading of ${path}.`);
    let entry: Lifecycle | null = null; const issues: string[] = [];
    try { entry = lifecycle(text); if (entry && entry.to !== status) issues.push('The ticket folder and lifecycle history disagree.'); }
    catch (error) { issues.push(error instanceof Error ? error.message : 'Unreadable lifecycle history.'); }
    return { id, status, path, text, revision: digest(text), lifecycle: entry, generation: entry?.id ?? (issues.length ? `invalid-${digest(text)}` : 'legacy'), issues };
  }));
  if (new Set(found.map(t => t.id)).size !== found.length) throw new Error('Duplicate ticket IDs across the board; reconcile without overwriting history.');
  return found;
}
export function findTicket(root: string, id: string) { const found = tickets(root).find(t => t.id === id); if (!found) throw new Error(`Ticket ${id} was not found on the canonical board.`); return found; }
export function assertExecutable(root: string, id: string, generation?: string, role: 'qa' | 'developer' = 'qa') {
  const ticket = findTicket(root, id), allowed = role === 'qa' ? ['Ready for QA', 'Retest'] : ['Dev Todo', 'Rework'];
  if (ticket.issues.length) throw new Error(`Reconcile lifecycle for ${id}: ${ticket.issues.join(' ')}`);
  if (!allowed.includes(ticket.status) || ticket.lifecycle && ticket.lifecycle.to !== ticket.status) throw new Error(`Ticket ${id} is not eligible for ${role} execution in ${ticket.status}; retain its actual decision and checkpoint.`);
  if (generation !== undefined && generation !== ticket.generation) throw new Error('Ticket lifecycle changed; an old approval continuation or running operation cannot resume automatically.');
  return ticket;
}
/** An unrelated in-progress move must not cancel an already running operation. */
export function assertContinuation(root: string, id: string, generation: string) {
  if (missingFolders(root).length) throw new Error('The canonical board became unavailable.');
  for (const path of pendingTransitions(root)) if (load<Journal>(root, path, () => { throw new Error('Missing transition.'); }).value.ticketId === id) throw new Error('This ticket has a pending lifecycle transition.');
  const found: { status: Status; generation: string }[] = [];
  for (const status of statuses) for (const file of readdirSync(contained(root, `${boardRoot}/${status}`), { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith('.md')) continue;
    const text = readFileSync(contained(root, `${boardRoot}/${status}/${file.name}`), 'utf8');
    if (text.match(/^\uFEFF?#\s+([A-Z][A-Z0-9]{0,15}-\d{1,9})(?=[:\s]|$)/m)?.[1] !== id) continue;
    const entry = lifecycle(text);
    if (entry && entry.to !== status) throw new Error('The bound ticket lifecycle is inconsistent.');
    found.push({ status, generation: entry?.id ?? 'legacy' });
  }
  if (found.length !== 1 || !['Ready for QA', 'Retest'].includes(found[0]!.status) || found[0]!.generation !== generation) throw new Error('The bound ticket is no longer eligible; preserve the original operation.');
}
export interface Operation { id: string; ticketId: string; generation: string; source: string; kind: 'localRegression' | 'workflowDispatch'; resultPath: string; state: 'running' | 'stopRequested' | 'uncertain' | 'finished'; observation?: Evidence }
export function operations(root: string, ticketId: string) { return entries(root, '.local/board-operations').map(p => load<Operation>(root, p, () => { throw new Error('Missing operation.'); }).value).filter(o => o.ticketId === ticketId && o.state !== 'finished'); }
export function startOperation(root: string, ticket: Ticket, operation: Omit<Operation, 'ticketId' | 'generation' | 'state'>) {
  assertExecutable(root, ticket.id, ticket.generation);
  if (operations(root, ticket.id).length) throw new Error('This ticket has unfinished or uncertain execution; inspect its actual outcome before another start.');
  const value: Operation = { ...operation, ticketId: ticket.id, generation: ticket.generation, state: 'running' };
  save(root, `.local/board-operations/${safeKey(value.id)}.json`, value, null); return value;
}
export function operationState(root: string, id: string, state: Operation['state']) {
  const path = `.local/board-operations/${safeKey(id)}.json`, record = load<Operation>(root, path, () => { throw new Error('Unknown operation.'); });
  record.value.state = state; save(root, path, record.value, record.revision);
}
export function settleOperation(root: string, request: { id: string; source: string; terminalState: 'completed' | 'stopped' | 'notStarted'; evidence: Evidence[] }) {
  requireText(request.source); if (!['completed', 'stopped', 'notStarted'].includes(request.terminalState) || !request.evidence?.length) throw new Error('Record actual terminal-process/workflow evidence; a folder move is not a stop acknowledgement.');
  request.evidence.forEach(e => verifyEvidence(root, e));
  return withLock(root, 'qa-board', () => {
    const path = `.local/board-operations/${safeKey(request.id)}.json`, record = load<Operation>(root, path, () => { throw new Error('Unknown operation.'); });
    const observationPath = `.local/board-operation-observations/${request.id}-${digest(JSON.stringify(request)).slice(0, 20)}.json`;
    if (!revision(root, observationPath)) save(root, observationPath, request, null);
    record.value.state = 'finished'; record.value.observation = { path: observationPath, sha256: revision(root, observationPath)! };
    save(root, path, record.value, record.revision); return record.value;
  });
}
function decisionValid(root: string, request: Transition, ticket: Ticket) {
  const d = request.decision; assertNonsecret(request);
  if (ticket.issues.length) throw new Error(`Reconcile lifecycle for ${ticket.id}: ${ticket.issues.join(' ')}`);
  if (!statuses.includes(request.to) || request.expectedRevision !== ticket.revision) throw new Error('Reload the actual ticket revision and select a supported destination.');
  for (const value of [d.actor, d.source, d.reason, d.checkpoint, d.nextOwner, d.nextAction, d.handoff]) requireText(value, 'Actual lifecycle decision, checkpoint and handoff');
  if (!d.evidence?.length || !d.scope || !['assignment', 'revision'].includes(d.scope.kind)) throw new Error('Reference the actual decision and its assignment/revision scope.');
  d.evidence.forEach(e => { if (resolve(root, e.path).toLowerCase() === resolve(root, ticket.path).toLowerCase()) throw new Error('Keep decision evidence in an immutable source/snapshot, not the ticket this transition changes.'); verifyEvidence(root, e); });
  if (d.scope.kind === 'revision' && !/^[a-f0-9]{40}$/.test(d.scope.revision)) throw new Error('Identify the exact revision covered by the inactive decision.');
  if (request.to === 'Deferred') {
    const r = d.review; if (!r) throw new Error('Deferral needs an owner, review date/trigger and resume conditions.');
    requireText(r.owner); requireText(r.resumeWhen);
    if (r.trigger !== null) requireText(r.trigger);
    if (!r.dueAt && !r.trigger || r.dueAt && !zonedTime(r.dueAt)) throw new Error('Provide an actual review date/time with timezone or a trigger.');
  }
  if (inactive(ticket.status) && !inactive(request.to)) {
    if (request.to === 'Tested-Ok') throw new Error('Reactivate into the appropriate working queue; inactivity does not establish a test pass.');
    if (operations(root, ticket.id).length) throw new Error('Verify unfinished process/workflow state and settle it before reactivation.');
    if (ticket.id.startsWith('QA-') && request.to !== 'Ready for QA' || ticket.id.startsWith('BUG-') && !['Retest', 'Dev Todo', 'Rework'].includes(request.to)) throw new Error('Choose the working queue for this assignment or defect and its next owner.');
  }
  if (request.to === 'Tested-Ok' && operations(root, ticket.id).length) throw new Error('Unfinished work cannot be closed as Tested-Ok.');
}
function markdownFiles(root: string, folder = ''): string[] {
  return readdirSync(contained(root, folder || '.'), { withFileTypes: true }).flatMap(e => {
    if (e.isSymbolicLink() || ['.git', '.local', 'node_modules', 'output', 'mental_model'].includes(e.name)) return [];
    const path = folder ? `${folder}/${e.name}` : e.name;
    return e.isDirectory() ? markdownFiles(root, path) : e.name.endsWith('.md') ? [path] : [];
  });
}
function proseLines(text: string, rewrite: (line: string) => string) {
  let fence: { char: string; length: number } | null = null;
  return text.split(/(?<=\n)/).map(line => {
    if (fence) { if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(line.trimEnd())) fence = null; return line; }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)/);
    if (opening) { fence = { char: opening[1]![0]!, length: opening[1]!.length }; return line; }
    return rewrite(line);
  }).join('');
}
function rewriteLinks(root: string, text: string, oldFile: string, newFile: string, from: string, to: string) {
  return proseLines(text, line => line.split(/(`+[^\n]*?`+)/g).map((part, index) => index % 2 ? part : part.replace(/(!?\[[^\]\n]*\]\()(<[^>]+>|[^\s)]+)([^\n)]*\))/g, (full, prefix, raw, suffix) => {
    const url = raw.replace(/^<|>$/g, ''); if (/^[a-z][\w+.-]*:|^\/|^#/i.test(url)) return full;
    const at = url.search(/[?#]/), path = at < 0 ? url : url.slice(0, at), tail = at < 0 ? '' : url.slice(at);
    let target: string; try { target = resolve(root, dirname(oldFile), decodeURIComponent(path)); } catch { return full; }
    const moved = target === resolve(root, from); if (!moved && oldFile === newFile) return full;
    const changed = relative(resolve(root, dirname(newFile)), moved ? resolve(root, to) : target).replaceAll('\\', '/');
    const result = changed.split('/').map(encodeURIComponent).join('/') + tail;
    return prefix + (raw.startsWith('<') ? `<${result}>` : result) + suffix;
  })).join(''));
}
const navigationPath = `${boardRoot}/README.md`;
function navigationContent(root: string, text: string, path: string, from: string, to: string) {
  const start = '<!-- qa-navigation:start -->', end = '<!-- qa-navigation:end -->';
  if (path !== navigationPath || text.split(start).length !== 2 || text.split(end).length !== 2) throw new Error('Authorize only the board index with one explicit mutable qa-navigation block.');
  const visible: string[] = [];
  proseLines(text, line => { if ([start, end].includes(line.trimEnd())) visible.push(line.trimEnd()); return line; });
  if (visible.join('\n') !== `${start}\n${end}`) throw new Error('Mutable navigation markers must be standalone prose, outside code examples.');
  const first = text.indexOf(start) + start.length, last = text.indexOf(end);
  if (last < first) throw new Error('The mutable navigation markers are out of order.');
  return text.slice(0, first) + rewriteLinks(root, text.slice(first, last), path, path, from, to) + text.slice(last);
}
function prepare(root: string, request: Transition): Journal {
  safeKey(request.id); const path = `.local/board-transitions/${request.id}.json`, hash = digest(JSON.stringify(request));
  const earlier = load<Journal | null>(root, path, () => null).value;
  if (earlier) { if (earlier.requestHash !== hash) throw new Error('This operation ID belongs to a different transition.'); return earlier; }
  const ticket = findTicket(root, request.ticketId); decisionValid(root, request, ticket);
  const destination = `${boardRoot}/${request.to}/${ticket.path.split('/').at(-1)}`;
  if (destination !== ticket.path && existsSync(contained(root, destination))) throw new Error('The destination already exists; never overwrite another ticket.');
  const event: Lifecycle = { ...request.decision, schemaVersion: 1, id: request.id, at: new Date().toISOString(), from: ticket.status, to: request.to, previousOwner: field(ticket.text, 'Owner / claimed at'), previousWaiting: field(ticket.text, 'Waiting on'), previousCheckpoint: field(ticket.text, 'Workflow checkpoint') };
  let content = ticket.text;
  if (!operations(root, ticket.id).length) content = setField(content, 'Owner / claimed at', 'Unassigned');
  content = setField(setField(content, 'Workflow checkpoint', event.checkpoint), 'Next action', event.nextAction);
  const waiting = event.waitingOn ?? (request.to === 'Deferred' ? `Review by ${event.review!.owner}; ${event.review!.dueAt ?? event.review!.trigger}` : request.to === 'Canceled' ? operations(root, ticket.id).length ? 'Actual terminal-state observation and cleanup handoff' : 'No further assignment execution; retain known risks' : `Current prerequisite/decision check by ${event.nextOwner}; prior blockers are not assumed resolved`);
  content = setField(content, 'Waiting on', waiting);
  content = setField(content, 'Updated', event.at);
  content = rewriteLinks(root, content, ticket.path, destination, ticket.path, destination);
  content += `\n### Lifecycle: ${request.to} — ${event.at}\n\n\`\`\`qa-lifecycle\n${JSON.stringify(event, null, 2)}\n\`\`\`\n`;
  if (lifecycle(content)?.id !== request.id) throw new Error('The lifecycle entry could not be placed outside ticket examples; reconcile the Markdown first.');
  const patches: Patch[] = [], ownerUpdates: Journal['ownerUpdates'] = [], linkUpdates: NonNullable<Journal['linkUpdates']> = [];
  const navigation = request.navigation ?? [];
  if (!Array.isArray(navigation) || navigation.length > 1) throw new Error('Select at most the explicit mutable board navigation index.');
  for (const permission of navigation) {
    requireText(permission.source, 'Actual mutable-navigation maintenance authorization');
    if (permission.path !== navigationPath || revision(root, permission.path) !== permission.expectedRevision || request.decision.evidence.some(e => resolve(root, e.path).toLowerCase() === resolve(root, permission.path).toLowerCase())) throw new Error('Mutable navigation cannot override evidence protection or an expected revision.');
    navigationContent(root, readFileSync(contained(root, permission.path), 'utf8'), permission.path, ticket.path, destination);
  }
  for (const file of markdownFiles(root)) {
    if (file === ticket.path) continue;
    const before = readFileSync(contained(root, file), 'utf8'), after = rewriteLinks(root, before, file, file, ticket.path, destination);
    if (before === after) continue;
    if (file.startsWith('Project Context/')) ownerUpdates.push({ path: file, destination });
    else {
      const permission = navigation.find(n => n.path === file);
      const mutable = permission ? navigationContent(root, before, file, ticket.path, destination) : before;
      if (mutable !== before) patches.push({ path: file, before: digest(before), original: before, content: mutable, source: permission!.source });
      if (mutable !== after) linkUpdates.push({ path: file, destination, expectedRevision: digest(mutable) });
    }
  }
  const journal: Journal = { schemaVersion: 2, id: request.id, requestHash: hash, ticketId: ticket.id, from: ticket.path, to: destination, before: ticket.revision, content, patches, ownerUpdates, linkUpdates, state: 'prepared' };
  save(root, path, journal, null); return journal;
}
function complete(root: string, journal: Journal) {
  const validTicketPath = (path: string) => { const parts = path.split('/'); return parts.length === 3 && parts[0] === boardRoot && statuses.includes(parts[1] as Status) && !!parts[2]?.endsWith('.md') && !path.includes('\\'); };
  const forbiddenPatch = (path: string) => {
    const normalized = path.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '').toLowerCase();
    if (['project context/', '.git/', '.local/', 'node_modules/', 'output/', 'mental_model/'].some(p => normalized.startsWith(p))) return true;
    const parts = path.replaceAll('\\', '/').split('/');
    return parts.some((_, i) => { const candidate = contained(root, parts.slice(0, i + 1).join('/')); return existsSync(candidate) && lstatSync(candidate).isSymbolicLink(); });
  };
  regularDirectory(root, boardRoot);
  for (const status of statuses) regularDirectory(root, `${boardRoot}/${status}`);
  if (![1, 2].includes(journal.schemaVersion) || !validId(journal.ticketId) || !validTicketPath(journal.from) || !validTicketPath(journal.to) || journal.from.split('/').at(-1) !== journal.to.split('/').at(-1) || !Array.isArray(journal.patches) || journal.patches.some(p => forbiddenPatch(p.path) || !p.path.endsWith('.md')) || !['prepared', 'completed'].includes(journal.state)) throw new Error('Unsupported or out-of-scope transition journal; preserve it for reconciliation.');
  safeKey(journal.id);
  if (journal.state === 'completed') return journal;
  if (journal.schemaVersion !== 2) throw new Error('This pending journal uses the old broad link-repair rules. Preserve it and obtain a reviewed reconciliation before any recovery writes.');
  const entry = lifecycle(journal.content);
  if (entry?.id !== journal.id || entry.to !== journal.to.split('/')[1]) throw new Error('The journal lifecycle does not match its recorded destination.');
  for (const patch of journal.patches) {
    if (patch.path !== navigationPath || !patch.source?.trim() || typeof patch.original !== 'string' || digest(patch.original) !== patch.before || entry.evidence.some(e => resolve(root, e.path).toLowerCase() === resolve(root, patch.path).toLowerCase()) || navigationContent(root, patch.original, patch.path, journal.from, journal.to) !== patch.content) throw new Error('An out-of-scope navigation patch cannot be replayed; preserve evidence and reconcile.');
  }
  const after = digest(journal.content), fromHash = revision(root, journal.from), toHash = revision(root, journal.to);
  if (journal.from === journal.to) {
    if (fromHash !== after) replace(root, journal.from, journal.content, journal.before);
  } else {
    if (toHash !== null && toHash !== after || fromHash !== null && fromHash !== journal.before) throw new Error('Transition files changed; preserve both and reconcile before recovery.');
    if (toHash === null) {
      if (fromHash !== journal.before) throw new Error('The source disappeared before the destination was established.');
      writeFileSync(contained(root, journal.to), journal.content, { flag: 'wx', mode: 0o600 });
    }
    if (revision(root, journal.to) !== after) throw new Error('The destination write is incomplete; preserve the journal and reconcile.');
    if (fromHash !== null) { if (revision(root, journal.from) !== journal.before) throw new Error('The source changed during the move.'); unlinkSync(contained(root, journal.from)); }
  }
  for (const patch of journal.patches) if (revision(root, patch.path) !== digest(patch.content)) replace(root, patch.path, patch.content, patch.before);
  journal.state = 'completed'; const path = `.local/board-transitions/${journal.id}.json`; save(root, path, journal, revision(root, path)); return journal;
}
export function prepareTransition(root: string, request: Transition) { return withLock(root, 'qa-board', () => prepare(root, request)); }
export function recoverTransition(root: string, id: string) { return withLock(root, 'qa-board', () => complete(root, load<Journal>(root, `.local/board-transitions/${safeKey(id)}.json`, () => { throw new Error('Unknown transition journal.'); }).value)); }
export function transitionTicket(root: string, request: Transition) { return withLock(root, 'qa-board', () => complete(root, prepare(root, request))); }
export function reviews(root: string, now = new Date().toISOString(), trigger?: string) {
  if (!zonedTime(now)) throw new Error('Use the actual review-check time with timezone.');
  return tickets(root).filter(t => t.status === 'Deferred' && t.lifecycle?.to === 'Deferred' && t.lifecycle.review).flatMap(t => {
    const review = t.lifecycle!.review!;
    if (!(review.dueAt && Date.parse(review.dueAt) <= Date.parse(now)) && !(trigger && review.trigger === trigger)) return [];
    const key = digest(`${t.id}:${t.generation}`), notice = load<{ source: string } | null>(root, `.local/board-review-notices/${key}.json`, () => null).value;
    return [{ ticketId: t.id, path: t.path, generation: t.generation, review, noticeKey: key, reported: !!notice }];
  });
}
export function acknowledgeReview(root: string, id: string, generation: string, source: string) {
  requireText(source, 'Actual review briefing/message reference'); const t = findTicket(root, id);
  if (t.status !== 'Deferred' || t.generation !== generation) throw new Error('This deferred review changed; retain the old notice and inspect current work.');
  const path = `.local/board-review-notices/${digest(`${id}:${generation}`)}.json`;
  if (!revision(root, path)) save(root, path, { ticketId: id, generation, source, at: new Date().toISOString() }, null);
}
