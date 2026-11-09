import { randomUUID } from 'node:crypto';
import { assertNonsecret, digest, load, requireText, save, verifyEvidence, withLock, type Evidence } from '../shared/store.js';
import { pendingCommentPublications } from '../github/github.js';
import { pendingPresentation } from '../attention/notifications.js';
import { pendingTransitions, pendingOperations, tickets as localTickets } from '../board/board.js';
import { activeSource, sourcePath, validateBoard, validateChoice, id, type Active, type BoardSelection, type Choice, type Identity, type LiveChoice, type Queue } from './config.js';
import { readBoard, prepareWrite, type BoardReader, type BoardWriter, type Connection, type Mutation, type Ticket } from './provider.js';

interface Claim {
  id: string; sourceKey: string; sourceRevision: string; identity: Identity; ticket: Ticket; queue: 'ready' | 'retest'; source: string;
  state: 'open' | 'closed'; startedAt: string; terminal?: { source: string; evidence: Evidence[]; at: string };
}
interface Publication {
  id: string; claimId: string; ticketId: string; fingerprint: string; action: Mutation['action'];
  state: 'pending' | 'confirmed' | 'notApplied'; remoteId?: string;
  startedAt: string; source: string; decision: Evidence; writerPid?: number; reconciliation?: { source: string; evidence: Evidence[] };
}
interface Execution {
  id: string; claimId: string; buildId: string; target: Evidence; gates: Partial<Record<Gate['gate'], Evidence>>;
  startedAt: string; terminal?: { state: 'completed' | 'stopped' | 'notStarted'; source: string; evidence: Evidence[] };
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
function route(choice: LiveChoice, ticket: Ticket, identity: Identity) {
  const queue = mappedQueue(choice, ticket);
  const eligible = !ticket.closed && (queue === 'ready' || queue === 'retest') && ownerMatches(ticket, identity);
  return { ticket, queue, eligible, reason: ticket.closed ? 'Provider marks this task closed' : queue !== 'ready' && queue !== 'retest' ? 'Outside the configured QA queues' : eligible ? 'Mapped QA queue and assigned to the connected QA account' : 'Requires assignment to the designated QA account' };
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
export async function checkIn(root: string, reader: BoardReader = readBoard) {
  const active = activeSource(root);
  if (active.value.choice.kind === 'local') return { kind: 'local', instruction: 'Use the existing local board check-in procedure.' };
  const { choice, connection, revision } = await liveBoard(root, reader);
  const work = journal(root).value, claims = work.claims.filter(c => c.state === 'open');
  const rows = ranked(choice, connection).filter(row => row.eligible), key = sourceKey(choice, connection.identity);
  const resume = claims.map(c => ({
    claim: c,
    eligible: c.sourceRevision === revision && !work.publications.some(p => p.claimId === c.id && (p.state === 'pending' || p.action === 'move' && p.state === 'confirmed')) && !work.executions.some(run => run.claimId === c.id && !run.terminal) && rows.some(row => row.ticket.id === c.ticket.id && row.ticket.revision === c.ticket.revision),
  }));
  return { kind: 'live', identity: connection.identity, resume, candidates: rows.filter(row => !alreadyClaimed(work, key, row.ticket, row.queue)), authorization: 'Review through G1–G5.' };
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
    const record: Claim = { id: randomUUID(), sourceKey: key, sourceRevision: revision, identity: connection.identity, ticket, queue, source: request.source, state: 'open', startedAt: new Date().toISOString() };
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
  const { choice, revision, connection } = await liveBoard(root, reader);
  const ticket = connection.tickets.find(item => item.id === claim.ticket.id);
  if (claim.sourceRevision !== revision || !ticket || !route(choice, ticket, connection.identity).eligible || ticket.revision !== claim.ticket.revision) {
    throw new Error('The ticket, ownership, queue or source changed. Preserve evidence and reconcile before resuming.');
  }
  openClaim(root, claimId);
  const publications = journal(root).value.publications.filter(p => p.claimId === claimId);
  if (publications.some(p => p.state === 'pending')) throw new Error('Reconcile the pending board write before resuming.');
  if (publications.some(p => p.action === 'move' && p.state === 'confirmed')) throw new Error('The board handoff already completed. Close this claim before taking the next retest.');
  return { claim, choice, connection };
}
export interface Gate {
  claimId: string; ticketRevision: string; gate: 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
  decision: 'Approved' | 'Approved with limits'; reviewer: string; source: string; packet: Evidence;
  target?: { buildId: string; environment: string }; publicationDigest?: string; publicationDigests?: string[];
}
export function approvedGate(root: string, claim: Claim, ref: Evidence, gate: Gate['gate']) {
  if (ref?.pointer || !ref?.path.startsWith('.local/')) throw new Error('Use the full private reviewed decision record.');
  verifyEvidence(root, ref);
  const decision = load<Gate>(root, ref.path, () => { throw new Error('Missing decision record.'); }).value;
  assertNonsecret(decision);
  if (decision?.claimId !== claim.id || decision.ticketRevision !== claim.ticket.revision || decision.gate !== gate || !['Approved', 'Approved with limits'].includes(decision.decision)) throw new Error(`Record the actual ${gate} approval for this ticket revision.`);
  requireText(decision.reviewer, 'Actual reviewer'); requireText(decision.source, 'Actual decision source');
  verifyEvidence(root, decision.packet);
  return decision;
}
export async function preflight(root: string, request: { claimId: string; gates: Partial<Record<Gate['gate'], Evidence>>; target: Evidence; buildId: string }, reader: BoardReader = readBoard) {
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
  return { claim, buildId: request.buildId, target: request.target, gates: request.gates, checkedAt: new Date().toISOString() };
}
export function closeClaim(root: string, request: { claimId: string; source: string; evidence: Evidence[] }) {
  requireText(request.source, 'Actual claim disposition and reason');
  if (!request.evidence?.length) throw new Error('Link the actual disposition evidence before closing the claim.');
  for (const evidence of request.evidence) verifyEvidence(root, evidence);
  return withLock(root, 'qa-board', () => {
    openClaim(root, request.claimId);
    const current = journal(root), claim = current.value.claims.find(c => c.id === request.claimId)!;
    if (current.value.publications.some(p => p.claimId === claim.id && p.state === 'pending')) throw new Error('Reconcile the pending board write before closing the claim.');
    if (current.value.executions.some(run => run.claimId === claim.id && !run.terminal)) throw new Error('Record the execution outcome before closing the claim.');
    claim.state = 'closed';
    claim.terminal = { source: request.source, evidence: request.evidence, at: new Date().toISOString() };
    save(root, journalPath, current.value, current.revision);
    return claim;
  });
}


type Proposal = { id: string; claimId: string } & (
  | { action: 'comment'; body: string }
  | { action: 'move'; to: 'testedOk' | 'rework' }
  | { action: 'createDefect'; title: string; body: string }
);
type PublicationRequest = Proposal & { source: string; decision: Evidence };
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
const proposalDigest = (claim: Claim, mutation: Mutation) => digest(JSON.stringify({ claimId: claim.id, revision: claim.ticket.revision, mutation }));
export async function publicationPreview(root: string, request: Proposal, reader: BoardReader = readBoard) {
  assertNonsecret(request); id(request.id);
  const { claim, choice, connection } = await recheck(root, request.claimId, reader);
  const mutation = publicationMutation(request, claim, choice, connection);
  return { ticket: claim.ticket.url, mutation, publicationDigest: proposalDigest(claim, mutation) };
}
function approvedPublication(root: string, request: PublicationRequest, claim: Claim, choice: LiveChoice, connection: Connection) {
  const mutation = publicationMutation(request, claim, choice, connection);
  const gate = mutation.action === 'move' && request.action === 'move' && request.to === 'testedOk' ? 'G5' : 'G3';
  const decision = approvedGate(root, claim, request.decision, gate);
  const reviewed = proposalDigest(claim, mutation);
  if (decision.publicationDigest !== reviewed && !(Array.isArray(decision.publicationDigests) && decision.publicationDigests.includes(reviewed))) throw new Error('The actual review must cover this exact board publication.');
  return mutation;
}
export async function publish(root: string, request: PublicationRequest, reader: BoardReader = readBoard, writer: BoardWriter = prepareWrite) {
  assertNonsecret(request); id(request.id); requireText(request.source, 'Actual authorization for this board publication');
  const { claim, choice, connection } = await recheck(root, request.claimId, reader);
  const mutation = approvedPublication(root, request, claim, choice, connection);
  const fingerprint = digest(JSON.stringify({ source: claim.sourceKey, ticket: claim.ticket.id, mutation, ...(mutation.action === 'move' ? { claimId: claim.id } : {}) }));
  const write = await writer(choice.board, claim.ticket, mutation.action === 'move' ? mutation : { ...mutation, body: `${mutation.body}\n\nQA operation: ${request.id}` });
  const fresh = await recheck(root, claim.id, reader);
  if (JSON.stringify(approvedPublication(root, request, fresh.claim, fresh.choice, fresh.connection)) !== JSON.stringify(mutation)) throw new Error('The reviewed publication changed before submission.');
  const pending = withLock(root, 'qa-board', () => {
    if (activeSource(root).revision !== claim.sourceRevision) throw new Error('The task source changed before publication.');
    openClaim(root, claim.id);
    const current = journal(root);
    if (current.value.executions.some(run => run.claimId === claim.id && !run.terminal)) throw new Error('Record the execution outcome before publishing.');
    const same = current.value.publications.find(p => p.id === request.id || p.fingerprint === fingerprint && p.state !== 'notApplied');
    if (same || current.value.publications.some(p => p.claimId === claim.id && p.state === 'pending')) throw new Error('This publication is already recorded or awaiting reconciliation. Inspect it before taking another action.');
    const record: Publication = {
      id: request.id, claimId: claim.id, ticketId: claim.ticket.id, fingerprint, action: mutation.action,
      state: 'pending', startedAt: new Date().toISOString(), source: request.source, decision: request.decision, writerPid: process.pid,
    };
    current.value.publications.push(record);
    save(root, journalPath, current.value, current.revision);
    return record;
  });
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
export function reconcilePublication(root: string, request: { id: string; state: 'confirmed' | 'notApplied'; remoteId?: string; source: string; evidence: Evidence[] }) {
  requireText(request.source, 'Actual reconciliation observation');
  if (!['confirmed', 'notApplied'].includes(request.state) || !request.evidence?.length) throw new Error('Record the independently observed terminal outcome with evidence.');
  if (request.state === 'confirmed') id(request.remoteId);
  for (const evidence of request.evidence) verifyEvidence(root, evidence);
  return updatePublication(root, request.id, item => {
    if (item.writerPid !== undefined) {
      try { process.kill(item.writerPid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') delete item.writerPid; }
      if (item.writerPid !== undefined) throw new Error('The local writer may still be running. Verify its termination before reconciliation.');
    }
    if (item.remoteId && (request.state !== 'confirmed' || request.remoteId !== item.remoteId)) throw new Error('The provider already returned an ID. Reconcile that actual record before another write.');
    if (request.remoteId) item.remoteId = request.remoteId;
    item.reconciliation = { source: request.source, evidence: request.evidence };
    item.state = request.state;
  });
}


export async function beginExecution(root: string, request: Parameters<typeof preflight>[1] & { id: string }, reader: BoardReader = readBoard) {
  id(request.id);
  const { claim, buildId, target, gates, checkedAt } = await preflight(root, request, reader);
  return withLock(root, 'qa-board', () => {
    if (activeSource(root).revision !== claim.sourceRevision) throw new Error('The task source changed before execution.');
    openClaim(root, claim.id);
    verifyEvidence(root, target);
    for (const gate of Object.values(gates)) if (gate) verifyEvidence(root, gate);
    const current = journal(root);
    if (current.value.publications.some(p => p.claimId === claim.id && p.state === 'pending') || current.value.executions.some(run => run.id === request.id || run.claimId === claim.id && !run.terminal)) throw new Error('A pending write or execution already controls this claim.');
    if (current.value.executions.some(run => run.claimId === claim.id && run.buildId === buildId && run.gates.G2?.sha256 === gates.G2?.sha256 && run.gates.G4?.sha256 === gates.G4?.sha256 && run.terminal?.state !== 'notStarted')) throw new Error('The same reviewed build and scope already ran. Retain its result or record a separately reviewed retry.');
    const execution: Execution = { id: request.id, claimId: claim.id, buildId, target, gates, startedAt: checkedAt };
    current.value.executions.push(execution);
    save(root, journalPath, current.value, current.revision);
    return execution;
  });
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
  return { claim, executions: current.executions.filter(run => run.claimId === claimId), publications: current.publications.filter(p => p.claimId === claimId) };
}
