import { randomUUID } from 'node:crypto';
import { assertDataReady, dataScopeDigest, type DataReceipt, type DataScope } from '../data/readiness.js';
import { assertNonsecret, digest, load, requireText, save, verifyEvidence, withLock, type Evidence } from '../shared/store.js';
import { pendingCommentPublications } from '../github/github.js';
import { pendingPresentation } from '../attention/notifications.js';
import { pendingTransitions, pendingOperations, tickets as localTickets } from '../board/board.js';
import { activeSource, sourcePath, validateBoard, validateChoice, id, type Active, type BoardSelection, type Choice, type Identity, type LiveChoice, type Queue } from './config.js';
import { readBoard, prepareWrite, type BoardReader, type BoardWriter, type Connection, type Mutation, type Ticket } from './provider.js';
import { currentAssessment, currentReleaseRegression, resolveHandoffRoute, reviewHandoff, verifyDelivery, type DeliveryEvidence, type HandoffApproval, type Route } from '../release/handoff.js';
import { pinned } from '../release/library.js';
import { releaseScope, sameEvidence } from '../release/scope.js';
import { currentFixes, defectCompletion, fixStatus, requireFixBatch, type DefectCompletion } from '../regression/fix.js';

interface Claim {
  id: string; sourceKey: string; sourceRevision: string; identity: Identity; ticket: Ticket; queue: 'ready' | 'retest'; source: string;
  descriptionRevision?: string;
  state: 'open' | 'closed'; startedAt: string; terminal?: { source: string; evidence: Evidence[]; at: string; disposition?: 'completed' | 'released' };
}
interface Publication {
  id: string; claimId: string; ticketId: string; fingerprint: string; action: Mutation['action'];
  state: 'pending' | 'confirmed' | 'notApplied'; remoteId?: string;
  startedAt: string; source: string; decision: Evidence; writerPid?: number; reconciliation?: { source: string; evidence: Evidence[] };
  destination?: { queue: 'testedOk' | 'rework'; id: string };
  fixProof?: { defect: Evidence; completion: DefectCompletion; digest: string; review?: Evidence };
  handoff?: { kind: 'delivery' | 'completion'; assessment: Evidence; route?: Route; delivery?: DeliveryEvidence; observed?: boolean };
}
interface Execution {
  id: string; claimId: string; buildId: string; target: Evidence; gates: Partial<Record<Gate['gate'], Evidence>>; data?: DataReceipt;
  startedAt: string; terminal?: { state: 'completed' | 'stopped' | 'notStarted'; source: string; evidence: Evidence[] };
  fixBatch?: ReturnType<typeof requireFixBatch>;
}
interface Journal { schemaVersion: 1; claims: Claim[]; publications: Publication[]; executions: Execution[] }
const journalPath = '.local/task-source-work.json';
function journal(root: string) {
  const current = load<Journal>(root, journalPath, () => ({ schemaVersion: 1, claims: [], publications: [], executions: [] }));
  if (current.value?.schemaVersion !== 1 || !Array.isArray(current.value.claims) || !Array.isArray(current.value.publications) || !Array.isArray(current.value.executions) || current.value.publications.some(p => !p?.id || !['pending', 'confirmed', 'notApplied'].includes(p.state)) || current.value.claims.some(c => !c?.id || !['open', 'closed'].includes(c.state))) throw new Error('Reconcile live task claims before continuing.');
  return current;
}
function ownerMatches(ticket: Ticket, identity: Identity) {
  return ticket.assignees.length === 1 && ticket.assignees[0] === identity.accountId;
}
function mappedQueue(choice: LiveChoice, ticket: Ticket): Queue | null {
  if (ticket.state === null) return null;
  return (Object.entries(choice.queues).find(([, ids]) => ids.includes(ticket.state!))?.[0] as Queue | undefined) ?? null;
}
const routeReasons = {
  ticketClosed: 'Provider marks this task closed',
  outsideQaQueue: 'Outside the configured QA queues',
  ownerChanged: 'Requires assignment to the designated QA account',
};
function routeBlocker(ticket: Ticket, queue: Queue | null, identity: Identity): keyof typeof routeReasons | null {
  if (ticket.closed) return 'ticketClosed';
  if (queue !== 'ready' && queue !== 'retest') return 'outsideQaQueue';
  return ownerMatches(ticket, identity) ? null : 'ownerChanged';
}
function route(choice: LiveChoice, ticket: Ticket, identity: Identity) {
  const queue = mappedQueue(choice, ticket), blockedBy = routeBlocker(ticket, queue, identity);
  return { ticket, queue, eligible: !blockedBy, reason: blockedBy ? routeReasons[blockedBy] : 'Mapped QA queue and assigned to the connected QA account' };
}
function ranked(choice: LiveChoice, connection: Connection) {
  return connection.tickets.map(ticket => route(choice, ticket, connection.identity)).sort((a, b) =>
    Number(b.eligible) - Number(a.eligible) || a.ticket.priority - b.ticket.priority || a.ticket.createdAt.localeCompare(b.ticket.createdAt) || a.ticket.id.localeCompare(b.ticket.id));
}
function mappings(choice: LiveChoice, board: Connection) {
  if (board.identity.scopeId !== choice.board.scopeId) throw new Error('Connected scope differs from the requested board.');
  return Object.fromEntries(Object.entries(choice.queues).map(([queue, ids]) => [queue, ids.map(id => {
    const state = board.states.find(s => s.id === id);
    if (!state) throw new Error(`A status mapped to ${queue} no longer belongs to the selected board.`);
    return state;
  })]));
}
const sourceKey = (choice: LiveChoice, identity: Identity) => digest(JSON.stringify([choice.board.provider, identity.workspaceId, identity.scopeId, choice.board.linearProjectId ?? null]));
const sameIdentity = (a: Identity, b: Identity) => a.accountId === b.accountId && a.workspaceId === b.workspaceId && a.scopeId === b.scopeId;

