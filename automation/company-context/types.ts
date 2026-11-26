import { requireText, assertNonsecret, type Evidence } from '../shared/store.js';
import type { HarnessIdentity } from '../tools/runtime.js';

export type Capability = 'identity' | 'channels' | 'history' | 'threads' | 'directory' | 'join';
export type CapabilityState = 'verified' | 'unverified' | 'unsupported' | 'denied';
export interface Identity { workspaceId: string; userId: string; botId?: string; enterpriseId?: string; name?: string }
export interface Connection {
  schemaVersion: 1; id: string; transport: 'host' | 'api'; identity: Identity; harness: HarnessIdentity;
  credentialVariable?: string; hostReference?: string; source: string; checkedAt: string;
  capabilities: Partial<Record<Capability, CapabilityState>>; evidence: Evidence[];
  capabilityEvidence?: Partial<Record<Capability, Evidence>>;
}
export interface Channel { id: string; name: string; type: 'public' | 'private'; archived: boolean; member: boolean; shared: boolean }
export interface Person { id: string; name: string; displayName?: string; title?: string; email?: string; deactivated: boolean; bot: boolean; guest: boolean }
export interface Message { channelId: string; ts: string; threadTs?: string; authorId: string; text: string; editedTs?: string; deleted?: boolean; replyCount?: number }
export interface Page<T> { identity: Identity; items: T[]; nextCursor: string | null; source: string; evidence: Evidence[] }
export interface Adapter {
  identity(): Promise<Identity>;
  channels(cursor?: string): Promise<Page<Channel>>;
  history(channelId: string, oldest: string, latest: string, cursor?: string): Promise<Page<Message>>;
  thread(channelId: string, ts: string, cursor?: string): Promise<Page<Message>>;
  directory(cursor?: string): Promise<Page<Person>>;
  join?(channelId: string): Promise<void>;
  channel?(channelId: string): Promise<Channel>;
  permalink?(channelId: string, ts: string): Promise<string>;
}
export interface Selection { mode: 'explicit' | 'allAccessible'; channelIds: string[]; catalog: Evidence; followNewChannels: boolean }
export interface Binding {
  id: string; connectionId: string; selection: Selection; history: { oldest: string; includeThreads: boolean };
  directory: boolean; maxAgeMs: number; retention: { source: string; keepHistorical: boolean };
  sharedStore?: { root: string; authorization: Evidence };
}
export interface Settings { schemaVersion: 1; bindings: Binding[]; source: string; savedAt: string }
export interface Catalog {
  schemaVersion: 1; id: string; connectionId: string; identity: Identity; channels: Channel[];
  cursor: string | null; complete: boolean; source: string; checkedAt: string; evidence: Evidence[];
  seenCursors?: string[]; operationId?: string; issue?: string; nextAt?: string | null;
}
export interface SourceRef { sourceId: string; revision: string; snapshot: Evidence; url?: string }
export interface SourceVersion { schemaVersion: 1; sourceId: string; message: Message; revision: string; observedAt: string; source: string; operationEvidence: Evidence[]; redacted: boolean }
export interface SourceHead { ref: SourceRef; editedTs?: string; observedAt: string; conflict?: string }
export interface Coverage {
  channelId: string; oldest: string; through: string | null; threads: string[];
  readAt: string | null; issue?: string;
}
export interface Claim {
  schemaVersion: 1; id: string; statement: string; kind: 'report' | 'fact' | 'proposal' | 'decision' | 'clarification' | 'inference';
  sources: SourceRef[]; authority?: { ownerId: string; basis: Evidence }; applicability: string;
  effective: string; supersedes: string[]; uncertainty: string | null; source: string; analyzedAt: string;
  effectiveScope?: { environment?: string; release?: string; startsAt?: string };
}
export interface Head {
  schemaVersion: 1; workspaceId: string; sources: Record<string, SourceHead>;
  claims: Record<string, Evidence>; coverage: Record<string, Coverage>;
}
export interface SyncUnit { kind: 'history' | 'thread' | 'directory'; channelId?: string; ts?: string; oldest?: string; cursor?: string; seenCursors: string[]; pages: number; done?: boolean; issue?: string; nextAt?: string }
export interface SyncJob {
  schemaVersion: 1; id: string; bindingId: string; connectionId: string; identity: Identity; selectionDigest: string;
  cutoff: string; oldest: string; units: SyncUnit[]; cursor: number; state: 'pending' | 'running' | 'partial' | 'complete' | 'superseded';
  observedAt: string; nextAt: string | null; issue: string | null; directory: Person[]; operationEvidence: Evidence[];
  inFlight?: { pid: number; unit: number; startedAt: string }; completedChannels: string[];
  startedAt?: string; connectionRevision?: string; observedSources?: Record<string, string>; generation?: number; channelCompletedAt?: Record<string, string>;
}
export interface ReadCompletion {
  schemaVersion: 1; jobId: string; generation: number; bindingId: string; channelId: string; identity: Identity;
  connectionRevision: string; selectionDigest: string; startedAt: string; completedAt: string;
  oldest: string; cutoff: string; threads: string[]; sources: SourceRef[]; operations: Evidence[];
}
export interface Assignment { source: string; ticketId: string }
export interface Dependency { bindingId: string; criterionIds: string[]; claim: Evidence }
export interface Basis {
  schemaVersion: 1; assignment: Assignment; selections: { bindingId: string; digest: string }[];
  target?: { environment: string; release?: string; at: string };
  dependencies: Dependency[]; exclusions: { bindingId: string; channelIds: string[]; reason: string; source: string }[];
}
export interface BasisBinding { schemaVersion: 1; basis: Evidence; approval: Evidence; source: string }
export interface Receipt {
  schemaVersion: 1; assignment: Assignment; bindingId: string; selectionDigest: string;
  connectionRevision: string;
  verified: SourceRef[]; verifiedChannels: string[]; checkedAt: string; validUntil: string; evidence: Evidence[];
  completions?: Evidence[];
}
export class ContextError extends Error {
  constructor(public code: string, message: string, public retryAt?: string) { super(message); this.name = 'CompanyContextError'; }
}
export const key = (value: string) => { requireText(value, 'Stable ID'); if (!/^[A-Za-z0-9_-]{1,160}$/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) throw new Error('Use a safe stable ID.'); return value; };
export function timestamp(value: string): string { if (typeof value !== 'string' || !/^\d{1,20}\.\d{1,9}$/.test(value)) throw new Error('Use an exact Slack timestamp string.'); return value; }
export function compareTs(a: string, b: string): number {
  const [ai, af] = timestamp(a).split('.'), [bi, bf] = timestamp(b).split('.');
  const left = BigInt(ai!), right = BigInt(bi!);
  return left < right ? -1 : left > right ? 1 : af!.padEnd(9, '0').localeCompare(bf!.padEnd(9, '0'));
}
export const slackNow = (now: number) => `${Math.floor(now / 1000)}.${String(now % 1000).padStart(3, '0')}000`;
export function iso(value: string): string {
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Use a timestamp with its timezone.'); return value;
}
export function sameIdentity(a: Identity, b: Identity) { return !!a && !!b && a.workspaceId === b.workspaceId && a.userId === b.userId && a.botId === b.botId && a.enterpriseId === b.enterpriseId; }
export function validateIdentity(value: Identity) { key(value?.workspaceId); key(value.userId); if (value.botId) key(value.botId); if (value.enterpriseId) key(value.enterpriseId); }
export function validateChannel(channel: Channel) {
  key(channel?.id); requireText(channel.name); if (!['public', 'private'].includes(channel.type) || [channel.archived, channel.member, channel.shared].some(item => typeof item !== 'boolean')) throw new Error('Invalid channel metadata.');
}
export function validateMessage(message: Message) {
  key(message?.channelId); timestamp(message.ts); if (message.threadTs) timestamp(message.threadTs); if (message.editedTs) timestamp(message.editedTs);
  key(message.authorId); if (typeof message.text !== 'string' || message.text.length > 200_000 || (message.deleted !== undefined && typeof message.deleted !== 'boolean')) throw new Error('Invalid source message.');
}
export function validateClaim(value: Claim) {
  if (value?.schemaVersion !== 1 || !['report', 'fact', 'proposal', 'decision', 'clarification', 'inference'].includes(value.kind) || !Array.isArray(value.sources) || !value.sources.length || !Array.isArray(value.supersedes) || !(value.uncertainty === null || typeof value.uncertainty === 'string')) throw new Error('Use a complete versioned claim with source evidence and explicit uncertainty.');
  key(value.id); requireText(value.statement); requireText(value.applicability); requireText(value.effective); requireText(value.source); iso(value.analyzedAt);
  for (const ref of value.sources) {
    const parts = ref?.sourceId?.split('/'); if (!parts || parts.length !== 3 || !/^[a-f0-9]{64}$/.test(ref.revision ?? '') || !ref.snapshot) throw new Error('Use exact source identities and versioned evidence.');
    key(parts[0]!); key(parts[1]!); timestamp(parts[2]!);
  }
  if (['decision', 'clarification'].includes(value.kind)) { key(value.authority?.ownerId ?? ''); if (!value.authority?.basis) throw new Error('Link actual owner-authority evidence.'); }
  if (value.effectiveScope?.startsAt) iso(value.effectiveScope.startsAt);
}
export function unique(values: string[], label: string, empty = false) {
  if (!Array.isArray(values) || (!empty && !values.length) || new Set(values).size !== values.length) throw new Error(`Use distinct ${label}.`);
  for (const value of values) requireText(value, label);
}
export function validateBinding(value: Binding) {
  key(value?.id); key(value.connectionId); const selection = value.selection;
  if (!selection || !['explicit', 'allAccessible'].includes(selection.mode) || typeof selection.followNewChannels !== 'boolean') throw new Error('Choose actual channel-selection semantics.');
  unique(selection.channelIds, 'channel IDs'); selection.channelIds.forEach(key);
  if (selection.mode === 'explicit' && selection.followNewChannels) throw new Error('Following new channels requires allAccessible selection.');
  timestamp(value.history?.oldest); if (typeof value.history.includeThreads !== 'boolean' || typeof value.directory !== 'boolean') throw new Error('Record history/thread and directory choices.');
  if (!Number.isSafeInteger(value.maxAgeMs) || value.maxAgeMs < 1_000 || value.maxAgeMs > 86_400_000) throw new Error('Context receipt age must be between one second and one day.');
  requireText(value.retention?.source, 'Actual retention policy source'); if (typeof value.retention.keepHistorical !== 'boolean') throw new Error('Record historical-content retention.');
  if (value.sharedStore && !value.retention.keepHistorical) throw new Error('Automatic cache purge requires project-local storage; shared retention changes need the shared owner procedure.');
  assertNonsecret(value);
}
export function validateSettings(value: Settings) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.bindings)) throw new Error('Invalid company-context settings; preserve the original record.');
  unique(value.bindings.map(item => item.id), 'binding IDs', true); value.bindings.forEach(validateBinding); requireText(value.source); iso(value.savedAt);
}
export function redact(value: string) {
  return value.replace(/\b(?:xox[baprs]-[A-Za-z0-9-]+|xapp-[A-Za-z0-9-]+|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED]')
    .replace(/(\b(?:password|api[_ -]?key|access[_ -]?token|authorization)\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1[REDACTED]');
}
