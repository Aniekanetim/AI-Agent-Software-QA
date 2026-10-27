import { existsSync, readFileSync } from 'node:fs';
import { contained, load, save, requireText, withLock, assertNonsecret } from '../shared/store.js';
import { commitReply, queueQuestions, journalPath, type Reply } from '../onboarding/conversation.js';
import { readState, writeState, type Stage } from '../onboarding/state.js';

export const areas = [
  { id: 'project', label: 'Project and environments', files: ['.local/project.json'], stage: 'project' },
  { id: 'context', label: 'Project context and discovery', files: ['.local/context-settings.json'], stage: 'understanding' },
  { id: 'github', label: 'GitHub repositories and PR triggers', files: ['.local/github-settings.json'], stage: 'tools' },
  { id: 'review', label: 'Review responsibilities and execution policies', files: ['.local/review-settings.json'], stage: 'operation' },
  { id: 'email', label: 'Email providers, accounts and mailboxes', files: ['.local/email-connections.json'], stage: 'email' },
  { id: 'verification', label: 'OTP and verification preferences', files: ['.local/verification-settings.json'], stage: 'email' },
  { id: 'browser', label: 'Browser and visibility', files: ['.local/browser-preferences.json'], stage: 'tools' },
  { id: 'schedule', label: 'Check-in schedule', files: ['.local/operation-preferences.json'], stage: 'operation' },
  { id: 'reporting', label: 'Reporting and evidence preferences', files: ['.local/reporting-settings.json'], stage: 'operation' },
] as const;
interface Menu { schemaVersion: 1; open: boolean; area: string | null; questionId: string | null; source: string | null }
const path = '.local/settings-menu.json';
export function menuState(root: string) { return load<Menu>(root, path, () => ({ schemaVersion: 1, open: false, area: null, questionId: null, source: null })); }
export function showMenu(root: string) {
  const menu = menuState(root).value, area = areas.find(a => a.id === menu.area);
  const current = area ? area.files.map(file => ({ path: file, value: existsSync(contained(root, file)) ? JSON.parse(readFileSync(contained(root, file), 'utf8')) : 'Not configured' })) : [];
  assertNonsecret(current);
  return { action: menu.open ? (area ? 'editArea' : 'chooseArea') : 'closed', area: area?.label ?? null,
    choices: area ? ['Back', 'Cancel this edit', 'Close settings'] : [...areas.map(a => ({ id: a.id, label: a.label })), { id: 'close', label: 'Close settings' }],
    current,
    question: menu.questionId ? readState(root).value.questions.find(q => q.id === menu.questionId) : null,
    instruction: 'Present the actual choices/current values in the conversation. CLI output is not a user-facing menu.' };
}
export function openMenu(root: string, source: string) {
  requireText(source, 'Actual settings request');
  withLock(root, 'conversation', () => { const current = menuState(root); if (current.value.open) return; current.value.open = true; current.value.source = source; save(root, path, current.value, current.revision); });
  return showMenu(root);
}
export function chooseArea(root: string, selection: string) {
  if (['close', 'Close settings', '10'].includes(selection)) { closeMenu(root); return showMenu(root); }
  const area = areas.find((a, i) => a.id === selection || a.label === selection || String(i + 1) === selection); if (!area) throw new Error('Choose an actual settings area.');
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
  if (area.id === 'email') throw new Error('Use email account discovery and the guarded mailbox-selection procedure; do not overwrite connection JSON.');
  queueQuestions(root, [{ id: input.id, stage: area.stage as Stage, path: input.file, pointer: input.pointer, prompt: input.prompt, required: false }]);
  current.value.questionId = input.id; save(root, path, current.value, current.revision); return showMenu(root);
}
export function saveEdit(root: string, reply: Reply) {
  const current = menuState(root);
  if (!current.value.open || !current.value.questionId || !reply.answers.some(a => a.id === current.value.questionId)) throw new Error('The response must answer the active settings edit.');
  commitReply(root, reply); current.value.questionId = null; save(root, path, current.value, current.revision); return showMenu(root);
}
export function presentEdit(root: string) {
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
    const current = menuState(root), state = readState(root);
    if (current.value.questionId) { const q = state.value.questions.find(q => q.id === current.value.questionId); if (q && q.status !== 'answered') { q.status = 'canceled'; writeState(root, state.value, state.revision); } }
    current.value.questionId = null; if (back) current.value.area = null; save(root, path, current.value, current.revision);
  }); return showMenu(root);
}
export function closeMenu(root: string) {
  cancelEdit(root, true);
  withLock(root, 'conversation', () => { const current = menuState(root); current.value.open = false; save(root, path, current.value, current.revision); });
  // No onboarding resume, schedule edit or undo of completed saves occurs here.
}