export async function inspect(board: BoardSelection, reader: BoardReader = readBoard) {
  validateBoard(board);
  const result = await reader(board);
  return { identity: result.identity, states: result.states };
}
export async function preview(root: string, choice: Choice, reader: BoardReader = readBoard) {
  validateChoice(choice);
  const expectedRevision = activeSource(root).revision;
  if (choice.kind === 'local') return { choice, expectedRevision, identity: null, mapping: null, candidates: [], digest: digest(JSON.stringify({ choice, expectedRevision })) };
  const connection = await reader(choice.board);
  const mapping = mappings(choice, connection), identity = connection.identity;
  const candidates = ranked(choice, connection).filter(row => row.queue === 'ready' || row.queue === 'retest');
  return { choice, expectedRevision, identity, mapping, candidates, digest: digest(JSON.stringify({ choice, expectedRevision, identity, mapping })) };
}
export async function configure(root: string, request: { choice: Choice; previewDigest: string; source: string }, reader: BoardReader = readBoard) {
  requireText(request.source, 'Actual task-source selection');
  const observed = await preview(root, request.choice, reader);
  if (observed.digest !== request.previewDigest) throw new Error('The account, mappings or active settings changed. Present the updated preview before saving.');
  return withLock(root, 'qa-board', () => {
    const current = activeSource(root);
    if (current.revision !== observed.expectedRevision) throw new Error('The task source changed while saving.');
    if (JSON.stringify(current.value.choice) === JSON.stringify(request.choice) && (!observed.identity || current.value.identity && sameIdentity(observed.identity, current.value.identity))) return current.value;
    if (journal(root).value.claims.some(c => c.state === 'open')) throw new Error('Reconcile active live claims before changing the task source.');
    if (current.value.choice.kind === 'local' && request.choice.kind === 'live') {
      if (pendingTransitions(root).length || pendingOperations(root).length) throw new Error('Reconcile pending local board operations before changing the task source.');
      if (pendingCommentPublications(root).length) throw new Error('Reconcile pending GitHub comments before changing the task source.');
      const claimed = localTickets(root).some(ticket => {
        const owner = ticket.text.match(/^\|\s*Owner\s*\/\s*claimed at\s*\|([^|\r\n]+)\|/im)?.[1]?.trim();
        return ['Ready for QA', 'Retest', 'Dev Todo', 'Rework'].includes(ticket.status) && owner && owner.toLowerCase() !== 'unassigned';
      });
      if (claimed) throw new Error('Reconcile claimed local tickets before changing the task source.');
    }
    const record: Active = { schemaVersion: 1, choice: request.choice, source: request.source, ...(observed.identity ? { identity: observed.identity } : {}) };
    const persist = () => { save(root, sourcePath, record, current.revision); return record; };
    if (current.value.choice.kind !== 'local') return persist();
    return withLock(root, 'attention', () => {
      if (pendingPresentation(root)) throw new Error('Reconcile the in-flight or uncertain local blocker reminder before switching.');
      return persist();
    });
  });
}
export async function liveBoard(root: string, reader: BoardReader) {
  const active = activeSource(root), { choice, identity } = active.value;
  if (choice.kind !== 'live' || !identity || !active.revision) throw new Error('Select an active live task source.');
  const connection = await reader(choice.board);
  if (activeSource(root).revision !== active.revision || !sameIdentity(connection.identity, identity)) throw new Error('The configured source or authenticated account changed. Live pickup is paused.');
  mappings(choice, connection);
  return { choice, revision: active.revision, connection };
}
function alreadyClaimed(work: Journal, key: string, ticket: Ticket, queue: Queue | null) {
  return work.claims.some(claim => {
    if (claim.sourceKey !== key || claim.ticket.id !== ticket.id) return false;
    if (claim.state === 'open') return true;
    if (claim.terminal?.disposition === 'released') return false;
    if (claim.ticket.revision !== ticket.revision) return false;
    if (queue !== 'retest') return true;

    const confirmed = work.publications.filter(publication => publication.claimId === claim.id && publication.state === 'confirmed');
    // Some providers do not change their update time when moving between sections.
    if (confirmed.some(publication => publication.action === 'move')) return false;

    // A report posted during the old claim should not itself count as a new retest.
    const posted = confirmed.some(publication => publication.action === 'comment');
    const previous = (posted ? claim.terminal?.at : claim.ticket.updatedAt) ?? claim.terminal?.at;
    return !(previous && ticket.updatedAt && Date.parse(ticket.updatedAt) > Date.parse(previous));
  });
}
const resumeActions = {
  sourceChanged: 'Review the current task source and reconcile the old claim.',
  ticketMissing: 'Check the native ticket and its board visibility before resuming.',
  ticketClosed: 'Confirm the native disposition and close the claim with evidence when appropriate.',
  outsideQaQueue: 'Confirm the current native queue and record the disposition before resuming.',
  ownerChanged: 'Confirm the current assignment with the ticket owner before resuming.',
  revisionChanged: 'Refresh the native ticket evidence and review the affected scope.',
  pendingPublication: 'Inspect the original board publication and reconcile its outcome before another write.',
  executionUnresolved: 'Inspect the original execution and record its observed terminal outcome.',
  handoffCompleted: 'Review the confirmed board move and verify the applicable disposition before closing the existing claim.',
  eligible: 'Review the applicable scope and approval evidence before resuming.',
};
type ResumeReason = keyof typeof resumeActions;
type Hold = { reasonCode: Exclude<ResumeReason, 'eligible'>; relatedId?: string };

