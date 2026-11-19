import { readFileSync } from 'node:fs';
import { contained, load, save, digest, withLock, verifyEvidence, evidence, requireText, assertNonsecret, type Evidence } from '../shared/store.js';
import { currentHarness } from '../tools/runtime.js';
import { assertIdentity, channelPage } from '../slack/adapter.js';
import { ContextError, key, validateIdentity, validateBinding, sameIdentity, iso, type Connection, type Adapter, type Catalog, type Binding, type Settings, type Capability } from './types.js';
import { prefix, settingsPath, settings, connection, immutable, readObject, selectionDigest, binding, storeRoot } from './store.js';
import { applyRetention } from './retention.js';

export function recordConnection(root: string, input: Omit<Connection, 'schemaVersion' | 'harness' | 'checkedAt'>, now = Date.now()) {
  key(input.id); validateIdentity(input.identity); requireText(input.source); assertNonsecret(input);
  if (!['host', 'api'].includes(input.transport) || !Array.isArray(input.evidence) || !input.evidence.length) throw new Error('Retain the actual connection-inspection evidence.');
  if (input.transport === 'host') requireText(input.hostReference, 'Actual native Slack connection');
  if (input.transport === 'api' && !/^QA_SLACK_[A-Z0-9_]+$/.test(input.credentialVariable ?? '')) throw new Error('Use a named QA_SLACK_ runtime credential variable.');
  if (Object.entries(input.capabilities).some(([name, state]) => !['identity', 'channels', 'history', 'threads', 'directory', 'join'].includes(name) || !['verified', 'unverified', 'unsupported', 'denied'].includes(state))) throw new Error('Record actual operation capabilities.');
  input.evidence.forEach(ref => verifyEvidence(root, ref));
  const actual: Connection = { ...input, schemaVersion: 1, harness: currentHarness(root), checkedAt: new Date(now).toISOString() };
  return withLock(root, `company-connection:${input.id}`, () => {
    const path = `${prefix}/connections/${input.id}.json`, previous = load<Connection | null>(root, path, () => null);
    if (previous.value && !sameIdentity(previous.value.identity, actual.identity) && settings(root).value?.bindings.some(item => item.connectionId === input.id)) throw new Error('Use a new connection ID when its active workspace or principal changes.');
    save(root, path, actual, previous.revision); return actual;
  });
}
export async function inspectApi(root: string, input: { id: string; credentialVariable: string; source: string }, adapter: Adapter) {
  const identity = await adapter.identity();
  const observed = immutable(root, 'observations', { identity, source: input.source, observedAt: new Date().toISOString(), operation: 'auth.test' });
  return recordConnection(root, { ...input, identity, transport: 'api', evidence: [observed], capabilities: { identity: 'verified' } });
}
export function recordCapability(root: string, id: string, capability: Capability, observed: Evidence) {
  verifyEvidence(root, observed);
  withLock(root, `company-connection:${id}`, () => {
    const path = `${prefix}/connections/${key(id)}.json`, stored = load<Connection>(root, path, () => { throw new Error('Inspect the original connection.'); });
    stored.value.capabilities[capability] = 'verified'; (stored.value.capabilityEvidence ??= {})[capability] = observed;
    save(root, path, stored.value, stored.revision);
  });
}
export async function discoverChannels(root: string, id: string, adapter: Adapter, input: { budget?: number; previous?: Evidence; source: string }, now = Date.now()) {
  const actual = connection(root, id, true); assertIdentity(await adapter.identity(), actual.identity); requireText(input.source);
  const budget = input.budget ?? 20; if (!Number.isSafeInteger(budget) || budget < 1 || budget > 1000) throw new Error('Use a bounded catalog page budget.');
  const old = input.previous ? readObject<Catalog>(root, input.previous) : null;
  if (old && (old.connectionId !== id || !sameIdentity(old.identity, actual.identity))) throw new Error('Resume the same Slack catalog identity.');
  if (old?.complete) return { catalog: input.previous!, complete: true };
  const channels = new Map((old?.channels ?? []).map(item => [item.id, item])); let cursor = old?.cursor ?? undefined;
  const seen = new Set<string>(); const receipts: Evidence[] = [...(old?.evidence ?? [])]; let complete = false;
  for (let index = 0; index < budget; index++) {
    const page = channelPage(await adapter.channels(cursor), actual.identity); page.evidence.forEach(ref => verifyEvidence(root, ref)); receipts.push(...page.evidence);
    for (const item of page.items) channels.set(item.id, item);
    if (!page.nextCursor) { complete = true; cursor = undefined; break; }
    if (seen.has(page.nextCursor) || page.nextCursor === cursor) throw new ContextError('PAGINATION_STALLED', 'Slack channel pagination did not progress. Preserve the earlier catalog.');
    seen.add(page.nextCursor); cursor = page.nextCursor;
  }
  const catalog: Catalog = { schemaVersion: 1, id: digest(`${id}:${now}`).slice(0, 24), connectionId: id, identity: actual.identity, channels: [...channels.values()], cursor: cursor ?? null, complete, source: input.source, checkedAt: new Date(now).toISOString(), evidence: receipts };
  const reference = immutable(root, 'catalogs', catalog); recordCapability(root, id, 'channels', reference);
  return { catalog: reference, complete, channelCount: channels.size, next: complete ? 'Select channels and preview configuration.' : 'Resume this catalog before selecting all accessible channels.' };
}
interface Preview { schemaVersion: 1; bindings: Binding[]; expectedRevision: string | null; source: string; connections: Evidence[]; digest: string }
export function previewConfiguration(root: string, input: { bindings: Binding[]; source: string }) {
  requireText(input.source); if (!Array.isArray(input.bindings) || new Set(input.bindings.map(item => item.id)).size !== input.bindings.length) throw new Error('Use distinct company bindings.');
  const connections: Evidence[] = [];
  for (const value of input.bindings) {
    validateBinding(value); const actual = connection(root, value.connectionId, true), catalog = readObject<Catalog>(root, value.selection.catalog);
    if (catalog.schemaVersion !== 1 || catalog.connectionId !== actual.id || !sameIdentity(catalog.identity, actual.identity)) throw new Error('Use the actual catalog for this workspace and connection.');
    const available = new Map(catalog.channels.map(item => [item.id, item]));
    if (value.selection.channelIds.some(id => !available.has(id))) throw new Error('Select channel IDs present in the actual catalog.');
    if (value.selection.mode === 'allAccessible') {
      const eligible = catalog.channels.filter(item => !item.archived).map(item => item.id).sort();
      if (!catalog.complete || JSON.stringify([...value.selection.channelIds].sort()) !== JSON.stringify(eligible)) throw new Error('All accessible selection needs the complete nonarchived channel catalog.');
    }
    storeRoot(root, value); connections.push(evidence(root, `${prefix}/connections/${actual.id}.json`));
  }
  const proposal = { schemaVersion: 1 as const, bindings: input.bindings, expectedRevision: settings(root).revision, source: input.source, connections };
  const preview: Preview = { ...proposal, digest: digest(JSON.stringify(proposal)) };
  return { preview: immutable(root, 'previews', preview), digest: preview.digest,
    before: settings(root).value?.bindings.map(item => ({ id: item.id, channels: item.selection.channelIds })) ?? [],
    after: input.bindings.map(item => ({ id: item.id, channels: item.selection.channelIds, pendingReadVerification: true })),
    next: 'Present the exact selection/history changes and retain the actual user response before applying.' };
}
export function applyConfiguration(root: string, input: { preview: Evidence; digest: string; response: Evidence; source: string; editId?: string }) {
  const preview = readObject<Preview>(root, input.preview); requireText(input.source); verifyEvidence(root, input.response);
  const { digest: expected, ...proposal } = preview;
  if (expected !== input.digest || digest(JSON.stringify(proposal)) !== expected) throw new Error('Apply the exact presented company-context preview.');
  preview.connections.forEach(ref => verifyEvidence(root, ref)); preview.bindings.forEach(item => { validateBinding(item); verifyEvidence(root, item.selection.catalog); storeRoot(root, item); });
  return withLock(root, 'company-configuration', () => {
    const journalPath = `${prefix}/transactions/config-${expected}.json`;
    const prior = load<any>(root, journalPath, () => null), current = settings(root);
    if (prior.value?.state === 'complete' && current.value && digest(JSON.stringify(current.value.bindings)) === digest(JSON.stringify(preview.bindings))) return { saved: true, recovered: true, revision: current.revision };
    if (current.revision !== preview.expectedRevision) {
      if (prior.value?.state === 'prepared' && current.value && digest(JSON.stringify(current.value.bindings)) === digest(JSON.stringify(preview.bindings)) && current.value.source === input.source) {
        applyRetention(root, prior.value.before ?? [], preview.bindings);
        save(root, journalPath, { ...prior.value, state: 'complete' }, prior.revision); return { saved: true, recovered: true, revision: current.revision };
      }
      throw new ContextError('SAVE_CONFLICT', 'Company settings changed; preserve the response and preview the current selection.');
    }
    const journal = { schemaVersion: 1, state: 'prepared', request: input, expectedRevision: current.revision, before: current.value?.bindings ?? [] };
    save(root, journalPath, journal, prior.revision);
    const value: Settings = { schemaVersion: 1, bindings: preview.bindings, source: input.source, savedAt: new Date().toISOString() };
    save(root, settingsPath, value, current.revision);
    applyRetention(root, journal.before, preview.bindings);
    const pending = load<any>(root, journalPath, () => null); save(root, journalPath, { ...journal, state: 'complete' }, pending.revision);
    return { saved: true, revision: settings(root).revision, next: 'Verify actual reading and prepare/resume initial history jobs. Selection alone is not access.' };
  });
}
export function recoverConfiguration(root: string, previewDigest: string) {
  if (!/^[a-f0-9]{64}$/.test(previewDigest)) throw new Error('Use the original preview digest.');
  const journal = load<{ request: Parameters<typeof applyConfiguration>[1] }>(root, `${prefix}/transactions/config-${previewDigest}.json`, () => { throw new Error('Inspect the original configuration journal.'); });
  const result = applyConfiguration(root, journal.value.request);
  if (journal.value.request.editId) {
    const edit = editQuestion(root);
    if (edit.value?.id === journal.value.request.editId && edit.value.status !== 'answered') {
      edit.value.status = 'answered'; edit.value.response = journal.value.request.response;
      save(root, editPath, edit.value, edit.revision);
    }
  }
  return result;
}
/** The original follow-new-channels choice authorizes catalog expansion, never membership changes. */
export async function followCatalog(root: string, id: string, adapter: Adapter) {
  const selected = binding(root, id); if (!selected.selection.followNewChannels) return { changed: false };
  const original = settings(root), result = await discoverChannels(root, selected.connectionId, adapter, { source: original.value!.source });
  if (!result.complete) return { changed: false, partial: true, catalog: result.catalog };
  return adoptFollowingCatalog(root, id, result.catalog);
}
export function adoptFollowingCatalog(root: string, id: string, reference: Evidence) {
  const selected = binding(root, id), original = settings(root), actual = connection(root, selected.connectionId, true);
  if (!selected.selection.followNewChannels) return { changed: false };
  const catalog = readObject<Catalog>(root, reference);
  if (!catalog.complete || catalog.connectionId !== actual.id || !sameIdentity(catalog.identity, actual.identity)) throw new Error('Follow new channels only from the completed actual workspace catalog.');
  const channels = catalog.channels.filter(item => !item.archived).map(item => item.id);
  if (channels.every(channel => selected.selection.channelIds.includes(channel))) return { changed: false, catalog: reference };
  return withLock(root, 'company-configuration', () => {
    const current = settings(root); if (current.revision !== original.revision) throw new Error('The channel selection changed during catalog refresh.');
    const updated = current.value!.bindings.find(item => item.id === id)!;
    updated.selection.channelIds = [...new Set([...updated.selection.channelIds, ...channels])]; updated.selection.catalog = reference;
    current.value!.savedAt = new Date().toISOString(); save(root, settingsPath, current.value, current.revision);
    return { changed: true, channelCount: updated.selection.channelIds.length, next: 'Assess the newly followed sources for current task applicability.' };
  });
}
export async function joinChannel(root: string, input: { bindingId: string; channelId: string; authorization: Evidence; source: string; recover?: boolean }, adapter: Adapter) {
  const selected = binding(root, input.bindingId), actual = connection(root, selected.connectionId, true); key(input.channelId); requireText(input.source);
  if (!selected.selection.channelIds.includes(input.channelId)) throw new Error('Membership setup must refer to a selected channel.');
  const authority = readObject<{ action: string; workspaceId: string; userId: string; channelId: string; source: string }>(root, input.authorization);
  if (authority.action !== 'join' || authority.workspaceId !== actual.identity.workspaceId || authority.userId !== actual.identity.userId || authority.channelId !== input.channelId || !authority.source) throw new Error('Record actual membership authorization for this principal and channel.');
  assertIdentity(await adapter.identity(), actual.identity); if (!adapter.channel) throw new Error('Actual membership readback is required.');
  const path = `${prefix}/transactions/join-${digest(JSON.stringify([selected.id, input.channelId, input.authorization]))}.json`;
  const previous = load<any>(root, path, () => null);
  if (previous.value && !input.recover) throw new Error('Inspect the original membership operation before another join.');
  const observed = await adapter.channel(input.channelId);
  if (observed.member) { save(root, path, { schemaVersion: 1, state: 'complete', source: input.source, observedAt: new Date().toISOString(), authorization: input.authorization }, previous.revision); return { member: true }; }
  if (input.recover) throw new Error('The original join is not verified; preserve the outcome and obtain an explicit new attempt decision.');
  if (observed.type !== 'public' || observed.archived || !adapter.join) throw new Error('Use the actual private-channel invitation or supported membership setup.');
  withLock(root, `membership:${path}`, () => save(root, path, { schemaVersion: 1, state: 'uncertain', source: input.source, authorization: input.authorization }, previous.revision));
  await adapter.join(input.channelId);
  const after = await adapter.channel(input.channelId); if (!after.member) throw new Error('Slack did not verify the completed membership.');
  const pending = load<any>(root, path, () => null); save(root, path, { ...pending.value, state: 'complete', observedAt: new Date().toISOString() }, pending.revision); return { member: true };
}

