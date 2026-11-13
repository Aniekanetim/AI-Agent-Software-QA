import { approveFixPlan, fixStatus, recordFixReview, registerFix, retainFixResults } from '../regression/fix.js';
import { retainRun, type Run } from '../release/round.js';
import { startCases, observeCheckpoint, prepareCheckpoint, finishCases, type CaseDefinition } from '../execution/cases.js';
import type { Assignment } from '../release/scope.js';
import { releaseFixture } from './release-fixture.js';

export function regressionFixture(root: string, defect: Assignment, ticketRevision: string, options: {
  parent?: Assignment; claimId?: string; base?: ReturnType<typeof releaseFixture>; fixRevision?: string; supersedes?: string; cases?: boolean; interruptConfirmation?: boolean;
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
  const batches = [
    { id: 'confirmation', phase: 'confirmation', checks: [{ checkId: 'confirmation', conditionId: 'route', context }] },
    { id: 'regression', phase: 'regression', checks: [{ ...critical, context }] },
  ];
  const basis = library.conditions[0]!.basis;
  const understanding = options.cases ? put(file('understanding'), { schemaVersion: 1, assignment: defect,
    sources: [{ id: 'route-rule', authority: 'Fixture business rule', accepted: basis, current: basis }],
    flows: [{ id: 'route', featureId: 'reporting', relationshipIds: [], actor: 'QA', startingState: 'Reviewed route',
      expectedFlow: 'Use the reviewed route.', criteria: ['route-rule'] }] }) : undefined;
  const g1 = understanding && put(file('g1'), { gate: 'G1', assignment: defect, decision: 'Approved', understanding,
    reviewer: 'Fixture reviewer', source: 'Synthetic G1 review', packet: defectReport });
  const checkpoints = [
    { id: 'precondition', action: 'Verify the reviewed starting state', expected: 'State matches' },
    { id: 'result', action: 'Check the reporting route', expected: 'The saved route is honored' },
  ];
  const caseBatches = understanding && batches.map(({ id, checks }) => {
    const cases: CaseDefinition[] = checks.map(check => ({ ...check, id, flowId: 'route', dependsOn: [], criteria: ['route-rule'],
      definition: library.checks.find(item => item.id === check.checkId)!.definition, checkpoints }));
    return { batchId: id, batch: put(file(id + '-cases'), { schemaVersion: 1, assignment: defect, target, understanding, cases }) };
  });
  const plan = put(file('plan'), { schemaVersion: 1, fix: key, library: libraryRef, policy, impact,
    coverage: 'targeted', rationale: 'Synthetic affected and baseline coverage', batches, caseBatches });
  const g4 = put(`.local/g4-${suffix}.json`, { gate: 'G4', decision: 'Approved', reviewer: 'Fixture reviewer',
    source: 'Synthetic G4 review', packet: defectReport, assignment: defect, target, fixPlan: plan, defectReport,
    claimId: options.claimId, ticketRevision, understanding, scopeReview: g1, caseBatches: caseBatches?.map(item => item.batch) });
  const approve = () => approveFixPlan(root, { fix: key, plan, approval: g4 });
  const retain = (batchId: 'confirmation' | 'regression', outcome: 'Pass' | 'Fail' = 'Pass', name = batchId as string) => {
    const run: Run = { schemaVersion: 1, id: name, round: roundRef, target, observedAt: '2026-01-01T00:02:00Z',
      targetEvidence: base.targetEvidence, observations: [{ checkId: batchId === 'confirmation' ? 'confirmation' : 'shared',
        conditionId: 'route', outcome, context, evidence: [put(file(name + '-result'), { actual: outcome })] }] };
    const batch = caseBatches?.find(item => item.batchId === batchId)?.batch;
    if (batch) {
      const interruptions = options.interruptConfirmation && batchId === 'confirmation' ? 2 : 0;
      let receipt: Run['observations'][number]['caseExecution'];
      for (let attempt = 0; attempt <= interruptions; attempt++) {
        const id = suffix + '-' + name + '-' + attempt;
        startCases(root, { id, batch, approval: g4, target: base.targetEvidence, previous: receipt?.receipt });
        const observed = { id, caseId: batchId, evidence: run.observations[0]!.evidence, source: 'Synthetic case observation' };
        for (const checkpoint of checkpoints) {
          prepareCheckpoint(root, { id, caseId: batchId, target: base.targetEvidence });
          observeCheckpoint(root, { ...observed, checkpoint: checkpoint.id, outcome: checkpoint.id === 'precondition'
            ? 'matched' : attempt < interruptions ? 'interrupted' : outcome === 'Fail' ? 'deviation' : 'matched' });
        }
        receipt = { receipt: finishCases(root, id).receipt, caseId: batchId };
      }
      run.observations[0]!.caseExecution = receipt;
    }
    const ref = put(file(name + '-run'), run);
    retainRun(root, { round: roundRef, run: ref });
    return { status: retainFixResults(root, { fix: key, plan, batchId, round: roundRef, run: ref }), ref };
  };
  const review = (findings: unknown[] = [], persist = true) => {
    const assessment = fixStatus(root, key).assessment!;
    const ref = put(file('disposition'), { gate: 'G5', decision: 'Approved', reviewer: 'Fixture reviewer',
      source: 'Synthetic fix decision', packet: defectReport, fix: key, ticketRevision, targetObservation: latestTarget,
      assessmentDigest: assessment.digest, findings, understanding });
    if (persist) recordFixReview(root, { fix: key, review: ref });
    return ref;
  };
  return { base, key, plan, g4, intake, roundRef, context, defectReport, approve, retain, review };
}