function bindingHold(claim: Claim, { choice, revision, connection }: Awaited<ReturnType<typeof liveBoard>>): Hold | null {
  if (claim.sourceRevision !== revision) return { reasonCode: 'sourceChanged' };
  const ticket = connection.tickets.find(item => item.id === claim.ticket.id);
  if (!ticket) return { reasonCode: 'ticketMissing' };
  const blockedBy = routeBlocker(ticket, mappedQueue(choice, ticket), connection.identity);
  if (blockedBy) return { reasonCode: blockedBy };
  return ticket.revision === claim.ticket.revision ? null : { reasonCode: 'revisionChanged' };
}
function publicationHold(publications: Publication[], claimId: string) {
  const pending = publications.find(p => p.claimId === claimId && p.state === 'pending');
  if (pending) return { reasonCode: 'pendingPublication', relatedId: pending.id } as const;
  const handoff = publications.find(p => p.claimId === claimId && p.action === 'move' && p.state === 'confirmed');
  return handoff ? { reasonCode: 'handoffCompleted', relatedId: handoff.id } as const : null;
}
export class LiveCheckInError extends Error {
  readonly guidance = {
    kind: 'live', reasonCode: 'sourceUnavailable',
    nextAction: 'Verify the selected board, account and access before checking in again.',
  };
  constructor(cause: unknown) { super(cause instanceof Error ? cause.message : 'The selected live board is unavailable.', { cause }); }
}

