import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as store from '../shared/store.js';
import * as board from '../board/board.js';
import * as prefs from '../attention/preferences.js';
import * as records from '../attention/blockers.js';
import * as notices from '../attention/notifications.js';
import * as menu from '../settings/menu.js';
import { bindHarness } from '../tools/runtime.js';
import { emptyState, statePath, readiness, readState } from '../onboarding/state.js';

const at = '2026-01-01T08:00:00Z';
const later = (minutes: number) => new Date(Date.parse(at) + minutes * 60_000).toISOString();
function put(root: string, path: string, value: unknown) { const full = store.contained(root, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, typeof value === 'string' ? value : JSON.stringify(value)); return store.evidence(root, path); }
function files(root: string): string[] { return readdirSync(root, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(resolve(root, e.name)) : [resolve(root, e.name)]).sort(); }
function fixture(enabled = true) {
  const root = resolve('.local/attention-fixtures', randomUUID()); mkdirSync(root, { recursive: true }); board.upgradeBoard(root, 'Synthetic package fixture only');
  const harness = bindHarness(root, { id: 'synthetic-host', version: '1', profile: 'synthetic', executionContext: 'interactive', source: 'Synthetic host fixture, not actual product access' });
  const evidence = put(root, '.local/source.json', { synthetic: true, source: 'Synthetic conversation/access/owner evidence only' });
  const recipient: prefs.Recipient = { id: 'qa', label: 'Synthetic QA', channelType: 'hostConversation', channelReference: 'synthetic:chat', timezone: 'UTC', mode: 'digest', batchSize: 3, reminderMinutes: 60, cooldownMinutes: 60, quietHours: null };
  let value: prefs.Preferences = { schemaVersion: 1, enabled: true, source: 'Synthetic preferences; no live notification authorization', evidence: [evidence], notifier: { id: 'synthetic-notifier', machine: hostname(), harness }, recipients: [recipient] };
  const configure = (changes: Partial<prefs.Preferences> = {}) => { value = { ...value, ...changes }; prefs.savePreferences(root, { id: randomUUID(), source: 'Synthetic actual preference fixture', evidence: [evidence], value, expectedRevision: prefs.settings(root).revision }); return value; };
  if (enabled) configure();
  const add = (number: number, changes: Partial<records.Blocker> = {}) => {
    const id = `QA-${String(number).padStart(3, '0')}`, path = `${board.boardRoot}/Ready for QA/${id}.md`;
    put(root, path, `# ${id}: Synthetic feature\n\nOriginal question Q-001: synthetic missing input.\n`);
    const blocker: records.Blocker = { id: 'Q-001', state: 'open', owner: 'qa', reason: 'Synthetic missing role', action: 'Provide the synthetic account role', impact: 'Synthetic selected check cannot proceed', context: 'Synthetic staging; tester role', dependencyId: null, priority: 'P2', dueAt: null, originalQuestion: 'Q-001', source: 'Synthetic observed dependency', evidence: [evidence], ...changes };
    records.recordBlocker(root, { eventId: randomUUID(), ticketId: id, expectedRevision: board.findTicket(root, id).revision, blocker, at: new Date(Date.parse(at) - (100 - number) * 1000).toISOString() });
    return { id, path, blocker };
  };
  const preview = (now = at) => notices.preview(root, { recipient: 'qa', notifier: 'synthetic-notifier', at: now });
  const reserve = (now = at) => { const result = notices.reserve(root, { id: randomUUID(), recipient: 'qa', notifier: 'synthetic-notifier', at: now }); assert('delivery' in result, JSON.stringify(result)); return result.delivery; };
  const presented = (delivery: notices.Delivery, now = later(1)) => notices.outcome(root, { id: delivery.id, notifier: delivery.notifier, channel: delivery.channel, state: 'presented', source: `Synthetic message ${delivery.id}`, evidence: [evidence], at: now });
  return { root, evidence, recipient, value, configure, add, preview, reserve, presented };
}

