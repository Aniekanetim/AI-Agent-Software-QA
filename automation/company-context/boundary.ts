import { digest, load, requireText, save, withLock, type Evidence } from '../shared/store.js';
import { currentBasis, assertCompanyBasis, receiptPath } from './guards.js';
import { immutable, prefix, readObject } from './store.js';
import { ContextError, key, type Assignment, type Basis, type ReadCompletion } from './types.js';

export interface Boundary {
  purpose: 'execution' | 'g5' | 'publish' | 'close' | 'reconcile' | 'observe'; id: string;
  target: { buildId: string; environment: string; commit?: string };
  decision?: Evidence;
  decisionSha256?: string;
}
interface Requirement { schemaVersion: 1; assignment: Assignment; basis: Evidence; boundary: Boundary; createdAt: string; generationFloors: Record<string, number> }
const path = (assignment: Assignment, basis: Evidence, value: Boundary) => `${prefix}/boundaries/${digest(JSON.stringify([assignment.source, assignment.ticketId, basis, value.purpose, value.id, value.target, value.decisionSha256]))}.json`;

export function boundaryRequirement(root: string, assignment: Assignment, value: Boundary, create = false, now = Date.now()) {
  value = { purpose: value.purpose, id: value.id, target: { buildId: value.target?.buildId, environment: value.target?.environment, ...(value.target?.commit ? { commit: value.target.commit } : {}) }, ...(value.decision ? { decision: value.decision } : {}), ...((value.decision || value.decisionSha256) ? { decisionSha256: value.decision?.sha256 ?? value.decisionSha256 } : {}) };
  const basis = currentBasis(root, assignment); if (!basis?.dependencies.length) return null;
  requireText(value.id); requireText(value.target?.buildId); requireText(value.target?.environment);
  if (!['execution', 'g5', 'publish', 'close', 'reconcile', 'observe'].includes(value.purpose)) throw new Error('Use the actual execution/release boundary.');
  if (create && ['publish', 'close', 'reconcile', 'observe'].includes(value.purpose)) {
    if (!value.decision) throw new Error('Retain the actual G5 decision before preparing a release action.');
    const decision = readObject<any>(root, value.decision);
    const observed = decision.target ?? (decision.targetObservation && readObject<any>(root, decision.targetObservation));
    if (decision.gate !== 'G5' || !['Approved', 'Approved with limits'].includes(decision.decision) || !decision.reviewer || !decision.source || observed?.buildId !== value.target.buildId || observed.environment !== value.target.environment) throw new Error('Prepare this release action after its actual scoped G5 decision.');
  }
  const file = path(assignment, basis.basis, value);
  const inspect = () => {
    const stored = load<Evidence | null>(root, file, () => null);
    if (!stored.value && create) {
      const generationFloors = Object.fromEntries([...new Set(basis.dependencies.map(dep => dep.bindingId))].map(id => [id, load<number>(root, `${prefix}/sync-generations/${key(id)}.json`, () => 0).value]));
      if (Object.values(generationFloors).some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Reconcile the actual source-read generation.');
      const reference = immutable(root, 'boundary-requirements', { schemaVersion: 1, assignment, basis: basis.basis, boundary: value, createdAt: new Date(now).toISOString(), generationFloors } satisfies Requirement);
      save(root, file, reference, null); return { reference, ...readObject<Requirement>(root, reference) };
    }
    if (!stored.value) throw new ContextError('REFRESH_REQUIRED', `Prepare the actual company-source read for ${value.purpose} boundary ${value.id}.`);
    const record = readObject<Requirement>(root, stored.value);
    if (record.schemaVersion !== 1 || record.assignment.source !== assignment.source || record.assignment.ticketId !== assignment.ticketId || record.basis.sha256 !== basis.basis.sha256 || path(assignment, basis.basis, record.boundary) !== file) throw new Error('The source boundary has different inputs.');
    if (record.boundary.decision) readObject(root, record.boundary.decision);
    return { reference: stored.value, ...record };
  };
  return create ? withLock(root, 'company-boundaries', inspect) : inspect();
}

export function assertCompanyBoundary(root: string, assignment: Assignment, value: Boundary, criteria?: string[], now = Date.now()) {
  // Validate known changes first, rather than masking them with missing boundary diagnostics.
  assertCompanyBasis(root, assignment, criteria, undefined, now);
  const requirement = boundaryRequirement(root, assignment, value); if (!requirement) return;
  const basis = readObject<Basis>(root, requirement.basis);
  for (const dep of basis.dependencies.filter(dep => !criteria || dep.criterionIds.some(id => criteria.includes(id)))) {
    const receipt = load<{ completions?: Evidence[] } | null>(root, receiptPath(assignment, dep.bindingId, dep.claim), () => null).value;
    if (!requirement.generationFloors || !receipt?.completions?.length || receipt.completions.some(ref => { const read = readObject<ReadCompletion>(root, ref); return read.generation <= requirement.generationFloors[dep.bindingId]! || Date.parse(read.startedAt) < Date.parse(requirement.createdAt); })) throw new ContextError('REFRESH_REQUIRED', `Reread the applicable company sources for ${value.purpose} boundary ${value.id}.`);
  }
}