export async function checkIn(root: string, reader: BoardReader = readBoard) {
  const active = activeSource(root);
  if (active.value.choice.kind === 'local') return { kind: 'local', instruction: 'Run board status to see Ready for QA and Retest tickets, then follow the local board check-in procedure.' };
  const board = await liveBoard(root, reader).catch(error => { throw new LiveCheckInError(error); });
  const { choice, connection } = board;
  const work = journal(root).value, claims = work.claims.filter(c => c.state === 'open');
  const rows = ranked(choice, connection).filter(row => row.eligible), key = sourceKey(choice, connection.identity);
  const retest = (ticketId: string) => {
    const fixes = currentFixes(root, { source: key, ticketId });
    return fixes.length ? fixes : [{ state: 'intakeNeeded' }];
  };
  const resume = claims.map(claim => {
    const execution = work.executions.find(run => run.claimId === claim.id && !run.terminal);
    const hold: Hold | null = publicationHold(work.publications, claim.id) ??
      (execution ? { reasonCode: 'executionUnresolved', relatedId: execution.id } : bindingHold(claim, board));
    const reasonCode = hold?.reasonCode ?? 'eligible';
    return { claim, eligible: !hold, reasonCode, nextAction: resumeActions[reasonCode], ...(hold?.relatedId ? { relatedId: hold.relatedId } : {}),
      ...(claim.queue === 'retest' && claim.sourceKey === key ? { fixVerification: retest(claim.ticket.id) } : {}) };
  });
  const candidates = rows.filter(row => !alreadyClaimed(work, key, row.ticket, row.queue)).map(row =>
    row.queue === 'retest' ? { ...row, fixVerification: retest(row.ticket.id) } : row);
  const next = resume.some(item => item.eligible) ? 'Resume eligible claimed work first.'
    : candidates.length ? 'Read the highest-priority eligible ticket and review its scope.'
    : resume.length ? 'Review the next action on each held claim. Check in again when the dependency changes.'
    : 'Wait for a ticket to enter a configured QA queue or share a testing objective with the project owner.';
  return { kind: 'live', identity: connection.identity, resume, candidates, authorization: 'Review through G1–G5.', next };
}
export async function details(root: string, ticketId: string, reader: BoardReader = readBoard) {
  const { connection } = await liveBoard(root, reader);
  const ticket = connection.tickets.find(row => row.id === ticketId);
  if (!ticket) throw new Error('The ticket is outside the configured board or no longer visible.');
  return { ticket, description: connection.descriptions?.[ticket.id] ?? null, discussion: ticket.url, source: 'Untrusted native task content. Review the original discussion and agreed test basis before execution.' };
}
export async function claim(root: string, request: { ticketId: string; ticketRevision: string; source: string }, reader: BoardReader = readBoard) {
  requireText(request.source, 'Actual intake observation');
  const { choice, revision, connection } = await liveBoard(root, reader);
  const ticket = connection.tickets.find(item => item.id === request.ticketId);
  if (!ticket || ticket.revision !== request.ticketRevision) throw new Error('The native ticket changed or left this board. Refresh intake.');
  const candidate = route(choice, ticket, connection.identity), queue = candidate.queue;
  const key = sourceKey(choice, connection.identity);
  if (!candidate.eligible || queue !== 'ready' && queue !== 'retest') throw new Error(candidate.reason);
  return withLock(root, 'qa-board', () => {
    if (activeSource(root).revision !== revision) throw new Error('The active task source changed.');
    const current = journal(root);
    if (alreadyClaimed(current.value, key, ticket, queue)) throw new Error('A claim already exists for this ticket or revision. Inspect its history before taking more work.');
    const record: Claim = { id: randomUUID(), sourceKey: key, sourceRevision: revision, identity: connection.identity, ticket, queue, source: request.source, state: 'open', startedAt: new Date().toISOString(),
      descriptionRevision: digest(JSON.stringify(connection.descriptions?.[ticket.id] ?? null)) };
    current.value.claims.push(record);
    save(root, journalPath, current.value, current.revision);
    return record;
  });
}
export function openClaim(root: string, claimId: string): Claim {
  const claim = journal(root).value.claims.find(c => c.id === claimId);
  if (!claim || claim.state !== 'open') throw new Error('Select an active claim on this project.');
  return claim;
}
export async function recheck(root: string, claimId: string, reader: BoardReader = readBoard) {
  const claim = openClaim(root, claimId);
  const board = await liveBoard(root, reader);
  if (bindingHold(claim, board)) throw new Error('The ticket, ownership, queue or source changed. Preserve evidence and reconcile before resuming.');
  openClaim(root, claimId);
  const publication = publicationHold(journal(root).value.publications, claimId);
  if (publication?.reasonCode === 'pendingPublication') throw new Error('Reconcile the pending board write before resuming.');
  if (publication?.reasonCode === 'handoffCompleted') throw new Error('The board handoff already completed. Close this claim before taking the next retest.');
  return { claim, choice: board.choice, connection: board.connection };
}
export interface Gate {
  claimId: string; ticketRevision: string; gate: 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
  decision: 'Approved' | 'Approved with limits'; reviewer: string; source: string; packet: Evidence;
  target?: { buildId: string; environment: string }; dataScope?: DataScope; publicationDigest?: string; publicationDigests?: string[];
  handoff?: HandoffApproval;
  defectReport?: Evidence;
  fixPlan?: Evidence;
  fixReview?: Evidence;
}
export function approvedGate(root: string, claim: Claim, ref: Evidence, gate: Gate['gate']) {
  if (ref?.pointer || !ref?.path.startsWith('.local/')) throw new Error('Use the full private reviewed decision record.');
  verifyEvidence(root, ref);
  const record = load<Gate>(root, ref.path, () => { throw new Error('Missing decision record.'); });
  if (record.revision !== ref.sha256) throw new Error('The reviewed decision changed while loading.');
  const decision = record.value;
  assertNonsecret(decision);
  if (decision?.claimId !== claim.id || decision.ticketRevision !== claim.ticket.revision || decision.gate !== gate || !['Approved', 'Approved with limits'].includes(decision.decision)) throw new Error(`Record the actual ${gate} approval for this ticket revision.`);
  requireText(decision.reviewer, 'Actual reviewer'); requireText(decision.source, 'Actual decision source');
  verifyEvidence(root, decision.packet);
  return decision;
}
async function checkExecution(root: string, request: { claimId: string; gates: Partial<Record<Gate['gate'], Evidence>>; target: Evidence; buildId: string; dataObservations?: Evidence[]; fixBatch?: { fix: string; batchId: string } }, reader: BoardReader) {
  const { claim } = await recheck(root, request.claimId, reader);
  const required = claim.queue === 'retest' ? ['G1', 'G2', 'G4'] as const : ['G1', 'G2'] as const;
  const decisions = required.map(gate => {
    const ref = request.gates?.[gate];
    if (!ref) throw new Error(`The ${gate} decision is required before execution.`);
    return approvedGate(root, claim, ref, gate);
  });
  requireText(request.buildId, 'Observed target build');
  if (request.target?.pointer) throw new Error('Use the full target observation.');
  verifyEvidence(root, request.target);
  const observation = load<{ claimId: string; ticketRevision: string; buildId: string; environment: string; source: string; observedAt: string }>(root, request.target.path, () => { throw new Error('Missing target observation.'); }).value;
  if (observation?.claimId !== claim.id || observation.ticketRevision !== claim.ticket.revision || observation.buildId !== request.buildId || !Number.isFinite(Date.parse(observation.observedAt))) throw new Error('Observe the actual target build for this claim and ticket revision.');
  requireText(observation.environment, 'Target environment'); requireText(observation.source, 'Build observation source');
  if (decisions.some(decision => ['G2', 'G4'].includes(decision.gate) && (decision.target?.buildId !== request.buildId || decision.target.environment !== observation.environment))) throw new Error('The actual build and environment must match the reviewed execution target.');
  if (request.fixBatch && claim.queue !== 'retest') throw new Error('Use the approved fix batches from Retest.');
  if (claim.queue === 'retest' && !request.fixBatch &&
      (decisions.some(decision => decision.fixPlan) || currentFixes(root, assignmentFor(claim)).some(row => row.target.environment === observation.environment))) {
    throw new Error('Select the current G4-approved confirmation or regression batch.');
  }
  const fixBatch = request.fixBatch ? requireFixBatch(root, assignmentFor(claim), observation, request.gates.G4!, request.fixBatch) : undefined;
  const executionGates = decisions.filter(decision => ['G2', 'G4'].includes(decision.gate));
  const scope = executionGates.find(decision => decision.dataScope !== undefined)?.dataScope;
  if (scope !== undefined && (!scope || executionGates.some(decision => !decision.dataScope || dataScopeDigest(decision.dataScope) !== dataScopeDigest(scope)))) {
    throw new Error('The G2 and G4 decisions must agree on the execution data scope.');
  }
  if (scope === undefined && request.dataObservations !== undefined) throw new Error('Data observations require a reviewed data scope.');
  const data = scope === undefined ? undefined : assertDataReady(root, scope, observation, request.dataObservations);
  return { result: { claim, buildId: request.buildId, target: request.target, gates: request.gates, checkedAt: new Date().toISOString(),
    ...(data ? { data } : {}), ...(fixBatch ? { fixBatch } : {}) }, scope, observation };
}
export async function preflight(root: string, request: Parameters<typeof checkExecution>[1], reader: BoardReader = readBoard) {
  return (await checkExecution(root, request, reader)).result;
}
const assignmentFor = (claim: Claim) => ({ source: claim.sourceKey, ticketId: claim.ticket.id });

function scopedDefect(root: string, claim: Claim, ref: Evidence | undefined) {
  if (!ref) return false;
  const assignment = assignmentFor(claim);
  if (claim.queue !== 'retest' || releaseScope(root, assignment).revision ||
      journal(root).value.claims.some(item => item.sourceKey === assignment.source && item.ticket.id === assignment.ticketId && item.queue === 'ready')) {
    throw new Error('A parent assignment still requires release sign-off after returning through Retest.');
  }
  const reviewed = approvedGate(root, claim, ref, 'G4');
  if (!reviewed.defectReport) throw new Error('Link the original defect report in the reviewed G4 scope.');
  verifyEvidence(root, reviewed.defectReport);
  return true;
}

