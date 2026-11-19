import { SlackApi } from '../slack/api.js';
import { ContextError, type Adapter, type Assignment } from './types.js';
import { connection, binding } from './store.js';
import { assertCompanyBasis, currentBasis, refreshReceipt } from './guards.js';
import { startRefresh, refresh } from './sync.js';

export function apiAdapter(root: string, id: string): Adapter {
  const selected = connection(root, id, true);
  if (selected.transport !== 'api') throw new ContextError('HOST_READ_REQUIRED', 'Use the actual native Slack tools and HostSlackAdapter/import-host-page through this harness; the terminal cannot invent a host connection.');
  return new SlackApi(process.env[selected.credentialVariable!] ?? '', fetch, Date.now, selected.identity);
}
/** No network while current, or while the project has no company source. Never runs inside execution locks. */
export async function prepareCompanyBasis(root: string, assignment: Assignment, criteria?: string[], adapterFor: (id: string) => Adapter = id => apiAdapter(root, id)) {
  try { assertCompanyBasis(root, assignment, criteria); return; }
  catch (error) { if (!(error instanceof ContextError) || error.code !== 'REFRESH_REQUIRED') throw error; }
  const basis = currentBasis(root, assignment); if (!basis) return;
  for (const id of new Set(basis.dependencies.filter(item => !criteria || item.criterionIds.some(id => criteria.includes(id))).map(item => item.bindingId))) {
    const selected = binding(root, id), job = startRefresh(root, id).job;
    await refresh(root, job.id, adapterFor(selected.connectionId), { budget: 20 });
  }
  refreshReceipt(root, assignment, Date.now(), criteria);
  assertCompanyBasis(root, assignment, criteria);
}
