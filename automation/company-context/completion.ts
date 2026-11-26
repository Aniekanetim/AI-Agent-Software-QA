import { digest, load, save, type Evidence } from '../shared/store.js';
import { binding, connection, connectionRevision, head, immutable, prefix, readObject, selectionDigest, storeRoot } from './store.js';
import { ContextError, sameIdentity, type ReadCompletion, type SourceRef, type SyncJob } from './types.js';

const path = (id: string, channel: string) => `${prefix}/completion-heads/${digest(JSON.stringify([id, channel]))}.json`;

/** Called only after the page progress has been durably committed. Never certifies a partial channel. */
export function publishCompletions(root: string, job: SyncJob) {
  if (!job.startedAt || !job.connectionRevision || !job.generation) return; // Legacy progress needs a new actual read.
  const selected = binding(root, job.bindingId), actual = connection(root, job.connectionId, true);
  if (selectionDigest(selected) !== job.selectionDigest || connectionRevision(actual) !== job.connectionRevision) throw new ContextError('SELECTION_CHANGED', 'The source scope/access changed before completion.');
  const state = head(storeRoot(root, selected), job.identity).value;
  for (const channelId of job.completedChannels) {
    const units = job.units.filter(unit => unit.channelId === channelId);
    if (!units.length || units.some(unit => !unit.done || unit.issue) || !job.channelCompletedAt?.[channelId]) continue;
    const previous = load<Evidence | null>(root, path(job.bindingId, channelId), () => null);
    if (previous.value) {
      const prior = readObject<ReadCompletion>(root, previous.value);
      if (prior.jobId === job.id || prior.generation >= job.generation) continue;
    }
    const sources = Object.values(state.sources).filter(item => item.ref.sourceId.split('/')[1] === channelId && job.observedSources?.[item.ref.sourceId] === item.ref.revision).map(item => item.ref);
    const value: ReadCompletion = { schemaVersion: 1, jobId: job.id, generation: job.generation, bindingId: job.bindingId, channelId, identity: job.identity,
      selectionDigest: job.selectionDigest, connectionRevision: job.connectionRevision, startedAt: job.startedAt,
      completedAt: job.channelCompletedAt[channelId]!, oldest: job.oldest, cutoff: job.cutoff,
      threads: units.filter(unit => unit.kind === 'thread').map(unit => unit.ts!), sources, operations: job.operationEvidence };
    const reference = immutable(root, 'read-completions', value);
    save(root, path(job.bindingId, channelId), reference, previous.revision);
  }
}

export function currentCompletions(root: string, id: string, refs: SourceRef[], now: number, notBefore = 0) {
  const selected = binding(root, id), actual = connection(root, selected.connectionId, true), storage = storeRoot(root, selected);
  const channels = [...new Set(refs.map(ref => ref.sourceId.split('/')[1]!))];
  return channels.map(channel => {
    const reference = load<Evidence | null>(root, path(id, channel), () => null).value;
    if (!reference) throw new ContextError('REFRESH_REQUIRED', 'Complete the required channel/thread read before renewing source evidence.');
    const value = verifyCompletion(root, reference, id, channel, now, notBefore);
    for (const ref of refs.filter(ref => ref.sourceId.split('/')[1] === channel)) {
      if (!value.sources.some(source => source.sourceId === ref.sourceId && source.revision === ref.revision)) throw new ContextError('REFRESH_REQUIRED', 'Reread the actual cited sources in a completed retrieval generation.');
    }
    // A changed head cannot be hidden by a pinned completion from an earlier read.
    for (const source of value.sources) if (head(storage, actual.identity).value.sources[source.sourceId]?.ref.revision !== source.revision) throw new ContextError('SOURCE_CHANGED', 'The completed read was superseded by a source change.');
    return reference;
  });
}

export function verifyCompletion(root: string, reference: Evidence, id: string, channel: string, now: number, notBefore = 0) {
  const selected = binding(root, id), actual = connection(root, selected.connectionId, true), value = readObject<ReadCompletion>(root, reference);
  const start = Date.parse(value.startedAt), end = Date.parse(value.completedAt);
  if (value.schemaVersion !== 1 || value.bindingId !== id || value.channelId !== channel || !sameIdentity(value.identity, actual.identity) || value.connectionRevision !== connectionRevision(actual) ||
      value.selectionDigest !== selectionDigest(selected) || !Number.isFinite(start) || !Number.isFinite(end) || start < notBefore || start < Date.parse(actual.checkedAt) || end < start || end > now || now - end > selected.maxAgeMs || !Array.isArray(value.sources) || !value.operations?.length) {
    throw new ContextError('REFRESH_REQUIRED', 'Obtain a completed actual read for this source scope and work boundary.');
  }
  for (const ref of value.operations) readObject(root, ref);
  const job = load<SyncJob | null>(root, `${prefix}/sync/${value.jobId}.json`, () => null).value;
  const units = job?.units.filter(unit => unit.channelId === channel);
  if (!job || !Number.isSafeInteger(value.generation) || value.generation < 1 || job.generation !== value.generation || job.selectionDigest !== value.selectionDigest || job.connectionRevision !== value.connectionRevision || job.startedAt !== value.startedAt || job.cutoff !== value.cutoff || job.channelCompletedAt?.[channel] !== value.completedAt ||
      !units?.some(unit => unit.kind === 'history') || units.some(unit => !unit.done || unit.issue) || !job.completedChannels.includes(channel) ||
      value.sources.some(source => job.observedSources?.[source.sourceId] !== source.revision) || value.threads.some(ts => !units.some(unit => unit.kind === 'thread' && unit.ts === ts))) {
    throw new ContextError('REFRESH_REQUIRED', 'The original read progress does not establish completed relevant coverage.');
  }
  return value;
}