test('unconfigured notifications preserve older boards and create no files', () => {
  const root = resolve('.local/attention-fixtures', randomUUID()); mkdirSync(root, { recursive: true });
  mkdirSync(resolve(root, 'QA task management Board/Ready for QA'), { recursive: true });
  const before = files(root); assert.equal(notices.preview(root, { recipient: 'unknown', notifier: 'unknown', at }).state, 'disabled');
  assert.equal(notices.reserve(root, { id: 'no-op', recipient: 'unknown', notifier: 'unknown', at }).state, 'disabled'); assert.deepEqual(files(root), before);
});
test('configured empty boards remain no-op without delivery records', () => {
  const f = fixture(), before = files(f.root); assert.equal(f.preview().state, 'noAction'); assert.equal(notices.reserve(f.root, { id: 'empty', recipient: 'qa', notifier: 'synthetic-notifier', at }).state, 'noAction'); assert.deepEqual(files(f.root), before);
});
test('25 distinct blocked tasks produce three actions and preserve all hidden items', () => {
  const f = fixture(); for (let n = 1; n <= 25; n++) f.add(n);
  const view = f.preview(); assert.equal(view.state, 'ready'); assert.equal(view.totalBlockedTasks, 25); assert.equal(view.tasksNeedingRecipient, 25); assert.equal(view.selected.length, 3); assert.equal(view.dueGroups, 25);
  const d = f.reserve(); assert.equal(d.members.length, 3); f.presented(d);
  assert.equal(f.preview(later(2)).state, 'paced');
  const full = records.backlog(f.root, 'qa'); assert.equal(full.groups.length, 25); assert.equal(full.items.length, 25);
  assert.equal(notices.status(f.root).unresolved.length, 0);
  const next = f.preview(later(62)); assert.equal(next.state, 'ready'); assert(next.selected.every(g => g.items.every(i => !d.members.some(m => m.key === i.key))));
});
test('real shared dependencies group tasks; role, action and owner differences stay separate', () => {
  const f = fixture(); for (let n = 1; n <= 12; n++) f.add(n, { dependencyId: 'access-1' });
  f.add(13, { dependencyId: 'access-1', context: 'Synthetic production; different role' });
  f.add(14, { dependencyId: 'access-1', action: 'Clarify the synthetic role' }); f.add(15, { dependencyId: 'access-1', owner: 'dev' });
  const full = records.backlog(f.root); assert.equal(full.groups.length, 4); assert.equal(f.preview().selected.find(g => g.items.length === 12)?.items.length, 12); assert.equal(f.preview().tasksNeedingRecipient, 14);
});
test('one task can have multiple blockers; counts do not multiply task totals', () => {
  const f = fixture(), task = f.add(1);
  records.recordBlocker(f.root, { eventId: randomUUID(), ticketId: task.id, expectedRevision: board.findTicket(f.root, task.id).revision, blocker: { ...task.blocker, id: 'Q-002', action: 'Confirm the synthetic requirement', originalQuestion: 'Q-002' }, at });
  assert.equal(f.preview().totalBlockedTasks, 1); assert.equal(f.preview().dueGroups, 2);
});
test('unrouted blockers and dependencies stay visible without asking the wrong person', () => {
  const f = fixture(); f.add(1, { owner: null }); f.add(2, { owner: 'dev' }); f.add(3, { action: null });
  assert.equal(f.preview().state, 'noAction'); assert.equal(records.backlog(f.root).items.length, 3); assert.equal(records.backlog(f.root).unassigned.length, 1);
});
test('preview and full-index generation do not mutate tickets or evidence', () => {
  const f = fixture(), task = f.add(1), ticket = store.revision(f.root, task.path), evidence = store.revision(f.root, f.evidence.path), before = files(f.root);
  f.preview(); records.indexText(f.root); records.backlog(f.root, 'qa');
  assert.equal(store.revision(f.root, task.path), ticket); assert.equal(store.revision(f.root, f.evidence.path), evidence); assert.deepEqual(files(f.root), before);
});
test('individual notification preference selects one action without hiding the backlog', () => {
  const f = fixture(); f.configure({ recipients: [{ ...f.recipient, mode: 'individual' }] }); for (let n = 1; n <= 4; n++) f.add(n);
  assert.equal(f.preview().selected.length, 1); assert.equal(f.preview().dueGroups, 4);
});
test('quiet hours follow the selected timezone, including midnight boundaries', () => {
  const f = fixture(); f.add(1); f.configure({ recipients: [{ ...f.recipient, timezone: 'Africa/Lagos', quietHours: { start: '22:00', end: '08:00' } }] });
  assert.equal(f.preview('2026-01-01T21:00:00Z').state, 'quiet'); assert.equal(f.preview('2026-01-02T06:59:00Z').state, 'quiet'); assert.equal(f.preview('2026-01-02T07:00:00Z').state, 'ready');
});
test('urgent pacing and quiet-hour exceptions require explicit policy', () => {
  const f = fixture(); f.add(1, { priority: 'P0' }); const d = f.reserve(); f.presented(d);
  f.add(2, { priority: 'P0' }); assert.equal(f.preview(later(2)).state, 'paced');
  f.configure({ urgentPriorities: ['P0'] }); assert.equal(f.preview(later(2)).state, 'ready');
  f.configure({ recipients: [{ ...f.recipient, quietHours: { start: '07:00', end: '10:00' } }] }); assert.equal(f.preview().state, 'quiet');
  f.configure({ urgentDuringQuietHours: true }); assert.equal(f.preview().state, 'ready');
});
test('reserved and uncertain presentations prevent duplicate sends across check-ins', async () => {
  const f = fixture(); f.add(1); const d = f.reserve(); assert.equal(f.preview().state, 'pendingDelivery'); let sends = 0;
  await assert.rejects(notices.deliver(f.root, d.id, d.notifier, { channel: d.channel, present: async () => { sends++; throw new Error('Synthetic transport lost the response'); } }), /uncertain/);
  assert.equal(f.preview(later(500)).state, 'pendingDelivery'); assert.equal(sends, 1); assert.equal(notices.status(f.root).unresolved[0]?.state, 'uncertain');
  f.presented(d, later(1)); assert.equal(f.preview(later(2)).state, 'noAction');
});
test('a real adapter callback separates preparation, presentation and acknowledgement', async () => {
  const f = fixture(); f.add(1); const d = f.reserve(); let observed = '';
  const actual = await notices.deliver(f.root, d.id, d.notifier, { channel: d.channel, present: async (text, id) => { observed = text; assert.equal(id, d.id); return { state: 'presented', source: 'Synthetic callback message receipt', evidence: [f.evidence] }; } });
  assert.equal(actual.state, 'presented'); assert(observed.includes('1 task needs')); assert(observed.includes('Q-001')); assert(!observed.includes('Approve all'));
  assert.equal(records.backlog(f.root).items[0]?.blocker.state, 'open');
});
test('acknowledgement applies only to the explicit current items and leaves tasks blocked', () => {
  const f = fixture(); for (let n = 1; n <= 5; n++) f.add(n); const d = f.reserve(); f.presented(d);
  notices.respond(f.root, { id: 'ack-one', recipient: 'qa', members: [d.members[0]!], kind: 'acknowledge', until: null, source: 'Synthetic explicit acknowledgement of one item', evidence: [f.evidence], at: later(2) });
  const full = records.backlog(f.root); assert.equal(full.items.length, 5); assert.equal(board.findTicket(f.root, 'QA-001').status, 'Ready for QA');
  assert(f.preview(later(62)).selected.every(g => g.items.every(i => i.key !== d.members[0]!.key)));
});
test('snoozing sets one due reminder without moving a task to Deferred', () => {
  const f = fixture(); f.add(1); const d = f.reserve(); f.presented(d);
  notices.respond(f.root, { id: 'later', recipient: 'qa', members: d.members, kind: 'snooze', until: later(10), source: 'Synthetic user asks for ten-minute reminder', evidence: [f.evidence], at: later(2) });
  assert.equal(f.preview(later(9)).state, 'noAction'); assert.equal(f.preview(later(10)).state, 'ready'); const reminder = f.reserve(later(10)); f.presented(reminder, later(10));
  assert.notEqual(f.preview(later(11)).state, 'ready'); assert.equal(board.findTicket(f.root, 'QA-001').status, 'Ready for QA');
});
test('source/owner changes invalidate stale messages and response targets', () => {
  const f = fixture(), task = f.add(1), d = f.reserve();
  records.recordBlocker(f.root, { eventId: randomUUID(), ticketId: task.id, expectedRevision: board.findTicket(f.root, task.id).revision, blocker: { ...task.blocker, owner: 'dev', source: 'Synthetic actual reassignment' }, at: later(1) });
  assert.throws(() => notices.beforePresentation(f.root, d.id, d.notifier), /changed/);
  assert.throws(() => notices.respond(f.root, { id: 'old-owner', recipient: 'qa', members: d.members, kind: 'acknowledge', until: null, source: 'Synthetic stale response', evidence: [f.evidence], at: later(2) }), /current blockers/);
  assert.equal(records.backlog(f.root, 'dev').items.length, 1);
});
test('resolved blockers require actual verification and do not approve or move the ticket', () => {
  const f = fixture(), task = f.add(1);
  assert.throws(() => records.recordBlocker(f.root, { eventId: randomUUID(), ticketId: task.id, expectedRevision: board.findTicket(f.root, task.id).revision, blocker: { ...task.blocker, state: 'resolved' }, at }), /verification/);
  records.recordBlocker(f.root, { eventId: randomUUID(), ticketId: task.id, expectedRevision: board.findTicket(f.root, task.id).revision, blocker: { ...task.blocker, state: 'resolved', verification: { source: 'Synthetic actually verified prerequisite', evidence: [f.evidence] } }, at: later(2) });
  assert.equal(f.preview().state, 'noAction'); assert.equal(board.findTicket(f.root, task.id).status, 'Ready for QA');
});
test('Deferred/Canceled/Tested-Ok tasks receive no ordinary blocker alerts', () => {
  const f = fixture(); for (let n = 1; n <= 3; n++) f.add(n);
  const fs = ['Deferred', 'Canceled', 'Tested-Ok'];
  for (let n = 1; n <= 3; n++) { const old = board.findTicket(f.root, `QA-00${n}`); const to = old.path.replace('/Ready for QA/', `/${fs[n - 1]}/`); writeFileSync(store.contained(f.root, to), old.text); unlinkSync(store.contained(f.root, old.path)); }
  assert.equal(f.preview().state, 'noAction'); assert.equal(records.scan(f.root).inactiveCount, 3);
});

