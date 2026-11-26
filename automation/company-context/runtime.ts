import { SlackApi } from '../slack/api.js';
import { ContextError, type Adapter, type Assignment } from './types.js';
import { connection, binding } from './store.js';
import { assertCompanyBasis, currentBasis, refreshReceipt } from './guards.js';
import { startRefresh, refresh } from './sync.js';
import { assertCompanyBoundary, boundaryRequirement, type Boundary } from './boundary.js';

export function apiAdapter(root: string, id: string): Adapter {
  const selected = connection(root, id, true);
  if (selected.transport !== 'api') throw new ContextError('HOST_READ_REQUIRED', 'Use the actual native Slack tools and HostSlackAdapter/import-host-page through this harness; the terminal cannot invent a host connection.');
  return new SlackApi(process.env[selected.credentialVariable!] ?? '', fetch, Date.now, selected.identity);
}
/** No network while current, or while the project has no company source. Never runs inside execution locks. */
export async function prepareCompanyBasis(root: string, assignment: Assignment, criteria?: string[], adapterFor: (id: string) => Adapter = id => apiAdapter(root, id), boundary?: Boundary) {
  const requirement = boundary && boundaryRequirement(root, assignment, boundary, true);
  const verify = () => boundary ? assertCompanyBoundary(root, assignment, boundary, criteria) : assertCompanyBasis(root, assignment, criteria);
  try { verify(); return; }
  catch (error) { if (!(error instanceof ContextError) || error.code !== 'REFRESH_REQUIRED') throw error; }
  try { refreshReceipt(root, assignment, Date.now(), criteria); verify(); return; }
  catch (error) { if (!(error instanceof ContextError) || error.code !== 'REFRESH_REQUIRED') throw error; }
  const basis = currentBasis(root, assignment); if (!basis) return;
  for (const id of new Set(basis.dependencies.filter(item => !criteria || item.criterionIds.some(id => criteria.includes(id))).map(item => item.bindingId))) {
    const selected = binding(root, id), job = startRefresh(root, id).job;
    const adapter = adapterFor(selected.connectionId);
    const result = await refresh(root, job.id, adapter, { budget: 20 });
    if (result.job.state === 'complete' && requirement && (!result.job.startedAt || !result.job.generation || result.job.generation <= requirement.generationFloors?.[id]! || Date.parse(result.job.startedAt) < Date.parse(requirement.createdAt))) {
      await refresh(root, startRefresh(root, id).job.id, adapter, { budget: 20 });
    }
  }
  refreshReceipt(root, assignment, Date.now(), criteria);
  verify();
}
