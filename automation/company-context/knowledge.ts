import { load, save, verifyEvidence, requireText, digest, type Evidence } from '../shared/store.js';
import { key, iso, redact, ContextError, validateClaim, type Claim, type SourceRef, type SourceVersion } from './types.js';
import { prefix, binding, connection, storeRoot, head, updateHead, immutable, readObject, selectionDigest } from './store.js';
import { sourceLink } from './links.js';

export function requireCurrentSource(storage: string, identity: ReturnType<typeof connection>['identity'], reference: SourceRef) {
  const actual = head(storage, identity).value.sources[reference?.sourceId];
  if (!actual || actual.ref.revision !== reference.revision || actual.ref.snapshot.sha256 !== reference.snapshot?.sha256 || actual.ref.snapshot.path !== reference.snapshot.path || actual.conflict) throw new ContextError('SOURCE_CHANGED', 'The company source changed or needs reconciliation. Reassess only its affected use.');
  const value = readObject<SourceVersion>(storage, reference.snapshot);
  if (value.sourceId !== reference.sourceId || value.revision !== reference.revision || value.message.deleted) throw new ContextError('SOURCE_UNAVAILABLE', 'This source cannot establish current intended behavior.');
  return value;
}
export function recordClaim(root: string, input: { bindingId: string; claim: Claim }) {
  const selected = binding(root, input.bindingId), actual = connection(root, selected.connectionId, true), storage = storeRoot(root, selected), claim = input.claim;
  if (claim?.schemaVersion !== 1) throw new Error('Use a version 1 company knowledge claim.'); key(claim.id); requireText(claim.statement); requireText(claim.applicability); requireText(claim.effective); requireText(claim.source); iso(claim.analyzedAt);
  if (!['report', 'fact', 'proposal', 'decision', 'clarification', 'inference'].includes(claim.kind) || !Array.isArray(claim.sources) || !claim.sources.length || !Array.isArray(claim.supersedes) || !(claim.uncertainty === null || typeof claim.uncertainty === 'string')) throw new Error('Record the statement kind, provenance, applicability and uncertainty separately.');
  if (['decision', 'clarification'].includes(claim.kind)) {
    key(claim.authority?.ownerId ?? ''); verifyEvidence(root, claim.authority!.basis);
  }
  for (const ref of claim.sources) {
    const value = requireCurrentSource(storage, actual.identity, ref);
    if (!selected.selection.channelIds.includes(value.message.channelId)) throw new Error('Knowledge must come from the selected authorized channels.');
    if (ref.url && sourceLink(root, ref.sourceId)?.url !== ref.url) throw new Error('Use the actual verified canonical Slack source link.');
  }
  claim.supersedes.forEach(key);
  if (new Set(claim.supersedes).size !== claim.supersedes.length || claim.supersedes.includes(claim.id)) throw new Error('Decision supersession must retain distinct earlier decisions without self-cycles.');
  if (claim.effectiveScope?.startsAt) iso(claim.effectiveScope.startsAt);
  const indexPath = `${prefix}/claim-index/${selected.id}.json`, previous = load<Record<string, Evidence>>(root, indexPath, () => ({}));
  const reaches = (id: string, seen = new Set<string>()): boolean => {
    if (id === claim.id) return true; if (seen.has(id)) return false; seen.add(id);
    const ref = previous.value[id]; if (!ref) throw new Error('Supersede an actual retained decision ID.');
    return readObject<Claim>(root, ref).supersedes.some(item => reaches(item, seen));
  };
  if (claim.supersedes.some(id => reaches(id))) throw new Error('Decision supersession cannot introduce a cycle.');
  const safe = { ...claim, statement: redact(claim.statement), applicability: redact(claim.applicability), source: redact(claim.source) };
  // Authority evidence is project-owned. Shared stores retain source facts; claims stay project-local.
  const reference = immutable(root, 'knowledge', safe);
  previous.value[claim.id] = reference; save(root, indexPath, previous.value, previous.revision); return reference;
}
export interface Analysis { schemaVersion: 1; selectionDigest: string; entries: Record<string, { revision: string; reason: string; source: string }>; updatedAt: string }
export const analysisPath = (id: string) => `${prefix}/analysis/${key(id)}.json`;
export function recordAnalysis(root: string, input: { bindingId: string; sources: SourceRef[]; reason: string; source: string }, now = Date.now()) {
  const selected = binding(root, input.bindingId), actual = connection(root, selected.connectionId, true), storage = storeRoot(root, selected);
  requireText(input.reason, 'Actual scope/interpretation rationale'); requireText(input.source, 'Actual analysis source');
  if (!Array.isArray(input.sources) || !input.sources.length) throw new Error('Identify the exact versions analyzed; do not mark unseen source history complete.');
  for (const ref of input.sources) { const value = requireCurrentSource(storage, actual.identity, ref); if (!selected.selection.channelIds.includes(value.message.channelId)) throw new Error('Analysis is outside the selected channel scope.'); }
  const path = analysisPath(selected.id), stored = load<Analysis>(root, path, () => ({ schemaVersion: 1, selectionDigest: selectionDigest(selected), entries: {}, updatedAt: new Date(now).toISOString() }));
  if (stored.value.selectionDigest !== selectionDigest(selected)) { stored.value.selectionDigest = selectionDigest(selected); }
  for (const ref of input.sources) stored.value.entries[ref.sourceId] = { revision: ref.revision, reason: redact(input.reason), source: input.source };
  stored.value.updatedAt = new Date(now).toISOString(); save(root, path, stored.value, stored.revision); return { analyzed: input.sources.length, evidence: (awaitEvidence(root, path)), next: 'Link actual applicable decisions to reviewed QA understanding; analysis alone is not QA approval.' };
}
import { evidence as awaitEvidence } from '../shared/store.js';
function semantics(claim: Claim) { return JSON.stringify([claim.statement, claim.kind, claim.applicability, claim.effective, claim.effectiveScope, claim.authority, claim.uncertainty]); }
interface Equivalent { basis: Evidence; bindingId: string; previous: Evidence; current: Evidence; reason: string; source: string; evidence: Evidence[] }
const equivalentPath = (basis: Evidence, id: string, previous: Evidence) => `${prefix}/equivalences/${digest(JSON.stringify([basis.sha256, id, previous.sha256]))}.json`;
export function recordEquivalent(root: string, input: Equivalent) {
  const basis = readObject<import('./types.js').Basis>(root, input.basis); requireText(input.reason); requireText(input.source); input.evidence.forEach(ref => verifyEvidence(root, ref));
  if (!basis.dependencies.some(item => item.bindingId === input.bindingId && item.claim.sha256 === input.previous.sha256 && item.claim.path === input.previous.path)) throw new Error('Reconcile the actual claim used by this reviewed source basis.');
  const old = readObject<Claim>(root, input.previous), next = readObject<Claim>(root, input.current);
  if (semantics(old) !== semantics(next)) throw new Error('Changed expectations, scope, authority or effective timing require the affected existing review gate.');
  const selected = binding(root, input.bindingId), actual = connection(root, selected.connectionId, true), storage = storeRoot(root, selected);
  const channels = (claim: Claim) => [...new Set(claim.sources.map(item => item.sourceId.split('/')[1]))].sort();
  if (JSON.stringify(channels(old)) !== JSON.stringify(channels(next))) throw new Error('Assess changed source coverage before reusing the existing approval.');
  next.sources.forEach(ref => requireCurrentSource(storage, actual.identity, ref));
  const path = equivalentPath(input.basis, input.bindingId, input.previous), stored = load<Equivalent | null>(root, path, () => null);
  save(root, path, input, stored.revision); return { equivalent: true, current: input.current };
}
export function effectiveClaim(root: string, basis: Evidence, dependency: { bindingId: string; claim: Evidence }) {
  const stored = load<Equivalent | null>(root, equivalentPath(basis, dependency.bindingId, dependency.claim), () => null).value;
  const reference = stored?.current ?? dependency.claim;
  const claim = readObject<Claim>(root, reference);
  validateClaim(claim);
  if (stored) {
    requireText(stored.reason); requireText(stored.source); stored.evidence.forEach(ref => verifyEvidence(root, ref));
    if (stored.basis.sha256 !== basis.sha256 || stored.previous.sha256 !== dependency.claim.sha256 || semantics(claim) !== semantics(readObject<Claim>(root, dependency.claim))) throw new Error('The source equivalence changed; reassess the affected understanding.');
  }
  return { reference, claim };
}
export function inspectedSources(root: string, id: string) {
  const selected = binding(root, id), actual = connection(root, selected.connectionId, true), storage = storeRoot(root, selected), current = head(storage, actual.identity).value;
  return Object.values(current.sources).filter(item => selected.selection.channelIds.some(channel => item.ref.sourceId.startsWith(`${actual.identity.workspaceId}/${channel}/`))).map(item => ({ ...item, ref: { ...item.ref, ...(sourceLink(root, item.ref.sourceId)?.url ? { url: sourceLink(root, item.ref.sourceId)!.url } : {}) }, content: readObject<SourceVersion>(storage, item.ref.snapshot) }));
}
export function reconcileSource(root: string, input: { bindingId: string; previous: SourceRef; observed: SourceRef; evidence: Evidence; source: string }) {
  const selected = binding(root, input.bindingId), actual = connection(root, selected.connectionId, true), storage = storeRoot(root, selected);
  const old = readObject<SourceVersion>(storage, input.previous.snapshot), next = readObject<SourceVersion>(storage, input.observed.snapshot);
  verifyEvidence(root, input.evidence); requireText(input.source);
  const observation = readObject<{ sourceId: string; revision: string; source: string }>(root, input.evidence);
  if (old.sourceId !== next.sourceId || next.sourceId !== observation.sourceId || next.revision !== observation.revision || !observation.source || !selected.selection.channelIds.includes(next.message.channelId)) throw new Error('Reconcile this exact source with its actual authoritative reread.');
  updateHead(storage, actual.identity, current => {
    const entry = current.sources[old.sourceId]; if (!entry || entry.ref.revision !== input.previous.revision) throw new Error('The source advanced during reconciliation.');
    current.sources[old.sourceId] = { ref: input.observed, ...(next.message.editedTs ? { editedTs: next.message.editedTs } : {}), observedAt: next.observedAt };
  }); return { reconciled: next.sourceId };
}