function scopedCompletion(root: string, claim: Claim, defect: Evidence, completion: DefectCompletion | undefined, preview = false) {
  scopedDefect(root, claim, defect);
  const digest = defectCompletion(root, assignmentFor(claim), claim.ticket.revision, completion, defect, preview);
  const review = preview ? undefined : completion?.fix ? fixStatus(root, completion.fix).review ?? undefined : completion?.refutation;
  return { defect, completion: completion!, digest, ...(review ? { review } : {}) };
}

function confirmRelease(root: string, claim: Claim, completion: Publication, publications: Publication[]) {
  const handoff = completion.handoff!;
  const decision = approvedGate(root, claim, completion.decision, 'G5');
  const route = handoff.route ?? decision.handoff?.route;
  if (!route || completion.remoteId !== claim.ticket.id || completion.destination?.queue !== 'testedOk') {
    throw new Error('Verify the actual reviewed release completion at its native destination.');
  }
  reviewHandoff(root, decision, handoff.assessment, route, assignmentFor(claim));
  const confirmed = publications.some(item => item.handoff?.kind === 'delivery' &&
    sameEvidence(item.decision, completion.decision) && sameEvidence(item.handoff.assessment, handoff.assessment));
  verifyDelivery(root, completion.decision, route, handoff.delivery ?? {}, handoff.observed ? 'observed' : confirmed ? 'publication' : undefined);
}

export function closeClaim(root: string, request: { claimId: string; source: string; evidence: Evidence[]; disposition?: 'completed' | 'released'; defect?: Evidence }) {
  requireText(request.source, 'Actual claim disposition and reason');
  if (!request.evidence?.length) throw new Error('Link the actual disposition evidence before closing the claim.');
  for (const evidence of request.evidence) verifyEvidence(root, evidence);
  return withLock(root, 'qa-board', () => withLock(root, 'release-records', () => {
    openClaim(root, request.claimId);
    const current = journal(root), claim = current.value.claims.find(c => c.id === request.claimId)!;
    if (current.value.publications.some(p => p.claimId === claim.id && p.state === 'pending')) throw new Error('Reconcile the pending board write before closing the claim.');
    if (current.value.executions.some(run => run.claimId === claim.id && !run.terminal)) throw new Error('Record the execution outcome before closing the claim.');
    const publications = current.value.publications.filter(item => item.claimId === claim.id && item.state === 'confirmed');
    const completion = publications.filter(item => item.handoff?.kind === 'completion').at(-1);
    if (request.disposition === 'completed' && completion) {
      confirmRelease(root, claim, completion, publications);
    } else if (request.disposition === 'completed') {
      const moved = publications.filter(item => item.destination?.queue === 'testedOk').at(-1);
      if (!moved?.fixProof && !request.defect) throw new Error('Use completed after the confirmed G5 move with current release or fix evidence.');
      if (!moved?.fixProof || moved.remoteId !== claim.ticket.id ||
          JSON.stringify(scopedCompletion(root, claim, moved.fixProof.defect, moved.fixProof.completion)) !== JSON.stringify(moved.fixProof)) {
        throw new Error('Verify the actual scoped defect completion with confirmation and regression evidence.');
      }
    } else if (request.disposition !== 'released' &&
        !publications.some(item => item.destination?.queue === 'rework' && request.disposition === undefined)) {
      throw new Error('Use completed after the confirmed G5 move, or record a released claim without marking the assignment complete.');
    }
    claim.state = 'closed';
    claim.terminal = { source: request.source, evidence: request.evidence, at: new Date().toISOString(), ...(request.disposition ? { disposition: request.disposition } : {}) };
    save(root, journalPath, current.value, current.revision);
    return claim;
  }));
}


type Proposal = { id: string; claimId: string; assessment?: Evidence; route?: Route; defect?: Evidence; completion?: DefectCompletion } & (
  | { action: 'comment'; body: string; purpose?: 'releaseHandoff' }
  | { action: 'move'; to: 'testedOk' | 'rework' }
  | { action: 'createDefect'; title: string; body: string }
);
type PublicationRequest = Proposal & { source: string; decision: Evidence } & DeliveryEvidence;
function publicationMutation(request: Proposal, claim: Claim, choice: LiveChoice, connection: Connection): Mutation {
  if (!choice.actions.includes(request.action)) throw new Error('This board action was not selected in task source settings.');
  if (request.action === 'move' && request.to !== 'testedOk' && (request.to !== 'rework' || claim.queue !== 'retest')) throw new Error('Rework requires an actual failed retest.');
  if ('body' in request) requireText(request.body, 'Reviewed public board text');
  if (request.action === 'createDefect') requireText(request.title, 'Reviewed defect title');
  if (request.action === 'comment') return { action: request.action, body: request.body };
  const queue = request.action === 'move' ? request.to : 'devTodo';
  const mapped = choice.queues[queue];
  if (mapped?.length !== 1) throw new Error('Select one unambiguous destination for the board write.');
  const destination = connection.states.find(s => s.id === mapped[0])!;
  if (choice.board.provider === 'clickup' && connection.states.filter(state => state.name === destination.name).length !== 1) throw new Error('ClickUp requires an unambiguous destination status name for this write.');
  const mutation: Mutation = request.action === 'move' ? { action: request.action, destination } : {
    action: request.action, destination, title: request.title,
    body: `${request.body}\n\nOriginating QA ticket: ${claim.ticket.url}`,
  };
  return mutation;
}
function releasePublication(root: string, request: Proposal, claim: Claim, choice: LiveChoice) {
  const comment = request.action === 'comment' && request.purpose === 'releaseHandoff';
  const completion = request.action === 'move' && request.to === 'testedOk';
  if (!comment && !completion) {
    if (request.assessment || request.route || request.defect || request.completion) throw new Error('Use the reviewed release or scoped defect evidence for its own completion.');
    return undefined;
  }
  if (request.defect) {
    if (comment || request.assessment || request.route) throw new Error('Use the reviewed scoped defect disposition for its own completion.');
    if (scopedDefect(root, claim, request.defect)) return undefined;
  }
  if (request.completion) throw new Error('Link the scoped G4 defect decision for fix completion.');
  if (!request.assessment) throw new Error('Select the reviewed release assessment for this G5 publication.');
  const route = resolveHandoffRoute(root, request.route, claim.ticket.url);
  if (comment && route.channel !== 'taskBoard') throw new Error('The selected G5 handoff uses a recorded delivery channel.');
  if (route.channel === 'taskBoard' && !choice.actions.includes('comment')) {
    throw new Error('The selected task source must permit comments for the board handoff route.');
  }
  const kind: 'delivery' | 'completion' = comment ? 'delivery' : 'completion';
  return { kind, assessment: request.assessment, route };
}

