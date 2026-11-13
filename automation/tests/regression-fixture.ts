import { approveFixPlan, fixStatus, recordFixReview, registerFix, retainFixResults } from '../regression/fix.js';
import { retainRun, type Run } from '../release/round.js';
import { startCases, runApprovedCases, observeCheckpoint, prepareCheckpoint, finishCases, type CaseDefinition } from '../execution/cases.js';
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
  const prerequisite = options.interruptConfirmation ? put(file('prerequisite'), { expected: 'Fixture route is available' }) : undefined;
  const library = {
    ...base.library,
    checks: [...base.library.checks, { id: 'confirmation', name: 'Original failure', definition, conditionIds: ['route'] },
      ...(prerequisite ? [{ id: 'prerequisite', name: 'Route prerequisite', definition: prerequisite, conditionIds: ['route'] }] : [])],
    suites: base.library.suites.map(suite => ({ ...suite, checkIds: [...suite.checkIds, 'confirmation', ...(prerequisite ? ['prerequisite'] : [])] })),
  };
  const libraryRef = put(file('library'), library);
  const round = { ...base.round, id: 'fix-' + suffix, assignmentIds: [defect.ticketId], library: libraryRef,
    obligations: base.round.obligations.map(row => ({ ...row, checkIds: [...row.checkIds, 'confirmation', ...(prerequisite ? ['prerequisite'] : [])] })) };
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
    { id: 'confirmation', phase: 'confirmation', checks: [
      ...(prerequisite ? [{ checkId: 'prerequisite', conditionId: 'route', context }] : []),
      { checkId: 'confirmation', conditionId: 'route', context },
    ] },
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
    const cases: CaseDefinition[] = checks.map(check => ({ ...check, id: check.checkId === 'prerequisite' ? 'prerequisite' : id, flowId: 'route',
      dependsOn: prerequisite && check.checkId === 'confirmation' ? ['prerequisite'] : [], criteria: ['route-rule'],
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
      const id = suffix + '-' + name;
      startCases(root, { id, batch, approval: g4, target: base.targetEvidence });
      const observed = { id, caseId: batchId, evidence: run.observations[0]!.evidence, source: 'Synthetic case observation' };
      for (const checkpoint of checkpoints) {
        prepareCheckpoint(root, { id, caseId: batchId, target: base.targetEvidence });
        observeCheckpoint(root, { ...observed, checkpoint: checkpoint.id,
          outcome: checkpoint.id === 'result' && outcome === 'Fail' ? 'deviation' : 'matched' });
      }
      run.observations[0]!.caseExecution = { receipt: finishCases(root, id).receipt, caseId: batchId };
    }
    const ref = put(file(name + '-run'), run);
    retainRun(root, { round: roundRef, run: ref });
    return { status: retainFixResults(root, { fix: key, plan, batchId, round: roundRef, run: ref }), ref };
  };
  async function retainResumedConfirmation() {
    const batch = caseBatches!.find(item => item.batchId === 'confirmation')!.batch;
    const evidence = [put(file('fixture-outcome'), { source: 'Synthetic', actual: 'Route observed' })];
    const id = suffix + '-batch';
    startCases(root, { id, batch, approval: g4, target: base.targetEvidence });
    const receipt = await runApprovedCases(root, id, { target: () => base.targetEvidence, execute: step => ({
      evidence, source: 'Synthetic runner', outcome: step.caseId === 'confirmation' && step.checkpoint.id === 'result' ? 'interrupted' : 'matched',
    }) });
    let previous = receipt.receipt;
    for (const attempt of [1, 2]) {
      const resumed = id + '-' + attempt;
      startCases(root, { id: resumed, batch, approval: g4, target: base.targetEvidence, previous, caseIds: ['confirmation'] });
      previous = (await runApprovedCases(root, resumed, { target: () => base.targetEvidence, execute: step => ({
        evidence, source: 'Synthetic runner', outcome: attempt === 1 && step.checkpoint.id === 'result' ? 'interrupted' : 'matched',
      }) })).receipt;
    }
    const run: Run = { schemaVersion: 1, id: 'resumed-confirmation', round: roundRef, target,
      observedAt: '2026-01-01T00:02:00Z', targetEvidence: base.targetEvidence, observations: [
        { checkId: 'prerequisite', conditionId: 'route', outcome: 'Pass', context, evidence, caseExecution: { receipt: receipt.receipt, caseId: 'prerequisite' } },
        { checkId: 'confirmation', conditionId: 'route', outcome: 'Pass', context, evidence, caseExecution: { receipt: previous, caseId: 'confirmation' } },
      ] };
    const ref = put(file('resumed-confirmation-run'), run);
    retainRun(root, { round: roundRef, run: ref });
    return retainFixResults(root, { fix: key, plan, batchId: 'confirmation', round: roundRef, run: ref });
  }
  const review = (findings: unknown[] = [], persist = true) => {
    const assessment = fixStatus(root, key).assessment!;
    const ref = put(file('disposition'), { gate: 'G5', decision: 'Approved', reviewer: 'Fixture reviewer',
      source: 'Synthetic fix decision', packet: defectReport, fix: key, ticketRevision, targetObservation: latestTarget,
      assessmentDigest: assessment.digest, findings, understanding });
    if (persist) recordFixReview(root, { fix: key, review: ref });
    return ref;
  };
  return { base, key, plan, g4, intake, roundRef, context, defectReport, approve, retain, retainResumedConfirmation, review };
}
