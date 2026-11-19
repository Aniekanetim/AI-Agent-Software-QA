import { realpathSync } from 'node:fs';
import { load, save, verifyEvidence, requireText, type Evidence } from '../shared/store.js';
import { prefix, binding } from './store.js';
import { readObject } from './store.js';
import { iso, unique } from './types.js';
import { currentHarness } from '../tools/runtime.js';

export interface RefreshSchedule { schemaVersion: 1; bindingIds: string[]; cadence: string; timezone: string; root: string; schedulerId: string; target: string; state: 'ACTIVE' | 'PAUSED' | 'DISABLED'; source: string; evidence: Evidence[]; checkedAt: string }
const path = `${prefix}/schedule.json`;
export function refreshSchedule(root: string) { return load<RefreshSchedule | null>(root, path, () => null).value; }
export function recordRefreshSchedule(root: string, input: RefreshSchedule) {
  if (input.schemaVersion !== 1 || !['ACTIVE', 'PAUSED', 'DISABLED'].includes(input.state) || input.root !== realpathSync(root)) throw new Error('Record the actual refresh schedule for this QA root.');
  unique(input.bindingIds, 'scheduled bindings'); input.bindingIds.forEach(id => binding(root, id));
  for (const value of [input.cadence, input.timezone, input.schedulerId, input.target, input.source]) requireText(value);
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { throw new Error('Use the actual schedule timezone.'); }
  iso(input.checkedAt); if (!input.evidence.length) throw new Error('Inspect the actual scheduler result before recording an active schedule.'); input.evidence.forEach(ref => verifyEvidence(root, ref));
  const observed = readObject<{ schedulerId: string; root: string; target: string; state: string; source: string }>(root, input.evidence[0]!);
  if (observed.schedulerId !== input.schedulerId || observed.root !== input.root || observed.target !== input.target || observed.state !== input.state || !observed.source) throw new Error('The scheduler evidence must identify this actual schedule, QA root, target and state.');
  const old = load<RefreshSchedule | null>(root, path, () => null); save(root, path, input, old.revision);
  return { recorded: true, actualSchedulerChange: 'Performed by the host; this command retains its evidence only.', unattendedSlackAccess: 'Must be verified in the scheduled harness', harness: currentHarness(root) };
}
