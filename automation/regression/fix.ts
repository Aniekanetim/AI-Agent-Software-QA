import { digest, load, requireText, sameEvidence, save, verifyEvidence, withLock, type Evidence } from '../shared/store.js';
import { indexById, pinned, readLibrary } from '../release/library.js';
import { retainedRun, retainedRuns, sameTarget, type Round, type Target } from '../release/round.js';
import type { Assignment } from '../release/scope.js';
import type { ReleaseBoard } from './board.js';
import { caseBasis, caseResult, verifyCaseAuthorization } from '../execution/cases.js';

interface FixIdentity { defect: Assignment; fixRevision: string }
interface Intake extends FixIdentity {
  schemaVersion: 1; parent?: Assignment; target: Target; targetObservation: Evidence;
  defectReport: Evidence; developerResponse: Evidence;
}
interface Coordinate { checkId: string; conditionId: string }
interface PlannedCheck extends Coordinate { context: Evidence }
interface RegressionPolicy { library: Evidence; critical: Coordinate[]; full?: Coordinate[] }
interface Batch { id: string; phase: 'confirmation' | 'regression'; checks: PlannedCheck[]; retryReason?: string }
interface Plan {
  schemaVersion: 1; fix: string; library: Evidence; policy: Evidence; impact: Evidence;
  coverage: 'targeted' | 'full'; rationale: string; batches: Batch[];
  caseBatches?: { batchId: string; batch: Evidence }[];
}
interface Approval {
  gate: string; decision: string; reviewer: string; source: string; packet: Evidence;
  assignment: Assignment; target: Target; fixPlan: Evidence; defectReport: Evidence;
}
interface Receipt { batchId: string; round: Evidence; run: Evidence }
interface Revision { plan: Evidence; approval: Evidence; results: Receipt[]; reviews: Evidence[] }
interface Fix { key: string; identity: Intake; intake: Evidence; plans: Revision[] }
interface Ledger { schemaVersion: 1; fixes: Fix[] }
interface Finding extends Coordinate { ticket: Assignment; impact: 'blocking' | 'nonblocking'; evidence: Evidence }
interface Review {
  gate: 'G5'; decision: 'Approved' | 'Approved with limits'; reviewer: string; source: string; packet: Evidence;
  fix: string; ticketRevision: string; assessmentDigest: string; targetObservation: Evidence; findings: Finding[];
  understanding?: Evidence;
}
export type DefectCompletion = { fix: string; refutation?: never } | { fix?: never; refutation: Evidence };
export interface ReworkDecision { fix: string; review: Evidence }

const ledgerPath = '.local/qa-regression/fixes.json';
const coordinates = (check: Coordinate) => `${check.checkId}/${check.conditionId}`;
const identityKey = (fix: FixIdentity) => JSON.stringify([fix.defect.source, fix.defect.ticketId, fix.fixRevision]);
const fixKey = (fix: FixIdentity & { target: Target }) => digest(JSON.stringify([identityKey(fix), fix.target.buildId, fix.target.environment]));
const sameAssignment = (a: Assignment | undefined, b: Assignment | undefined) =>
  !!a && !!b && a.source === b.source && a.ticketId === b.ticketId;
const sameContent = (a: Evidence | undefined, b: Evidence | undefined) =>
  !!a && !!b && a.sha256 === b.sha256 && a.pointer === b.pointer;
const lock = <T>(root: string, fn: () => T) => withLock(root, 'qa-board', () => withLock(root, 'release-records', fn));

function ledger(root: string) {
  const record = load<Ledger>(root, ledgerPath, () => ({ schemaVersion: 1, fixes: [] }));
  if (record.value?.schemaVersion !== 1 || !Array.isArray(record.value.fixes)) throw new Error('Reconcile the fix verification records.');
  return record;
}

function assignmentValid(assignment: Assignment) {
  requireText(assignment?.source, 'Canonical task source');
  requireText(assignment.ticketId, 'Stable ticket ID');
}

function observeTarget(root: string, fix: Pick<Intake, 'target' | 'fixRevision'>, ref: Evidence) {
  const observed = pinned<Target & { fixRevision: string; observedAt: string; source: string }>(root, ref, 'fixed target observation');
  if (!sameTarget(observed, fix.target) || observed.fixRevision !== fix.fixRevision ||
      !Number.isFinite(Date.parse(observed.observedAt)) || !/(Z|[+-]\d\d:\d\d)$/.test(observed.observedAt)) {
    throw new Error('Observe the build, environment and included fix revision.');
  }
  requireText(observed.source, 'Actual fixed target observation source');
  return observed;
}

function requiredChecks(root: string, ref: Evidence, library: Evidence, affected: Coordinate[], coverage: 'targeted' | 'full') {
  const policy = pinned<RegressionPolicy>(root, ref, 'reviewed project regression policy');
  if (!sameEvidence(policy?.library, library) || !Array.isArray(policy.critical) || !policy.critical.length || !Array.isArray(affected)) {
    throw new Error('Identify the reviewed critical baseline and affected checks.');
  }
  if (coverage === 'full' && (!Array.isArray(policy.full) || !policy.full.length)) throw new Error('Pin the reviewed full suite before claiming full regression.');
  return [...policy.critical, ...affected, ...(coverage === 'full' ? policy.full! : [])];
}

