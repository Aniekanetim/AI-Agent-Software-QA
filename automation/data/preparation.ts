import { assertNonsecret, requireText, verifyEvidence, type Evidence } from '../shared/store.js';
import { uniqueTexts } from '../tools/policy.js';

export interface DataItem {
  id: string; conditionIds: string[]; requiredState: string;
  kind: 'localInput' | 'applicationState' | 'externalState'; approach: 'generate' | 'create' | 'reuse' | 'supplied';
  classification: 'synthetic' | 'explicitlyPermitted'; basis: Evidence[]; authorization: Evidence[];
  preparation: { status: 'planned' | 'prepared' | 'blocked'; method: string; dataReference: string | null; generationRules: string | null; evidence: Evidence[] };
  stateVerification: { status: 'notVerified' | 'verified'; dataReference: string | null; environment: string | null; build: string | null; evidence: Evidence[] };
  identity: { mode: 'fresh' | 'reuse' | 'none'; originalReference: string | null };
  controls: { isolation: string; concurrency: string; retention: string; cleanup: string };
  blocker: { reason: string; attempts: string; needed: string; owner: string; questionReference: string } | null;
}
export interface DataPreparation {
  schemaVersion: 1; id: string; revision: string; task: Evidence; environment: string; build: string | null; items: DataItem[];
}
function nullable(value: unknown, label: string) { if (value !== null) requireText(value, `${label}; use null when unknown`); }

/** Inspect a preparation record without generating values or modifying application state. */
export function assessData(root: string, plan: DataPreparation) {
  assertNonsecret(plan);
  if (!plan || plan.schemaVersion !== 1) throw new Error('Unsupported data-preparation record; preserve it for explicit migration.');
  requireText(plan.id); requireText(plan.revision); requireText(plan.environment); nullable(plan.build, 'Target build');
  if (!Array.isArray(plan.items) || !plan.items.length) throw new Error('Record the data items actually required.');
  uniqueTexts(plan.items.map(item => item.id), 'Data IDs');
  const globalIssues: string[] = []; try { verifyEvidence(root, plan.task); } catch { globalIssues.push('Task source is missing or changed.'); }
  const items = plan.items.map(item => {
    requireText(item.requiredState); uniqueTexts(item.conditionIds, 'Condition IDs');
    if (!item.conditionIds.length || !['localInput', 'applicationState', 'externalState'].includes(item.kind) || !['generate', 'create', 'reuse', 'supplied'].includes(item.approach) || !['synthetic', 'explicitlyPermitted'].includes(item.classification)) throw new Error('Identify data conditions, kind, approach and classification.');
    if (!item.preparation || !item.stateVerification || !item.identity || !item.controls) throw new Error('Separate preparation, state verification, identity and controls.');
    if (!['planned', 'prepared', 'blocked'].includes(item.preparation.status) || !['notVerified', 'verified'].includes(item.stateVerification.status) || !['fresh', 'reuse', 'none'].includes(item.identity.mode)) throw new Error('Invalid preparation, state or identity status.');
    requireText(item.preparation.method); nullable(item.preparation.dataReference, 'Data reference'); nullable(item.preparation.generationRules, 'Generation rules'); nullable(item.identity.originalReference, 'Original identity');
    nullable(item.stateVerification.dataReference, 'Verified data reference'); nullable(item.stateVerification.environment, 'Verified environment'); nullable(item.stateVerification.build, 'Verified build');
    for (const control of ['isolation', 'concurrency', 'retention', 'cleanup'] as const) requireText(item.controls[control], `Data ${control}`);
    const issues: string[] = [], verify = (refs: Evidence[], name: string) => {
      if (!Array.isArray(refs)) throw new Error(`${name} must be evidence references.`);
      for (const ref of refs) { try { verifyEvidence(root, ref); } catch { issues.push(`${name}: missing or changed evidence.`); } }
    };
    verify(item.basis, 'Data basis'); verify(item.authorization, 'Preparation authorization'); verify(item.preparation.evidence, 'Preparation'); verify(item.stateVerification.evidence, 'State verification');
    let status = 'canPrepare';
    if (!item.basis.length) { issues.push('Resolve the rule or state definition with its owner; do not invent valid data.'); status = 'needsClarification'; }
    const localSynthetic = item.kind === 'localInput' && item.classification === 'synthetic' && item.approach === 'generate';
    if (!localSynthetic && !item.authorization.length) { issues.push('Establish permission for the actual data access or state-changing preparation.'); status = 'needsAuthorization'; }
    if (item.identity.mode === 'reuse' || item.approach === 'reuse') {
      if (!item.identity.originalReference) { issues.push('Continuation/retest needs the exact original identity or dataset reference.'); status = 'needsClarification'; }
      else if (item.preparation.dataReference !== item.identity.originalReference) { issues.push('Prepared reference differs from the required original; a fresh replacement cannot certify this retest.'); status = 'needsPreparation'; }
    }
    if (item.preparation.status === 'blocked') {
      if (item.stateVerification.status === 'verified') throw new Error('A blocked preparation cannot also claim a verified ready state.');
      if (!item.blocker) throw new Error('A blocked item needs its specific owner question and assistance request.');
      for (const field of ['reason', 'attempts', 'needed', 'owner', 'questionReference'] as const) requireText(item.blocker[field], `Blocker ${field}`);
      status = 'blocked';
    } else if (item.blocker !== null) throw new Error('Resolve the recorded blocker explicitly before representing this item as unblocked.');
    if (item.preparation.status === 'prepared') {
      if (!item.preparation.dataReference || !item.preparation.evidence.length) { issues.push('Prepared data needs its actual reference and evidence.'); status = 'needsPreparation'; }
      else if (!issues.length) status = item.kind === 'localInput' ? 'inputsPrepared' : 'needsStateVerification';
    }
    if (item.stateVerification.status === 'verified') {
      if (item.preparation.status !== 'prepared' || !item.stateVerification.evidence.length || item.stateVerification.dataReference !== item.preparation.dataReference || item.stateVerification.environment !== plan.environment || item.stateVerification.build !== plan.build) {
        issues.push('State verification must match the prepared identity, target environment/build and actual evidence.'); status = 'needsStateVerification';
      } else if (!issues.length) status = 'stateVerified';
    }
    if (issues.length && ['canPrepare', 'inputsPrepared', 'stateVerified'].includes(status)) status = 'needsReview';
    if (globalIssues.length) status = 'needsReview';
    return { id: item.id, conditionIds: item.conditionIds, status, issues, blocker: item.blocker, next: status === 'canPrepare' ? 'Agent prepares within existing task bounds, records evidence and verifies required state.' : status === 'blocked' ? 'Post the specific question on the existing ticket; continue independent authorized work.' : 'Use the actual record and resolve only the affected preparation.' };
  });
  const prepared = items.every(item => ['inputsPrepared', 'stateVerified'].includes(item.status));
  return { id: plan.id, revision: plan.revision, status: prepared ? 'preparedForReview' : 'needsPreparation', globalIssues, items,
    authorization: 'Not established by this assessment', productVerdict: 'Not assessed',
    limits: ['Declared kind, authorization and evidence meaning require review; hashes cannot prove an application state or human decision.', 'No generation, account creation, data seeding, cleanup, testing or approval occurs here.', ...(plan.build === null ? ['Build identity is undisclosed; exact-revision state applicability is not established.'] : [])] };
}
