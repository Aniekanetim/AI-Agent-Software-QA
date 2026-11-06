import { hostname } from 'node:os';
import { currentHarness, harnessKey, type HarnessIdentity } from '../tools/runtime.js';
import { load, save, digest, requireText, assertNonsecret, withLock, type Evidence } from '../shared/store.js';
import { verifyImmutable } from './evidence.js';

export const preferencesPath = '.local/attention/preferences.json';
export interface Recipient {
  id: string; label: string; channelType: 'hostConversation'; channelReference: string; timezone: string;
  mode: 'digest' | 'individual'; batchSize: number; reminderMinutes: number; cooldownMinutes: number;
  quietHours: { start: string; end: string } | null;
}
export interface Preferences {
  schemaVersion: 1; enabled: boolean; source: string; evidence: Evidence[];
  notifier?: { id: string; machine: string; harness: HarnessIdentity };
  recipients?: Recipient[]; urgentPriorities?: ('P0' | 'P1')[]; urgentDuringQuietHours?: boolean;
}
export interface Edit { id: string; prompt: string; source: string; expectedRevision: string | null; status: 'queued' | 'presenting' | 'asked' | 'answered' | 'canceled'; references: string[] }
interface Store { schemaVersion: 1; value: Preferences | null; edit: Edit | null; edits?: Edit[]; history: { id: string; digest: string; source: string; evidence: Evidence[]; value: Preferences }[] }
const empty = (): Store => ({ schemaVersion: 1, value: null, edit: null, history: [] });
function read(root: string) {
  const record = load(root, preferencesPath, empty), v = record.value;
  if (v.schemaVersion !== 1 || !Array.isArray(v.history) || !Object.hasOwn(v, 'value') || !Object.hasOwn(v, 'edit')) throw new Error('Preserve unreadable notification preferences and reconcile them; do not reset settings.');
  return record;
}
export function settings(root: string) { const value = read(root).value.value; return { value, revision: value ? digest(JSON.stringify(value)) : null }; }
export function proposal(root: string, input: { source: string; evidence: Evidence[]; notifierId: string; recipients: Recipient[]; urgentPriorities?: ('P0' | 'P1')[]; urgentDuringQuietHours?: boolean }) {
  const value: Preferences = { schemaVersion: 1, enabled: true, source: input.source, evidence: input.evidence, notifier: { id: input.notifierId, machine: hostname(), harness: currentHarness(root) }, recipients: input.recipients, urgentPriorities: input.urgentPriorities ?? [], urgentDuringQuietHours: input.urgentDuringQuietHours ?? false };
  validatePreferences(value); return { value, expectedRevision: settings(root).revision, effect: 'Read-only policy proposal. Review actual recipients, conversation access, pacing and quiet-hour exceptions before saving.' };
}
export function validatePreferences(value: Preferences) {
  assertNonsecret(value);
  if (!value || value.schemaVersion !== 1 || typeof value.enabled !== 'boolean' || !Array.isArray(value.evidence)) throw new Error('Use version 1 notification preferences and an explicit enabled choice.');
  requireText(value.source, 'Actual notification preference source');
  if (!value.enabled) return;
  if (!value.notifier?.harness || !Array.isArray(value.recipients) || !value.recipients.length || !value.evidence.length) throw new Error('Select the notifier, actual harness, recipients and conversation-access evidence before enabling notifications.');
  requireText(value.notifier.id); requireText(value.notifier.machine);
  if (new Set(value.recipients.map(r => r.id)).size !== value.recipients.length) throw new Error('Recipient IDs must be unique.');
  for (const r of value.recipients) {
    for (const text of [r.id, r.label, r.channelReference, r.timezone]) requireText(text);
    if (r.channelType !== 'hostConversation') throw new Error('This version delivers only through the selected host conversation; other outbound channels need separate implementation and authorization.');
    try { new Intl.DateTimeFormat('en', { timeZone: r.timezone }).format(); } catch { throw new Error('Choose a valid notification timezone.'); }
    if (!['digest', 'individual'].includes(r.mode) || !Number.isInteger(r.batchSize) || r.batchSize < 1 || r.batchSize > 10 || !Number.isInteger(r.reminderMinutes) || r.reminderMinutes < 1 || r.reminderMinutes > 43_200 || !Number.isInteger(r.cooldownMinutes) || r.cooldownMinutes < 1 || r.cooldownMinutes > 43_200) throw new Error('Choose 1–10 action groups and bounded reminder/cooldown intervals in minutes.');
    if (r.quietHours && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.quietHours.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.quietHours.end) || r.quietHours.start === r.quietHours.end)) throw new Error('Set distinct quiet-hour start/end times, or select no quiet hours.');
  }
  if (value.urgentPriorities && (!Array.isArray(value.urgentPriorities) || value.urgentPriorities.some(p => !['P0', 'P1'].includes(p)))) throw new Error('Only explicitly configured P0/P1 notifications may bypass normal pacing.');
  if (value.urgentDuringQuietHours !== undefined && typeof value.urgentDuringQuietHours !== 'boolean') throw new Error('Record an explicit quiet-hour exception choice.');
}
export function verifyNotifier(root: string, value: Preferences, notifierId: string) {
  validatePreferences(value);
  if (!value.enabled || value.notifier?.id !== notifierId || value.notifier.machine !== hostname() || harnessKey(currentHarness(root)) !== harnessKey(value.notifier.harness)) throw new Error('Use the configured notifier in its verified machine, project and calling harness; reverify only notification access after a change.');
  verifyImmutable(root, value.evidence, [preferencesPath, '.local/attention/delivery-state.json']);
}
export function savePreferences(root: string, request: { id: string; source: string; evidence: Evidence[]; value: Preferences; expectedRevision: string | null; questionId?: string }) {
  requireText(request.id); requireText(request.source); validatePreferences(request.value); assertNonsecret(request);
  if (!request.evidence?.length) throw new Error('Retain the actual preference response evidence.');
  verifyImmutable(root, request.evidence, [preferencesPath, '.local/attention/delivery-state.json']);
  if (request.value.enabled) verifyNotifier(root, request.value, request.value.notifier!.id);
  return withLock(root, 'attention', () => {
    const record = read(root), old = record.value.history.find(h => h.id === request.id), hash = digest(JSON.stringify(request));
    if (old) { if (old.digest !== hash) throw new Error('This preference response ID has different content.'); return settings(root); }
    const actual = record.value.value ? digest(JSON.stringify(record.value.value)) : null;
    if (actual !== request.expectedRevision) throw new Error('Notification preferences changed; merge against current values without overwriting them.');
    if (request.questionId && (record.value.edit?.id !== request.questionId || record.value.edit.status !== 'asked' || !record.value.edit.references.length || record.value.edit.expectedRevision !== actual)) throw new Error('Answer the current notification setting question and retain its actual presentation.');
    record.value.value = request.value;
    if (request.questionId) { record.value.edit!.status = 'answered'; record.value.edit!.references.push(request.source); }
    record.value.history.push({ id: request.id, digest: hash, source: request.source, evidence: request.evidence, value: request.value });
    save(root, preferencesPath, record.value, record.revision); return settings(root);
  });
}
export function editQuestion(root: string) { return read(root).value.edit; }
export function beginEdit(root: string, input: { id: string; prompt: string; source: string }) {
  for (const v of [input.id, input.prompt, input.source]) requireText(v);
  withLock(root, 'attention', () => {
    const record = read(root);
    if (record.value.edit && !['answered', 'canceled'].includes(record.value.edit.status)) {
      if (record.value.edit.id === input.id && record.value.edit.prompt === input.prompt && record.value.edit.source === input.source) return;
      throw new Error('Finish or cancel the current notification setting question first.');
    }
    if (record.value.edit?.id === input.id || record.value.edits?.some(e => e.id === input.id)) throw new Error('Use a new notification question ID; earlier prompts and responses remain historical.');
    if (record.value.edit) (record.value.edits ??= []).push(record.value.edit);
    record.value.edit = { ...input, expectedRevision: settings(root).revision, status: 'queued', references: [] };
    save(root, preferencesPath, record.value, record.revision);
  });
}
export function markEdit(root: string, status: 'presenting' | 'asked' | 'canceled', source?: string) {
  withLock(root, 'attention', () => {
    const record = read(root), edit = record.value.edit;
    if (!edit || ['answered', 'canceled'].includes(edit.status)) throw new Error('Select an unfinished notification preference question.');
    if (status === 'asked') { if (edit.status !== 'presenting') throw new Error('Present the actual notification setting question before recording it as shown.'); requireText(source, 'Actual question presentation reference'); edit.references.push(source); }
    edit.status = status; save(root, preferencesPath, record.value, record.revision);
  });
}