test('optional notification settings preserve completed onboarding and unrelated preferences byte-for-byte', () => {
  const f = fixture(false), onboard = emptyState(); onboard.completed = true; onboard.roadmapShown = true;
  put(f.root, statePath, onboard); put(f.root, '.local/reporting-settings.json', { retained: 'Synthetic existing report preference' }); put(f.root, '.local/operation-preferences.json', { mode: 'onDemand', schedule: 'Not activated' });
  const baseline = [statePath, '.local/reporting-settings.json', '.local/operation-preferences.json'].map(path => store.evidence(f.root, path));
  const priorReadiness = readiness(f.root, readState(f.root).value);
  menu.openMenu(f.root, 'Synthetic explicit settings request'); menu.chooseArea(f.root, 'reporting');
  menu.startEdit(f.root, { id: 'attention-enable', prompt: 'Enable blocker reminders for this synthetic chat?', file: prefs.preferencesPath, source: 'Synthetic settings request' });
  menu.presentEdit(f.root); assert.throws(() => menu.saveAttentionEdit(f.root, { id: 'reply', questionId: 'attention-enable', source: 'Synthetic reply before actual presentation', evidence: [f.evidence], value: f.value, expectedRevision: null }), /presentation/);
  prefs.markEdit(f.root, 'asked', 'Synthetic actually shown question reference');
  menu.saveAttentionEdit(f.root, { id: 'reply', questionId: 'attention-enable', source: 'Synthetic actual response', evidence: [f.evidence], value: f.value, expectedRevision: null }); menu.closeMenu(f.root);
  baseline.forEach(ref => store.verifyEvidence(f.root, ref)); assert.equal(JSON.parse(readFileSync(store.contained(f.root, statePath), 'utf8')).completed, true); assert.deepEqual(readiness(f.root, readState(f.root).value), priorReadiness);
});
test('cancel/back and interrupted notification edits preserve history without reopening onboarding', () => {
  const f = fixture(false); put(f.root, statePath, { ...emptyState(), completed: true }); const before = store.revision(f.root, statePath);
  menu.openMenu(f.root, 'Synthetic settings'); menu.chooseArea(f.root, 'reporting');
  const question = { id: 'first', prompt: 'Synthetic notification choice?', file: prefs.preferencesPath, source: 'Synthetic request' };
  prefs.beginEdit(f.root, question); // Simulate a save before the menu focus was persisted.
  menu.startEdit(f.root, question); menu.presentEdit(f.root); prefs.markEdit(f.root, 'asked', 'Synthetic actual presentation'); menu.cancelEdit(f.root, true);
  menu.chooseArea(f.root, 'reporting'); menu.startEdit(f.root, { ...question, id: 'second' }); menu.closeMenu(f.root);
  assert.equal(store.revision(f.root, statePath), before); assert.equal(prefs.settings(f.root).value, null);
  const history = JSON.parse(readFileSync(store.contained(f.root, prefs.preferencesPath), 'utf8')); assert(history.edits.some((e: prefs.Edit) => e.id === 'first' && e.status === 'canceled'));
});
test('unreadable optional notification preferences do not block other reporting settings', () => {
  const f = fixture(false); put(f.root, prefs.preferencesPath, '{ unreadable optional state'); put(f.root, '.local/reporting-settings.json', { retained: 'Existing setting' });
  menu.openMenu(f.root, 'Synthetic request'); const view = menu.chooseArea(f.root, 'reporting'); assert(view.current.some(v => v.path === '.local/reporting-settings.json')); assert.equal(f.preview().state, 'needsSetup');
});
test('backlog pagination has an explicit snapshot and never acknowledges hidden items', () => {
  const f = fixture(); for (let n = 1; n <= 7; n++) f.add(n);
  const first = records.page(f.root, { recipient: 'qa' }); assert.equal(first.selected.length, 3); assert.equal(first.nextOffset, 3);
  const second = records.page(f.root, { recipient: 'qa', offset: first.nextOffset!, snapshot: first.snapshot }); assert.equal(second.selected.length, 3); assert(second.selected.every(g => !first.selected.some(p => p.id === g.id)));
  assert.equal(records.page(f.root, { recipient: 'qa', all: true }).selected.length, 7); assert.equal(notices.status(f.root).unresolved.length, 0);
  f.add(8); assert.throws(() => records.page(f.root, { recipient: 'qa', offset: 3, snapshot: first.snapshot }), /backlog changed/);
});
test('nonsemantic blocker notes do not trigger a changed-action reminder', () => {
  const f = fixture(), task = f.add(1), d = f.reserve(); f.presented(d);
  records.recordBlocker(f.root, { eventId: randomUUID(), ticketId: task.id, expectedRevision: board.findTicket(f.root, task.id).revision, blocker: { ...task.blocker, source: 'Synthetic supplemental source note, unchanged action' }, at: later(2) });
  assert.equal(f.preview(later(3)).state, 'noAction');
});
test('malformed blocker metadata is isolated and does not alter lifecycle eligibility', () => {
  const f = fixture(), bad = f.add(1); f.add(2);
  put(f.root, bad.path, readFileSync(store.contained(f.root, bad.path), 'utf8') + '\n```qa-blocker\n{ malformed');
  assert.equal(board.assertExecutable(f.root, bad.id).status, 'Ready for QA'); const view = f.preview(); assert.equal(view.state, 'ready'); assert.equal(view.selected.length, 1); assert.equal(view.diagnostics.length, 1);
});
test('changed source evidence or calling harness affects notifications only', () => {
  const f = fixture(), task = f.add(1), original = store.revision(f.root, task.path);
  bindHarness(f.root, { id: 'different-host', version: '1', profile: 'other', executionContext: 'interactive', source: 'Synthetic host switch' });
  assert.equal(f.preview().state, 'needsSetup'); assert.equal(board.assertExecutable(f.root, task.id).status, 'Ready for QA'); assert.equal(store.revision(f.root, task.path), original);
});
test('disabling the feature preserves pending receipts and allows truthful later reconciliation', () => {
  const f = fixture(); f.add(1); const d = f.reserve(); f.configure({ enabled: false });
  assert.equal(f.preview().state, 'disabled'); assert.throws(() => notices.beforePresentation(f.root, d.id, d.notifier), /preferences changed/);
  assert.equal(notices.status(f.root).unresolved.length, 1);
  notices.outcome(f.root, { id: d.id, notifier: d.notifier, channel: d.channel, state: 'notSent', source: 'Synthetic observed preflight rejection before a send', evidence: [f.evidence], at: later(1) });
  assert.equal(notices.status(f.root).unresolved.length, 0);
});
test('concurrent delivery callers cannot present one reservation twice', async () => {
  const f = fixture(); f.add(1); const d = f.reserve(); let sends = 0;
  const host = { channel: d.channel, present: async () => { sends++; await new Promise(done => setTimeout(done, 30)); return { state: 'presented' as const, source: 'Synthetic one actual callback receipt', evidence: [f.evidence] }; } };
  const outcomes = await Promise.allSettled([notices.deliver(f.root, d.id, d.notifier, host), notices.deliver(f.root, d.id, d.notifier, host)]);
  assert.equal(sends, 1); assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
});
test('mutable state aliases cannot serve as evidence for their own update', () => {
  const f = fixture(); f.add(1); const d = f.reserve(); const alias = store.evidence(f.root, './.local/attention/delivery-state.json');
  assert.throws(() => notices.outcome(f.root, { id: d.id, notifier: d.notifier, channel: d.channel, state: 'presented', source: 'Synthetic invalid self-reference', evidence: [alias], at: later(1) }), /immutable/);
  const configAlias = store.evidence(f.root, './.local/attention/preferences.json');
  assert.throws(() => prefs.savePreferences(f.root, { id: 'bad', source: 'Synthetic invalid self-reference', evidence: [configAlias], value: { ...f.value, enabled: false }, expectedRevision: prefs.settings(f.root).revision }), /immutable/);
});
test('the full shared index updates only its explicit mutable block with concurrency checks', () => {
  const f = fixture(); f.add(1); const path = `${board.boardRoot}/README.md`;
  const prefix = '# Synthetic board history\nKeep immutable historical content unchanged.\n';
  put(f.root, path, prefix + '<!-- qa-attention-index:start -->\nOld index\n<!-- qa-attention-index:end -->\n');
  const before = store.revision(f.root, path)!; records.updateIndex(f.root, { expectedRevision: before, source: 'Synthetic authorized navigation maintenance' });
  const updated = readFileSync(store.contained(f.root, path), 'utf8'); assert(updated.startsWith(prefix)); assert(updated.includes('QA-001/Q-001'));
  assert.throws(() => records.updateIndex(f.root, { expectedRevision: before, source: 'Synthetic stale writer' }), /changed/);
  put(f.root, path, '````markdown\n<!-- qa-attention-index:start -->\nOld\n<!-- qa-attention-index:end -->\n````\n');
  assert.throws(() => records.updateIndex(f.root, { expectedRevision: store.revision(f.root, path)!, source: 'Synthetic example must stay untouched' }), /standalone prose/);
  put(f.root, path, '<!-- qa-attention-index:start -->\nOld index\n<!-- qa-attention-index:end -->\n');
  const ticket = board.findTicket(f.root, 'QA-001');
  const replaced = ticket.text.replaceAll(JSON.stringify(f.evidence.path), JSON.stringify('./' + path)).replaceAll(f.evidence.sha256, store.revision(f.root, path)!);
  put(f.root, ticket.path, replaced);
  assert.throws(() => records.updateIndex(f.root, { expectedRevision: store.revision(f.root, path)!, source: 'Synthetic mutable alias must stay untouched' }), /immutable/);
});
test('preference and response replay cannot overwrite a newer choice', () => {
  const f = fixture(); f.add(1); const d = f.reserve(); f.presented(d);
  const request = { id: 'answer-1', recipient: 'qa', members: d.members, kind: 'acknowledge' as const, until: null, source: 'Synthetic explicit acknowledgement', evidence: [f.evidence], at: later(2) };
  notices.respond(f.root, request); const before = store.revision(f.root, notices.statePath); notices.respond(f.root, request); assert.equal(store.revision(f.root, notices.statePath), before);
  assert.throws(() => notices.respond(f.root, { ...request, until: later(10) }), /different content/);
  assert.throws(() => prefs.savePreferences(f.root, { id: 'stale', source: 'Synthetic stale preference response', evidence: [f.evidence], value: f.value, expectedRevision: null }), /changed/);
});
test('stale receipt evidence cannot silently restart notification delivery', () => {
  const f = fixture(); f.add(1); const d = f.reserve(); f.presented(d);
  put(f.root, f.evidence.path, { synthetic: true, changedEvidence: true });
  const before = store.revision(f.root, notices.statePath); assert.equal(f.preview(later(100)).state, 'needsSetup'); assert.equal(store.revision(f.root, notices.statePath), before);
});

