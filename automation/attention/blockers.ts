import { readFileSync } from 'node:fs';
import { tickets, findTicket, boardRoot, type Ticket } from '../board/board.js';
import { digest, contained, replace, requireText, assertNonsecret, verifyEvidence, withLock, type Evidence } from '../shared/store.js';
import { verifyImmutable } from './evidence.js';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'Unknown';
export interface Blocker {
  id: string; state: 'open' | 'resolved' | 'withdrawn'; owner: string | null;
  reason: string; action: string | null; impact: string; context: string; dependencyId: string | null;
  priority: Priority; dueAt: string | null; originalQuestion: string; source: string; evidence: Evidence[];
  verification?: { source: string; evidence: Evidence[] };
}
export interface BlockerEvent extends Blocker { schemaVersion: 1; eventId: string; ticketId: string; generation: string; recordedAt: string }
export interface Item { key: string; fingerprint: string; ticketId: string; path: string; generation: string; firstRaisedAt: string; blocker: BlockerEvent }
export const time = (value: string) => { if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Use an ISO date/time with timezone.'); return Date.parse(value); };
export const rank = (value: Priority) => ['P0', 'P1', 'P2', 'P3', 'Unknown'].indexOf(value);
function parse(text: string) {
  const events: BlockerEvent[] = []; let fence: { char: string; size: number; capture: boolean; lines: string[] } | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!fence) { const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/); if (match) fence = { char: match[1]![0]!, size: match[1]!.length, capture: match[2]!.trim() === 'qa-blocker', lines: [] }; }
    else if (new RegExp(`^ {0,3}${fence.char}{${fence.size},}\\s*$`).test(line)) { if (fence.capture) { const event = JSON.parse(fence.lines.join('\n')) as BlockerEvent; validate(event); events.push(event); } fence = null; }
    else if (fence.capture) fence.lines.push(line);
  }
  if (fence?.capture) throw new Error('Reconcile the unfinished blocker record on this ticket.');
  return { events, unfinishedExample: !!fence };
}
function validate(b: BlockerEvent) {
  assertNonsecret(b);
  if (b.schemaVersion !== 1 || !['open', 'resolved', 'withdrawn'].includes(b.state) || !['P0', 'P1', 'P2', 'P3', 'Unknown'].includes(b.priority) || !Array.isArray(b.evidence) || !b.evidence.length) throw new Error('Use a complete version 1 blocker record with actual supporting evidence.');
  for (const v of [b.id, b.eventId, b.ticketId, b.generation, b.reason, b.impact, b.context, b.originalQuestion, b.source]) requireText(v);
  for (const v of [b.owner, b.action, b.dependencyId]) if (v !== null) requireText(v);
  time(b.recordedAt); if (b.dueAt !== null) time(b.dueAt);
  if (b.state === 'resolved' && (!b.verification?.source?.trim() || !b.verification.evidence?.length)) throw new Error('Resolution requires actual prerequisite/decision verification; acknowledgement alone is not resolution.');
}
const fingerprint = (e: BlockerEvent) => digest(JSON.stringify([
  e.ticketId, e.id, e.generation, e.state, e.owner, e.reason, e.action, e.impact, e.context,
  e.dependencyId, e.priority, e.dueAt, e.originalQuestion,
  e.evidence.map(ref => [ref.path, ref.sha256, ref.pointer ?? null]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  e.verification ?? null,
]));
export function recordBlocker(root: string, request: { eventId: string; ticketId: string; expectedRevision: string; blocker: Blocker; at?: string }) {
  return withLock(root, 'qa-board', () => {
    const ticket = findTicket(root, request.ticketId);
    if (ticket.issues.length) throw new Error('Reconcile this ticket lifecycle before recording a blocker.');
    const parsed = parse(ticket.text), at = request.at ?? new Date().toISOString(); time(at);
    const event: BlockerEvent = { ...request.blocker, schemaVersion: 1, eventId: request.eventId, ticketId: ticket.id, generation: ticket.generation, recordedAt: at }; validate(event);
    const previous = parsed.events.find(e => e.eventId === event.eventId);
    if (previous) { if (fingerprint(previous) !== fingerprint(event) || previous.source !== event.source) throw new Error('This blocker event ID has different content.'); return previous; }
    if (ticket.revision !== request.expectedRevision || parsed.unfinishedExample) throw new Error('Reload the current ticket and close its unfinished example before appending a blocker outside code samples.');
    if (parsed.events.some(e => e.id === event.id && time(e.recordedAt) > time(event.recordedAt))) throw new Error('This blocker update predates its current recorded state. Retain the historical input and evidence without replacing the newer state.');
    verifyImmutable(root, [...event.evidence, ...(event.verification?.evidence ?? [])], [ticket.path, `${boardRoot}/README.md`]);
    replace(root, ticket.path, ticket.text + `\n### Blocker ${event.id} — ${at}\n\n\`\`\`qa-blocker\n${JSON.stringify(event, null, 2)}\n\`\`\`\n`, ticket.revision);
    return event;
  });
}
export function scan(root: string) {
  const items: Item[] = [], diagnostics: { ticketId: string | null; reason: string }[] = [];
  let all: Ticket[];
  try { all = tickets(root); } catch (error) { return { items, diagnostics: [{ ticketId: null, reason: String(error) }], inactiveCount: 0 }; }
  let inactiveCount = 0;
  for (const ticket of all) {
    try {
      if (ticket.issues.length) throw new Error(ticket.issues.join(' '));
      const events = parse(ticket.text).events, last = new Map<string, BlockerEvent>(), first = new Map<string, string>();
      if (!events.length) {
        const waiting = ticket.text.match(/^\| Waiting on \|\s*(.*?)\s*\|\s*$/m)?.[1]?.trim();
        if (waiting && !/^(none\.?|-|not recorded|required sources or approval only where missing)$/i.test(waiting)) diagnostics.push({ ticketId: ticket.id, reason: 'Inspect the existing waiting reason and original responses before recording a routed blocker; do not infer ownership or resend its question.' });
      }
      for (const e of events) {
        if (e.ticketId !== ticket.id) throw new Error('The blocker belongs to another ticket.');
        if (!first.has(e.id) || time(e.recordedAt) < time(first.get(e.id)!)) first.set(e.id, e.recordedAt);
        const previous = last.get(e.id);
        if (!previous || time(e.recordedAt) >= time(previous.recordedAt)) last.set(e.id, e);
      }
      for (const e of last.values()) {
        if (e.state !== 'open') continue;
        if (!['Ready for QA', 'Retest', 'Dev Todo', 'Rework'].includes(ticket.status)) { inactiveCount++; continue; }
        if (e.generation !== ticket.generation) { diagnostics.push({ ticketId: ticket.id, reason: `Revalidate blocker ${e.id} after the lifecycle change.` }); continue; }
        try { e.evidence.forEach(ref => verifyEvidence(root, ref)); }
        catch { diagnostics.push({ ticketId: ticket.id, reason: `Refresh changed or missing evidence for blocker ${e.id}.` }); continue; }
        items.push({ key: `${ticket.id}/${e.id}`, fingerprint: fingerprint(e), ticketId: ticket.id, path: ticket.path, generation: ticket.generation, firstRaisedAt: first.get(e.id)!, blocker: e });
      }
    } catch (error) { diagnostics.push({ ticketId: ticket.id, reason: String(error) }); }
  }
  return { items, diagnostics, inactiveCount };
}
export interface Group { id: string; owner: string; action: string; context: string; priority: Priority; dueAt: string | null; oldest: string; items: Item[] }
export function groups(items: Item[]) {
  const grouped = new Map<string, Group>();
  for (const item of items) {
    const b = item.blocker; if (!b.owner || !b.action) continue;
    const id = digest(JSON.stringify([b.owner, b.context, b.action, b.dependencyId ?? item.key]));
    const group = grouped.get(id) ?? { id, owner: b.owner, action: b.action, context: b.context, priority: b.priority, dueAt: b.dueAt, oldest: item.firstRaisedAt, items: [] };
    group.items.push(item);
    if (rank(b.priority) < rank(group.priority)) group.priority = b.priority;
    if (b.dueAt && (!group.dueAt || time(b.dueAt) < time(group.dueAt))) group.dueAt = b.dueAt;
    if (time(item.firstRaisedAt) < time(group.oldest)) group.oldest = item.firstRaisedAt;
    grouped.set(id, group);
  }
  return [...grouped.values()].sort((a, b) => rank(a.priority) - rank(b.priority) || (a.dueAt ? time(a.dueAt) : Infinity) - (b.dueAt ? time(b.dueAt) : Infinity) || b.items.length - a.items.length || time(a.oldest) - time(b.oldest) || a.id.localeCompare(b.id));
}
export function backlog(root: string, owner?: string) {
  const observed = scan(root), relevant = observed.items.filter(i => !owner || i.blocker.owner === owner);
  return { ...observed, items: relevant, groups: groups(relevant), totalBlockedTasks: new Set(observed.items.map(i => i.ticketId)).size, tasksNeedingRecipient: new Set(relevant.filter(i => i.blocker.owner && i.blocker.action).map(i => i.ticketId)).size, unassigned: observed.items.filter(i => i.blocker.action && !i.blocker.owner).map(i => i.key) };
}
export function page(root: string, input: { recipient: string; offset?: number; limit?: number; snapshot?: string; all?: boolean }) {
  const view = backlog(root, input.recipient), offset = input.offset ?? 0, limit = input.limit ?? 3;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Choose a nonnegative offset and 1–100 action groups per page.');
  const snapshot = digest(JSON.stringify(view.items.map(i => [i.key, i.fingerprint]).sort((a, b) => a[0]!.localeCompare(b[0]!))));
  if (input.snapshot && input.snapshot !== snapshot) throw new Error('The backlog changed; refresh it before continuing the earlier page.');
  const selected = input.all ? view.groups : view.groups.slice(offset, offset + limit);
  return { snapshot, totalBlockedTasks: view.totalBlockedTasks, tasksNeedingRecipient: view.tasksNeedingRecipient, totalGroups: view.groups.length, selected, nextOffset: !input.all && offset + selected.length < view.groups.length ? offset + selected.length : null, diagnostics: view.diagnostics, instruction: 'A read-only view is not a notification, acknowledgement, approval or task transition.' };
}
export function indexText(root: string) {
  const view = backlog(root), esc = (s: string) => s.replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
  return ['### Needs your action', '', `${view.totalBlockedTasks} active tasks have readable, current blocker records. Notification acknowledgement is separate from resolution.`, '', '| Ticket / blocker | Needed from | Required action |', '| --- | --- | --- |', ...view.items.map(i => `| [${esc(i.key)}](${i.path.split('/').slice(1).map(encodeURIComponent).join('/')}) | ${esc(i.blocker.owner ?? 'Owner not assigned')} | ${esc(i.blocker.action ?? 'Waiting on a dependency; no current human action')} |`), ...(view.diagnostics.length ? ['', `Coverage limitation: ${view.diagnostics.length} source/lifecycle issue(s) need review; this index is not a complete clean-state assertion.`] : [])].join('\n');
}
export function updateIndex(root: string, input: { expectedRevision: string; source: string }) {
  requireText(input.source, 'Actual mutable-index maintenance authorization');
  return withLock(root, 'qa-board', () => {
    if (scan(root).diagnostics.some(d => d.ticketId === null)) throw new Error('Reconcile the unavailable or incomplete board before replacing its shared index.');
    const path = `${boardRoot}/README.md`, text = readFileSync(contained(root, path), 'utf8');
    const start = '<!-- qa-attention-index:start -->', end = '<!-- qa-attention-index:end -->';
    if (text.split(start).length !== 2 || text.split(end).length !== 2 || text.indexOf(end) < text.indexOf(start)) throw new Error('Maintain one explicit mutable attention-index block on the board README.');
    const visible: string[] = []; let fence: { char: string; size: number } | null = null;
    for (const line of text.split(/\r?\n/)) {
      if (fence) { if (new RegExp(`^ {0,3}${fence.char}{${fence.size},}\\s*$`).test(line)) fence = null; continue; }
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})/); if (opening) { fence = { char: opening[1]![0]!, size: opening[1]!.length }; continue; }
      if ([start, end].includes(line)) visible.push(line);
    }
    if (visible.join('\n') !== `${start}\n${end}`) throw new Error('Attention-index markers must be standalone prose outside examples.');
    verifyImmutable(root, scan(root).items.flatMap(i => i.blocker.evidence), [path]);
    const content = text.slice(0, text.indexOf(start) + start.length) + '\n\n' + indexText(root) + '\n\n' + text.slice(text.indexOf(end));
    replace(root, path, content, input.expectedRevision); return { path, source: input.source };
  });
}
