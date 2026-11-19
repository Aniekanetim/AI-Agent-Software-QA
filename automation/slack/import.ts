import { verifyEvidence, requireText, digest, type Evidence } from '../shared/store.js';
import { HostSlackAdapter } from './host.js';
import { assertIdentity, channelPage } from './adapter.js';
import { connection, readObject, immutable, prefix } from '../company-context/store.js';
import { inspectJob, refresh } from '../company-context/sync.js';
import type { Page, Message, Person, Catalog, Channel, Identity } from '../company-context/types.js';
import { recordCapability, adoptFollowingCatalog } from '../company-context/config.js';
import { settings } from '../company-context/store.js';

export interface HostRead {
  jobId: string;
  operation: 'history' | 'thread' | 'directory';
  channelId?: string; oldest?: string; latest?: string; ts?: string; cursor?: string;
  page: Page<Message> | Page<Person>;
  call: Evidence;
}
export const hostPageDigest = (page: Page<unknown>) => digest(JSON.stringify({ identity: page.identity, items: page.items, nextCursor: page.nextCursor, source: page.source }));
/** Import an actual native operation, bound to its request. Never invokes a fictitious connector. */
export async function importHostPage(root: string, input: HostRead) {
  const job = inspectJob(root, input.jobId).value, selected = connection(root, job.connectionId, true);
  if (selected.transport !== 'host') throw new Error('Use the verified native Slack binding for native read evidence.');
  const call = readObject<Omit<HostRead, 'page' | 'call'> & { identity: Identity; source: string; resultDigest: string }>(root, input.call);
  assertIdentity(call.identity, selected.identity); assertIdentity(input.page.identity, selected.identity); requireText(call.source);
  if (call.resultDigest !== hostPageDigest(input.page)) throw new Error('The normalized native page differs from its retained operation output.');
  for (const field of ['jobId', 'operation', 'channelId', 'oldest', 'latest', 'ts', 'cursor'] as const) if (call[field] !== input[field]) throw new Error('The native read evidence must match the exact recorded Slack request.');
  input.page.evidence = [...input.page.evidence, input.call];
  const match = (operation: string, channelId?: string, oldest?: string, latest?: string, ts?: string, cursor?: string) => {
    if (input.operation !== operation || input.channelId !== channelId || input.oldest !== oldest || input.latest !== latest || input.ts !== ts || input.cursor !== cursor) throw new Error('The captured native page does not match the next pending refresh request.');
    return input.page;
  };
  return refresh(root, job.id, new HostSlackAdapter({ identity: async () => call.identity,
    channels: async () => { throw new Error('Use actual channel-catalog inspection.'); },
    history: async (channel, oldest, latest, cursor) => match('history', channel, oldest, latest, undefined, cursor) as Page<Message>,
    thread: async (channel, ts, cursor) => match('thread', channel, undefined, undefined, ts, cursor) as Page<Message>,
    directory: async cursor => match('directory', undefined, undefined, undefined, undefined, cursor) as Page<Person>,
  }), { budget: 1 });
}
export function importHostCatalog(root: string, input: { connectionId: string; pages: { page: Page<Channel>; cursor: string | null; call: Evidence }[]; source: string }) {
  const actual = connection(root, input.connectionId, true); if (actual.transport !== 'host') throw new Error('Use the actual native Slack connection.'); requireText(input.source);
  let cursor: string | null = null, complete = false; const channels = new Map<string, Channel>(), seen = new Set<string>(), refs: Evidence[] = [];
  for (const item of input.pages) {
    if (complete || item.cursor !== cursor) throw new Error('Retain the original complete native catalog page chain.');
    const call = readObject<{ connectionId: string; cursor: string | null; identity: Identity; source: string; resultDigest: string }>(root, item.call);
    assertIdentity(call.identity, actual.identity); if (call.connectionId !== actual.id || call.cursor !== cursor || !call.source) throw new Error('Bind the native catalog call to its actual account/cursor.');
    if (call.resultDigest !== hostPageDigest(item.page)) throw new Error('The native channel page differs from its recorded output.');
    const page = channelPage(item.page, actual.identity); page.evidence.forEach(ref => verifyEvidence(root, ref)); refs.push(item.call, ...page.evidence);
    page.items.forEach(channel => channels.set(channel.id, channel)); cursor = page.nextCursor;
    if (!cursor) complete = true; else { if (seen.has(cursor)) throw new Error('Native Slack catalog pagination repeated a cursor.'); seen.add(cursor); }
  }
  if (!input.pages.length) throw new Error('Retain actual native catalog pages.');
  const catalog: Catalog = { schemaVersion: 1, id: `host-${Date.now()}`, connectionId: actual.id, identity: actual.identity, channels: [...channels.values()], cursor, complete, source: input.source, checkedAt: new Date().toISOString(), evidence: refs };
  const reference = immutable(root, 'catalogs', catalog); recordCapability(root, actual.id, 'channels', reference);
  if (complete) for (const selected of settings(root).value?.bindings ?? []) if (selected.connectionId === actual.id && selected.selection.followNewChannels) adoptFollowingCatalog(root, selected.id, reference);
  return { catalog: reference, complete, channelCount: channels.size };
}