function readIntake(root: string, ref: Evidence) {
  const fix = pinned<Intake>(root, ref, 'fix intake');
  if (fix?.schemaVersion !== 1) throw new Error('Use a version 1 fix intake record.');
  assignmentValid(fix.defect);
  if (fix.parent) assignmentValid(fix.parent);
  requireText(fix.fixRevision, 'Developer fix revision');
  requireText(fix.target?.buildId, 'Observed build identity');
  requireText(fix.target.environment, 'Observed environment');
  verifyEvidence(root, fix.defectReport);
  verifyEvidence(root, fix.developerResponse);
  observeTarget(root, fix, fix.targetObservation);
  return fix;
}

function currentFor(fixes: Fix[], defect: Assignment, environment: string) {
  return fixes.filter(row => sameAssignment(row.identity.defect, defect) && row.identity.target.environment === environment).at(-1);
}

function findFix(root: string, key: string, current = true, fixes = ledger(root).value.fixes) {
  const entry = fixes.find(row => row.key === key);
  if (!entry) throw new Error('Register the identified fix at Retest before recording regression evidence.');
  const actual = readIntake(root, entry.intake);
  if (fixKey(actual) !== key || digest(JSON.stringify(actual)) !== digest(JSON.stringify(entry.identity))) throw new Error('The stored fix identity changed.');
  if (current && currentFor(fixes, actual.defect, actual.target.environment)?.key !== key) throw new Error('This fix or target was superseded. Use the current Retest record.');
  return entry;
}

export function registerFix(root: string, request: { intake: Evidence; supersedes?: string }) {
  return lock(root, () => {
    const identity = readIntake(root, request.intake), key = fixKey(identity), current = ledger(root);
    const prior = currentFor(current.value.fixes, identity.defect, identity.target.environment);
    if (prior?.key === key) {
      if (!sameEvidence(prior.intake, request.intake)) throw new Error('Resume the existing fix intake with its original evidence.');
      return fixStatus(root, key);
    }
    if (prior?.key !== request.supersedes || current.value.fixes.some(entry => entry.key === key)) {
      throw new Error('Review the current fix and identify the superseded build or revision before registering a replacement.');
    }
    current.value.fixes.push({ key, identity, intake: request.intake, plans: [] });
    save(root, ledgerPath, current.value, current.revision);
    return fixStatus(root, key);
  });
}

function readPlan(root: string, entry: Fix, revision: Pick<Revision, 'plan' | 'approval'>) {
  const plan = pinned<Plan>(root, revision.plan, 'confirmation and regression plan');
  const review = pinned<Approval>(root, revision.approval, 'G4 fix review');
  if (plan?.schemaVersion !== 1 || plan.fix !== entry.key || !['targeted', 'full'].includes(plan.coverage) ||
      review?.gate !== 'G4' || !['Approved', 'Approved with limits'].includes(review.decision) ||
      !sameAssignment(review.assignment, entry.identity.defect) || !sameTarget(review.target, entry.identity.target) ||
      !sameEvidence(review.fixPlan, revision.plan) || !sameEvidence(review.defectReport, entry.identity.defectReport)) {
    throw new Error('G4 must approve this fix, target and exact confirmation and regression scope.');
  }
  requireText(review.reviewer, 'Actual G4 reviewer');
  requireText(review.source, 'Actual G4 approval source');
  requireText(plan.rationale, 'Scope and expansion rationale');
  verifyEvidence(root, review.packet);
  const catalogue = readLibrary(root, plan.library);
  const impact = pinned<{ fix: string; affected: Coordinate[]; broaderRequired: boolean }>(root, plan.impact, 'reviewed change impact');
  if (impact?.fix !== entry.key || typeof impact.broaderRequired !== 'boolean') {
    throw new Error('Identify the reviewed change impact for this fix.');
  }
  if (impact.broaderRequired && plan.coverage !== 'full') throw new Error('Use the reviewed full regression suite for this change.');
  const batches = indexById(plan.batches, 'fix batch'), seen = new Set<string>(), regression = new Set<string>();
  for (const batch of batches.values()) {
    if (!['confirmation', 'regression'].includes(batch.phase) || !Array.isArray(batch.checks) || !batch.checks.length) throw new Error('Give each fix batch a phase and required checks.');
    if (batch.retryReason !== undefined) requireText(batch.retryReason, 'Reviewed retry reason');
    for (const check of batch.checks) {
      const key = coordinates(check);
      if (seen.has(key) || !catalogue.checks.get(check.checkId)?.conditionIds.includes(check.conditionId)) {
        throw new Error('Use distinct, applicable library check and condition pairs across the two phases.');
      }
      seen.add(key);
      if (batch.phase === 'regression') regression.add(key);
      verifyEvidence(root, check.context);
    }
  }
  if (regression.size === seen.size || !regression.size) throw new Error('Plan distinct confirmation and regression checks.');
  for (const check of requiredChecks(root, plan.policy, plan.library, impact.affected, plan.coverage)) {
    if (!seen.has(coordinates(check))) throw new Error(`The required regression check ${coordinates(check)} is missing from the reviewed plan.`);
  }
  const caseDesigns = new Map<string, ReturnType<typeof verifyCaseAuthorization>>();
  if (plan.caseBatches) {
    for (const record of plan.caseBatches) {
      const batch = batches.get(record.batchId);
      if (!batch || caseDesigns.has(record.batchId)) throw new Error('Pin one case batch per confirmation or regression batch.');
      const design = verifyCaseAuthorization(root, { batch: record.batch, approval: revision.approval }, {
        assignment: entry.identity.defect, target: entry.identity.target, gate: 'G4',
      });
      if (design.cases.size !== batch.checks.length || [...design.cases.values()].some(item =>
        !batch.checks.some(check => coordinates(item) === coordinates(check) && sameEvidence(check.context, item.context)) ||
        !sameEvidence(item.definition, catalogue.checks.get(item.checkId)?.definition))) {
        throw new Error('Bind the exact G4 case definitions to each fix batch.');
      }
      caseDesigns.set(batch.id, design);
    }
    if (caseDesigns.size !== batches.size) throw new Error('Cover all confirmation and regression batches at G4.');
  }
  return { plan, batches, catalogue, caseDesigns };
}

