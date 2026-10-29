import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { contained, privatePath, load, save, replace, revision, digest, evidence, verifyEvidence, requireText, assertNonsecret, withLock, atPointer, type Evidence } from '../shared/store.js';
import { readState, writeState, stages, labels, statePath, readiness, type Question, type Stage, type SetupState, type Check, type ContextDomain } from './state.js';

export const journalPath = '.local/pending-response.json';
export interface ProposedWrite { path: string; expectedSha256: string | null; content: string; origin: 'human' | 'agent' }
export interface Reply {
  id: string; source: string;
  answers: { id: string; path: string; pointer?: string; kind: 'answer' | 'correction' }[];
  writes: ProposedWrite[];
  baselineMaintenance?: { source: string; paths: string[] };
}
interface Journal { schemaVersion: 1; reply: Reply; comparisonReferences: string[] }
export function permittedWrite(root: string, write: ProposedWrite, reply: Reply): void {
  const path = write.path.replaceAll('\\', '/'); contained(root, path); assertNonsecret(write.content);
  if (path.startsWith('Project Context/')) {
    if (write.origin !== 'human' || !reply.baselineMaintenance?.source.trim() || !reply.baselineMaintenance.paths.includes(path) || !path.endsWith('.md')) throw new Error('Human-baseline transcription needs a human source and authorization for this named document.');
  } else if (path.startsWith('Product Discovery/Project Context/') && path.endsWith('.md')) {
    // Discovery observations retain their own authority; they cannot write the root baseline.
  } else if (path.startsWith('.local/')) {
    privatePath(root, path);
    if (!['project', 'context-settings', 'tool-policy', 'browser-preferences', 'chrome-devtools-settings', 'github-settings', 'review-settings', 'verification-settings', 'operation-preferences', 'reporting-settings', 'postman-settings'].some(name => path === `.local/${name}.json`)) throw new Error('Use the dedicated state/evidence procedure for this destination.');
    try { assertNonsecret(JSON.parse(write.content)); } catch { throw new Error('Canonical settings must be valid, nonsecret JSON.'); }
  } else throw new Error('Response writes must target authorized baseline documents, discovery knowledge or private canonical settings.');
  if (!reply.answers.some(a => a.path === write.path)) throw new Error('Every proposed write must be bound to a saved answer.');
}
function validateReply(root: string, reply: Reply, state: SetupState): void {
  requireText(reply.id, 'Response ID'); requireText(reply.source, 'Actual response reference'); assertNonsecret(reply);
  if (!Array.isArray(reply.answers) || !reply.answers.length || !Array.isArray(reply.writes)) throw new Error('A response needs answer bindings and proposed writes/references.');
  if (new Set(reply.writes.map(w => w.path)).size !== reply.writes.length || new Set(reply.answers.map(a => a.id)).size !== reply.answers.length) throw new Error('Duplicate response bindings or writes.');
  for (const answer of reply.answers) {
    const question = state.questions.find(q => q.id === answer.id);
    if (!question || question.path !== answer.path || question.pointer !== answer.pointer || !['answer', 'correction'].includes(answer.kind)) throw new Error('The answer does not match its registered question and destination.');
    if (question.status === 'answered' && answer.kind !== 'correction') throw new Error('Use an explicit correction for an already answered decision.');
    if (!reply.writes.some(w => w.path === answer.path)) verifyEvidence(root, evidence(root, answer.path, answer.pointer));
  }
  for (const write of reply.writes) permittedWrite(root, write, reply);
  for (const answer of reply.answers) if (answer.pointer) {
    const write = reply.writes.find(w => w.path === answer.path);
    if (write) atPointer(JSON.parse(write.content), answer.pointer);
  }
}
export function queueQuestions(root: string, questions: Omit<Question, 'status' | 'promptReferences' | 'answerReferences' | 'clarificationHistory'>[]): void {
  withLock(root, 'conversation', () => {
    const current = readState(root); let changed = false;
    for (const question of questions) {
      requireText(question.id); requireText(question.prompt); contained(root, question.path);
      if (!stages.includes(question.stage)) throw new Error('Unknown onboarding stage.');
      const old = current.value.questions.find(q => q.id === question.id);
      if (old) {
        if (old.path !== question.path || old.pointer !== question.pointer || old.stage !== question.stage) throw new Error('A question ID cannot be rebound to another field.');
        continue;
      }
      current.value.questions.push({ ...question, status: 'queued', promptReferences: [], answerReferences: [], clarificationHistory: [] }); changed = true;
    }
    if (changed) { current.value.completed = false; writeState(root, current.value, current.revision); }
  });
}
export function next(root: string, repeatOnRequest?: string): Record<string, unknown> {
  return withLock(root, 'conversation', () => {
    const current = readState(root), state = current.value;
    if (existsSync(contained(root, journalPath))) return { action: 'recoverResponse', next: 'Recover the retained response before new questions or edits.' };
    if (state.paused) return { action: 'paused', next: 'Wait for an explicit resume; clear volunteered answers may still be saved.' };
    const menu = load<{ open: boolean }>(root, '.local/settings-menu.json', () => ({ open: false })).value;
    if (menu.open) return { action: 'settings', next: 'Present or resume the existing settings menu.' };
    let question = state.questions.find(q => ['presenting', 'asked'].includes(q.status));
    if (question) {
      if (repeatOnRequest) { requireText(repeatOnRequest); return { action: 'repeatOnRequest', question }; }
      return { action: question.status === 'asked' ? 'wait' : 'verifyPresentation', question };
    }
    question = state.questions.find(q => q.status === 'queued');
    if (question) {
      question.status = 'presenting'; writeState(root, state, current.revision);
      return { action: 'present', question, instruction: 'Actually display this one question, then acknowledge presentation.' };
    }
    const status = readiness(root, state);
    if (state.completed && status.ready) return { action: 'complete', next: 'Use the existing task board and applicable scoped authorizations.' };
    const stage = stages.find(s => !['verified', 'notApplicable'].includes(state.checks[s].status)) ?? 'handoff';
    return { action: 'work', stage, label: labels[stage], next: state.checks[stage].nextAction ?? 'Inspect existing sources; perform agent-owned preparation or register one necessary missing question.', issues: status.issues };
  });
}
export function acknowledge(root: string, id: string, source: string, shown = true): void {
  requireText(source, 'Actual presentation observation');
  withLock(root, 'conversation', () => {
    const current = readState(root), q = current.value.questions.find(q => q.id === id);
    if (!q || q.status !== 'presenting') throw new Error('Only an awaiting presentation can be acknowledged.');
    q.status = shown ? 'asked' : 'queued'; q.promptReferences.push(source); writeState(root, current.value, current.revision);
  });
}
export function pause(root: string, paused: boolean, source: string): void {
  requireText(source, 'Actual pause/resume request');
  withLock(root, 'conversation', () => {
    const current = readState(root); if (current.value.paused === paused) return;
    current.value.paused = paused; writeState(root, current.value, current.revision);
  });
}
export function clarify(root: string, id: string, prompt: string, source: string): void {
  requireText(prompt); requireText(source);
  withLock(root, 'conversation', () => {
    const current = readState(root), q = current.value.questions.find(q => q.id === id);
    if (!q || !['asked', 'presenting', 'answered'].includes(q.status)) throw new Error('Clarify the existing decision, not a new interview.');
    q.clarificationHistory.push({ prompt: q.prompt, source }); q.prompt = prompt; q.status = 'queued'; current.value.completed = false;
    writeState(root, current.value, current.revision);
  });
}
export function deferQuestion(root: string, id: string, source: string): void {
  requireText(source, 'Actual deferral request');
  withLock(root, 'conversation', () => {
    const current = readState(root), q = current.value.questions.find(q => q.id === id);
    if (!q || q.required) throw new Error('A required answer cannot be silently deferred.');
    q.status = 'deferred'; q.promptReferences.push(source); writeState(root, current.value, current.revision);
  });
}
export function commitReply(root: string, reply: Reply, afterWrite?: (index: number) => void): void {
  withLock(root, 'conversation', () => {
    const current = readState(root);
    const old = current.value.responses.find(r => r.id === reply.id);
    if (old) { if (old.digest !== digest(JSON.stringify(reply))) throw new Error('This response ID already has different content.'); return; }
    if (existsSync(contained(root, journalPath))) throw new Error('Recover the existing pending response first.');
    validateReply(root, reply, current.value);
    for (const w of reply.writes) if (revision(root, w.path) !== w.expectedSha256) throw new Error('A proposed destination changed; reconcile before saving.');
    save(root, journalPath, { schemaVersion: 1, reply, comparisonReferences: [] } satisfies Journal, null);
    recoverLocked(root, afterWrite);
  });
}
function recoverLocked(root: string, afterWrite?: (index: number) => void): void {
  const journal = load<Journal | null>(root, journalPath, () => null).value;
  if (!journal || journal.schemaVersion !== 1) throw new Error('No valid pending response exists.');
  const reply = journal.reply, current = readState(root);
  const old = current.value.responses.find(r => r.id === reply.id);
  if (old) {
    if (old.digest !== digest(JSON.stringify(reply))) throw new Error('Saved response history conflicts with the pending journal.');
    unlinkSync(contained(root, journalPath)); return;
  }
  validateReply(root, reply, current.value);
  for (const write of reply.writes) {
    const actual = revision(root, write.path);
    if (actual !== write.expectedSha256 && actual !== digest(write.content)) throw new Error('A pending destination has a newer edit. Reconcile without overwriting it.');
  }
  for (const [index, write] of reply.writes.entries()) {
    if (revision(root, write.path) !== digest(write.content)) replace(root, write.path, write.content, write.expectedSha256);
    afterWrite?.(index);
  }
  for (const answer of reply.answers) {
    const q = current.value.questions.find(q => q.id === answer.id)!;
    q.answerReferences.push({ source: reply.source, evidence: evidence(root, answer.path, answer.pointer) }); q.status = 'answered';
    current.value.checks[q.stage].status = 'pending'; current.value.checks[q.stage].nextAction = 'Revalidate preparation affected by the saved answer.';
    const affected: Stage[] = (answer.path.includes('browser-preferences') || answer.path.includes('tool-policy') || answer.path.includes('chrome-devtools-settings')) ? ['tools', 'access', 'operation'] : answer.path.includes('github-settings') ? ['tools', 'operation'] : answer.path.startsWith('Project Context/') || answer.path.startsWith('Product Discovery/') ? ['understanding'] : [];
    for (const stage of affected) { current.value.checks[stage].status = 'pending'; current.value.checks[stage].nextAction = 'Revalidate only preparation affected by this change.'; }
  }
  current.value.completed = false;
  current.value.responses.push({ id: reply.id, digest: digest(JSON.stringify(reply)), source: reply.source });
  writeState(root, current.value, current.revision); unlinkSync(contained(root, journalPath));
}
export function recover(root: string): void { withLock(root, 'conversation', () => recoverLocked(root)); }
/** Explicitly retire only obsolete unanswered tool-choice questions; retain all history and other decisions. */
export function retireToolQuestions(root: string, input: { ids: string[]; source: string }): void {
  requireText(input.source, 'Actual migration decision');
  if (!Array.isArray(input.ids) || !input.ids.length || new Set(input.ids).size !== input.ids.length) throw new Error('Identify the exact obsolete question IDs.');
  withLock(root, 'conversation', () => {
    if (existsSync(contained(root, journalPath))) throw new Error('Recover the interrupted reply before retiring questions.');
    const current = readState(root);
    const questions = input.ids.map(id => {
      const q = current.value.questions.find(q => q.id === id);
      if (!q || q.path !== '.local/browser-preferences.json' || !['/method', '/fallback'].includes(q.pointer ?? '') || q.status === 'answered') throw new Error('Retire only exact unanswered legacy method/fallback questions; preserve answers and visibility decisions.');
      return q;
    });
    let changed = false;
    for (const q of questions) if (q.status !== 'canceled' || q.required) {
      q.required = false; q.status = 'canceled';
      q.clarificationHistory.push({ prompt: 'Obsolete project-wide tool choice retired; the agent selects suitable tools per task. Existing constraints and answers remain.', source: input.source }); changed = true;
    }
    if (changed) writeState(root, current.value, current.revision);
  });
}
export function reconcile(root: string, writes: ProposedWrite[], comparisonSource: string): void {
  requireText(comparisonSource, 'Actual conflict comparison');
  withLock(root, 'conversation', () => {
    const loaded = load<Journal | null>(root, journalPath, () => null), journal = loaded.value;
    if (!journal || writes.length !== journal.reply.writes.length) throw new Error('Reconciliation must retain the same response and destinations.');
    for (const old of journal.reply.writes) {
      const replacement = writes.find(w => w.path === old.path); if (!replacement || replacement.origin !== old.origin) throw new Error('Do not change reconciliation bindings.');
      const actual = revision(root, old.path);
      if (actual === old.expectedSha256 || actual === digest(old.content)) {
        if (JSON.stringify(old) !== JSON.stringify(replacement)) throw new Error('Preserve already-saved and unconflicted work.');
      } else if (replacement.expectedSha256 !== actual) throw new Error('The merged proposal must reference the actual newer revision.');
      permittedWrite(root, replacement, journal.reply);
    }
    journal.reply.writes = writes; journal.comparisonReferences.push(comparisonSource); save(root, journalPath, journal, loaded.revision);
  });
}
export function recordCheck(root: string, stage: Stage, check: Check): void {
  if (!stages.includes(stage)) throw new Error('Unknown preparation stage.');
  if (['verified', 'notApplicable', 'deferred'].includes(check.status)) {
    if (check.status === 'verified' && (!check.evidence.length || !check.checkedAt)) throw new Error('A verified check needs actual evidence and time.');
    if (check.status !== 'verified') requireText(check.reason, 'Deferral/non-applicability reason');
    for (const ref of check.evidence) verifyEvidence(root, ref);
  }
  withLock(root, 'conversation', () => { const current = readState(root); current.value.checks[stage] = check; current.value.completed = false; writeState(root, current.value, current.revision); });
}
export function recordDomains(root: string, domains: ContextDomain[]): void {
  withLock(root, 'conversation', () => {
    const current = readState(root);
    for (const d of domains) { requireText(d.owner); for (const ref of d.sources) verifyEvidence(root, ref); }
    current.value.domains = domains; current.value.completed = false; writeState(root, current.value, current.revision);
  });
}
export function finish(root: string, handoff: Evidence): void {
  verifyEvidence(root, handoff);
  if (readFileSync(contained(root, handoff.path), 'utf8').trim().length < 50) throw new Error('Supply a usable scoped handoff.');
  withLock(root, 'conversation', () => {
    if (existsSync(contained(root, journalPath)) || load<{ open: boolean }>(root, '.local/settings-menu.json', () => ({ open: false })).value.open) throw new Error('Complete or close the current response/settings operation first.');
    const current = readState(root), status = readiness(root, current.value, false);
    if (!status.ready) throw new Error('Required onboarding preparation remains incomplete: ' + status.issues.join('; '));
    current.value.checks.handoff = { status: 'verified', evidence: [handoff], checkedAt: new Date().toISOString(), reason: null, nextAction: null };
    current.value.completed = true; writeState(root, current.value, current.revision);
  });
}
