import { assertNonsecret, digest, load, requireText, verifyEvidence, type Evidence } from '../shared/store.js';
import { uniqueTexts } from '../tools/policy.js';
import { inspectDatasets, type DatasetIndex } from './datasets.js';
import { assessData, type DataItem, type DataPreparation } from './preparation.js';

interface DataCheck { id: string; conditionIds: string[]; dataItemIds: string[] }
export interface DataScope {
  schemaVersion: 1;
  mode: 'none' | 'required';
  checks: DataCheck[];
  plan?: Evidence;
  maxStateAgeMs?: number;
}
export interface DataTarget { environment: string; buildId: string }
interface StateObservation {
  planSha256: string;
  itemId: string;
  verification: DataItem['stateVerification'];
}

export const dataScopeDigest = (scope: DataScope) => digest(JSON.stringify(scope));
const ready = ['inputsPrepared', 'stateVerified'];
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;

function fullRecord<T>(root: string, ref: Evidence): T {
  if (!ref || ref.pointer !== undefined) throw new Error('Use a full, hashed data record.');
  verifyEvidence(root, ref);
  const record = load<T>(root, ref.path, () => { throw new Error('Data record is missing.'); });
  if (record.revision !== ref.sha256) throw new Error('Data record changed while loading.');
  return record.value;
}

function verifyDataset(root: string, item: DataItem, environment: string) {
  if (!item.dataset) return;
  const { index, id, revision } = item.dataset;
  const catalogue = fullRecord<DatasetIndex>(root, index);
  const matches = catalogue?.datasets?.filter(entry => entry.id === id);
  const dataset = matches?.length === 1 ? matches[0] : undefined;
  if (!dataset || catalogue.schemaVersion !== 1 || dataset.revision !== revision || !dataset.environments.includes(environment) || dataset.classification !== item.classification) {
    throw new Error('Check the selected dataset revision, classification and permitted environment.');
  }
  const assessment = inspectDatasets(root, { schemaVersion: 1, datasets: [dataset] }, index.path.startsWith('.local/'));
  if (assessment.datasets[0]?.status === 'needsReview') throw new Error('Check the selected dataset files and recorded hashes.');
}

export function assertDataReady(root: string, scope: DataScope, target: DataTarget, references: Evidence[] = [], now = Date.now()) {
  assertNonsecret(scope);
  requireText(target.environment, 'Target environment'); requireText(target.buildId, 'Target build');
  if (scope?.schemaVersion !== 1 || !['none', 'required'].includes(scope.mode) || !Array.isArray(scope.checks) || !scope.checks.length || !Array.isArray(references)) {
    throw new Error('Record an explicit version 1 data scope and its approved checks.');
  }
  uniqueTexts(scope.checks.map(check => check.id), 'Data scope check IDs');
  for (const check of scope.checks) {
    if (!Array.isArray(check.conditionIds) || !check.conditionIds.length || !Array.isArray(check.dataItemIds)) throw new Error('Bind each selected check to its conditions and data items.');
    uniqueTexts(check.conditionIds, 'Check condition IDs'); uniqueTexts(check.dataItemIds, 'Check data item IDs');
  }
  const selected = new Set(scope.checks.flatMap(check => check.dataItemIds));
  const receipt = { scopeDigest: dataScopeDigest(scope), mode: scope.mode, checks: scope.checks, plan: scope.plan ?? null, observations: references };
  if (scope.mode === 'none') {
    if (selected.size || scope.plan !== undefined || scope.maxStateAgeMs !== undefined || references.length) throw new Error('A data-independent scope cannot carry required data or state observations.');
    return { ...receipt, items: [] };
  }
  if (!selected.size || !scope.plan) throw new Error('Bind required data to its reviewed preparation record.');
  const plan = fullRecord<DataPreparation>(root, scope.plan);
  if (plan?.environment !== target.environment || plan?.build !== target.buildId || !Array.isArray(plan.items)) throw new Error('The data plan must match the observed execution environment and build.');
  uniqueTexts(plan.items.map(item => item.id), 'Data plan item IDs');
  for (const check of scope.checks) {
    const applicable = plan.items.filter(item => item.conditionIds.some(id => check.conditionIds.includes(id))).map(item => item.id);
    if (applicable.length !== check.dataItemIds.length || applicable.some(id => !check.dataItemIds.includes(id))) {
      throw new Error(`Check ${check.id} must bind all data items for its approved conditions.`);
    }
  }
  const observations = new Map<string, StateObservation>();
  for (const ref of references) {
    const observation = fullRecord<StateObservation>(root, ref);
    assertNonsecret(observation);
    if (observation?.planSha256 !== scope.plan.sha256 || !selected.has(observation.itemId) || observations.has(observation.itemId) || observation.verification?.status !== 'verified') {
      throw new Error('Bind each refreshed observation to one selected item and its approved plan hash.');
    }
    observations.set(observation.itemId, observation);
  }
  const items = plan.items.filter(item => selected.has(item.id)).map(item => {
    const refreshed = observations.get(item.id);
    return refreshed ? { ...item, stateVerification: refreshed.verification } : item;
  });
  const assessment = assessData(root, { ...plan, items });
  const failures = assessment.items.flatMap(result => {
    const item = items.find(entry => entry.id === result.id)!;
    const checks = scope.checks.filter(check => check.dataItemIds.includes(item.id)).map(check => check.id).join(', ');
    const prefix = `Check ${checks}, data ${item.id}`;
    if (!ready.includes(result.status)) return [`${prefix}: ${result.status}. ${result.blocker?.needed ?? result.issues.join(' ')}`];
    if (item.kind !== 'localInput') {
      const observedAt = date(item.stateVerification.observedAt);
      const recheckAfter = date(item.stateVerification.recheckAfter);
      const maxAge = scope.maxStateAgeMs;
      if (!maxAge || !Number.isSafeInteger(maxAge) || !(observedAt <= now && now < recheckAfter && recheckAfter - observedAt <= maxAge)) {
        return [`${prefix}: observe the starting state again within its reviewed validity window.`];
      }
    }
    try { verifyDataset(root, item, target.environment); }
    catch (error) { return [`${prefix}: ${(error as Error).message}`]; }
    return [];
  });
  if (failures.length) throw new Error(`Data readiness holds execution. ${failures.join(' ')}`);
  return { ...receipt, items: items.map(item => ({
    id: item.id, dataReference: item.preparation.dataReference, dataset: item.dataset ?? null,
    observedAt: item.stateVerification.observedAt ?? null, recheckAfter: item.stateVerification.recheckAfter ?? null,
  })) };
}
export type DataReceipt = ReturnType<typeof assertDataReady>;
