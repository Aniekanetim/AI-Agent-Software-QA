import { assertNonsecret, load, requireText, verifyEvidence, type Evidence } from '../shared/store.js';
import { pinned } from './library.js';
import { sameTarget, verifyAssessment, type Target } from './round.js';

type Preferences =
  | { channel: 'taskBoard'; recipient: string; acknowledgementRequired: boolean }
  | { channel: 'recorded'; destination: string; recipient: string; acknowledgementRequired: boolean };
export interface Route { channel: Preferences['channel']; destination: string; recipient: string; acknowledgementRequired: boolean }
export interface HandoffApproval {
  assessment: Evidence; route: Route;
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

export function reviewHandoff(root: string, decision: ReleaseDecision, assessment: Evidence, route: Route, assignmentId: string) {
  if (decision.gate !== 'G5' || !['Approved', 'Approved with limits'].includes(decision.decision)) throw new Error('Record the actual G5 decision for this handoff.');
  requireText(decision.reviewer, 'Actual reviewer');
  requireText(decision.source, 'Actual G5 decision source');
  verifyEvidence(root, decision.packet);
  const reviewed = decision.handoff;
  if (!reviewed || reviewed.assessment.path !== assessment.path || reviewed.assessment.sha256 !== assessment.sha256 ||
      reviewed.route.channel !== route.channel || reviewed.route.destination !== route.destination || reviewed.route.recipient !== route.recipient ||
      reviewed.route.acknowledgementRequired !== route.acknowledgementRequired) throw new Error('G5 must review this release assessment and handoff destination.');
  const report = verifyAssessment(root, assessment, true);
  if (!sameTarget(decision.target, report.target)) throw new Error('G5 must match the assessed release build and environment.');
  if (!report.assignmentIds.includes(assignmentId)) throw new Error('The release assessment must include this assignment.');
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

export function verifyDelivery(root: string, decision: Evidence, route: Route, refs: DeliveryEvidence, boardPublicationConfirmed = false) {
  if (route.channel === 'taskBoard') {
    if (!boardPublicationConfirmed) throw new Error('Confirm the reviewed G5 board handoff comment before completing the ticket.');
  } else deliveryObservation(root, refs.delivery, 'handoff delivery', 'delivered', decision, route);
  if (route.acknowledgementRequired) deliveryObservation(root, refs.acknowledgement, 'recipient acknowledgement', 'accepted', decision, route);
}

export function verifyLocalHandoff(root: string, ticketId: string, ticketRevision: string, route: Route, request: LocalHandoff) {
  const decision = pinned<ReleaseDecision & { ticketId: string; ticketRevision: string }>(root, request.decision, 'G5 decision');
  if (decision?.ticketId !== ticketId || decision.ticketRevision !== ticketRevision || !decision.handoff) {
    throw new Error('Record G5 for this local ticket revision and its release assessment.');
  }
  const report = reviewHandoff(root, decision, decision.handoff.assessment, route, ticketId);
  verifyDelivery(root, request.decision, route, request);
  return report;
}