export function approveFixPlan(root: string, request: { fix: string; plan: Evidence; approval: Evidence; previousPlan?: Evidence; requireCases?: boolean }) {
  return lock(root, () => {
    const current = ledger(root);
    const entry = findFix(root, request.fix, true, current.value.fixes), previous = entry.plans.at(-1);
    if (request.requireCases && !pinned<Plan>(root, request.plan, 'fix plan').caseBatches?.length) {
      throw new Error('Approve the feature understanding and exact confirmation and regression cases at G4.');
    }
    if (previous && sameEvidence(previous.plan, request.plan) && sameEvidence(previous.approval, request.approval)) return fixStatus(root, entry.key);
    if (previous ? !sameEvidence(previous.plan, request.previousPlan) : request.previousPlan !== undefined) throw new Error('Review the current fix plan before replacing it.');
    if (entry.plans.some(row => row.approval.sha256 === request.approval?.sha256)) throw new Error('Record a renewed G4 decision for a revised plan.');
    const revision = { plan: request.plan, approval: request.approval, results: [], reviews: [] };
    readPlan(root, entry, revision);
    entry.plans.push(revision);
    save(root, ledgerPath, current.value, current.revision);
    return fixStatus(root, entry.key);
  });
}

function matches(root: string, entry: Fix, design: ReturnType<typeof readPlan>, receipt: Receipt, allowUnmatched = false) {
  const batch = design.batches.get(receipt.batchId);
  if (!batch) throw new Error('Select a batch from the approved fix plan.');
  const { run, catalogue } = retainedRun(root, receipt.round, receipt.run);
  const caseDesign = design.caseDesigns.get(batch.id);
  if (!sameTarget(run.target, entry.identity.target)) throw new Error('Use results from the same observed build and environment.');
  const observations = run.observations.filter(observation => {
    const check = batch.checks.find(item => coordinates(item) === coordinates(observation));
    if (!check || !sameContent(check.context, observation.context) ||
        !sameContent(design.catalogue.checks.get(check.checkId)?.definition, catalogue.checks.get(check.checkId)?.definition) ||
        !sameContent(design.catalogue.conditions.get(check.conditionId)?.basis, catalogue.conditions.get(check.conditionId)?.basis)) return false;
    if (caseDesign && ['Pass', 'Fail'].includes(observation.outcome)) {
      const observed = observation.caseExecution;
      const planned = [...caseDesign.cases.values()].find(item => coordinates(item) === coordinates(check))!;
      if (!observed) return false;
      try {
        return caseResult(root, observed.receipt, observed.caseId, { ...observation, target: run.target }, true).basis === caseBasis(caseDesign, planned);
      } catch { return false; }
    }
    return true;
  });
  if (!observations.length && !allowUnmatched) throw new Error('No matching check revision, condition and test context were observed in this retained run.');
  return { runId: run.id, observedAt: run.observedAt, observations };
}

export function retainFixResults(root: string, request: { fix: string; plan: Evidence } & Receipt) {
  return lock(root, () => {
    const current = ledger(root), entry = findFix(root, request.fix, true, current.value.fixes), revision = entry.plans.at(-1);
    if (!revision || !sameEvidence(revision.plan, request.plan)) throw new Error('Use the current approved fix plan.');
    const receipt = { batchId: request.batchId, round: request.round, run: request.run };
    matches(root, entry, readPlan(root, entry, revision), receipt);
    if (!revision.results.some(row => row.batchId === receipt.batchId && sameEvidence(row.round, receipt.round) && sameEvidence(row.run, receipt.run))) {
      revision.results.push(receipt);
      save(root, ledgerPath, current.value, current.revision);
    }
    return fixStatus(root, entry.key);
  });
}