test('later delivery confirmation preserves the original presentation time and evidence', () => {
  const f = fixture(); f.add(1); const d = f.reserve(); f.presented(d, later(1));
  const receipt = notices.outcome(f.root, { id: d.id, notifier: d.notifier, channel: d.channel, state: 'delivered', source: 'Synthetic later confirmed delivery', evidence: [f.evidence], at: later(50) });
  assert.equal(receipt.observations?.length, 2); assert.equal(receipt.observations?.[0]?.state, 'presented');
  assert.equal(f.preview(later(62)).state, 'ready', 'Confirmation of an old message must not restart the cooldown');
  assert.throws(() => notices.outcome(f.root, { id: d.id, notifier: d.notifier, channel: d.channel, state: 'notSent', source: 'Synthetic contradictory observation', evidence: [f.evidence], at: later(51) }), /earlier terminal/);
});
test('notifications label newly tracked, changed and reminder-due actions accurately', () => {
  const f = fixture(), task = f.add(1); assert(f.preview().message?.includes('Newly tracked'));
  const d = f.reserve(); f.presented(d); assert(f.preview(later(62)).message?.includes('Reminder due'));
  records.recordBlocker(f.root, { eventId: randomUUID(), ticketId: task.id, expectedRevision: board.findTicket(f.root, task.id).revision, blocker: { ...task.blocker, action: 'Synthetic materially changed owner action' }, at: later(63) });
  assert(f.preview(later(63)).message?.includes('Changed action'));
});
test('a legacy waiting field is a review candidate, never an invented notification', () => {
  const f = fixture(); put(f.root, `${board.boardRoot}/Ready for QA/QA-001.md`, '# QA-001: Legacy task\n| Waiting on | Existing developer clarification |\n');
  const view = f.preview(); assert.equal(view.state, 'noAction'); assert.equal(view.diagnostics.length, 1); assert.equal(view.selected.length, 0);
  assert.equal(board.assertExecutable(f.root, 'QA-001').status, 'Ready for QA');
});
test('policy proposals reuse actual harness identity without saving or activating settings', () => {
  const f = fixture(false), before = files(f.root);
  const p = prefs.proposal(f.root, { source: 'Synthetic proposal only', evidence: [f.evidence], notifierId: 'synthetic-notifier', recipients: [f.recipient] });
  assert.equal(p.value.notifier?.machine, hostname()); assert.equal(p.value.recipients?.[0]?.batchSize, 3); assert.equal(prefs.settings(f.root).value, null); assert.deepEqual(files(f.root), before);
});
test('invalid settings and cross-owner acknowledgements cannot activate or change task execution', () => {
  const f = fixture(); const task = f.add(1); const view = f.preview();
  assert.throws(() => f.configure({ recipients: [{ ...f.recipient, batchSize: 0 }] }), /1–10/);
  assert.throws(() => f.configure({ recipients: [{ ...f.recipient, timezone: 'Not/A/Timezone' }] }), /timezone/);
  const item = view.selected[0]!.items[0]!;
  assert.throws(() => notices.respond(f.root, { id: 'wrong', recipient: 'dev', members: [{ key: item.key, fingerprint: item.fingerprint, ticketId: item.ticketId, generation: item.generation }], kind: 'acknowledge', until: null, source: 'Synthetic wrong owner', evidence: [f.evidence], at }), /current blockers/);
  assert.equal(board.assertExecutable(f.root, task.id).status, 'Ready for QA');
});

