import { digest, load, requireText, save, verifyEvidence, withLock, type Evidence } from '../shared/store.js';
import { indexById, pinned } from './library.js';
import { readRound } from './round.js';

export interface Assignment { source: string; ticketId: string }

interface Review {
  gate: string; decision: string; reviewer: string; source: string; packet: Evidence;
  assignment: Assignment;
}
interface CoverageReview extends Review {
  library: Evidence; modules: string[];
  changeManifest?: Evidence;
  obligations: {
    id: string; moduleId: string; testTypeId: string; conditionId: string;
    state: 'required' | 'excluded' | 'unresolved'; checkIds?: string[]; exceptionAllowed?: boolean;
  }[];
}
interface ReadinessReview extends Review { round: Evidence; scopeReview: Evidence }
interface Binding {
  schemaVersion: 1; assignment: Assignment;
  history: ({ round: Evidence; approval: Evidence } | { invalidation: Evidence })[];
}

export function sameEvidence(a: Evidence | undefined, b: Evidence | undefined) {
  return !!a && !!b && a.path === b.path && a.sha256 === b.sha256 && a.pointer === b.pointer;
}

function sameAssignment(a: Assignment | undefined, b: Assignment) {
  return a?.source === b.source && a.ticketId === b.ticketId;
}

function scopeRecord(root: string, assignment: Assignment) {
  requireText(assignment?.source, 'Canonical task source');
  requireText(assignment.ticketId, 'Canonical assignment ID');
  const path = `.local/qa-release/scope-${digest(JSON.stringify([assignment.source, assignment.ticketId]))}.json`;
  const record = load<Binding>(root, path, () => ({ schemaVersion: 1, assignment, history: [] }));
  if (record.value?.schemaVersion !== 1 || !sameAssignment(record.value.assignment, assignment) || !Array.isArray(record.value.history)) {
    throw new Error('Reconcile the stored assignment release scope.');
  }
  return { ...record, path };
}

export function releaseScope(root: string, assignment: Assignment) {
  const record = scopeRecord(root, assignment);
  return { assignment, revision: record.revision, current: record.value.history.at(-1) ?? null };
}

function readReview<T extends Review>(root: string, ref: Evidence, gate: 'G1' | 'G2', assignment: Assignment) {
  const review = pinned<T>(root, ref, `${gate} release review`);
  if (review?.gate !== gate || !['Approved', 'Approved with limits'].includes(review.decision) || !sameAssignment(review.assignment, assignment)) {
    throw new Error(`Record the actual ${gate} decision for this assignment.`);
  }
  requireText(review.reviewer, 'Actual reviewer');
  requireText(review.source, 'Actual approval source');
  verifyEvidence(root, review.packet);
  return review;
}

function matchCoverage(root: string, assignment: Assignment, round: Evidence, approval: Evidence) {
  const readiness = readReview<ReadinessReview>(root, approval, 'G2', assignment);
  if (!sameEvidence(readiness.round, round)) throw new Error('G2 must identify the exact reviewed round.');
  const coverage = readReview<CoverageReview>(root, readiness.scopeReview, 'G1', assignment);
  const { round: plan } = readRound(root, round);
  if (!plan.assignmentIds.includes(assignment.ticketId) || !sameEvidence(coverage.packet, plan.scope) || !sameEvidence(coverage.library, plan.library) ||
      !Array.isArray(coverage.modules) || coverage.modules.length !== plan.moduleIds.length ||
      new Set(coverage.modules).size !== coverage.modules.length || !coverage.modules.every(id => plan.moduleIds.includes(id))) {
    throw new Error('The round must include this assignment, its reviewed library, and every approved module.');
  }
  const expected = indexById(coverage.obligations, 'G1 coverage obligation');
  if (expected.size !== plan.obligations.length || plan.obligations.some(row => {
    const basis = expected.get(row.id);
    return !basis || basis.moduleId !== row.moduleId || basis.testTypeId !== row.testTypeId ||
      basis.conditionId !== row.conditionId || basis.state !== row.state ||
      (basis.exceptionAllowed === true) !== (row.exceptionAllowed === true) ||
      (basis.checkIds !== undefined && (!Array.isArray(basis.checkIds) ||
        new Set(basis.checkIds).size !== basis.checkIds.length || !basis.checkIds.every(id => row.checkIds.includes(id))));
  })) throw new Error('The round must account for every G1 coverage obligation and its required checks.');
  if (coverage.changeManifest) verifyEvidence(root, coverage.changeManifest);
  return { target: plan.target, plan, changeManifest: coverage.changeManifest };
}

export function requireCurrentScope(root: string, assignment: Assignment) {
  const { current } = releaseScope(root, assignment);
  if (!current || !('round' in current)) throw new Error('Bind the assignment to its current reviewed release round at G1/G2.');
  return { ...current, ...matchCoverage(root, assignment, current.round, current.approval) };
}

export function bindReleaseScope(root: string, request: { assignment: Assignment; expectedRevision: string | null; round: Evidence; approval: Evidence }) {
  return withLock(root, 'qa-board', () => {
    const { assignment, expectedRevision, round, approval } = request;
    const record = scopeRecord(root, assignment);
    const current = record.value.history.at(-1);
    if (current && 'round' in current && sameEvidence(current.round, round) && sameEvidence(current.approval, approval)) {
      return releaseScope(root, assignment);
    }
    if (record.revision !== expectedRevision) throw new Error('The assignment release scope changed. Read its current revision before binding.');
    if (record.value.history.some(entry => 'round' in entry && entry.approval.sha256 === approval?.sha256)) {
      throw new Error('Record the actual renewed G2 decision before restoring a previous round.');
    }
    matchCoverage(root, assignment, round, approval);
    record.value.history.push({ round, approval });
    save(root, record.path, record.value, record.revision);
    return releaseScope(root, assignment);
  });
}

export function invalidateReleaseScope(root: string, request: { assignment: Assignment; expectedRevision: string; observation: Evidence }) {
  return withLock(root, 'qa-board', () => {
    const { assignment, expectedRevision, observation } = request;
    const record = scopeRecord(root, assignment);
    const current = record.value.history.at(-1);
    if (current && 'invalidation' in current && sameEvidence(current.invalidation, observation)) return releaseScope(root, assignment);
    if (!current || !('round' in current) || record.revision !== expectedRevision) throw new Error('Read the current active release scope before invalidating it.');
    const change = pinned<{ assignment: Assignment; round: Evidence; reason: string; source: string }>(root, observation, 'material change observation');
    if (!sameAssignment(change?.assignment, assignment) || !sameEvidence(change.round, current.round)) {
      throw new Error('Record the material change for this assignment and round.');
    }
    requireText(change.reason, 'Observed material change');
    requireText(change.source, 'Actual material change source');
    record.value.history.push({ invalidation: observation });
    save(root, record.path, record.value, record.revision);
    return releaseScope(root, assignment);
  });
}