function assess(root: string, entry: Fix) {
  const revision = entry.plans.at(-1);
  if (!revision) return null;
  const design = readPlan(root, entry, revision);
  const linkedRounds = new Map<string, { batchId: string; round: Evidence; linked: Evidence[] }>();
  for (const previous of entry.plans) for (const result of previous.results) {
    const batchIds = previous === revision ? [result.batchId] : [...design.batches.keys()];
    for (const batchId of batchIds) {
      const key = JSON.stringify([batchId, result.round]);
      const linked = linkedRounds.get(key) ?? { batchId, round: result.round, linked: [] };
      linked.linked.push(result.run);
      linkedRounds.set(key, linked);
    }
  }
  const runs = [...linkedRounds.values()].flatMap(({ batchId, round, linked }) => {
    const retained = retainedRuns(root, round).runs;
    if (linked.some(ref => !retained.some(run => sameEvidence(run, ref)))) throw new Error('Reconcile a previously linked regression run missing from its retained round.');
    return retained.map(run => {
      const receipt = { batchId, round, run };
      return { ...receipt, ...matches(root, entry, design, receipt, true) };
    });
  });
  const batches = [...design.batches.values()].map(batch => ({
    id: batch.id, phase: batch.phase, ...(batch.retryReason ? { retryReason: batch.retryReason } : {}),
    checks: batch.checks.map(check => {
      const attempts = runs.filter(run => run.batchId === batch.id).flatMap(run => run.observations.filter(item => coordinates(item) === coordinates(check))
        .map(observation => ({ round: run.round, run: run.run, runId: run.runId, observedAt: run.observedAt, observation })));
      const active = attempts.filter(prior => !attempts.some(later => sameEvidence(later.round, prior.round) &&
        later.observation.previousRunId === prior.runId && ['Pass', 'Fail'].includes(later.observation.outcome)));
      const outcome = ['Fail', 'Blocked', 'Partial', 'Not run', 'Pass'].find(value => active.some(item => item.observation.outcome === value)) ?? 'Not run';
      return { ...check, outcome, attempts };
    }),
  }));
  const confirmation = batches.filter(batch => batch.phase === 'confirmation').flatMap(batch => batch.checks);
  const regression = batches.filter(batch => batch.phase === 'regression').flatMap(batch => batch.checks);
  const state = confirmation.some(check => check.outcome === 'Fail') ? 'confirmationFailed'
    : confirmation.some(check => check.outcome !== 'Pass') ? 'confirmationPending'
    : regression.some(check => !['Pass', 'Fail'].includes(check.outcome)) ? 'regressionPending' : 'reviewPending';
  const report = { fix: entry.key, plan: revision.plan, approval: revision.approval, target: entry.identity.target, batches, state };
  return { report, assessmentDigest: digest(JSON.stringify(report)), revision, regression };
}

export function fixStatus(root: string, key: string) {
  const fixes = ledger(root).value.fixes;
  const entry = findFix(root, key, false, fixes);
  const active = currentFor(fixes, entry.identity.defect, entry.identity.target.environment)?.key === key;
  const assessment = assess(root, entry);
  if (!assessment) return { key, identity: entry.identity, state: active ? 'scopePending' as const : 'superseded' as const, assessment: null, review: null };
  const latest = assessment.revision.reviews.at(-1);
  const reviewed = latest && pinned<Review>(root, latest, 'fix disposition').assessmentDigest === assessment.assessmentDigest ? latest : null;
  return { key, identity: entry.identity, state: active ? reviewed ? 'reviewed' as const : assessment.report.state : 'superseded' as const,
    assessment: { ...assessment.report, digest: assessment.assessmentDigest }, review: reviewed,
    reviewHistory: entry.plans.flatMap(plan => plan.reviews) };
}

export function currentFixes(root: string, defect: Assignment) {
  const fixes = ledger(root).value.fixes;
  return fixes.filter(entry => sameAssignment(entry.identity.defect, defect) &&
    currentFor(fixes, defect, entry.identity.target.environment)?.key === entry.key)
    .map(entry => ({ key: entry.key, target: entry.identity.target, ...(() => {
      try { return { state: fixStatus(root, entry.key).state }; }
      catch (error) { return { state: 'evidenceNeedsReview', reason: error instanceof Error ? error.message : 'Review the fix evidence.' }; }
    })() }));
}

function verifyReview(root: string, entry: Fix, ref: Evidence) {
  const current = assess(root, entry);
  if (!current || current.report.state !== 'reviewPending') throw new Error('Complete confirmation and every required regression check before reviewing this fix.');
  const review = pinned<Review>(root, ref, 'fix disposition');
  if (review?.gate !== 'G5' || !['Approved', 'Approved with limits'].includes(review.decision) || review.fix !== entry.key ||
      review.assessmentDigest !== current.assessmentDigest || !Array.isArray(review.findings)) {
    throw new Error('Record the actual scoped G5 decision for the current fix assessment.');
  }
  requireText(review.reviewer, 'Actual fix reviewer');
  requireText(review.source, 'Actual fix disposition source');
  requireText(review.ticketRevision, 'Reviewed defect ticket revision');
  verifyEvidence(root, review.packet);
  const firstCaseBatch = readPlan(root, entry, current.revision).caseDesigns.values().next().value;
  if (firstCaseBatch && !sameEvidence(review.understanding, firstCaseBatch.batch.understanding)) {
    throw new Error('Review the feature understanding used for the confirmation and regression verdicts.');
  }
  const observed = observeTarget(root, entry.identity, review.targetObservation);
  if (current.report.batches.some(batch => batch.checks.some(check =>
    check.attempts.some(attempt => Date.parse(attempt.observedAt) > Date.parse(observed.observedAt))))) {
    throw new Error('Reobserve the fixed target on or after the retained confirmation and regression results.');
  }
  const failures = current.regression.filter(check => check.outcome === 'Fail');
  if (review.findings.length !== failures.length || new Set(review.findings.map(coordinates)).size !== failures.length ||
      failures.some(check => !review.findings.some(item => coordinates(item) === coordinates(check)))) {
    throw new Error('Link the reviewed regression defect for each failing check.');
  }
  for (const finding of review.findings) {
    assignmentValid(finding.ticket);
    if (sameAssignment(finding.ticket, entry.identity.defect) || !['blocking', 'nonblocking'].includes(finding.impact)) {
      throw new Error('Identify the separate regression ticket and its reviewed release impact.');
    }
    const observed = pinned<{ fix: string; ticket: Assignment; destination: 'Dev Todo'; source: string }>(root, finding.evidence, 'regression ticket observation');
    if (observed?.fix !== entry.key || !sameAssignment(observed.ticket, finding.ticket) || observed.destination !== 'Dev Todo') {
      throw new Error('Link the observed Dev Todo ticket to the originating fix.');
    }
    requireText(observed.source, 'Actual regression ticket evidence source');
  }
  return { review, assessmentDigest: current.assessmentDigest, approval: current.revision.approval };
}

