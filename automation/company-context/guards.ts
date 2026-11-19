import { existsSync, readFileSync } from 'node:fs';
import { contained, load, save, digest, verifyEvidence, sameEvidence, requireText, type Evidence } from '../shared/store.js';
import { ContextError, unique, validateClaim, type Assignment, type Basis, type BasisBinding, type Receipt, type Claim, type SourceVersion } from './types.js';
import { settings, prefix, binding, connection, storeRoot, selectionDigest, connectionRevision, head, readObject, immutable } from './store.js';
import { analysisPath, requireCurrentSource, effectiveClaim, type Analysis } from './knowledge.js';

const assignmentKey = (assignment: Assignment) => { requireText(assignment?.source); requireText(assignment.ticketId); return digest(JSON.stringify([assignment.source, assignment.ticketId])); };
export const basisPath = (assignment: Assignment) => `${prefix}/bindings/${assignmentKey(assignment)}.json`;
const receiptPath = (assignment: Assignment, id: string, claim: Evidence) => `${prefix}/receipts/${digest(JSON.stringify([assignmentKey(assignment), id, claim.sha256]))}.json`;
function sameAssignment(a: Assignment, b: Assignment) { return a?.source === b.source && a.ticketId === b.ticketId; }
function currentRecord(root: string, assignment: Assignment) {
  const record = load<BasisBinding | null>(root, basisPath(assignment), () => null);
  const active = settings(root).value;
  if (!record.value && !active?.bindings.length) return null;
  if (!record.value) throw new ContextError('BASIS_REQUIRED', 'Record the Slack sources considered and bind their applicability to the reviewed feature understanding before dependent execution.');
  const basis = readObject<Basis>(root, record.value.basis); verifyEvidence(root, record.value.approval);
  if (basis.schemaVersion !== 1 || !sameAssignment(basis.assignment, assignment) || !Array.isArray(basis.dependencies) || !Array.isArray(basis.exclusions) || !Array.isArray(basis.selections)) throw new Error('Use the company-source basis for this assignment.');
  return { record: record.value, basis, active };
}
export function bindBasis(root: string, input: { basis: Evidence; approval: Evidence; source: string }) {
  const basis = readObject<Basis>(root, input.basis), approval = readObject<any>(root, input.approval); requireText(input.source);
  if (basis.schemaVersion !== 1 || !sameAssignment(basis.assignment, approval.assignment) || !['G1', 'G2', 'G4'].includes(approval.gate) || !['Approved', 'Approved with limits'].includes(approval.decision) || !approval.reviewer || !approval.source) throw new Error('Reuse the actual applicable G1/G2/G4 decision for this source basis.');
  const understanding = readObject<{ companyContext?: Evidence; sources?: { id: string; accepted: Evidence }[] }>(root, approval.understanding);
  if (!sameEvidence(understanding.companyContext, input.basis)) throw new Error('The reviewed understanding must identify this exact company-source basis.');
  for (const dependency of basis.dependencies) {
    const claim = readObject<Claim>(root, dependency.claim);
    for (const criterionId of dependency.criterionIds) {
      const source = understanding.sources?.find(item => item.id === criterionId);
      if (!source || ![dependency.claim, ...claim.sources.map(item => item.snapshot)].some(ref => sameEvidence(ref, source.accepted))) throw new Error('The reviewed criterion must cite its actual company decision/source evidence.');
    }
  }
  validateBasis(root, basis);
  const path = basisPath(basis.assignment), stored = load<BasisBinding | null>(root, path, () => null);
  const value: BasisBinding = { schemaVersion: 1, basis: input.basis, approval: input.approval, source: input.source };
  // Retain the old binding as an immutable record before advancing the current pointer.
  if (stored.value) immutable(root, 'binding-history', stored.value);
  save(root, path, value, stored.revision); return { bound: true, basis: input.basis };
}
function validateBasis(root: string, basis: Basis) {
  const configured = settings(root).value?.bindings ?? [];
  if (!Array.isArray(basis.selections) || !Array.isArray(basis.dependencies) || !Array.isArray(basis.exclusions)) throw new Error('Record source selections, dependencies and exclusions.');
  unique(basis.selections.map(item => item.bindingId), 'source selections', true);
  if (configured.length !== basis.selections.length) throw new ContextError('SELECTION_CHANGED', 'Assess the changed company-source selection for this task.');
  for (const selected of configured) {
    if (!basis.selections.some(item => item.bindingId === selected.id && item.digest === selectionDigest(selected))) throw new ContextError('SELECTION_CHANGED', 'Assess the changed company-source selection; preserve unrelated approvals.');
    const covered = new Set<string>();
    for (const dependency of basis.dependencies.filter(item => item.bindingId === selected.id)) {
      unique(dependency.criterionIds, 'criterion IDs');
      const claim = readObject<Claim>(root, dependency.claim), actual = connection(root, selected.connectionId, true), storage = storeRoot(root, selected);
      validateClaim(claim);
      if (!['decision', 'clarification'].includes(claim.kind) || claim.uncertainty || !claim.authority) throw new Error('Current correctness judgments need a clear applicable human decision with its authority basis.');
      verifyEvidence(root, claim.authority.basis);
      for (const source of claim.sources) { const value = readObject<SourceVersion>(storage, source.snapshot); if (!selected.selection.channelIds.includes(value.message.channelId)) throw new Error('The source basis names an unselected channel.'); covered.add(value.message.channelId); }
    }
    for (const excluded of basis.exclusions.filter(item => item.bindingId === selected.id)) {
      requireText(excluded.reason); requireText(excluded.source); unique(excluded.channelIds, 'excluded channels');
      for (const channelId of excluded.channelIds) { if (!selected.selection.channelIds.includes(channelId)) throw new Error('Exclude actual selected channels only.'); covered.add(channelId); }
    }
    if (selected.selection.channelIds.some(channelId => !covered.has(channelId))) throw new Error('Account for the selected channels through actual dependencies or reasoned scope exclusions.');
  }
  if (basis.dependencies.some(item => !configured.some(selected => selected.id === item.bindingId)) || basis.exclusions.some(item => !configured.some(selected => selected.id === item.bindingId))) throw new Error('The source basis references an unknown binding.');
}
export function refreshReceipt(root: string, assignment: Assignment, now = Date.now(), criteria?: string[]) {
  const current = currentRecord(root, assignment); if (!current) return { required: false, receipts: [] as Evidence[] };
  validateBasis(root, current.basis); const receipts: Evidence[] = [];
  for (const selected of current.active?.bindings ?? []) {
    const actual = connection(root, selected.connectionId, true), storage = storeRoot(root, selected);
    const dependencies = current.basis.dependencies.filter(item => item.bindingId === selected.id && (!criteria || item.criterionIds.some(id => criteria.includes(id))));
    for (const dependency of dependencies) {
    const sources = effectiveClaim(root, current.record.basis, dependency).claim.sources;
    for (const ref of sources) requireCurrentSource(storage, actual.identity, ref);
    const state = head(storage, actual.identity).value;
    const checkedAt = Math.min(...sources.map(ref => Date.parse(state.sources[ref.sourceId]!.observedAt)));
    if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > selected.maxAgeMs || checkedAt < Date.parse(actual.checkedAt)) throw new ContextError('REFRESH_REQUIRED', 'Reread the actual cited Slack threads through the selected connection; cached snapshots cannot establish freshness.');
    const receipt: Receipt = { schemaVersion: 1, assignment, bindingId: selected.id, selectionDigest: selectionDigest(selected), connectionRevision: connectionRevision(actual), verified: sources,
      verifiedChannels: [...new Set(sources.map(ref => ref.sourceId.split('/')[1]!))], checkedAt: new Date(checkedAt).toISOString(), validUntil: new Date(checkedAt + selected.maxAgeMs).toISOString(), evidence: sources.map(ref => ref.snapshot) };
    const path = receiptPath(assignment, selected.id, dependency.claim), old = load<Receipt | null>(root, path, () => null); save(root, path, receipt, old.revision);
    receipts.push(immutable(root, 'receipt-history', receipt));
    }
  }
  return { required: true, receipts };
}
export function assertCompanyBasis(root: string, assignment: Assignment, criteria?: string[], understanding?: Evidence, now = Date.now()): void {
  const current = currentRecord(root, assignment); if (!current) return;
  validateBasis(root, current.basis);
  if (understanding && !sameEvidence(readObject<{ companyContext?: Evidence }>(root, understanding).companyContext, current.record.basis)) throw new ContextError('BASIS_CHANGED', 'Use the feature understanding approved for the current company-source basis.');
  const dependencies = current.basis.dependencies.filter(item => !criteria || item.criterionIds.some(id => criteria.includes(id)));
  for (const dependency of dependencies) {
    const selected = binding(root, dependency.bindingId), actual = connection(root, selected.connectionId, true), storage = storeRoot(root, selected);
    const resolved = effectiveClaim(root, current.record.basis, dependency), claim = resolved.claim;
    if (claim.uncertainty) throw new ContextError('CONTEXT_CONFLICT', 'Resolve the applicable source ambiguity before this dependent judgment.');
    const index = load<Record<string, Evidence>>(root, `${prefix}/claim-index/${selected.id}.json`, () => ({})).value;
    for (const [id, ref] of Object.entries(index)) {
      if (sameEvidence(ref, resolved.reference)) continue;
      const newer = readObject<Claim>(root, ref);
      if (id !== claim.id && !newer.supersedes.includes(claim.id)) continue;
      const effect = newer.effectiveScope, target = current.basis.target;
      const outsideScope = effect && target && (effect.environment && effect.environment !== target.environment || effect.release && target.release && effect.release !== target.release || effect.startsAt && Date.parse(effect.startsAt) > Date.parse(target.at));
      if (!outsideScope) throw new ContextError('DECISION_SUPERSEDED', 'A replacement decision affects this source basis. Assess its applicability and return material expectation changes to the existing gate.');
    }
    const receipt = load<Receipt | null>(root, receiptPath(assignment, selected.id, dependency.claim), () => null).value;
    if (!receipt || receipt.schemaVersion !== 1 || !sameAssignment(receipt.assignment, assignment) || receipt.bindingId !== selected.id || !Array.isArray(receipt.verified) ||
      receipt.selectionDigest !== selectionDigest(selected) || receipt.connectionRevision !== connectionRevision(actual) || !Number.isFinite(Date.parse(receipt.checkedAt)) || !Number.isFinite(Date.parse(receipt.validUntil)) ||
      Date.parse(receipt.checkedAt) > now || Date.parse(receipt.validUntil) < now || Date.parse(receipt.validUntil) - Date.parse(receipt.checkedAt) > selected.maxAgeMs) throw new ContextError('REFRESH_REQUIRED', 'Refresh the cited Slack sources and retain current basis verification before the next dependent action.');
    const relevantChannels = new Set<string>();
    for (const ref of claim.sources) {
      const value = requireCurrentSource(storage, actual.identity, ref); relevantChannels.add(value.message.channelId);
      if (!receipt.verified.some(item => item.sourceId === ref.sourceId && item.revision === ref.revision)) throw new Error('The freshness receipt does not cover this approved source revision.');
    }
    for (const channelId of relevantChannels) if (head(storage, actual.identity).value.coverage[channelId]?.issue) throw new ContextError('SOURCE_UNAVAILABLE', 'Relevant channel/thread coverage has an unresolved access or read gap.');
    const analysis = load<Analysis | null>(root, analysisPath(selected.id), () => null).value;
    for (const source of Object.values(head(storage, actual.identity).value.sources)) {
      if (!relevantChannels.has(source.ref.sourceId.split('/')[1]!)) continue;
      if (source.conflict || analysis?.entries[source.ref.sourceId]?.revision !== source.ref.revision) throw new ContextError('ANALYSIS_PENDING', 'Analyze the changed relevant channel/thread context before dependent work; independent approved cases can continue.');
    }
  }
}
export function currentBasis(root: string, assignment: Assignment) { const current = currentRecord(root, assignment); return current ? { basis: current.record.basis, dependencies: current.basis.dependencies } : null; }
export function assertCompanyPlan(root: string, assignment: Assignment) { const current = currentRecord(root, assignment); if (current) validateBasis(root, current.basis); }