test('outbound channel substitutions and copied-machine settings are not activated', () => {
  const f = fixture(false);
  assert.throws(() => f.configure({ recipients: [{ ...f.recipient, channelType: 'email' as prefs.Recipient['channelType'] }] }), /host conversation/);
  assert.throws(() => prefs.savePreferences(f.root, { id: 'copied', source: 'Synthetic copied configuration', evidence: [f.evidence], value: { ...f.value, notifier: { ...f.value.notifier!, machine: 'another-synthetic-machine' } }, expectedRevision: null }), /configured notifier/);
  assert.equal(prefs.settings(f.root).value, null);
});
test('malformed operational receipt state is preserved and does not disable ordinary QA work', () => {
  const f = fixture(), task = f.add(1); f.reserve();
  const raw = JSON.parse(readFileSync(store.contained(f.root, notices.statePath), 'utf8')); raw.deliveries.push({ ...raw.deliveries[0] });
  put(f.root, notices.statePath, raw); const before = store.revision(f.root, notices.statePath);
  assert.equal(f.preview().state, 'needsSetup'); assert.equal(board.assertExecutable(f.root, task.id).status, 'Ready for QA'); assert.equal(store.revision(f.root, notices.statePath), before);
});

test('an incomplete lifecycle move cannot overwrite the last shared attention index', () => {
  const f = fixture(), task = f.add(1), path = `${board.boardRoot}/README.md`;
  const ref = put(f.root, path, '<!-- qa-attention-index:start -->\nLast known shared index\n<!-- qa-attention-index:end -->\n');
  board.prepareTransition(f.root, { id: 'synthetic-pending-move', ticketId: task.id, expectedRevision: board.findTicket(f.root, task.id).revision, to: 'Canceled', decision: { actor: 'Synthetic owner', source: 'Synthetic decision fixture', reason: 'Synthetic lifecycle interruption', evidence: [f.evidence], scope: { kind: 'assignment' }, checkpoint: 'Synthetic checkpoint', nextOwner: 'Synthetic QA', nextAction: 'Inspect original operation', handoff: 'Synthetic only' } });
  assert.throws(() => records.updateIndex(f.root, { expectedRevision: ref.sha256, source: 'Synthetic maintenance attempt' }), /incomplete board/); assert.equal(store.revision(f.root, path), ref.sha256);
  assert.equal(f.preview().state, 'needsSetup');
});

