import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bindHarness } from '../tools/runtime.js';
import { evidence, type Evidence } from '../shared/store.js';
import { recordConnection, discoverChannels, previewConfiguration, applyConfiguration } from '../company-context/config.js';
import { startRefresh, refresh } from '../company-context/sync.js';
import { settings, selectionDigest, immutable, readObject } from '../company-context/store.js';
import { inspectedSources, recordClaim, recordAnalysis } from '../company-context/knowledge.js';
import { bindBasis, refreshReceipt } from '../company-context/guards.js';
import type { Adapter, Channel, Identity, Message, Page, Person, Binding, Claim, Basis } from '../company-context/types.js';

export class FakeSlack implements Adapter {
  principal: Identity = { workspaceId: 'T1', userId: 'U1', name: 'Synthetic company' };
  channelList: Channel[] = ['C1', 'C2'].map(id => ({ id, name: id === 'C1' ? 'product' : 'support', type: 'public', member: true, archived: false, shared: false }));
  messages: Message[] = [{ channelId: 'C1', ts: '100.000001', authorId: 'U2', text: 'Retry preserves one recorded payment.', replyCount: 1 }, { channelId: 'C1', ts: '101.000001', threadTs: '100.000001', authorId: 'U2', text: 'Confirmed for staging.' }, { channelId: 'C2', ts: '102.000001', authorId: 'U3', text: 'The summary loads independently.' }];
  calls: { kind: string; channel?: string; cursor?: string }[] = [];
  historyHook?: (channel: string, cursor?: string) => Promise<Page<Message>>;
  threadHook?: (channel: string, ts: string, cursor?: string) => Promise<Page<Message>>;
  channelHook?: (cursor?: string) => Promise<Page<Channel>>;
  directoryHook?: (cursor?: string) => Promise<Page<Person>>;
  page<T>(items: T[], nextCursor: string | null = null): Page<T> { return { identity: this.principal, items, nextCursor, source: 'Synthetic native Slack response', evidence: [] }; }
  async identity() { return this.principal; }
  async channels(cursor?: string) { this.calls.push({ kind: 'channels', cursor }); return this.channelHook ? this.channelHook(cursor) : this.page(this.channelList); }
  async history(channel: string, oldest: string, latest: string, cursor?: string) {
    this.calls.push({ kind: 'history', channel, cursor });
    return this.historyHook ? this.historyHook(channel, cursor) : this.page(this.messages.filter(item => item.channelId === channel && Number(item.ts) >= Number(oldest) && Number(item.ts) <= Number(latest)));
  }
  async thread(channel: string, ts: string, cursor?: string) { this.calls.push({ kind: 'thread', channel, cursor }); return this.threadHook ? this.threadHook(channel, ts, cursor) : this.page(this.messages.filter(item => item.channelId === channel && (item.ts === ts || item.threadTs === ts))); }
  async directory(cursor?: string) { this.calls.push({ kind: 'directory', cursor }); return this.directoryHook ? this.directoryHook(cursor) : this.page([{ id: 'U2', name: 'Product owner', deactivated: false, bot: false, guest: false }]); }
  async channel(id: string) { const value = this.channelList.find(item => item.id === id); if (!value) throw new Error('Synthetic missing channel.'); return { ...value }; }
  async join(id: string) { this.channelList.find(item => item.id === id)!.member = true; }
}
export function companyRoot() {
  const folder = resolve('output/company-context-fixtures'); mkdirSync(folder, { recursive: true }); const root = mkdtempSync(resolve(folder, 'run-'));
  bindHarness(root, { id: 'synthetic-host', version: '1', profile: 'qa', executionContext: 'interactive', source: 'Synthetic harness inspection' });
  let counter = 0;
  const put = (name: string, value: unknown): Evidence => { const path = `.local/${name}`; mkdirSync(resolve(root, '.local'), { recursive: true }); writeFileSync(resolve(root, path), typeof value === 'string' ? value : JSON.stringify(value, null, 2)); return evidence(root, path); };
  return { root, put, next: () => `source-${++counter}.json` };
}
export async function companyFixture(channels = ['C1']) {
  const base = companyRoot(), adapter = new FakeSlack(), now = Date.now();
  const inspection = base.put('connection-evidence.json', { source: 'Synthetic real-operation boundary', identity: adapter.principal });
  recordConnection(base.root, { id: 'slack', transport: 'host', identity: adapter.principal, hostReference: 'synthetic-connector', source: 'Synthetic account inspection', evidence: [inspection], capabilities: { identity: 'verified' } }, now);
  const catalog = await discoverChannels(base.root, 'slack', adapter, { source: 'Synthetic channel discovery' }, now);
  const selected: Binding = { id: 'company', connectionId: 'slack', selection: { mode: 'explicit', channelIds: channels, catalog: catalog.catalog, followNewChannels: false }, history: { oldest: '0.000000', includeThreads: true }, directory: false, maxAgeMs: 900_000, retention: { source: 'Synthetic private QA retention policy', keepHistorical: true } };
  const response = base.put('selection-response.json', { source: 'Synthetic user selection' });
  const configure = (bindings: Binding[]) => { const preview = previewConfiguration(base.root, { bindings, source: 'Synthetic selection proposal' }); applyConfiguration(base.root, { preview: preview.preview, digest: preview.digest, source: 'Synthetic actual selection', response }); return preview; };
  configure([selected]);
  const run = async (budget = 50, options: Parameters<typeof refresh>[3] = {}) => { const job = startRefresh(base.root, selected.id).job; return refresh(base.root, job.id, adapter, { budget, ...options }); };
  await run();
  const analyze = () => recordAnalysis(base.root, { bindingId: selected.id, sources: inspectedSources(base.root, selected.id).map(item => item.ref), reason: 'Synthetic project relevance and decision analysis', source: 'Synthetic agent analysis' });
  const authorize = (options: { both?: boolean; skipAnalysis?: boolean; statement?: string; assignment?: { source: string; ticketId: string } } = {}) => {
    const assignment = options.assignment ?? { source: 'local', ticketId: 'QA-001' };
    const scopeChannels = settings(base.root).value!.bindings.find(item => item.id === selected.id)!.selection.channelIds;
    const author = base.put(base.next(), { ownerId: 'U2', source: 'Synthetic established project ownership' });
    const refs = inspectedSources(base.root, selected.id);
    const makeClaim = (channelId: string, id: string) => {
      const claim: Claim = { schemaVersion: 1, id, statement: channelId === 'C1' ? options.statement ?? 'Retry must preserve payment identity.' : 'Summary must load independently.', kind: 'decision', sources: refs.filter(item => item.ref.sourceId.includes(`/${channelId}/`)).map(item => item.ref), authority: { ownerId: 'U2', basis: author }, applicability: 'Synthetic staging scope', effective: 'Current reviewed staging build', supersedes: [], uncertainty: null, source: 'Synthetic owner decision in Slack', analyzedAt: new Date().toISOString() };
      return recordClaim(base.root, { bindingId: selected.id, claim });
    };
    const claim = makeClaim('C1', 'retry-rule'), other = options.both ? makeClaim('C2', 'list-rule') : undefined;
    const basis: Basis = { schemaVersion: 1, assignment, target: { environment: 'staging', release: 'current', at: new Date().toISOString() }, selections: settings(base.root).value!.bindings.map(item => ({ bindingId: item.id, digest: selectionDigest(item) })),
      dependencies: [{ bindingId: selected.id, criterionIds: ['rule'], claim }, ...(other ? [{ bindingId: selected.id, criterionIds: ['other'], claim: other }] : [])],
      exclusions: scopeChannels.every(id => id === 'C1' || options.both && id === 'C2') ? [] : [{ bindingId: selected.id, channelIds: scopeChannels.filter(id => id !== 'C1' && !(options.both && id === 'C2')), reason: 'Independent company channel not applicable to this task', source: 'Synthetic reviewed scope' }] };
    const basisRef = immutable(base.root, 'basis', basis);
    const understanding = base.put(base.next(), { schemaVersion: 1, assignment, companyContext: basisRef,
      sources: [{ id: 'rule', authority: 'Synthetic accepted owner rule', accepted: claim, current: claim }, ...(other ? [{ id: 'other', authority: 'Synthetic accepted owner rule', accepted: other, current: other }] : [])],
      flows: [{ id: 'retry', featureId: 'payments', relationshipIds: [], actor: 'QA', startingState: 'One saved payment', expectedFlow: options.statement ?? 'Retry keeps the same payment', criteria: ['rule'] }, ...(other ? [{ id: 'list', featureId: 'summary', relationshipIds: [], actor: 'QA', startingState: 'Summary available', expectedFlow: 'Load the summary', criteria: ['other'] }] : [])] });
    const packet = base.put(base.next(), { source: 'Synthetic informed review packet' });
    const g1 = base.put(base.next(), { gate: 'G1', decision: 'Approved', assignment, reviewer: 'Synthetic QA', source: 'Synthetic actual review response', understanding, packet });
    bindBasis(base.root, { basis: basisRef, approval: g1, source: 'Synthetic G1 binding' }); if (!options.skipAnalysis) analyze(); refreshReceipt(base.root, assignment);
    return { assignment, claim, other, basis, basisRef, understanding, g1, packet };
  };
  return { ...base, adapter, selected, configure, run, analyze, authorize, now };
}
