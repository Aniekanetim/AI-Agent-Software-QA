import { SlackApi } from '../slack/api.js';
import { ContextError, type Adapter, type Assignment } from './types.js';
import { connection, binding } from './store.js';
import { assertCompanyBasis, currentBasis, refreshReceipt } from './guards.js';
import { startRefresh, refresh } from './sync.js';
import { assertCompanyBoundary, boundaryRequirement, type Boundary } from './boundary.js';
import { effectiveClaim } from './knowledge.js';

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
  let pendingJob: string | undefined;
  for (const id of new Set(basis.dependencies.filter(item => !criteria || item.criterionIds.some(id => criteria.includes(id))).map(item => item.bindingId))) {
    const selected = binding(root, id);
    const channelIds = [...new Set(basis.dependencies.filter(dep => dep.bindingId === id && (!criteria || dep.criterionIds.some(value => criteria.includes(value))))
      .flatMap(dep => effectiveClaim(root, basis.basis, dep).claim.sources.map(ref => ref.sourceId.split('/')[1]!)))];
    const job = startRefresh(root, id, Date.now(), { channelIds, directory: false,
      ...(requirement ? { notBefore: requirement.createdAt, afterGeneration: requirement.generationFloors[id] } : {}) }).job;
    pendingJob = job.id;
    let adapter: Adapter;
    try { adapter = adapterFor(selected.connectionId); }
    catch (error) {
      if (error instanceof ContextError && error.code === 'HOST_READ_REQUIRED') throw Object.assign(new ContextError(error.code, `${error.message} Inspect scoped job ${job.id} and import its next actual request.`), { jobId: job.id });
      throw error;
    }
    try { await refresh(root, job.id, adapter, { budget: 20 }); }
    catch (error) { if (error instanceof ContextError) Object.assign(error, { jobId: job.id }); throw error; }
  }
  try { refreshReceipt(root, assignment, Date.now(), criteria); verify(); }
  catch (error) { if (error instanceof ContextError && error.code === 'REFRESH_REQUIRED' && pendingJob) Object.assign(error, { jobId: pendingJob }); throw error; }
}
