import { assertExecutable } from '../board/board.js';
import { assertNonsecret, load, requireText, verifyEvidence, type Evidence } from '../shared/store.js';
import { assertDataReady, dataScopeDigest, type DataScope, type DataTarget } from './readiness.js';

interface LocalObservation extends DataTarget { ticketId: string; generation: string; observedAt: string; source: string }
interface LocalDecision {
  ticketId: string; generation: string; gate: 'G2' | 'G4'; decision: 'Approved' | 'Approved with limits';
  reviewer: string; source: string; packet: Evidence; target: DataTarget; dataScope: DataScope;
}
interface LocalPreflight {
  ticketId: string; generation: string; target: Evidence;
  gates: { G2: Evidence; G4?: Evidence }; dataObservations?: Evidence[];
}

export function preflightLocalData(root: string, request: LocalPreflight) {
  requireText(request.generation, 'Current ticket generation');
  const ticket = assertExecutable(root, request.ticketId, request.generation);
  if (request.target?.pointer !== undefined) throw new Error('Use a full target observation.');
  verifyEvidence(root, request.target);
  const observed = load<LocalObservation>(root, request.target.path, () => { throw new Error('Missing target observation.'); });
  const target = observed.value;
  if (observed.revision !== request.target.sha256 || target?.ticketId !== ticket.id || target.generation !== ticket.generation || !Number.isFinite(Date.parse(target.observedAt))) {
    throw new Error('Observe the actual target for this ticket generation.');
  }
  requireText(target.source, 'Actual target observation source');
  const gates = ticket.status === 'Retest' ? ['G2', 'G4'] as const : ['G2'] as const;
  const scopes = gates.map(gate => {
    const ref = request.gates?.[gate];
    if (!ref || ref.pointer !== undefined || !ref.path.startsWith('.local/')) throw new Error(`Use the full private ${gate} decision record.`);
    verifyEvidence(root, ref);
    const record = load<LocalDecision>(root, ref.path, () => { throw new Error(`Missing ${gate} decision.`); });
    const decision = record.value;
    assertNonsecret(decision);
    if (record.revision !== ref.sha256 || decision?.ticketId !== ticket.id || decision.generation !== ticket.generation || decision.gate !== gate ||
        !['Approved', 'Approved with limits'].includes(decision.decision) || !decision.dataScope ||
        decision.target?.environment !== target.environment || decision.target.buildId !== target.buildId) {
      throw new Error(`Record the actual ${gate} decision, target and data scope for this ticket generation.`);
    }
    requireText(decision.reviewer, 'Actual reviewer'); requireText(decision.source, 'Actual decision source');
    verifyEvidence(root, decision.packet);
    return decision.dataScope;
  });
  const scope = scopes[0]!;
  if (scopes.some(value => dataScopeDigest(value) !== dataScopeDigest(scope))) throw new Error('The G2 and G4 decisions must agree on the execution data scope.');
  return { ticketId: ticket.id, generation: ticket.generation, target: request.target, gates: request.gates, checkedAt: new Date().toISOString(),
    data: assertDataReady(root, scope, target, request.dataObservations) };
}