export function recordFixReview(root: string, request: { fix: string; review: Evidence }) {
  return lock(root, () => {
    const current = ledger(root), entry = findFix(root, request.fix, true, current.value.fixes);
    verifyReview(root, entry, request.review);
    const revision = entry.plans.at(-1)!;
    if (!sameEvidence(revision.reviews.at(-1), request.review)) {
      revision.reviews.push(request.review);
      save(root, ledgerPath, current.value, current.revision);
    }
    return fixStatus(root, entry.key);
  });
}

export function requireVerifiedFix(root: string, key: string, defect: Assignment, approval?: Evidence) {
  const entry = findFix(root, key);
  const review = entry.plans.at(-1)?.reviews.at(-1);
  if (!sameAssignment(entry.identity.defect, defect) || !review) throw new Error('Record the reviewed confirmation and regression results for this defect.');
  const verified = verifyReview(root, entry, review);
  if (approval && !sameEvidence(verified.approval, approval)) throw new Error('Use the same reviewed G4 scope for fix completion.');
  return { key, target: entry.identity.target, ...verified, evidence: review };
}

export function defectCompletion(root: string, defect: Assignment, ticketRevision: string, completion: DefectCompletion | undefined, approval?: Evidence, preview = false) {
  if (!completion) throw new Error('Record separate confirmation and regression outcomes for the fix, or the reviewed no-change disposition.');
  if (completion.fix) {
    const entry = findFix(root, completion.fix), current = assess(root, entry);
    if (completion.refutation || !sameAssignment(entry.identity.defect, defect) || !current ||
        approval && !sameEvidence(current.revision.approval, approval) || current.report.state !== 'reviewPending') {
      throw new Error('Complete confirmation and every required regression check for the current defect and G4 scope.');
    }
    if (!preview) {
      const verified = requireVerifiedFix(root, completion.fix, defect, approval);
      if (verified.review.ticketRevision !== ticketRevision) throw new Error('The scoped fix disposition must cover this ticket revision.');
    }
    return current.assessmentDigest;
  }
  if (currentFixes(root, defect).length) throw new Error('This defect has a registered product fix. Complete its confirmation and regression.');
  const review = pinned<{ gate: string; decision: string; assignment: Assignment; ticketRevision: string;
    reviewer: string; source: string; defectReport: Evidence; ownerDecision: Evidence }>(root, completion.refutation!, 'no-change disposition');
  if (review?.gate !== 'G5' || review.decision !== 'Approved' || !sameAssignment(review.assignment, defect) || review.ticketRevision !== ticketRevision) {
    throw new Error('Record the reviewed no-change disposition for the current defect ticket revision.');
  }
  requireText(review.reviewer, 'Actual disposition reviewer');
  requireText(review.source, 'Actual no-change decision source');
  verifyEvidence(root, review.defectReport);
  const owner = pinned<{ assignment: Assignment; decision: string; source: string }>(root, review.ownerDecision, 'responsible owner clarification');
  if (owner?.decision !== 'noProductChange' || !sameAssignment(owner.assignment, defect)) throw new Error('Link the actual owner decision confirming no product change.');
  requireText(owner.source, 'Actual owner decision source');
  return completion.refutation!.sha256;
}

export function requireFixBatch(root: string, defect: Assignment, target: Target, approval: Evidence, selection: { fix: string; batchId: string }) {
  const entry = findFix(root, selection.fix), revision = entry.plans.at(-1);
  if (!sameAssignment(entry.identity.defect, defect) || !sameTarget(entry.identity.target, target) || !revision ||
      !sameEvidence(revision.approval, approval)) throw new Error('Reserve a batch from the same G4-approved fix and target.');
  const current = assess(root, entry)!;
  const batch = current.report.batches.find(row => row.id === selection.batchId);
  if (!batch) throw new Error('Select an approved fix batch.');
  if (batch.phase === 'regression' && ['confirmationPending', 'confirmationFailed'].includes(current.report.state)) {
    throw new Error('Complete confirmation before starting this regression batch. Matching retained results can be linked earlier.');
  }
  if (batch.checks.every(check => ['Pass', 'Fail'].includes(check.outcome)) && !batch.retryReason) {
    throw new Error('This batch already has eligible outcomes. Reuse the evidence or obtain a reviewed retry.');
  }
  const cases = readPlan(root, entry, revision).plan.caseBatches?.find(item => item.batchId === batch.id)?.batch;
  return { fix: entry.key, batchId: batch.id, phase: batch.phase, plan: revision.plan, checks: batch.checks.map(coordinates),
    ...(cases ? { caseBatch: cases } : {}) };
}

