import { assertNonsecret, load, requireText, verifyEvidence, type Evidence } from '../shared/store.js';
import { pinned } from './library.js';
import { sameTarget, verifyAssessment, type Target } from './round.js';
import { releaseBoard, requireCurrentScope, sameEvidence, type Assignment } from './scope.js';
import { releaseFixes } from '../regression/fix.js';
import type { ReleaseBoard } from '../regression/board.js';

type Preferences =
  | { channel: 'taskBoard'; recipient: string; acknowledgementRequired: boolean }
  | { channel: 'recorded'; destination: string; recipient: string; acknowledgementRequired: boolean };
export interface Route { channel: Preferences['channel']; destination: string; recipient: string; acknowledgementRequired: boolean }
export interface HandoffApproval {
  assessment: Evidence; route: Route; targetObservation: Evidence;
  regressionDigest?: string;
  boardInventory?: Evidence;
  exceptions?: { gapId: string; owner: string; reason: string; decision: Evidence }[];
}
interface ReleaseDecision {
  gate: string; decision: string; reviewer: string; source: string; packet: Evidence;
  target?: Target; handoff?: HandoffApproval;
}
export interface DeliveryEvidence { delivery?: Evidence; acknowledgement?: Evidence }
export interface LocalHandoff extends DeliveryEvidence { decision: Evidence }

export function reportingPreference(root: string) {
  const { value } = load<{ releaseHandoff?: Preferences }>(root, '.local/reporting-settings.json', () => ({}));
  const preference = value?.releaseHandoff;
  if (preference === undefined) return undefined;
  if (!preference || !['taskBoard', 'recorded'].includes(preference.channel) ||
      typeof preference.acknowledgementRequired !== 'boolean') throw new Error('Review the release handoff preference in Reporting and evidence preferences.');
  requireText(preference.recipient, 'Handoff recipient');
  if (preference.channel === 'recorded') requireText(preference.destination, 'Authorized handoff destination');
  assertNonsecret(preference);
  return preference;
}

export function handoffRoute(preference: Preferences, ticketUrl?: string): Route {
  const destination = preference.channel === 'taskBoard' ? ticketUrl : preference.destination;
  requireText(destination, 'Live ticket destination or recorded channel');
  return { channel: preference.channel, destination, recipient: preference.recipient, acknowledgementRequired: preference.acknowledgementRequired };
}

function sameRoute(a: Route | undefined, b: Route | undefined) {
  return !!a && !!b && a.channel === b.channel && a.destination === b.destination &&
    a.recipient === b.recipient && a.acknowledgementRequired === b.acknowledgementRequired;
}

export function resolveHandoffRoute(root: string, requested?: Route, ticketUrl?: string) {
  const preference = reportingPreference(root);
  const route = preference && (preference.channel === 'recorded' || ticketUrl) ? handoffRoute(preference, ticketUrl) : requested;
  if (!route) throw new Error('Identify the authorized release handoff route and recipient for G5.');
  if (requested && !sameRoute(requested, route)) throw new Error('Review the actual handoff route against Reporting and evidence preferences; the exact board publication may have changed.');
  requireText(route.destination, 'Authorized handoff destination');
  requireText(route.recipient, 'Handoff recipient');
  if (typeof route.acknowledgementRequired !== 'boolean' || !['taskBoard', 'recorded'].includes(route.channel) ||
      route.channel === 'taskBoard' && route.destination !== ticketUrl) throw new Error('Use the actual live ticket or a recorded delivery route.');
  assertNonsecret(route);
  return route;
}

export function currentAssessment(root: string, assessment: Evidence, assignment: Assignment) {
  const scope = requireCurrentScope(root, assignment);
  const report = verifyAssessment(root, assessment, true, scope.round);
  if (!report.assignmentIds.includes(assignment.ticketId) || !sameTarget(report.target, scope.target)) {
    throw new Error('The release assessment must cover this assignment and its reviewed build and environment.');
  }
  return report;
}

export function currentReleaseRegression(root: string, assignment: Assignment, liveBoard?: ReleaseBoard,
  handoff: { inventory?: Evidence; observedAt?: string } = {}) {
  const scope = requireCurrentScope(root, assignment);
  if (!scope.changeManifest) throw new Error('Pin the independent release change manifest in the reviewed G1 scope before G5.');
  return releaseFixes(root, assignment, scope.plan, scope.changeManifest, releaseBoard(root, assignment, liveBoard), handoff);
}