export interface Edit { schemaVersion: 1; id: string; prompt: string; source: string; expectedRevision: string | null; status: 'queued' | 'presenting' | 'asked' | 'answered' | 'canceled'; references: string[]; response?: Evidence }
const editPath = `${prefix}/edit.json`;
export function editQuestion(root: string) { return load<Edit | null>(root, editPath, () => null); }
export function beginEdit(root: string, input: { id: string; prompt: string; source: string }) {
  key(input.id); requireText(input.prompt); requireText(input.source); const previous = editQuestion(root);
  if (previous.value && !['answered', 'canceled'].includes(previous.value.status)) throw new Error('Preserve or finish the original company-context edit.');
  const value: Edit = { ...input, schemaVersion: 1, expectedRevision: settings(root).revision, status: 'queued', references: [] };
  save(root, editPath, value, previous.revision); return value;
}
export function markEdit(root: string, status: Edit['status'], source?: string) {
  const current = editQuestion(root); if (!current.value) throw new Error('Inspect the original company-context edit.');
  if (source) { requireText(source); current.value.references.push(source); }
  if (status === 'asked' && current.value.status !== 'presenting') throw new Error('Present the company-context question before recording it as shown.');
  current.value.status = status; save(root, editPath, current.value, current.revision); return current.value;
}
export function answerEdit(root: string, input: Parameters<typeof applyConfiguration>[1]) {
  const current = editQuestion(root); if (!current.value || current.value.status !== 'asked') throw new Error('Retain the actual presented company-context question before saving.');
  const preview = readObject<Preview>(root, input.preview); if (preview.expectedRevision !== current.value.expectedRevision) throw new Error('Preview the selection bound to the original edit revision.');
  const result = applyConfiguration(root, { ...input, editId: current.value.id }); current.value.status = 'answered'; current.value.response = input.response; save(root, editPath, current.value, current.revision); return result;
}