export function failedConfirmation(root: string, defect: Assignment, fix: string) {
  const entry = findFix(root, fix);
  const assessment = assess(root, entry);
  if (!sameAssignment(entry.identity.defect, defect) || assessment?.report.state !== 'confirmationFailed') {
    throw new Error('Rework requires a recorded failure of the original confirmation check for the current fix and target.');
  }
  return { fix, target: entry.identity.target, assessmentDigest: assessment.assessmentDigest };
}

export function verifyRework(root: string, defect: Assignment, ticketRevision: string, decision: ReworkDecision) {
  const current = failedConfirmation(root, defect, decision.fix);
  const reviewed = pinned<{ gate: string; decision: string; assignment: Assignment; ticketRevision: string; target: Target;
    source: string; reviewer: string; packet: Evidence; rework: { fix: string; assessmentDigest: string } }>(root, decision.review, 'G3 Rework decision');
  if (reviewed?.gate !== 'G3' || !['Approved', 'Approved with limits'].includes(reviewed.decision) ||
      !sameAssignment(reviewed.assignment, defect) || reviewed.ticketRevision !== ticketRevision || !sameTarget(reviewed.target, current.target) ||
      reviewed.rework?.fix !== current.fix || reviewed.rework.assessmentDigest !== current.assessmentDigest) {
    throw new Error('G3 must review the recorded confirmation failure for this ticket revision, fix and target.');
  }
  requireText(reviewed.source, 'Actual G3 review source');
  requireText(reviewed.reviewer, 'Actual G3 reviewer');
  verifyEvidence(root, reviewed.packet);
  return { ...current, review: decision.review };
}

interface ChangeManifest {
  assignment: Assignment; target: Target; changes: Evidence; fixes: FixIdentity[];
  policy: Evidence; coverage: 'targeted' | 'full'; affected: Coordinate[];
  findingDispositions?: Evidence[]; exclusions?: Evidence[]; boardReadbacks?: Evidence[]; boardInventory?: Evidence;
}
interface BoardInventory {
  assignment: Assignment; target: Target; linkedTicketIds: string[];
  owner: string; source: string; evidence: Evidence; observedAt: string; boardReadbacks?: Evidence[];
}
const assignmentKey = (item: Assignment) => JSON.stringify([item.source, item.ticketId]);

function readInventory(root: string, manifest: ChangeManifest, ref: Evidence | undefined, stage: 'scope' | 'handoff') {
  if (!ref) throw new Error(`Supply an authoritative live-board inventory for release ${stage}, even if it contains no linked tickets.`);
  const inventory = pinned<BoardInventory>(root, ref, 'authoritative live-board inventory');
  if (!sameAssignment(inventory?.assignment, manifest.assignment) || !sameTarget(inventory.target, manifest.target) ||
      !Array.isArray(inventory.linkedTicketIds) || new Set(inventory.linkedTicketIds).size !== inventory.linkedTicketIds.length ||
      inventory.linkedTicketIds.includes(manifest.assignment.ticketId) ||
      !Number.isFinite(Date.parse(inventory.observedAt)) || !/(Z|[+-]\d\d:\d\d)$/.test(inventory.observedAt)) {
    throw new Error('Record the complete linked-ticket inventory for the exact release assignment and target, with the actual observation time.');
  }
  for (const id of inventory.linkedTicketIds) requireText(id, 'Canonical linked ticket ID');
  requireText(inventory.owner, 'Responsible owner for the complete live-board inventory');
  requireText(inventory.source, 'Authoritative source covering tickets outside the selected board view');
  verifyEvidence(root, inventory.evidence);
  return inventory;
}

function reviewedBoardEntries(root: string, manifest: ChangeManifest, refs: Evidence[] | undefined, label: 'exclusion' | 'board readback',
  readbackWindow?: { earliest: number; latest: number }) {
  const entries = new Map<string, { ref: Evidence; revision?: string; linked?: boolean }>();
  for (const ref of refs ?? []) {
    const record = pinned<{ assignment: Assignment; defect: Assignment; target: Target; source: string; evidence: Evidence;
      reason?: string; reviewer?: string; revision?: string; linked?: boolean; observedAt?: string }>(root, ref, label);
    assignmentValid(record?.defect);
    const key = assignmentKey(record.defect);
    if (entries.has(key) || !sameAssignment(record.assignment, manifest.assignment) || !sameTarget(record.target, manifest.target)) {
      throw new Error(`Reconcile each ${label} for the exact assignment, defect and target.`);
    }
    requireText(record.source, `Actual ${label} source`);
    verifyEvidence(root, record.evidence);
    if (label === 'exclusion') {
      requireText(record.reason, 'Reason the fix is outside this release build');
      requireText(record.reviewer, 'Actual exclusion reviewer');
    } else {
      requireText(record.revision, 'Observed canonical ticket revision');
      if (typeof record.linked !== 'boolean') throw new Error('Record the observed parent relationship in the board readback.');
      if (readbackWindow) {
        const time = Date.parse(record.observedAt ?? '');
        if (!Number.isFinite(time) || !/(Z|[+-]\d\d:\d\d)$/.test(record.observedAt!) ||
            time < readbackWindow.earliest || time > readbackWindow.latest) {
          throw new Error(`Refresh the authoritative board readback for ${record.defect.ticketId} within the current G5 observation window.`);
        }
      }
    }
    entries.set(key, { ref, revision: record.revision, linked: record.linked });
  }
  return entries;
}