export function reviewHandoff(root: string, decision: ReleaseDecision, assessment: Evidence, route: Route, assignment: Assignment, liveBoard?: ReleaseBoard) {
  if (decision.gate !== 'G5' || !['Approved', 'Approved with limits'].includes(decision.decision)) throw new Error('Record the actual G5 decision for this handoff.');
  requireText(decision.reviewer, 'Actual reviewer');
  requireText(decision.source, 'Actual G5 decision source');
  verifyEvidence(root, decision.packet);
  const reviewed = decision.handoff;
  if (!reviewed || !sameEvidence(reviewed.assessment, assessment) || !sameRoute(reviewed.route, route)) {
    throw new Error('G5 must review this release assessment and handoff destination.');
  }
  const report = currentAssessment(root, assessment, assignment);
  if (!sameTarget(decision.target, report.target)) throw new Error('G5 must match the assessed release build and environment.');
  const observed = pinned<Target & { observedAt: string; source: string }>(root, reviewed.targetObservation, 'G5 target observation');
  if (!sameTarget(observed, report.target) || !Number.isFinite(Date.parse(observed.observedAt)) || !/(Z|[+-]\d\d:\d\d)$/.test(observed.observedAt)) {
    throw new Error('Observe the exact build and environment again for G5.');
  }
  requireText(observed.source, 'Actual G5 target observation source');
  for (const module of report.modules) for (const type of module.testTypes) for (const obligation of type.obligations) {
    if (obligation.checks.some(check => check.attempts.some(attempt => Date.parse(attempt.observedAt) > Date.parse(observed.observedAt)))) {
      throw new Error('Observe the G5 target on or after the retained run observations.');
    }
  }
  if (!report.uniqueCheckExecutions) throw new Error('Zero executed checks cannot support a positive QA sign-off.');
  if (report.gaps.some(gap => !gap.exceptionAllowed)) throw new Error('The release has a blocking coverage gap. Resolve it within the reviewed scope before handoff.');
  const exceptions = reviewed.exceptions ?? [];
  if (!Array.isArray(exceptions) || new Set(exceptions.map(item => item.gapId)).size !== exceptions.length ||
      exceptions.length !== report.gaps.length ||
      report.gaps.some(gap => !exceptions.some(item => item.gapId === gap.id)) ||
      (report.gaps.length > 0 && decision.decision !== 'Approved with limits')) {
    throw new Error('Resolve the release gaps or record each authorized exception under G5 Approved with limits.');
  }
  for (const exception of exceptions) {
    requireText(exception.owner, 'Risk owner');
    requireText(exception.reason, 'Accepted release exception');
    verifyEvidence(root, exception.decision);
  }
  const regression = currentReleaseRegression(root, assignment, liveBoard, { inventory: reviewed.boardInventory, observedAt: observed.observedAt });
  if ((regression.boardInventory || regression.relationships.length || regression.fixes.length || regression.dispositions.length || reviewed.regressionDigest) &&
      reviewed.regressionDigest !== regression.digest) {
    throw new Error('G5 must review the current regression evidence and canonical board reconciliation for this release.');
  }
  if ((regression.fixes.some(fix => fix.findings.length) || regression.dispositions.some(item => item.decision === 'acceptedNonblocking')) &&
      decision.decision !== 'Approved with limits') {
    throw new Error('Record the reviewed regression limits under G5 Approved with limits.');
  }
  return report;
}

interface DeliveryObservation { decisionSha256: string; recipient: string; destination: string; source: string; state: 'delivered' | 'accepted' }
function deliveryObservation(root: string, ref: Evidence | undefined, label: string, state: DeliveryObservation['state'], decision: Evidence, route: Route) {
  if (!ref) throw new Error(`Record actual ${label} before completion.`);
  const observed = pinned<DeliveryObservation>(root, ref, label);
  if (observed?.state !== state || observed.decisionSha256 !== decision.sha256 || observed.recipient !== route.recipient || observed.destination !== route.destination) {
    throw new Error(`The ${label} must identify this G5 decision, recipient and destination.`);
  }
  requireText(observed.source, `Actual ${label} source`);
}

export function verifyDelivery(root: string, decision: Evidence, route: Route, refs: DeliveryEvidence, confirmation?: 'publication' | 'observed') {
  if (route.channel === 'taskBoard' && confirmation !== 'observed') {
    if (confirmation !== 'publication') throw new Error('Confirm the reviewed G5 board handoff comment before completing the ticket.');
  } else deliveryObservation(root, refs.delivery, 'handoff delivery', 'delivered', decision, route);
  if (route.acknowledgementRequired) deliveryObservation(root, refs.acknowledgement, 'recipient acknowledgement', 'accepted', decision, route);
}

export function verifyLocalHandoff(root: string, ticketId: string, ticketRevision: string, request: LocalHandoff) {
  const decision = pinned<ReleaseDecision & { ticketId: string; ticketRevision: string }>(root, request.decision, 'G5 decision');
  if (decision?.ticketId !== ticketId || decision.ticketRevision !== ticketRevision || !decision.handoff) {
    throw new Error('Record G5 for this local ticket revision and its release assessment.');
  }
  const route = resolveHandoffRoute(root, decision.handoff.route);
  const report = reviewHandoff(root, decision, decision.handoff.assessment, route, { source: 'local', ticketId });
  verifyDelivery(root, request.decision, route, request);
  return report;
}
