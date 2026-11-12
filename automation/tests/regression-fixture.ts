import { approveFixPlan, fixStatus, recordFixReview, registerFix, retainFixResults } from '../regression/fix.js';
import { retainRun, type Run } from '../release/round.js';
import type { Assignment } from '../release/scope.js';
import { releaseFixture } from './release-fixture.js';

export function regressionFixture(root: string, defect: Assignment, ticketRevision: string, options: {
  parent?: Assignment; claimId?: string; base?: ReturnType<typeof releaseFixture>; fixRevision?: string; supersedes?: string;
} = {}) {
  const base = options.base ?? releaseFixture(root, defect.ticketId);
  const { put, target } = base;
  const suffix = defect.ticketId + '-' + (options.fixRevision ?? 'r1');
  const file = (name: string) => `fix-fixtures/${suffix}/${name}.json`;
  const definition = put(file('confirmation-definition'), { expected: 'The original failure no longer occurs.' });
  const library = {
    ...base.library,
    checks: [...base.library.checks, { id: 'confirmation', name: 'Original failure', definition, conditionIds: ['route'] }],
    suites: base.library.suites.map(suite => ({ ...suite, checkIds: [...suite.checkIds, 'confirmation'] })),
  };
  const libraryRef = put(file('library'), library);
  const round = { ...base.round, id: 'fix-' + suffix, assignmentIds: [defect.ticketId], library: libraryRef,
    obligations: base.round.obligations.map(row => ({ ...row, checkIds: [...row.checkIds, 'confirmation'] })) };
  const roundRef = put(file('round'), round);
  const fixRevision = options.fixRevision ?? 'r1';
  const observed = (observedAt: string) => ({ ...target, fixRevision, observedAt, source: 'Synthetic target inspection' });
  const targetObservation = put(file('intake-target'), observed('2026-01-01T00:00:00Z'));
  const latestTarget = put(file('review-target'), observed('2026-01-01T00:10:00Z'));
  const defectReport = put(file('defect'), { reproduction: 'Original failing behavior' });
  const developerResponse = put(file('developer'), { claimedFix: fixRevision });
  const intake = put(file('intake'), { schemaVersion: 1, defect, parent: options.parent, fixRevision, target, targetObservation, defectReport, developerResponse });
  const { key } = registerFix(root, { intake, supersedes: options.supersedes });
  const context = put(file('context'), { role: 'Synthetic QA role', data: 'Fixture v1', configuration: 'Default fixture configuration' });
  const critical = { checkId: 'shared', conditionId: 'route' };
  const policy = put(file('policy'), { library: libraryRef, critical: [critical], full: [critical] });
  const impact = put(file('impact'), { fix: key, affected: [critical], broaderRequired: false });
  const plan = put(file('plan'), { schemaVersion: 1, fix: key, library: libraryRef, policy, impact,
    coverage: 'targeted', rationale: 'Synthetic affected and baseline coverage', batches: [
      { id: 'confirmation', phase: 'confirmation', checks: [{ checkId: 'confirmation', conditionId: 'route', context }] },
      { id: 'regression', phase: 'regression', checks: [{ ...critical, context }] },
    ] });
  const g4 = put(`.local/g4-${suffix}.json`, { gate: 'G4', decision: 'Approved', reviewer: 'Fixture reviewer',
    source: 'Synthetic G4 review', packet: defectReport, assignment: defect, target, fixPlan: plan, defectReport,
    claimId: options.claimId, ticketRevision });
  const approve = () => approveFixPlan(root, { fix: key, plan, approval: g4 });
  const retain = (batchId: 'confirmation' | 'regression', outcome: 'Pass' | 'Fail' = 'Pass', name = batchId as string) => {
    const run: Run = { schemaVersion: 1, id: name, round: roundRef, target, observedAt: '2026-01-01T00:02:00Z',
      targetEvidence: base.targetEvidence, observations: [{ checkId: batchId === 'confirmation' ? 'confirmation' : 'shared',
        conditionId: 'route', outcome, context, evidence: [put(file(name + '-result'), { actual: outcome })] }] };
    const ref = put(file(name + '-run'), run);
    retainRun(root, { round: roundRef, run: ref });
    return { status: retainFixResults(root, { fix: key, plan, batchId, round: roundRef, run: ref }), ref };
  };
  const review = (findings: unknown[] = []) => {
    const assessment = fixStatus(root, key).assessment!;
    const ref = put(file('disposition'), { gate: 'G5', decision: 'Approved', reviewer: 'Fixture reviewer',
      source: 'Synthetic fix decision', packet: defectReport, fix: key, ticketRevision, targetObservation: latestTarget,
      assessmentDigest: assessment.digest, findings });
    recordFixReview(root, { fix: key, review: ref });
    return ref;
  };
  return { base, key, plan, g4, intake, roundRef, context, defectReport, approve, retain, review };
}
