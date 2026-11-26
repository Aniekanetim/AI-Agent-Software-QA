import { randomUUID } from 'node:crypto';
import { load, save, withLock, verifyEvidence, type Evidence } from '../shared/store.js';
import { channelPage } from '../slack/adapter.js';
import { connection, connectionRevision, immutable, prefix, readObject } from './store.js';
import { ContextError, sameIdentity, key, type Catalog, type Channel, type Page } from './types.js';

interface Progress { catalog: Evidence; connectionRevision: string; inFlight?: { pid: number; cursor: string | null }; source?: string }
const path = (id: string) => `${prefix}/catalog-operations/${key(id)}.json`;
export function catalogProgress(root: string, id: string) { return load<Progress>(root, path(id), () => { throw new Error('Inspect the original catalog operation.'); }); }
export function beginCatalog(root: string, id: string, source: string, previous?: Evidence, now = Date.now()) {
  const actual = connection(root, id, true), old = previous && readObject<Catalog>(root, previous);
  if (old && (old.connectionId !== id || !sameIdentity(old.identity, actual.identity))) throw new Error('Resume the same Slack catalog identity.');
  if (old?.operationId) {
    const stored = catalogProgress(root, old.operationId);
    if (stored.value.catalog.sha256 !== previous!.sha256 || stored.value.connectionRevision !== connectionRevision(actual)) throw new Error(`Resume the current catalog operation ${old.operationId}; the saved page or access changed.`);
    return old;
  }
  const operationId = randomUUID();
  const value: Catalog = { ...(old || { schemaVersion: 1 as const, connectionId: id, identity: actual.identity, channels: [], cursor: null, complete: false, evidence: [] }),
    id: operationId, operationId, source, checkedAt: new Date(now).toISOString(), seenCursors: old?.cursor ? [old.cursor] : [] };
  save(root, path(operationId), { catalog: immutable(root, 'catalogs', value), connectionRevision: connectionRevision(actual) } satisfies Progress, null);
  return value;
}
export function reserveCatalogPage(root: string, catalog: Catalog, now = Date.now()) {
  return withLock(root, `catalog:${catalog.operationId}`, () => {
    const stored = catalogProgress(root, catalog.operationId!), current = readObject<Catalog>(root, stored.value.catalog);
    if (stored.value.inFlight) throw new Error(`A catalog read is in flight. Inspect/recover catalog operation ${catalog.operationId}.`);
    if (current.cursor !== catalog.cursor || current.checkedAt !== catalog.checkedAt || current.complete) throw new Error('Resume the latest incomplete catalog page.');
    if (current.nextAt && Date.parse(current.nextAt) > now) throw new ContextError('RATE_LIMITED', 'The original catalog cooldown has not elapsed.', current.nextAt);
    const actual = connection(root, current.connectionId, true);
    if (stored.value.connectionRevision !== connectionRevision(actual)) throw new Error('The catalog connection changed.');
    stored.value.inFlight = { pid: process.pid, cursor: current.cursor };
    save(root, path(catalog.operationId!), stored.value, stored.revision);
  });
}
export function commitCatalogPage(root: string, catalog: Catalog, page: Page<Channel>, now = Date.now()) {
  return withLock(root, `catalog:${catalog.operationId}`, () => {
    const stored = catalogProgress(root, catalog.operationId!), actual = connection(root, catalog.connectionId, true);
    if (stored.value.inFlight?.pid !== process.pid || stored.value.inFlight.cursor !== catalog.cursor || stored.value.connectionRevision !== connectionRevision(actual)) throw new Error('The catalog operation/access changed before commit.');
    channelPage(page, actual.identity);
    page.evidence.forEach(ref => verifyEvidence(root, ref));
    if (page.nextCursor && (page.nextCursor === catalog.cursor || catalog.seenCursors?.includes(page.nextCursor))) throw new ContextError('PAGINATION_STALLED', 'Slack channel pagination did not progress. Preserve the earlier catalog.');
    const observation = immutable(root, 'observations', { operation: 'channels', identity: actual.identity, cursor: catalog.cursor, nextCursor: page.nextCursor,
      source: page.source, evidence: page.evidence, channels: page.items, observedAt: new Date(now).toISOString() });
    const channels = new Map(catalog.channels.map(item => [item.id, item])); page.items.forEach(item => channels.set(item.id, item));
    const value: Catalog = { ...catalog, channels: [...channels.values()], cursor: page.nextCursor, complete: !page.nextCursor,
      checkedAt: new Date(now).toISOString(), seenCursors: [...(catalog.seenCursors ?? []), ...(page.nextCursor ? [page.nextCursor] : [])], evidence: [...catalog.evidence, observation], issue: undefined, nextAt: null };
    save(root, path(catalog.operationId!), { catalog: immutable(root, 'catalogs', value), connectionRevision: stored.value.connectionRevision } satisfies Progress, stored.revision);
    return value;
  });
}
export function failCatalogPage(root: string, catalog: Catalog, error: unknown) {
  const issue = error instanceof ContextError ? error : new ContextError('READ_FAILED', 'Slack catalog retrieval failed; retain and resume its completed pages.');
  withLock(root, `catalog:${catalog.operationId}`, () => {
    const stored = catalogProgress(root, catalog.operationId!);
    if (stored.value.inFlight?.pid !== process.pid) return;
    const current = readObject<Catalog>(root, stored.value.catalog);
    const value = { ...current, issue: issue.code, nextAt: issue.retryAt ?? null };
    save(root, path(catalog.operationId!), { catalog: immutable(root, 'catalogs', value), connectionRevision: stored.value.connectionRevision }, stored.revision);
  });
  const progress = catalogProgress(root, catalog.operationId!).value.catalog;
  return Object.assign(new ContextError(issue.code, `${issue.message} Resume catalog operation ${catalog.operationId}.`, issue.retryAt), { progress });
}
export function recoverCatalog(root: string, id: string, source: string) {
  if (!source?.trim()) throw new Error('Record the actual stopped-reader investigation.');
  return withLock(root, `catalog:${id}`, () => {
    const stored = catalogProgress(root, id), flight = stored.value.inFlight;
    if (flight) {
      let alive = true; try { process.kill(flight.pid, 0); } catch (error) { alive = (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
      if (alive) throw new Error('The original catalog reader may still be running.');
    }
    delete stored.value.inFlight; stored.value.source = source; save(root, path(id), stored.value, stored.revision);
    return { catalog: stored.value.catalog, next: 'Resume from the retained continuation after its cooldown.' };
  });
}