function reconcileBoard(root: string, manifest: ChangeManifest, board: ReleaseBoard, onTarget: Fix[], expected: Set<string>,
  inventory?: BoardInventory, readbackWindow?: { earliest: number; latest: number }) {
  if (!sameAssignment(board?.assignment, manifest.assignment)) throw new Error('Observe the canonical board for this release assignment.');
  const { assignment, target } = manifest;
  const exclusions = reviewedBoardEntries(root, manifest, manifest.exclusions, 'exclusion');
  const readbacks = reviewedBoardEntries(root, manifest, inventory ? inventory.boardReadbacks : manifest.boardReadbacks, 'board readback', readbackWindow);
  const roster = inventory && new Set(inventory.linkedTicketIds);
  const candidates = new Map<string, Assignment>();
  for (const ticketId of roster ?? []) {
    const defect = { source: assignment.source, ticketId };
    candidates.set(assignmentKey(defect), defect);
  }
  for (const row of board.rows) if (row.linked) {
    const defect = { source: assignment.source, ticketId: row.id };
    candidates.set(assignmentKey(defect), defect);
  }
  for (const row of onTarget) if (sameAssignment(row.identity.parent, assignment)) {
    candidates.set(assignmentKey(row.identity.defect), row.identity.defect);
  }
  for (const fix of manifest.fixes) candidates.set(assignmentKey(fix.defect), fix.defect);
  // A provider-filtered child can be supplied through an authoritative ticket readback.
  for (const key of new Set([...exclusions.keys(), ...[...readbacks].filter(([, row]) => row.linked).map(([id]) => id)])) if (!candidates.has(key)) {
    const [source, ticketId] = JSON.parse(key) as [string, string];
    candidates.set(key, { source, ticketId });
  }
  const relationships = [];
  for (const [key, defect] of candidates) {
    const matches = defect.source === assignment.source ? board.rows.filter(row => row.id === defect.ticketId) : [];
    const row = matches[0], readback = readbacks.get(key), exclusion = exclusions.get(key);
    if (matches.length > 1 || row?.ambiguous) throw new Error(`Reconcile conflicting board relationships for ${defect.ticketId}.`);
    if (!row && !readback) throw new Error(`Observe ${defect.ticketId} on the canonical board or supply an authoritative ticket readback.`);
    if (row && readback && (row.revision !== readback.revision ||
        (row.linked || row.parentSpecified) && row.linked !== readback.linked)) {
      throw new Error(`Refresh the authoritative board readback for ${defect.ticketId}.`);
    }
    const current = currentFor(onTarget, defect, target.environment);
    const linked = row?.linked || readback?.linked || false;
    const intakeParent = current?.identity.parent;
    if (roster && defect.source === assignment.source && roster.has(defect.ticketId) !==
        (linked || sameAssignment(intakeParent, assignment))) {
      throw new Error(`Reconcile ${defect.ticketId} with the authoritative live-board inventory. Refresh the release scope if its membership changed.`);
    }
    if (intakeParent && (linked && !sameAssignment(intakeParent, assignment) ||
        (row?.parentSpecified || readback) && !linked && sameAssignment(intakeParent, assignment))) {
      throw new Error(`Reconcile the board and fix intake parent for ${defect.ticketId}.`);
    }
    if (current && !expected.has(identityKey(current.identity))) {
      throw new Error(`The reviewed release change manifest omits a known linked fix for ${defect.ticketId}.`);
    }
    const included = manifest.fixes.some(item => sameAssignment(item.defect, defect));
    if (exclusion && (current || included)) throw new Error(`The exclusion for ${defect.ticketId} conflicts with evidence that it belongs to this release build.`);
    if (!included && !exclusion) throw new Error(`Establish whether linked defect ${defect.ticketId} is included in this exact build, or retain a reviewed exclusion.`);
    if (included && !current) throw new Error(`Record the observed fix intake for ${defect.ticketId} on this exact release build and environment.`);
    if (current) findFix(root, current.key, false, onTarget);
    relationships.push({ defect, revision: row?.revision ?? readback!.revision, linked,
      ...(readback ? { readback: readback.ref } : {}), ...(exclusion ? { exclusion: exclusion.ref } : {}) });
  }
  return relationships.sort((a, b) => assignmentKey(a.defect).localeCompare(assignmentKey(b.defect)));
}