const proposalDigest = (claim: Claim, mutation: Mutation, release?: ReturnType<typeof releasePublication>, fix?: ReturnType<typeof scopedCompletion>) =>
  digest(JSON.stringify({ claimId: claim.id, revision: claim.ticket.revision, mutation, ...(release ? { release } : {}), ...(fix ? { fix } : {}) }));
export async function publicationPreview(root: string, request: Proposal, reader: BoardReader = readBoard) {
  assertNonsecret(request); id(request.id);
  const { claim, choice, connection } = await recheck(root, request.claimId, reader);
  const mutation = publicationMutation(request, claim, choice, connection);
  const release = releasePublication(root, request, claim, choice);
  if (release) currentAssessment(root, release.assessment, assignmentFor(claim));
  const releaseRegression = release ? currentReleaseRegression(root, assignmentFor(claim)) : undefined;
  const fix = request.defect ? scopedCompletion(root, claim, request.defect, request.completion, true) : undefined;
  return { ticket: claim.ticket.url, mutation, ...(release ? { release, releaseRegression } : {}), ...(fix ? { fix } : {}),
    publicationDigest: proposalDigest(claim, mutation, release, fix) };
}
function approvedPublication(root: string, request: PublicationRequest, claim: Claim, choice: LiveChoice, connection: Connection) {
  const mutation = publicationMutation(request, claim, choice, connection);
  const release = releasePublication(root, request, claim, choice);
  const gate = release || request.action === 'move' && request.to === 'testedOk' ? 'G5' : 'G3';
  const decision = approvedGate(root, claim, request.decision, gate);
  const fix = request.defect ? scopedCompletion(root, claim, request.defect, request.completion, true) : undefined;
  const reviewed = proposalDigest(claim, mutation, release, fix);
  if (decision.publicationDigest !== reviewed && !(Array.isArray(decision.publicationDigests) && decision.publicationDigests.includes(reviewed))) throw new Error('The actual review must cover this exact board publication.');
  if (release) {
    reviewHandoff(root, decision, release.assessment, release.route, assignmentFor(claim));
    if (release.kind === 'completion') {
      const confirmed = journal(root).value.publications.some(item =>
        item.claimId === claim.id && item.state === 'confirmed' && item.handoff?.kind === 'delivery' &&
        sameEvidence(item.decision, request.decision) && sameEvidence(item.handoff.assessment, release.assessment));
      verifyDelivery(root, request.decision, release.route, request, confirmed ? 'publication' : undefined);
    }
  }
  const fixProof = request.defect ? scopedCompletion(root, claim, request.defect, request.completion) : undefined;
  if (fixProof?.review && !sameEvidence(decision.fixReview, fixProof.review)) throw new Error('Bind the actual G5 publication to the reviewed fix disposition.');
  return { mutation, release, fixProof };
}
export async function publish(root: string, request: PublicationRequest, reader: BoardReader = readBoard, writer: BoardWriter = prepareWrite) {
  assertNonsecret(request); id(request.id); requireText(request.source, 'Actual authorization for this board publication');
  const { claim, choice, connection } = await recheck(root, request.claimId, reader);
  const approved = approvedPublication(root, request, claim, choice, connection);
  const { mutation, release, fixProof } = approved;
  const fingerprint = digest(JSON.stringify({
    source: claim.sourceKey, ticket: claim.ticket.id, mutation,
    ...(mutation.action === 'move' || release ? { claimId: claim.id } : {}),
    ...(release ? { release, decisionSha256: request.decision.sha256 } : {}),
  }));
  const write = await writer(choice.board, claim.ticket, mutation.action === 'move' ? mutation : { ...mutation, body: `${mutation.body}\n\nQA operation: ${request.id}` });
  const fresh = await recheck(root, claim.id, reader);
  if (JSON.stringify(approvedPublication(root, request, fresh.claim, fresh.choice, fresh.connection)) !== JSON.stringify(approved)) throw new Error('The reviewed publication changed before submission.');
  const pending = withLock(root, 'qa-board', () => withLock(root, 'release-records', () => {
    if (activeSource(root).revision !== claim.sourceRevision) throw new Error('The task source changed before publication.');
    if ((release || fixProof) && JSON.stringify(approvedPublication(root, request, fresh.claim, fresh.choice, fresh.connection)) !== JSON.stringify(approved)) {
      throw new Error('The reviewed release or handoff destination changed before publication.');
    }
    openClaim(root, claim.id);
    const current = journal(root);
    if (current.value.executions.some(run => run.claimId === claim.id && !run.terminal)) throw new Error('Record the execution outcome before publishing.');
    const same = current.value.publications.find(p => p.id === request.id || p.fingerprint === fingerprint && p.state !== 'notApplied');
    if (same || current.value.publications.some(p => p.claimId === claim.id && p.state === 'pending')) throw new Error('This publication is already recorded or awaiting reconciliation. Inspect it before taking another action.');
    const record: Publication = {
      id: request.id, claimId: claim.id, ticketId: claim.ticket.id, fingerprint, action: mutation.action,
      state: 'pending', startedAt: new Date().toISOString(), source: request.source, decision: request.decision, writerPid: process.pid,
      ...(request.action === 'move' && mutation.action === 'move' ? { destination: { queue: request.to, id: mutation.destination.id } } : {}),
      ...(fixProof ? { fixProof } : {}),
      ...(release ? { handoff: { kind: release.kind, assessment: release.assessment, route: release.route,
        ...(release.kind === 'completion' ? { delivery: { delivery: request.delivery, acknowledgement: request.acknowledgement } } : {}),
      } } : {}),
    };
    current.value.publications.push(record);
    save(root, journalPath, current.value, current.revision);
    return record;
  }));
  try {
    const { remoteId } = await write();
    id(remoteId);
    const record = updatePublication(root, pending.id, item => { item.remoteId = remoteId; });
    if (mutation.action !== 'comment') {
      const observed = await liveBoard(root, reader);
      const atDestination = observed.connection.tickets.find(t => t.id === remoteId && t.state === mutation.destination.id);
      if (!atDestination || mutation.action === 'move' && remoteId !== claim.ticket.id) {
        throw new Error('The provider did not verify the requested ticket at its destination.');
      }
    }
    return updatePublication(root, record.id, item => { item.state = 'confirmed'; delete item.writerPid; });
  } catch {
    updatePublication(root, pending.id, item => { delete item.writerPid; });
    throw new Error(`Board write ${pending.id} has an uncertain outcome. Read the native ticket or action marker and reconcile the pending record before retrying.`);
  }
}
function updatePublication(root: string, publicationId: string, update: (item: Publication) => void) {
  return withLock(root, 'qa-board', () => {
    const current = journal(root), item = current.value.publications.find(p => p.id === publicationId);
    if (!item || item.state !== 'pending') throw new Error('Select a pending board publication.');
    update(item);
    save(root, journalPath, current.value, current.revision);
    return item;
  });
}
export function reconcilePublication(root: string, request: { id: string; state: 'confirmed' | 'notApplied'; remoteId?: string; source: string; evidence: Evidence[]; moveObservation?: Evidence }) {
  requireText(request.source, 'Actual reconciliation observation');
  if (!['confirmed', 'notApplied'].includes(request.state) || !request.evidence?.length) throw new Error('Record the independently observed terminal outcome with evidence.');
  if (request.state === 'confirmed') id(request.remoteId);
  for (const evidence of request.evidence) verifyEvidence(root, evidence);
  return updatePublication(root, request.id, item => {
    const managed = item.handoff?.kind === 'completion' || item.fixProof;
    if (managed && request.state === 'confirmed' && request.remoteId !== item.ticketId) {
      throw new Error('Confirm the actual assignment at its reviewed destination.');
    }
    if (managed && request.state === 'confirmed' && item.destination) {
      const observed = pinned<{ ticketId: string; destinationId: string; publicationId: string; source: string }>(root, request.moveObservation!, 'native move observation');
      if (observed?.ticketId !== item.ticketId || observed.destinationId !== item.destination.id || observed.publicationId !== item.id) {
        throw new Error('Record the actual assignment, destination and publication in the native move observation.');
      }
      requireText(observed.source, 'Actual native move source');
    }
    if (item.writerPid !== undefined) {
      try { process.kill(item.writerPid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') delete item.writerPid; }
      if (item.writerPid !== undefined) throw new Error('The local writer may still be running. Verify its termination before reconciliation.');
    }
    if (item.remoteId && (request.state !== 'confirmed' || request.remoteId !== item.remoteId)) throw new Error('The provider already returned an ID. Reconcile that actual record before another write.');
    if (request.remoteId) item.remoteId = request.remoteId;
    item.reconciliation = { source: request.source, evidence: [...request.evidence, ...(request.moveObservation ? [request.moveObservation] : [])] };
    item.state = request.state;
  });
}

export async function observeReleaseCompletion(root: string, request: { id: string; claimId: string; decision: Evidence; source: string; defect?: Evidence; completion?: DefectCompletion } & DeliveryEvidence, reader: BoardReader = readBoard) {
  assertNonsecret(request);
  id(request.id);
  requireText(request.source, 'Actual handoff and native board observation');
  const claim = openClaim(root, request.claimId);
  const { choice, revision, connection } = await liveBoard(root, reader);
  const mapped = choice.queues.testedOk;
  const observed = connection.tickets.find(ticket => ticket.id === claim.ticket.id && ticket.url === claim.ticket.url);
  if (claim.sourceRevision !== revision || sourceKey(choice, connection.identity) !== claim.sourceKey ||
      mapped?.length !== 1 || !observed || observed.state !== mapped[0]) {
    throw new Error('Observe the exact claimed assignment at the configured Tested-Ok destination.');
  }
  if (observed.title !== claim.ticket.title || claim.descriptionRevision &&
      claim.descriptionRevision !== digest(JSON.stringify(connection.descriptions?.[observed.id] ?? null))) {
    throw new Error('The native assignment scope changed. Reconcile the actual ticket revision and release decision.');
  }
  const destinationId = mapped[0]!;
  return withLock(root, 'qa-board', () => withLock(root, 'release-records', () => {
    if (activeSource(root).revision !== revision) throw new Error('The task source changed while observing completion.');
    openClaim(root, claim.id);
    const current = journal(root);
    if (current.value.publications.some(item => item.claimId === claim.id && item.state === 'pending') ||
        current.value.executions.some(run => run.claimId === claim.id && !run.terminal)) {
      throw new Error('Reconcile any pending publication or execution before recording release completion.');
    }
    const decision = approvedGate(root, claim, request.decision, 'G5');
    const fixProof = request.defect ? scopedCompletion(root, claim, request.defect, request.completion) : undefined;
    let handoff: Publication['handoff'];
    if (fixProof) {
      if (fixProof.review && !sameEvidence(decision.fixReview, fixProof.review)) throw new Error('Bind the observed G5 disposition to the reviewed fix.');
    } else {
      if (request.completion || !decision.handoff) throw new Error('Record the actual G5 release decision and handoff.');
      const route = resolveHandoffRoute(root, decision.handoff.route, claim.ticket.url);
      reviewHandoff(root, decision, decision.handoff.assessment, route, assignmentFor(claim));
      verifyDelivery(root, request.decision, route, request, 'observed');
      handoff = { kind: 'completion', assessment: decision.handoff.assessment, route, observed: true,
        delivery: { delivery: request.delivery, acknowledgement: request.acknowledgement } };
    }
    const fingerprint = digest(JSON.stringify([claim.id, request.decision.sha256, destinationId, request.delivery, request.acknowledgement]));
    const existing = current.value.publications.find(item => item.id === request.id || item.fingerprint === fingerprint);
    if (existing) {
      if (existing.fingerprint === fingerprint && existing.state === 'confirmed') return existing;
      throw new Error('Use a unique ID for this release completion observation.');
    }
    const publication: Publication = {
      id: request.id, claimId: claim.id, ticketId: claim.ticket.id, fingerprint, action: 'move', state: 'confirmed',
      startedAt: new Date().toISOString(), source: request.source, decision: request.decision, remoteId: observed.id,
      destination: { queue: 'testedOk', id: destinationId },
      ...(fixProof ? { fixProof } : { handoff }),
    };
    current.value.publications.push(publication);
    save(root, journalPath, current.value, current.revision);
    return publication;
  }));
}


export async function beginExecution(root: string, request: Parameters<typeof preflight>[1] & { id: string }, reader: BoardReader = readBoard) {
  id(request.id);
  const { result: { claim, buildId, target, gates, checkedAt }, scope, observation } = await checkExecution(root, request, reader);
  return withLock(root, 'qa-board', () => withLock(root, 'release-records', () => {
    if (activeSource(root).revision !== claim.sourceRevision) throw new Error('The task source changed before execution.');
    openClaim(root, claim.id);
    verifyEvidence(root, target);
    for (const gate of Object.values(gates)) if (gate) verifyEvidence(root, gate);
    const data = scope === undefined ? undefined : assertDataReady(root, scope, observation, request.dataObservations);
    const fixBatch = request.fixBatch ? requireFixBatch(root, assignmentFor(claim), observation, gates.G4!, request.fixBatch) : undefined;
    const current = journal(root);
    if (current.value.publications.some(p => p.claimId === claim.id && p.state === 'pending') || current.value.executions.some(run => run.id === request.id || run.claimId === claim.id && !run.terminal)) throw new Error('A pending write or execution already controls this claim.');
    if (current.value.executions.some(run => run.terminal?.state !== 'notStarted' && (fixBatch
      ? run.fixBatch?.fix === fixBatch.fix && run.fixBatch.batchId === fixBatch.batchId && sameEvidence(run.gates.G4, gates.G4)
      : !run.fixBatch && run.claimId === claim.id && run.buildId === buildId && run.gates.G2?.sha256 === gates.G2?.sha256 && run.gates.G4?.sha256 === gates.G4?.sha256))) {
      throw new Error('The same reviewed build and scope already ran. Retain its result or record a separately reviewed retry.');
    }
    const execution: Execution = { id: request.id, claimId: claim.id, buildId, target, gates, startedAt: checkedAt, ...(data ? { data } : {}), ...(fixBatch ? { fixBatch } : {}) };
    current.value.executions.push(execution);
    save(root, journalPath, current.value, current.revision);
    return execution;
  }));
}
export function settleExecution(root: string, request: NonNullable<Execution['terminal']> & { id: string }) {
  requireText(request.source, 'Actual terminal execution observation');
  if (!['completed', 'stopped', 'notStarted'].includes(request.state) || !request.evidence?.length) throw new Error('Retain actual terminal evidence.');
  for (const evidence of request.evidence) verifyEvidence(root, evidence);
  return withLock(root, 'qa-board', () => {
    const current = journal(root), run = current.value.executions.find(record => record.id === request.id);
    if (!run || run.terminal) throw new Error('Select an unfinished execution record.');
    run.terminal = { state: request.state, source: request.source, evidence: request.evidence };
    save(root, journalPath, current.value, current.revision);
    return run;
  });
}
export function claimHistory(root: string, claimId: string) {
  const current = journal(root).value;
  const claim = current.claims.find(c => c.id === claimId);
  if (!claim) throw new Error('Unknown claim.');
  const related = current.claims.filter(item => item.id !== claimId && item.sourceKey === claim.sourceKey && item.ticket.id === claim.ticket.id);
  return { claim, executions: current.executions.filter(run => run.claimId === claimId), publications: current.publications.filter(p => p.claimId === claimId),
    relatedClaims: related.map(item => ({ id: item.id, ticketRevision: item.ticket.revision, queue: item.queue, terminal: item.terminal })) };
}