test('a recipient acknowledgement after reservation stops the stale reminder before presentation', async () => {
  const f = fixture(); f.add(1); const d = f.reserve(); let sends = 0;
  notices.respond(f.root, { id: 'after-reservation', recipient: 'qa', members: d.members, kind: 'acknowledge', until: null, source: 'Synthetic explicit acknowledgement before sending', evidence: [f.evidence], at: later(1) });
  await assert.rejects(notices.deliver(f.root, d.id, d.notifier, { channel: d.channel, present: async () => { sends++; return { state: 'presented', source: 'Synthetic stale send', evidence: [f.evidence] }; } }), /changed|eligible/);
  assert.equal(sends, 0); assert.equal(notices.status(f.root).unresolved[0]?.state, 'reserved');
});

test('send-time revalidation respects quiet hours and changed backlog counts', () => {
  const f = fixture(); f.add(1); f.configure({ recipients: [{ ...f.recipient, quietHours: { start: '22:00', end: '08:00' } }] }); const d = f.reserve();
  assert.throws(() => notices.beforePresentation(f.root, d.id, d.notifier, '2026-01-01T22:00:00Z'), /eligibility|changed/);
  f.add(2); assert.throws(() => notices.beforePresentation(f.root, d.id, d.notifier, at), /eligibility|changed/);
  assert.equal(notices.status(f.root).unresolved[0]?.state, 'reserved');
});

test('importing an older response preserves the newer explicit reminder decision', () => {
  const f = fixture(); f.add(1); const d = f.reserve(); f.presented(d);
  const response = { recipient: 'qa', members: d.members, evidence: [f.evidence] };
  notices.respond(f.root, { ...response, id: 'newer-reminder', kind: 'snooze', until: later(10), source: 'Synthetic newer explicit reminder request', at: later(3) });
  notices.respond(f.root, { ...response, id: 'late-old-ack', kind: 'acknowledge', until: null, source: 'Synthetic older response imported after interruption', at: later(2) });
  assert.equal(f.preview(later(9)).state, 'noAction'); assert.equal(f.preview(later(10)).state, 'ready');
});