export function reconcileReleaseScope(root: string, assignment: Assignment, round: Round, manifestRef: Evidence, board: ReleaseBoard,
  handoff?: { inventory?: Evidence; observedAt?: string }) {
  const { target, changes } = round;
  const manifest = pinned<ChangeManifest>(root, manifestRef, 'reviewed release change manifest');
  if (!sameAssignment(manifest?.assignment, assignment) || !sameTarget(manifest.target, target) ||
      !sameEvidence(manifest.changes, changes) || !Array.isArray(manifest.fixes) || !['targeted', 'full'].includes(manifest.coverage)) {
    throw new Error('Review the independent list of fixes included in this exact release build.');
  }
  for (const check of requiredChecks(root, manifest.policy, round.library, manifest.affected, manifest.coverage)) {
    if (!round.obligations.some(row => row.state === 'required' && row.conditionId === check.conditionId && row.checkIds.includes(check.checkId))) {
      throw new Error(`The reviewed release round omits the required regression check ${coordinates(check)}.`);
    }
  }
  const expected = new Set<string>();
  const defects = new Set<string>();
  for (const fix of manifest.fixes) {
    assignmentValid(fix.defect);
    requireText(fix.fixRevision, 'Included fix revision');
    const key = assignmentKey(fix.defect);
    if (defects.has(key)) throw new Error('Include one current fix revision per defect for the exact release build.');
    defects.add(key);
    expected.add(identityKey(fix));
  }
  const all = ledger(root).value.fixes;
  const onTarget = all.filter(row => sameTarget(row.identity.target, target));
  let inventory: BoardInventory | undefined;
  let readbackWindow: { earliest: number; latest: number } | undefined;
  if (assignment.source !== 'local') {
    const scope = readInventory(root, manifest, manifest.boardInventory, 'scope');
    inventory = { ...scope, boardReadbacks: scope.boardReadbacks ?? manifest.boardReadbacks };
    if (handoff) {
      inventory = readInventory(root, manifest, handoff.inventory, 'handoff');
      const scoped = new Set(scope.linkedTicketIds);
      if (scoped.size !== inventory.linkedTicketIds.length || inventory.linkedTicketIds.some(id => !scoped.has(id))) {
        throw new Error('The authoritative live-board inventory changed. Review the updated release scope before G5.');
      }
      const scopeTime = Date.parse(scope.observedAt);
      const latest = Date.parse(inventory.observedAt);
      const earliest = Math.max(scopeTime + 1, handoff.observedAt ? Date.parse(handoff.observedAt) : scopeTime);
      if (latest < earliest) {
        throw new Error('Refresh the authoritative live-board inventory for the current G5 target observation.');
      }
      readbackWindow = { earliest, latest };
    }
  }
  const relationships = reconcileBoard(root, manifest, board, onTarget, expected, inventory, readbackWindow);
  return { manifest, relationships, all };
}

export function releaseFixes(root: string, assignment: Assignment, round: Round, manifestRef: Evidence, board: ReleaseBoard,
  handoff: { inventory?: Evidence; observedAt?: string }) {
  const { target } = round;
  const { manifest, relationships, all } = reconcileReleaseScope(root, assignment, round, manifestRef, board, handoff);
  const fixes = manifest.fixes.map(fix => {
    const key = fixKey({ ...fix, target });
    const verified = requireVerifiedFix(root, key, fix.defect);
    if (verified.review.findings.some(finding => finding.impact === 'blocking')) throw new Error(`A reviewed regression finding blocks release for ${fix.defect.ticketId}.`);
    return { defect: fix.defect, fixRevision: fix.fixRevision, evidence: verified.evidence, findings: verified.review.findings };
  });
  const known = new Map<string, Assignment>();
  for (const row of all.filter(entry => sameAssignment(entry.identity.parent, assignment) ||
    relationships.some(item => sameAssignment(item.defect, entry.identity.defect)))) {
    for (const ref of row.plans.flatMap(plan => plan.reviews)) {
      const review = pinned<Review>(root, ref, 'retained fix review');
      for (const finding of review.findings) if (finding.impact === 'blocking') {
        known.set(JSON.stringify([finding.ticket.source, finding.ticket.ticketId]), finding.ticket);
      }
    }
  }
  const dispositions = (manifest.findingDispositions ?? []).map(ref => {
    const record = pinned<{ ticket: Assignment; target: Target; decision: 'resolved' | 'acceptedNonblocking';
      owner: string; source: string; evidence: Evidence }>(root, ref, 'reviewed regression disposition');
    assignmentValid(record.ticket);
    if (!known.has(JSON.stringify([record.ticket.source, record.ticket.ticketId])) || !sameTarget(record.target, target) ||
        !['resolved', 'acceptedNonblocking'].includes(record.decision)) throw new Error('Review the known regression finding for the exact release target.');
    requireText(record.owner, 'Responsible owner for the regression disposition');
    requireText(record.source, 'Actual regression disposition source');
    verifyEvidence(root, record.evidence);
    return { ticket: record.ticket, decision: record.decision, evidence: ref };
  });
  for (const ticket of known.values()) if (!fixes.some(fix => sameAssignment(fix.defect, ticket)) &&
      !dispositions.some(item => sameAssignment(item.ticket, ticket))) {
    throw new Error(`The prior blocking regression ${ticket.ticketId} still needs a reviewed release disposition.`);
  }
  const report = { manifest: manifestRef, ...(handoff.inventory ? { boardInventory: handoff.inventory } : {}), relationships, fixes, dispositions };
  return { ...report, digest: digest(JSON.stringify(report)) };
}
