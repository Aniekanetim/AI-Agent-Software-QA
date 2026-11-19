import { load, save, digest, requireText, type Evidence } from '../shared/store.js';
import { binding, connection, storeRoot, head, prefix, readObject, immutable } from './store.js';
import { assertIdentity } from '../slack/adapter.js';
import { timestamp, type Adapter } from './types.js';
const pathFor = (id: string) => `${prefix}/links/${digest(id)}.json`;
interface Link { sourceId: string; url: string; source: string; evidence: Evidence }
export function sourceLink(root: string, sourceId: string) {
  const value = load<Link | null>(root, pathFor(sourceId), () => null).value;
  if (value) { const original = readObject<Link>(root, value.evidence); if (value.sourceId !== sourceId || original.sourceId !== sourceId || original.url !== value.url) throw new Error('Reconcile the actual canonical source link.'); }
  return value;
}
export function recordSourceLink(root: string, input: { bindingId: string; sourceId: string; url: string; source: string; evidence: Evidence }) {
  const selected = binding(root, input.bindingId), actual = connection(root, selected.connectionId, true), [workspace, channelId, ts] = input.sourceId.split('/');
  if (workspace !== actual.identity.workspaceId || !selected.selection.channelIds.includes(channelId!) || !head(storeRoot(root, selected), actual.identity).value.sources[input.sourceId]) throw new Error('Link an actual selected source from this workspace.');
  timestamp(ts!); requireText(input.source); const url = new URL(input.url);
  if (url.protocol !== 'https:' || url.username || url.password || !(url.hostname === 'app.slack.com' || url.hostname.endsWith('.slack.com'))) throw new Error('Use the actual HTTPS Slack source permalink.');
  const observed = readObject<{ sourceId: string; url: string; source: string }>(root, input.evidence);
  if (observed.sourceId !== input.sourceId || observed.url !== input.url || !observed.source) throw new Error('Bind the source link to its actual provider observation.');
  const old = load<Link | null>(root, pathFor(input.sourceId), () => null); save(root, pathFor(input.sourceId), { sourceId: input.sourceId, url: input.url, source: input.source, evidence: input.evidence }, old.revision);
  return { sourceId: input.sourceId, url: input.url };
}
export async function retrieveSourceLink(root: string, input: { bindingId: string; sourceId: string; source: string }, adapter: Adapter) {
  const selected = binding(root, input.bindingId), actual = connection(root, selected.connectionId, true);
  assertIdentity(await adapter.identity(), actual.identity); const [workspace, channelId, ts] = input.sourceId.split('/');
  if (workspace !== actual.identity.workspaceId || !selected.selection.channelIds.includes(channelId!) || !adapter.permalink) throw new Error('Retrieve a canonical link through the actual selected provider.');
  const url = await adapter.permalink(channelId!, timestamp(ts!));
  const observed = immutable(root, 'observations', { sourceId: input.sourceId, url, source: input.source, observedAt: new Date().toISOString() });
  return recordSourceLink(root, { ...input, url, evidence: observed });
}
