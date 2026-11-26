import { beginCatalog, reserveCatalogPage, commitCatalogPage, failCatalogPage, catalogProgress } from '../company-context/catalog.js';
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
export function importHostCatalog(root: string, input: { connectionId: string; pages: { page: Page<Channel>; cursor: string | null; call: Evidence }[]; source: string; previous?: Evidence }) {
  const actual = connection(root, input.connectionId, true); if (actual.transport !== 'host') throw new Error('Use the actual native Slack connection.'); requireText(input.source);
  if (!input.pages.length) throw new Error('Retain actual native catalog pages.');
  let catalog = beginCatalog(root, actual.id, input.source, input.previous);
  for (const item of input.pages) {
    if (catalog.complete || item.cursor !== catalog.cursor) throw new Error('Retain the original native catalog page chain.');
    const call = readObject<{ connectionId: string; cursor: string | null; identity: Identity; source: string; resultDigest: string }>(root, item.call);
    assertIdentity(call.identity, actual.identity); if (call.connectionId !== actual.id || call.cursor !== item.cursor || !call.source) throw new Error('Bind the native catalog call to its actual account/cursor.');
    if (call.resultDigest !== hostPageDigest(item.page)) throw new Error('The native channel page differs from its recorded output.');
    item.page.evidence.forEach(ref => verifyEvidence(root, ref));
    reserveCatalogPage(root, catalog);
    try { catalog = commitCatalogPage(root, catalog, { ...item.page, evidence: [...item.page.evidence, item.call] }); }
    catch (error) { throw failCatalogPage(root, catalog, error); }
  }
  const reference = catalogProgress(root, catalog.operationId!).value.catalog; recordCapability(root, actual.id, 'channels', reference);
  if (catalog.complete) for (const selected of settings(root).value?.bindings ?? []) if (selected.connectionId === actual.id && selected.selection.followNewChannels) adoptFollowingCatalog(root, selected.id, reference);
  return { catalog: reference, complete: catalog.complete, channelCount: catalog.channels.length, operationId: catalog.operationId };
}
