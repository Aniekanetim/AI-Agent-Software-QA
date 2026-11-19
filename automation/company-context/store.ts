import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { contained, privatePath, load, save, evidence, verifyEvidence, digest, withLock, type Evidence } from '../shared/store.js';
import { key, validateSettings, validateIdentity, iso, type Settings, type Binding, type Connection, type Head, type Identity } from './types.js';
import { currentHarness, harnessKey } from '../tools/runtime.js';

export const settingsPath = '.local/company-context.json';
export const prefix = '.local/company-context';
export function settings(root: string) {
  const stored = load<Settings | null>(root, settingsPath, () => null); if (stored.value) validateSettings(stored.value); return stored;
}
export function binding(root: string, id: string) {
  const selected = settings(root).value?.bindings.find(item => item.id === id); if (!selected) throw new Error('Select the actual company-context binding first.'); return selected;
}
export function selectionDigest(value: Binding) { return digest(JSON.stringify({ connectionId: value.connectionId, selection: value.selection, history: value.history, directory: value.directory, retention: value.retention, maxAgeMs: value.maxAgeMs, sharedStore: value.sharedStore })); }
export function connectionRevision(value: Connection) { return digest(JSON.stringify([value.id, value.transport, value.identity.workspaceId, value.identity.userId, value.identity.botId, value.identity.enterpriseId, value.harness, value.credentialVariable, value.hostReference, value.checkedAt])); }
export function storeRoot(root: string, value: Binding) {
  if (!value.sharedStore) return root;
  verifyEvidence(root, value.sharedStore.authorization);
  const authorization = JSON.parse(readFileSync(contained(root, value.sharedStore.authorization.path), 'utf8'));
  const actual = realpathSync(value.sharedStore.root);
  if (authorization.root !== actual || authorization.bindingId !== value.id || !authorization.source || !authorization.policy) throw new Error('Shared company storage needs actual named-root authorization and isolation policy.');
  privatePath(actual, `${prefix}/heads`); return actual;
}
export function connection(root: string, id: string, current = false): Connection {
  const result = load<Connection>(root, `${prefix}/connections/${key(id)}.json`, () => { throw new Error('Discover and verify the Slack connection first.'); }).value;
  if (result.schemaVersion !== 1 || result.id !== id || !['host', 'api'].includes(result.transport)) throw new Error('Invalid company connection.');
  validateIdentity(result.identity); iso(result.checkedAt);
  if (current && harnessKey(result.harness) !== harnessKey(currentHarness(root))) throw new Error('Verify the Slack connection through the current harness and execution context.');
  result.evidence.forEach(ref => verifyEvidence(root, ref)); Object.values(result.capabilityEvidence ?? {}).forEach(ref => verifyEvidence(root, ref)); return result;
}
export function readObject<T>(root: string, ref: Evidence): T { if (ref?.pointer !== undefined) throw new Error('Use the complete versioned company record.'); verifyEvidence(root, ref); return JSON.parse(readFileSync(contained(root, ref.path), 'utf8')) as T; }
export function immutable<T>(root: string, kind: string, value: T): Evidence {
  key(kind); const hash = digest(JSON.stringify(value)); const path = `${prefix}/${kind}/${hash}.json`;
  if (existsSync(contained(root, path))) {
    const actual = readObject<T>(root, evidence(root, path)); if (digest(JSON.stringify(actual)) !== hash) throw new Error('The immutable company source object changed.');
  } else save(root, path, value, null);
  return evidence(root, path);
}
export function headPath(identity: Identity) { return `${prefix}/heads/${digest(JSON.stringify([identity.workspaceId, identity.userId, identity.botId, identity.enterpriseId])).slice(0, 32)}.json`; }
export function head(root: string, identity: Identity) { return load<Head>(root, headPath(identity), () => ({ schemaVersion: 1, workspaceId: identity.workspaceId, sources: {}, claims: {}, coverage: {} })); }
export function updateHead<T>(root: string, identity: Identity, action: (value: Head) => T): T {
  return withLock(root, `company:${headPath(identity)}`, () => { const stored = head(root, identity); const result = action(stored.value); save(root, headPath(identity), stored.value, stored.revision); return result; });
}
export function jsonFiles(root: string, folder: string) {
  const path = contained(root, folder); return existsSync(path) ? readdirSync(path).filter(item => /^[A-Za-z0-9_-]+\.json$/.test(item)).map(item => `${folder}/${item}`) : [];
}
export function sourceId(identity: Identity, channelId: string, ts: string) { return `${identity.workspaceId}/${channelId}/${ts}`; }
export function status(root: string) {
  try {
    const configured = settings(root); if (!configured.value) return { configured: false, bindings: [], issue: null, next: 'Connect Slack during onboarding or Settings → Company context when useful.' };
    return { configured: true, revision: configured.revision, issue: null, bindings: configured.value.bindings.map(item => {
      try {
        const actual = connection(root, item.connectionId), storage = storeRoot(root, item), current = head(storage, actual.identity).value;
        const selected = new Set(item.selection.channelIds);
        const sources = Object.values(current.sources).filter(source => selected.has(source.ref.sourceId.split('/')[1]!));
        const analysis = load<{ entries: Record<string, { revision: string }> } | null>(root, `${prefix}/analysis/${item.id}.json`, () => null).value;
        const jobs = jsonFiles(root, `${prefix}/sync`).map(file => load<{ id: string; bindingId: string; state: string; nextAt: string | null }>(root, file, () => { throw new Error('Missing refresh record.'); }).value).filter(job => job.bindingId === item.id && !['complete', 'superseded'].includes(job.state));
        return { id: item.id, workspaceId: actual.identity.workspaceId, connectionId: item.connectionId, channelCount: selected.size,
          selection: item.selection.mode, followNewChannels: item.selection.followNewChannels, history: item.history, maxAgeMs: item.maxAgeMs,
          channels: item.selection.channelIds.map(id => ({ id, selected: true, access: current.coverage[id]?.issue ?? (current.coverage[id]?.readAt ? 'verifiedForRecordedCoverage' : 'unverified'), coverage: current.coverage[id] ?? null })),
          sourceCount: sources.length, analyzedSourceCount: sources.filter(source => analysis?.entries[source.ref.sourceId]?.revision === source.ref.revision).length,
          pendingRefreshes: jobs.map(job => ({ id: job.id, state: job.state, nextAt: job.nextAt })),
          capabilities: actual.capabilities, checkedAt: actual.checkedAt, issue: null };
      } catch { return { id: item.id, issue: 'This Slack binding needs reconciliation; preserve its records and reverify affected access.' }; }
    }), next: 'Inspect coverage and pending analysis. A saved selection is not current QA understanding.' };
  } catch { return { configured: true, bindings: [], issue: 'Company context needs reconciliation. Back and Close settings remain available; preserve the original data.', next: 'Inspect the original settings and recovery journal. Do not reset them.' }; }
}
