import { randomUUID } from 'node:crypto';
import { load, save, evidence, verifyEvidence, digest, withLock, type Evidence } from '../shared/store.js';
import { assertIdentity, messagePage, checkPage, person } from '../slack/adapter.js';
import { ContextError, compareTs, slackNow, key, redact, type Adapter, type Message, type SourceRef, type SourceVersion, type SyncJob, type SyncUnit } from './types.js';
import { prefix, binding, settings, connection, connectionRevision, selectionDigest, storeRoot, head, updateHead, immutable, readObject, sourceId, jsonFiles } from './store.js';
import { publishCompletions } from './completion.js';
import { recordCapability } from './config.js';

export function sourceVersion(root: string, identity: ReturnType<typeof connection>['identity'], input: Message, source: string, refs: Evidence[], now: number): SourceRef {
  const text = redact(input.text), message = { ...input, text };
  const id = sourceId(identity, message.channelId, message.ts), revision = digest(JSON.stringify(message));
  const value: SourceVersion = { schemaVersion: 1, sourceId: id, message, revision, observedAt: new Date(now).toISOString(), source, operationEvidence: refs, redacted: text !== input.text };
  const ref: SourceRef = { sourceId: id, revision, snapshot: immutable(root, 'objects', value) };
  updateHead(root, identity, current => {
    const previous = current.sources[id];
    if (previous?.ref.revision === revision) { previous.observedAt = value.observedAt; return; }
    if (previous && !message.deleted) {
      if (previous.editedTs && (!message.editedTs || compareTs(message.editedTs, previous.editedTs) < 0)) return;
      const old = readObject<SourceVersion>(root, previous.ref.snapshot);
      if (!message.editedTs && !previous.editedTs && old.message.text !== message.text) {
        previous.conflict = 'Unordered source content changed. Reconcile an authoritative reread before current use.'; return;
      }
    }
    current.sources[id] = { ref, ...(message.editedTs ? { editedTs: message.editedTs } : {}), observedAt: value.observedAt };
  });
  return ref;
}
const jobPath = (id: string) => `${prefix}/sync/${key(id)}.json`;
export function inspectJob(root: string, id: string) { return load<SyncJob>(root, jobPath(id), () => { throw new Error('Inspect the original company refresh job.'); }); }
export function startRefresh(root: string, id: string, now = Date.now(), scope?: { channelIds: string[]; directory: boolean; notBefore?: string; afterGeneration?: number }) {
  const selected = binding(root, id), actual = connection(root, selected.connectionId, true), storage = storeRoot(root, selected), current = head(storage, actual.identity).value;
  const channels = [...new Set(scope?.channelIds ?? selected.selection.channelIds)].sort(), directory = scope?.directory ?? selected.directory;
  if (!channels.length || channels.some(channel => !selected.selection.channelIds.includes(channel)) || directory && !selected.directory ||
      scope?.afterGeneration !== undefined && (!Number.isSafeInteger(scope.afterGeneration) || scope.afterGeneration < 0) ||
      scope?.notBefore && !Number.isFinite(Date.parse(scope.notBefore))) throw new Error('Refresh actual selected source channels and their required generation.');
  const signature = (units: SyncUnit[]) => JSON.stringify([units.filter(unit => unit.kind === 'history').map(unit => unit.channelId).sort(), units.some(unit => unit.kind === 'directory')]);
  const desired = JSON.stringify([channels, directory]);
  return withLock(root, `company-jobs:${id}`, () => {
    const jobs = jsonFiles(root, `${prefix}/sync`).map(file => load<SyncJob>(root, file, () => { throw new Error('Missing refresh.'); }).value);
    for (const old of jobs) {
      if (old.bindingId === id && !['complete', 'superseded'].includes(old.state) && old.selectionDigest === selectionDigest(selected) &&
          old.connectionRevision === connectionRevision(actual) && signature(old.units) === desired &&
          (!scope?.notBefore || old.startedAt && Date.parse(old.startedAt) >= Date.parse(scope.notBefore)) &&
          (scope?.afterGeneration === undefined || old.generation && old.generation > scope.afterGeneration)) return { job: old, reused: true };
    }
    const units: SyncUnit[] = channels.map(channelId => {
      const through = current.coverage[channelId]?.through;
      const oldest = through && compareTs(through, selected.history.oldest) > 0 ? through : selected.history.oldest;
      return { kind: 'history', channelId, oldest, seenCursors: [], pages: 0 };
    });
    if (selected.history.includeThreads) {
      const roots = new Set<string>();
      for (const item of Object.values(current.sources)) {
        if (!channels.includes(item.ref.sourceId.split('/')[1]!)) continue;
        const value = readObject<SourceVersion>(storage, item.ref.snapshot), message = value.message;
        if (!channels.includes(message.channelId)) continue;
        const ts = message.threadTs ?? message.ts, identity = `${message.channelId}/${ts}`;
        if (!roots.has(identity)) { roots.add(identity); units.push({ kind: 'thread', channelId: message.channelId, ts, seenCursors: [], pages: 0 }); }
      }
    }
    if (directory) units.push({ kind: 'directory', seenCursors: [], pages: 0 });
    // Slack limits apply by actual connection/method, not by our job or selected channel.
    for (const unit of units) {
      const cooldowns = jobs.filter(job => job.connectionId === actual.id && job.identity.workspaceId === actual.identity.workspaceId)
        .flatMap(job => job.units.filter(old => old.kind === unit.kind && old.nextAt && Date.parse(old.nextAt) > now).map(old => old.nextAt!));
      if (cooldowns.length) unit.nextAt = new Date(Math.max(...cooldowns.map(Date.parse))).toISOString();
    }
    const sequencePath = `${prefix}/sync-generations/${key(id)}.json`, sequence = load<number>(root, sequencePath, () => 0);
    if (!Number.isSafeInteger(sequence.value) || sequence.value < 0) throw new Error('Reconcile the original source-read generation.');
    save(root, sequencePath, sequence.value + 1, sequence.revision);
    const job: SyncJob = { schemaVersion: 1, id: randomUUID(), generation: sequence.value + 1, bindingId: id, connectionId: actual.id, identity: actual.identity,
      selectionDigest: selectionDigest(selected), cutoff: slackNow(now), oldest: selected.history.oldest, units, cursor: 0,
      state: 'pending', observedAt: new Date(now).toISOString(), startedAt: new Date(now).toISOString(), connectionRevision: connectionRevision(actual), observedSources: {}, nextAt: null, issue: null, directory: [], operationEvidence: [], completedChannels: [] };
    save(root, jobPath(job.id), job, null); return { job, reused: false };
  });
}
function currentBinding(root: string, job: SyncJob) {
  const selected = settings(root).value?.bindings.find(item => item.id === job.bindingId);
  if (!selected) throw new ContextError('SELECTION_CHANGED', 'The binding was removed while its read was in flight.');
  if (selectionDigest(selected) !== job.selectionDigest) throw new ContextError('SELECTION_CHANGED', 'The source selection changed during this refresh. Its old results cannot reactivate removed channels.');
  const actual = connection(root, selected.connectionId, true); assertIdentity(actual.identity, job.identity);
  if (job.connectionRevision && job.connectionRevision !== connectionRevision(actual)) throw new ContextError('SELECTION_CHANGED', 'Connection access changed during the read; obtain current evidence.');
  return { selected, actual, storage: storeRoot(root, selected) };
}
function alive(pid: number) { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; } }
export function recoverRefresh(root: string, id: string, source: string) {
  if (!source?.trim()) throw new Error('Retain the actual interrupted-read investigation.');
  return withLock(root, `company-job:${id}`, () => {
    const stored = inspectJob(root, id), job = stored.value;
    if (['complete', 'superseded'].includes(job.state)) throw new Error('The original refresh is settled; preserve its outcome.');
    if (job.inFlight && alive(job.inFlight.pid)) throw new Error('The original Slack reader may still be running; inspect it before recovery.');
    delete job.inFlight; job.state = 'partial'; job.issue = `Interrupted safe read reconciled: ${source}`;
    save(root, jobPath(id), job, stored.revision); return job;
  });
}
export async function refresh(root: string, id: string, adapter: Adapter, options: { budget?: number; now?: () => number; retryFailures?: boolean } = {}) {
  const now = options.now ?? Date.now, budget = options.budget ?? 20;
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 1000) throw new Error('Use a bounded refresh page budget.');
  let initial = inspectJob(root, id).value;
  if (initial.units.every(unit => unit.done && !unit.issue)) {
    return withLock(root, `company-job:${id}`, () => withLock(root, 'company-configuration', () => {
      const stored = inspectJob(root, id); currentBinding(root, stored.value);
      if (stored.value.inFlight) throw new Error('Reconcile the original in-flight read before completing progress.');
      if (stored.value.state !== 'complete') { stored.value.state = 'complete'; save(root, jobPath(id), stored.value, stored.revision); }
      publishCompletions(root, stored.value); return { job: stored.value, evidence: evidence(root, jobPath(id)) };
    }));
  }
  if (initial.nextAt && Date.parse(initial.nextAt) > now()) throw new ContextError('RATE_LIMITED', 'The original Slack cooldown has not elapsed.', initial.nextAt);
  if (!options.retryFailures && initial.units.every(unit => unit.done || unit.issue)) return { job: initial, evidence: evidence(root, jobPath(id)), next: 'Resolve the recorded access/read gap before retrying this unchanged refresh.' };
  try { currentBinding(root, initial); } catch (error) {
    const stored = inspectJob(root, id); stored.value.state = 'superseded'; save(root, jobPath(id), stored.value, stored.revision); throw error;
  }
  assertIdentity(await adapter.identity(), initial.identity);
  if (options.retryFailures) {
    const stored = inspectJob(root, id); if (stored.value.inFlight) throw new Error('Reconcile the original in-flight read first.');
    for (const unit of stored.value.units) delete unit.issue;
    save(root, jobPath(id), stored.value, stored.revision);
  }
  for (let pageNumber = 0; pageNumber < budget; pageNumber++) {
    const reserved = withLock(root, `company-job:${id}`, () => {
      const stored = inspectJob(root, id), job = stored.value; currentBinding(root, job);
      if (job.inFlight) throw new Error('A Slack read is already in flight. Reconcile it before another request.');
      const candidates = job.units.map((unit, index) => ({ unit, index })).filter(item => !item.unit.done && !item.unit.issue && (!item.unit.nextAt || Date.parse(item.unit.nextAt) <= now()));
      if (!candidates.length) return null;
      const selected = candidates.find(item => item.index >= job.cursor) ?? candidates[0]!;
      job.inFlight = { pid: process.pid, unit: selected.index, startedAt: new Date(now()).toISOString() }; job.state = 'running'; job.nextAt = null;
      save(root, jobPath(id), job, stored.revision); return { job, unit: selected.unit, index: selected.index };
    });
    if (!reserved) break;
    try {
      const { job, unit } = reserved;
      const page = unit.kind === 'directory'
        ? checkPage(await adapter.directory(unit.cursor), job.identity, person)
        : messagePage(await (unit.kind === 'history' ? adapter.history(unit.channelId!, unit.oldest!, job.cutoff, unit.cursor) : adapter.thread(unit.channelId!, unit.ts!, unit.cursor)), job.identity, unit.channelId!);
      page.evidence.forEach(ref => verifyEvidence(root, ref));
      if (page.nextCursor && (page.nextCursor === unit.cursor || unit.seenCursors.includes(page.nextCursor))) throw new ContextError('PAGINATION_STALLED', 'Slack pagination repeated a cursor; preserve incomplete coverage.');
      withLock(root, `company-job:${id}`, () => withLock(root, 'company-configuration', () => {
        const stored = inspectJob(root, id), current = stored.value;
        if (current.inFlight?.unit !== reserved.index || current.inFlight.pid !== process.pid) throw new Error('Refresh ownership changed.');
        const { selected, storage } = currentBinding(root, current);
        const progress = current.units[reserved.index]!;
        const receipt = immutable(root, 'observations', { operation: progress.kind, channelId: progress.channelId ?? null, thread: progress.ts ?? null, cursor: progress.cursor ?? null,
          identity: current.identity, source: page.source, evidence: page.evidence, count: page.items.length, nextCursor: page.nextCursor, observedAt: new Date(now()).toISOString() });
        current.operationEvidence.push(receipt);
        recordCapability(root, current.connectionId, progress.kind === 'history' ? 'history' : progress.kind === 'thread' ? 'threads' : 'directory', receipt);
        if (progress.kind === 'directory') {
          const people = new Map(current.directory.map(item => [item.id, item])); for (const item of page.items as any[]) people.set(item.id, item); current.directory = [...people.values()];
        } else {
          for (const item of page.items as Message[]) {
            if (progress.kind === 'history' && (compareTs(item.ts, progress.oldest!) < 0 || compareTs(item.ts, current.cutoff) > 0)) throw new Error('Slack history returned messages outside the requested interval.');
            const observed = sourceVersion(storage, current.identity, item, page.source, storage === root ? [receipt, ...page.evidence] : [], now());
            (current.observedSources ??= {})[observed.sourceId] = observed.revision;
            if (selected.history.includeThreads && (item.replyCount || item.threadTs)) {
              const ts = item.threadTs ?? item.ts;
              if (!current.units.some(other => other.kind === 'thread' && other.channelId === item.channelId && other.ts === ts)) current.units.push({ kind: 'thread', channelId: item.channelId, ts, seenCursors: [], pages: 0 });
            }
          }
        }
        progress.pages++; if (page.nextCursor) { progress.cursor = page.nextCursor; progress.seenCursors.push(page.nextCursor); } else progress.done = true;
        delete current.inFlight; current.cursor = (reserved.index + 1) % current.units.length; current.observedAt = new Date(now()).toISOString(); current.issue = null;
        for (const channelId of current.units.filter(item => item.kind === 'history').map(item => item.channelId!)) {
          const channelUnits = current.units.filter(item => item.channelId === channelId);
          if (channelUnits.every(item => item.done && !item.issue)) {
            (current.channelCompletedAt ??= {})[channelId] ??= current.observedAt;
            updateHead(storage, current.identity, currentHead => {
              const prior = currentHead.coverage[channelId];
              if (prior?.through && compareTs(prior.through, current.cutoff) > 0) return;
              currentHead.coverage[channelId] = { channelId, oldest: current.oldest, through: current.cutoff,
                threads: channelUnits.filter(item => item.kind === 'thread').map(item => item.ts!), readAt: current.channelCompletedAt![channelId]! };
            });
            if (!current.completedChannels.includes(channelId)) current.completedChannels.push(channelId);
          }
        }
        current.state = current.units.every(item => item.done && !item.issue) ? 'complete' : 'partial';
        save(root, jobPath(id), current, stored.revision);
        publishCompletions(root, current);
      }));
    } catch (error) {
      const context = error instanceof ContextError ? error : new ContextError('READ_FAILED', 'The Slack page was not committed. Preserve coverage and inspect the failed operation.');
      withLock(root, `company-job:${id}`, () => {
        const stored = inspectJob(root, id), job = stored.value; delete job.inFlight; job.state = context.code === 'SELECTION_CHANGED' ? 'superseded' : 'partial'; job.issue = context.code;
        if (context.retryAt) {
          const kind = job.units[reserved.index]!.kind;
          for (const unit of job.units) if (!unit.done && unit.kind === kind) unit.nextAt = context.retryAt;
        } else job.units[reserved.index]!.issue = context.code;
        const channelId = job.units[reserved.index]!.channelId;
        if (channelId && context.code !== 'SELECTION_CHANGED') {
          try { const { storage } = currentBinding(root, job); updateHead(storage, job.identity, current => {
            const previous = current.coverage[channelId]; current.coverage[channelId] = { channelId, oldest: job.oldest, through: previous?.through ?? null, threads: previous?.threads ?? [], readAt: previous?.readAt ?? null, issue: context.code };
          }); } catch { /* Selection can disappear while the read returns. Never restore it. */ }
        }
        save(root, jobPath(id), job, stored.revision);
      });
      if (context.code === 'SELECTION_CHANGED') break;
    }
  }
  const stored = inspectJob(root, id), job = stored.value;
  const pending = job.units.filter(unit => !unit.done && !unit.issue);
  job.nextAt = pending.length && pending.every(unit => unit.nextAt && Date.parse(unit.nextAt) > now())
    ? new Date(Math.min(...pending.map(unit => Date.parse(unit.nextAt!)))).toISOString() : null;
  if (job.state !== 'superseded') job.state = job.units.every(unit => unit.done && !unit.issue) ? 'complete' : 'partial';
  save(root, jobPath(id), job, stored.revision);
  if (job.state !== 'superseded') withLock(root, 'company-configuration', () => { currentBinding(root, job); publishCompletions(root, job); });
  return { job, evidence: evidence(root, jobPath(id)), next: job.state === 'complete' ? 'Analyze relevant source versions before using them as QA context.' : 'Resume pending pages after resolving recorded gaps or cooldowns.' };
}
