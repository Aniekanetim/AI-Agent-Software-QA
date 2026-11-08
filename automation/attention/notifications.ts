import { resolve } from 'node:path';
import { settings, verifyNotifier, type Recipient } from './preferences.js';
import { backlog, groups, time, type Item, type Group } from './blockers.js';
import { load, save, digest, requireText, assertNonsecret, withLock, type Evidence } from '../shared/store.js';
import { verifyImmutable } from './evidence.js';

export const statePath = '.local/attention/delivery-state.json';
type Member = Pick<Item, 'key' | 'fingerprint' | 'ticketId' | 'generation'>;
export interface Delivery {
  id: string; recipient: string; notifier: string; channel: string; profile: string; createdAt: string;
  state: 'reserved' | 'presenting' | 'presented' | 'delivered' | 'notSent' | 'uncertain'; members: Member[];
  groups: Group[]; message: string; outcome?: { at: string; source: string; evidence: Evidence[] };
  observations?: { state: 'presented' | 'delivered' | 'notSent' | 'uncertain'; at: string; source: string; evidence: Evidence[] }[];
}
interface Control { id: string; requestHash: string; recipient: string; at: string; kind: 'acknowledge' | 'snooze'; until: string | null; members: Member[]; source: string; evidence: Evidence[] }
interface State { schemaVersion: 1; deliveries: Delivery[]; controls: Control[] }
function read(root: string) {
  const r = load<State>(root, statePath, () => ({ schemaVersion: 1, deliveries: [], controls: [] }));
  if (r.value.schemaVersion !== 1 || !Array.isArray(r.value.deliveries) || !Array.isArray(r.value.controls) || r.value.deliveries.some(d => !['reserved', 'presenting', 'presented', 'delivered', 'notSent', 'uncertain'].includes(d.state) || !Array.isArray(d.members)) || r.value.controls.some(c => !['acknowledge', 'snooze'].includes(c.kind) || !Array.isArray(c.members)) || new Set(r.value.deliveries.map(d => d.id)).size !== r.value.deliveries.length || new Set(r.value.controls.map(c => c.id)).size !== r.value.controls.length) throw new Error('Preserve notification delivery history and reconcile it; unreadable state must not restart delivery.');
  return r;
}
export function pendingPresentation(root: string) { return read(root).value.deliveries.some(delivery => ['presenting', 'uncertain'].includes(delivery.state)); }
export function status(root: string) { return { preferences: settings(root), unresolved: read(root).value.deliveries.filter(d => ['reserved', 'presenting', 'uncertain'].includes(d.state)), activation: 'Preferences do not create a schedule or establish actual message delivery.' }; }
const member = (i: Item): Member => ({ key: i.key, fingerprint: i.fingerprint, ticketId: i.ticketId, generation: i.generation });
const matches = (a: Member, b: Member) => a.key === b.key && a.fingerprint === b.fingerprint && a.generation === b.generation && a.ticketId === b.ticketId;
const presentationTime = (d: Delivery) => d.observations?.find(o => ['presented', 'delivered'].includes(o.state))?.at ?? d.outcome?.at ?? d.createdAt;
function quiet(r: Recipient, at: string) {
  if (!r.quietHours) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: r.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
  const local = `${parts.find(p => p.type === 'hour')!.value}:${parts.find(p => p.type === 'minute')!.value}`;
  const { start, end } = r.quietHours;
  return start < end ? local >= start && local < end : local >= start || local < end;
}
function lastPresented(state: State, recipient: string, item: Member) {
  return state.deliveries.filter(d => d.recipient === recipient && ['presented', 'delivered'].includes(d.state) && d.members.some(m => matches(m, item))).sort((a, b) => time(presentationTime(b)) - time(presentationTime(a)))[0];
}
function due(state: State, recipient: Recipient, item: Item, at: string) {
  const target = member(item), now = time(at);
  const control = state.controls.filter(c => c.recipient === recipient.id && c.members.some(m => matches(m, target))).sort((a, b) => time(a.at) - time(b.at)).at(-1);
  const presented = lastPresented(state, recipient.id, target), shownAt = presented ? time(presentationTime(presented)) : null;
  if (control) {
    if (control.until === null || time(control.until) > now) return null;
    if (shownAt === null || shownAt < time(control.until)) return 'agreedReminder' as const;
  }
  if (shownAt === null) return state.deliveries.some(d => d.recipient === recipient.id && ['presented', 'delivered'].includes(d.state) && d.members.some(m => m.key === target.key)) ? 'changed' as const : 'new' as const;
  return now - shownAt >= recipient.reminderMinutes * 60_000 ? 'reminderDue' as const : null;
}
function message(root: string, selected: Group[], count: number, taskCount: number, reasons: Record<string, string>) {
  const lines = [`${taskCount} ${taskCount === 1 ? 'task needs' : 'tasks need'} your action across ${count} ${count === 1 ? 'action group' : 'action groups'}. Showing ${selected.length}.`, ''];
  for (const [index, group] of selected.entries()) {
    const labels: Record<string, string> = { new: 'Newly tracked', changed: 'Changed action', reminderDue: 'Reminder due', agreedReminder: 'Requested reminder' };
    lines.push(`${index + 1}. ${group.action}`, `   Notice: ${[...new Set(group.items.map(i => labels[reasons[i.key]!]))].join('; ')}.`, `   Context: ${group.context}. Priority: ${group.priority}${group.dueAt ? `; due ${group.dueAt}` : ''}.`, `   Impact: ${[...new Set(group.items.map(i => i.blocker.impact))].join('; ')}`, `   Blocked by: ${[...new Set(group.items.map(i => i.blocker.reason))].join('; ')}`, `   Affected tasks: ${group.items.map(i => `[${i.key}](<${resolve(root, i.path).replaceAll('\\', '/') }>)`).join(', ')}`, '');
  }
  lines.push('View all actions, show the next group, or choose an action to work through. An acknowledgement does not approve testing or resolve a blocker.');
  return lines.join('\n');
}
function prepare(root: string, input: { recipient: string; notifier: string; at?: string }, claimedId?: string) {
  const at = input.at ?? new Date().toISOString(); time(at);
  const empty = { at, selected: [] as Group[], dueGroups: 0, tasksNeedingRecipient: 0, totalBlockedTasks: 0, diagnostics: [] as { ticketId: string | null; reason: string }[], profile: null as string | null, message: null as string | null };
  try {
    const profile = settings(root);
    if (!profile.value?.enabled) return { ...empty, state: 'disabled', reason: 'Blocker notifications are not enabled; existing work is unchanged.' };
    verifyNotifier(root, profile.value, input.notifier);
    const recipient = profile.value.recipients!.find(r => r.id === input.recipient);
    if (!recipient) throw new Error('Select an explicitly configured notification recipient.');
    const state = read(root).value, view = backlog(root, recipient.id);
    if (claimedId) state.deliveries = state.deliveries.filter(d => d.id !== claimedId);
    for (const d of state.deliveries.filter(d => d.recipient === recipient.id && d.outcome)) {
      verifyImmutable(root, d.outcome!.evidence, [statePath]);
      for (const o of d.observations ?? []) verifyImmutable(root, o.evidence, [statePath]);
    }
    for (const c of state.controls.filter(c => c.recipient === recipient.id)) verifyImmutable(root, c.evidence, [statePath]);
    const base = { ...empty, profile: profile.revision, totalBlockedTasks: view.totalBlockedTasks, tasksNeedingRecipient: view.tasksNeedingRecipient, diagnostics: view.diagnostics };
    if (view.diagnostics.some(d => d.ticketId === null)) return { ...base, state: 'needsSetup', reason: 'The canonical board is unavailable or has an incomplete move. Reconcile it before assessing notification eligibility; no empty-backlog claim is made.' };
    if (state.deliveries.some(d => d.recipient === recipient.id && ['reserved', 'presenting', 'uncertain'].includes(d.state))) return { ...base, state: 'pendingDelivery', reason: 'Observe the earlier delivery outcome before sending another message to this recipient.' };
    const dueItems = view.items.filter(i => due(state, recipient, i, at));
    const urgent = (i: Item) => (profile.value!.urgentPriorities ?? []).some(p => p === i.blocker.priority);
    let eligible = dueItems;
    if (quiet(recipient, at)) {
      eligible = profile.value.urgentDuringQuietHours ? eligible.filter(urgent) : [];
      if (!eligible.length) return { ...base, state: 'quiet', reason: 'The configured quiet hours are active.' };
    }
    const attempts = state.deliveries.filter(d => d.recipient === recipient.id && d.state !== 'reserved');
    const latest = attempts.sort((a, b) => time(presentationTime(b)) - time(presentationTime(a)))[0];
    if (latest && time(at) - time(presentationTime(latest)) < recipient.cooldownMinutes * 60_000) eligible = eligible.filter(i => urgent(i) || due(state, recipient, i, at) === 'agreedReminder');
    if (!eligible.length) return { ...base, state: dueItems.length ? 'paced' : 'noAction', reason: dueItems.length ? 'The recipient notification interval has not elapsed.' : 'No new, changed or reminder-due action needs a notification.' };
    const ready = groups(eligible);
    // Unreported and oldest-due actions precede repeated notices of the same priority.
    const last = (g: Group) => Math.min(...g.items.map(i => { const d = lastPresented(state, recipient.id, member(i)); return d ? time(presentationTime(d)) : -Infinity; }));
    const order = new Map(ready.map((g, i) => [g.id, i]));
    ready.sort((a, b) => {
      const priority = ['P0', 'P1', 'P2', 'P3', 'Unknown'].indexOf(a.priority) - ['P0', 'P1', 'P2', 'P3', 'Unknown'].indexOf(b.priority);
      const recency = last(a) - last(b);
      return priority || (Number.isNaN(recency) ? 0 : recency) || order.get(a.id)! - order.get(b.id)!;
    });
    const selected = ready.slice(0, recipient.mode === 'individual' ? 1 : recipient.batchSize);
    if (!selected.length) return { ...base, state: 'noAction', reason: 'These records have no routed human action; inspect ownership in the full backlog.' };
    const reasons = Object.fromEntries(selected.flatMap(g => g.items.map(i => [i.key, due(state, recipient, i, at)!])));
    const rendered = message(root, selected, view.groups.length, view.tasksNeedingRecipient, reasons) + (view.diagnostics.length ? `\n${view.diagnostics.length} source issue(s) need review. Counts cover readable, current records only.` : '');
    return { ...base, state: 'ready', selected, dueGroups: ready.length, message: rendered, reason: 'Prepared only; actual host presentation and receipt remain separate.' };
  } catch (error) { return { ...empty, state: 'needsSetup', reason: String(error) }; }
}
export function preview(root: string, input: { recipient: string; notifier: string; at?: string }) { return prepare(root, input); }
export function reserve(root: string, input: { id: string; recipient: string; notifier: string; at?: string }) {
  requireText(input.id, 'Unique delivery request ID');
  const first = preview(root, input); if (first.state !== 'ready') return first;
  return withLock(root, 'attention', () => {
    const record = read(root), existing = record.value.deliveries.find(d => d.id === input.id);
    if (existing) throw new Error('This delivery ID already exists; inspect its original outcome instead of sending again.');
    const current = preview(root, input); if (current.state !== 'ready') return current;
    const p = settings(root).value!, recipient = p.recipients!.find(r => r.id === input.recipient)!;
    const delivery: Delivery = { id: input.id, recipient: recipient.id, notifier: input.notifier, channel: recipient.channelReference, profile: current.profile!, createdAt: current.at, state: 'reserved', groups: current.selected, members: current.selected.flatMap(g => g.items.map(member)), message: current.message! };
    record.value.deliveries.push(delivery); save(root, statePath, record.value, record.revision);
    return { state: 'reserved', delivery, instruction: 'Revalidate before actual host presentation. CLI JSON is not a notification or proof of delivery.' };
  });
}
export function beforePresentation(root: string, id: string, notifier: string, at?: string) {
  return withLock(root, 'attention', () => {
    const record = read(root), delivery = record.value.deliveries.find(d => d.id === id);
    if (!delivery || delivery.state !== 'reserved' || delivery.notifier !== notifier) throw new Error('Use the original unpresented delivery reservation; an existing presentation claim must not be replayed.');
    const p = settings(root); if (p.revision !== delivery.profile || !p.value?.enabled) throw new Error('Notification preferences changed; do not present this stale message.');
    verifyNotifier(root, p.value, notifier);
    const current = backlog(root, delivery.recipient).items;
    if (delivery.members.some(m => !current.some(i => matches(m, member(i))))) throw new Error('The blocker, owner or lifecycle changed; do not present this stale action request.');
    const eligible = prepare(root, { recipient: delivery.recipient, notifier, at }, id);
    if (eligible.state !== 'ready' || eligible.message !== delivery.message) throw new Error('Reminder eligibility or summary changed; do not present this stale message. Inspect acknowledgement, quiet hours, pacing and the current backlog.');
    delivery.state = 'presenting'; save(root, statePath, record.value, record.revision); return delivery;
  });
}
export function outcome(root: string, input: { id: string; notifier: string; channel: string; state: 'presented' | 'delivered' | 'notSent' | 'uncertain'; source: string; evidence: Evidence[]; at?: string }) {
  requireText(input.source, 'Actual presentation/delivery observation'); assertNonsecret(input);
  if (!['presented', 'delivered', 'notSent', 'uncertain'].includes(input.state) || !input.evidence?.length) throw new Error('Retain actual delivery evidence, or an explicit uncertain outcome.');
  verifyImmutable(root, input.evidence, [statePath]);
  return withLock(root, 'attention', () => {
    const record = read(root), d = record.value.deliveries.find(d => d.id === input.id), at = input.at ?? new Date().toISOString();
    if (!d || d.notifier !== input.notifier || d.channel !== input.channel || time(at) < time(d.createdAt)) throw new Error('Match the original recipient channel, notifier and attempt time.');
    if (!['reserved', 'presenting', 'uncertain'].includes(d.state) && !(d.state === 'presented' && input.state === 'delivered')) {
      if (d.state === input.state && d.outcome?.source === input.source) return d;
      throw new Error('Preserve the earlier terminal delivery observation; do not replace it.');
    }
    if (d.outcome && time(at) < time(d.outcome.at)) throw new Error('A later delivery observation cannot precede its recorded presentation.');
    (d.observations ??= []).push({ state: input.state, at, source: input.source, evidence: input.evidence });
    d.state = input.state; d.outcome = { at, source: input.source, evidence: input.evidence }; save(root, statePath, record.value, record.revision); return d;
  });
}
export async function deliver(root: string, id: string, notifier: string, host: { channel: string; present: (message: string, requestId: string) => Promise<{ state: 'presented' | 'delivered' | 'notSent'; source: string; evidence: Evidence[] }> }) {
  const d = beforePresentation(root, id, notifier);
  if (host.channel !== d.channel) throw new Error('Use the selected host conversation; no fallback channel is authorized.');
  try { const result = await host.present(d.message, d.id); return outcome(root, { ...result, id, notifier, channel: d.channel }); }
  catch (error) {
    // A thrown adapter call may have sent the message. Retain the reservation as uncertain.
    withLock(root, 'attention', () => { const r = read(root), found = r.value.deliveries.find(v => v.id === id)!; if (['reserved', 'presenting'].includes(found.state)) { found.state = 'uncertain'; save(root, statePath, r.value, r.revision); } });
    throw new Error('Notification presentation is uncertain. Inspect the actual host message before any resend; independent QA work can continue.', { cause: error });
  }
}
export function respond(root: string, input: { id: string; recipient: string; members: Member[]; kind: 'acknowledge' | 'snooze'; until: string | null; source: string; evidence: Evidence[]; at?: string }) {
  assertNonsecret(input); requireText(input.id); requireText(input.source, 'Actual recipient response');
  const at = input.at ?? new Date().toISOString(); time(at);
  if (!['acknowledge', 'snooze'].includes(input.kind) || !input.members?.length || !input.evidence?.length || input.kind === 'snooze' && !input.until || input.until && time(input.until) <= time(at)) throw new Error('Identify explicit items and a future reminder time for snoozing.');
  verifyImmutable(root, input.evidence, [statePath]);
  return withLock(root, 'attention', () => {
    const record = read(root), requestHash = digest(JSON.stringify(input)), previous = record.value.controls.find(c => c.id === input.id);
    if (previous) { if (previous.requestHash !== requestHash) throw new Error('This response ID has different content.'); return previous; }
    const current = backlog(root, input.recipient).items;
    if (new Set(input.members.map(m => m.key)).size !== input.members.length || input.members.some(m => !current.some(i => matches(m, member(i))))) throw new Error('Only acknowledge current blockers explicitly covered by this recipient response.');
    const control: Control = { ...input, at, requestHash }; record.value.controls.push(control); save(root, statePath, record.value, record.revision); return control;
  });
}
