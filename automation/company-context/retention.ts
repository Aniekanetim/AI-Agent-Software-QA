import { unlinkSync, existsSync } from 'node:fs';
import { privatePath, load, save, digest } from '../shared/store.js';
import { prefix, connection, storeRoot, jsonFiles, readObject, head, updateHead } from './store.js';
import type { Binding, SourceVersion, Claim } from './types.js';

/** Apply only the configured private-cache policy. Published documents remain under their owners. */
export function applyRetention(root: string, before: Binding[], after: Binding[]) {
  for (const old of before) {
    const policy = after.find(item => item.id === old.id)?.retention ?? old.retention;
    if (policy.keepHistorical) continue;
    if (old.sharedStore) throw new Error('Use a retained shared store or a project-local store for automatic removal cleanup. Shared purge needs its own owner procedure.');
    const actual = connection(root, old.connectionId), storage = storeRoot(root, old);
    const replacement = after.find(item => item.id === old.id && item.connectionId === old.connectionId);
    const removed = old.selection.channelIds.filter(channelId => !replacement?.selection.channelIds.includes(channelId));
    const protectedChannels = new Set(after.filter(item => connection(root, item.connectionId).identity.workspaceId === actual.identity.workspaceId).flatMap(item => item.selection.channelIds));
    const purge = new Set(removed.filter(channel => !protectedChannels.has(channel))); if (!purge.size) continue;
    const id = digest(JSON.stringify([old.id, [...purge].sort(), policy.source]));
    const path = `${prefix}/purges/${id}.json`, previous = load<any>(root, path, () => null);
    if (previous.value?.state === 'complete') continue;
    const sources = Object.values(head(storage, actual.identity).value.sources).filter(item => purge.has(item.ref.sourceId.split('/')[1]!)).map(item => item.ref.sourceId);
    save(root, path, { schemaVersion: 1, state: 'prepared', bindingId: old.id, channelIds: [...purge], sourceIds: sources, policy: policy.source }, previous.revision);
    for (const file of jsonFiles(storage, `${prefix}/objects`)) {
      const value = load<SourceVersion>(storage, file, () => { throw new Error('Missing source cache object.'); }).value;
      if (value.sourceId.startsWith(actual.identity.workspaceId + '/') && purge.has(value.message.channelId)) unlinkSync(privatePath(storage, file));
    }
    for (const file of jsonFiles(root, `${prefix}/knowledge`)) {
      const claim = load<Claim>(root, file, () => { throw new Error('Missing claim.'); }).value;
      if (claim.sources.some(ref => sources.includes(ref.sourceId))) unlinkSync(privatePath(root, file));
    }
    updateHead(storage, actual.identity, current => { for (const source of sources) if (current.sources[source]) current.sources[source]!.conflict = 'Private content purged under the selected retention policy; original evidence is unavailable.'; });
    const pending = load<any>(root, path, () => null); save(root, path, { ...pending.value, state: 'complete', completedAt: new Date().toISOString(), limitation: 'Private source/claim content was removed. Historical content verification is unavailable; published records require their owner retention procedure.' }, pending.revision);
  }
}
