import { existsSync, readFileSync } from 'node:fs';
import { contained, load, save, revision, requireText, withLock, assertNonsecret } from '../shared/store.js';
import { commitReply, queueQuestions, journalPath, type Reply } from '../onboarding/conversation.js';
import { readState, writeState, type Stage } from '../onboarding/state.js';
import * as attention from '../attention/preferences.js';
import { browserAccessStatus } from '../browser/access.js';

import { activeSource, sourcePath } from '../task-source/config.js';

const existingAreas = [
  { id: 'project', label: 'Project and environments', files: ['.local/project.json'], stage: 'project' },
  { id: 'context', label: 'Project context and discovery', files: ['.local/context-settings.json'], stage: 'understanding' },
  { id: 'github', label: 'GitHub repositories and PR triggers', files: ['.local/github-settings.json'], stage: 'tools' },
  { id: 'review', label: 'Review responsibilities and execution policies', files: ['.local/review-settings.json'], stage: 'operation' },
  { id: 'email', label: 'Email providers, accounts and mailboxes', files: ['.local/email-connections.json'], stage: 'email' },
  { id: 'verification', label: 'OTP and verification preferences', files: ['.local/verification-settings.json'], stage: 'email' },
  { id: 'browser', label: 'Tool constraints, browser visibility and Chrome DevTools', files: ['.local/tool-policy.json', '.local/browser-preferences.json', '.local/chrome-devtools-settings.json'], stage: 'tools' },
  { id: 'schedule', label: 'Check-in schedule', files: ['.local/operation-preferences.json'], stage: 'operation' },
  { id: 'reporting', label: 'Reporting and evidence preferences', files: ['.local/reporting-settings.json', attention.preferencesPath], stage: 'operation' },
  { id: 'postman', label: 'API tools and Postman', files: ['.local/postman-settings.json'], stage: 'tools' },
] as const;
const taskSource = { id: 'taskSource', label: 'Task source', files: [sourcePath], stage: 'operation' } as const;
export const areas = [...existingAreas, taskSource] as const;
const menuChoices = [...existingAreas, { id: 'close', label: 'Close settings' }, taskSource] as const;
interface NotificationRecovery { questionId: string; preferencesPath: string; preferencesRevision: string | null; recordedAt: string; action: 'leftWithoutUpdatingNotificationEdit' }
interface Menu { schemaVersion: 1; open: boolean; area: string | null; questionId: string | null; source: string | null; questionKind?: 'attention'; notificationRecoveryHistory?: NotificationRecovery[] }
const path = '.local/settings-menu.json';
export function menuState(root: string) { return load<Menu>(root, path, () => ({ schemaVersion: 1, open: false, area: null, questionId: null, source: null })); }
function notificationQuestion(root: string, id: string) {
  try {
    const question = attention.editQuestion(root);
    if (!question || question.id !== id || !['queued', 'presenting', 'asked', 'answered', 'canceled'].includes(question.status) || !Array.isArray(question.references) || !question.references.every(ref => typeof ref === 'string' && ref.trim()) || !(question.expectedRevision === null || typeof question.expectedRevision === 'string')) throw new Error('Reconcile the original notification edit.');
    requireText(question.prompt); requireText(question.source); assertNonsecret(question);
    return { question, issue: null };
  } catch { return { question: null, issue: 'The notification edit needs reconciliation. You can use Back, Cancel this edit or Close settings; its existing data will be preserved.' }; }
}
function retainNotificationRecovery(root: string, menu: Menu) {
  if (!menu.questionId) return;
  let captured: string | null = null;
  try { captured = revision(root, attention.preferencesPath); } catch { /* The original file may also be inaccessible; never replace it. */ }
  const history = menu.notificationRecoveryHistory ??= [];
  if (!history.some(item => item.questionId === menu.questionId && item.preferencesRevision === captured)) history.push({ questionId: menu.questionId, preferencesPath: attention.preferencesPath, preferencesRevision: captured, recordedAt: new Date().toISOString(), action: 'leftWithoutUpdatingNotificationEdit' });
}
export function showMenu(root: string) {
  const menu = menuState(root).value, area = areas.find(a => a.id === menu.area);
  const current = area ? area.files.map(file => {
    if (file === sourcePath) {
      try { return { path: file, value: activeSource(root).value }; }
      catch { return { path: file, value: 'Task source settings need reconciliation. Other settings remain available.' }; }
    }
    if (file === attention.preferencesPath) { try { const value = attention.settings(root).value ?? 'Not configured'; assertNonsecret(value); return { path: file, value }; } catch { return { path: file, value: 'Notification preferences need reconciliation; other settings remain available.' }; } }
    return { path: file, value: existsSync(contained(root, file)) ? JSON.parse(readFileSync(contained(root, file), 'utf8')) : 'Not configured' };
  }) : [];
  assertNonsecret(current);
  const notification = menu.questionId && menu.questionKind === 'attention' ? notificationQuestion(root, menu.questionId) : null;
  return { action: menu.open ? (area ? 'editArea' : 'chooseArea') : 'closed', area: area?.label ?? null,
    choices: area ? ['Back', 'Cancel this edit', 'Close settings'] : menuChoices.map(({ id, label }) => ({ id, label })),
    current,
    ...(menu.open && area?.id === 'browser' ? { browserAccess: browserAccessStatus(root) } : {}),
    question: menu.questionId ? notification ? notification.question : readState(root).value.questions.find(q => q.id === menu.questionId) : null,
    questionIssue: notification?.issue ?? null,
    notificationRecoveryHistory: menu.notificationRecoveryHistory ?? [],
    instruction: 'Present the actual choices/current values in the conversation. CLI output is not a user-facing menu.' };
}
export function openMenu(root: string, source: string) {
  requireText(source, 'Actual settings request');
  withLock(root, 'conversation', () => { const current = menuState(root); if (current.value.open) return; current.value.open = true; current.value.source = source; save(root, path, current.value, current.revision); });
  return showMenu(root);
}
export function chooseArea(root: string, selection: string) {
  const area = menuChoices.find((a, i) => a.id === selection || a.label === selection || String(i + 1) === selection);
  if (!area) throw new Error('Choose an actual settings area.');
  if (area.id === 'close') { closeMenu(root); return showMenu(root); }
  withLock(root, 'conversation', () => {
    const current = menuState(root); if (!current.value.open) throw new Error('Open settings only from an actual user request.');
    if (current.value.questionId) throw new Error('Finish, clarify or cancel the current edit first.');
    current.value.area = area.id; save(root, path, current.value, current.revision);
  }); return showMenu(root);
}
export function startEdit(root: string, input: { id: string; prompt: string; file: string; pointer?: string; source: string }) {
  const current = menuState(root), area = areas.find(a => a.id === current.value.area);
  if (!current.value.open || !area || current.value.questionId || !(area.files as readonly string[]).includes(input.file)) throw new Error('Bind the edit to the selected area and its canonical destination.');
  requireText(input.source);
  if (area.id === 'taskSource') throw new Error('Use task-source inspect, preview and save for this area.');
  if (area.id === 'email') throw new Error('Use email account discovery and the guarded mailbox-selection procedure; do not overwrite connection JSON.');
  if (input.file === attention.preferencesPath) {
    if (input.pointer) throw new Error('Save the merged notification preferences through their isolated optional-settings path.');
    attention.beginEdit(root, input); current.value.questionKind = 'attention'; current.value.questionId = input.id;
    save(root, path, current.value, current.revision); return showMenu(root);
  }
  queueQuestions(root, [{ id: input.id, stage: area.stage as Stage, path: input.file, pointer: input.pointer, prompt: input.prompt, required: false }]);
  current.value.questionId = input.id; save(root, path, current.value, current.revision); return showMenu(root);
}
export function saveEdit(root: string, reply: Reply) {
  const current = menuState(root);
  if (!current.value.open || !current.value.questionId || current.value.questionKind === 'attention' || !reply.answers.some(a => a.id === current.value.questionId)) throw new Error('The response must answer the active settings edit; notification preferences use save-attention.');
  commitReply(root, reply); current.value.questionId = null; save(root, path, current.value, current.revision); return showMenu(root);
}
export function presentEdit(root: string) {
  const pending = menuState(root);
  if (pending.value.questionKind === 'attention') {
    if (!pending.value.open || !pending.value.questionId) throw new Error('Select the current notification preference question.');
    const { question: q } = notificationQuestion(root, pending.value.questionId);
    if (!q) return showMenu(root);
    if (['answered', 'canceled'].includes(q.status)) { pending.value.questionId = null; delete pending.value.questionKind; save(root, path, pending.value, pending.revision); }
    else if (q.status === 'queued') attention.markEdit(root, 'presenting', undefined, q.id);
    return showMenu(root);
  }
  withLock(root, 'conversation', () => {
    const menu = menuState(root), state = readState(root);
    const question = state.value.questions.find(q => q.id === menu.value.questionId);
    if (!menu.value.open || !question) throw new Error('Select an area and register its missing decision first.');
    if (question.status === 'answered') { menu.value.questionId = null; save(root, path, menu.value, menu.revision); }
    else if (question.status === 'queued') { question.status = 'presenting'; writeState(root, state.value, state.revision); }
  });
  return showMenu(root);
}
export function cancelEdit(root: string, back = false) {
  withLock(root, 'conversation', () => {
    if (existsSync(contained(root, journalPath))) throw new Error('Recover or reconcile the pending save before navigation.');
    const current = menuState(root);
    if (current.value.questionKind === 'attention') {
      const { question: q } = current.value.questionId ? notificationQuestion(root, current.value.questionId) : { question: null };
      if (!q) retainNotificationRecovery(root, current.value);
      else if (!['answered', 'canceled'].includes(q.status)) {
        try { attention.markEdit(root, 'canceled', undefined, q.id); }
        catch { retainNotificationRecovery(root, current.value); }
      }
      current.value.questionId = null; delete current.value.questionKind; if (back) current.value.area = null;
      save(root, path, current.value, current.revision); return;
    }
    const state = readState(root);
    if (current.value.questionId) { const q = state.value.questions.find(q => q.id === current.value.questionId); if (q && q.status !== 'answered') { q.status = 'canceled'; writeState(root, state.value, state.revision); } }
    current.value.questionId = null; if (back) current.value.area = null; save(root, path, current.value, current.revision);
  }); return showMenu(root);
}
export function saveAttentionEdit(root: string, request: Parameters<typeof attention.savePreferences>[1]) {
  const menu = menuState(root);
  if (!menu.value.open || menu.value.questionKind !== 'attention' || menu.value.questionId !== request.questionId) throw new Error('Answer the selected notification preference question.');
  attention.savePreferences(root, request);
  menu.value.questionId = null; delete menu.value.questionKind; save(root, path, menu.value, menu.revision); return showMenu(root);
}
export function closeMenu(root: string) {
  cancelEdit(root, true);
  withLock(root, 'conversation', () => { const current = menuState(root); current.value.open = false; save(root, path, current.value, current.revision); });
  // No onboarding resume, schedule edit or undo of completed saves occurs here.
}
