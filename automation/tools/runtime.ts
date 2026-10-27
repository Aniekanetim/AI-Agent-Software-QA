import { arch, platform } from 'node:os';
import { realpathSync } from 'node:fs';
import { load, save, requireText, digest, type Evidence } from '../shared/store.js';

export type ExecutionContext = 'interactive' | 'scheduled' | 'ci';
export interface HarnessIdentity {
  schemaVersion: 1; id: string; version: string; profile: string;
  executionContext: ExecutionContext; root: string; platform: string; arch: string; nodeMajor: number; source: string;
}
export const harnessPath = '.local/harness.json';
export function readHarness(root: string): HarnessIdentity | null {
  return load<HarnessIdentity | null>(root, harnessPath, () => null).value;
}
export function validateHarness(root: string, value: HarnessIdentity, context?: ExecutionContext): void {
  if (!value || value.schemaVersion !== 1) throw new Error('Identify the actual calling harness first.');
  for (const field of ['id', 'version', 'profile', 'source'] as const) requireText(value[field], `Harness ${field}`);
  if (!['interactive', 'scheduled', 'ci'].includes(value.executionContext) || value.root !== realpathSync(root) || value.platform !== platform() || value.arch !== arch() || value.nodeMajor !== Number(process.versions.node.split('.')[0]) || (context && value.executionContext !== context)) throw new Error('Rebind the actual harness, machine, root and execution context; preserve previous evidence.');
}
export function bindHarness(root: string, input: Pick<HarnessIdentity, 'id' | 'version' | 'profile' | 'executionContext' | 'source'>): HarnessIdentity {
  const value: HarnessIdentity = { ...input, schemaVersion: 1, root: realpathSync(root), platform: platform(), arch: arch(), nodeMajor: Number(process.versions.node.split('.')[0]) };
  validateHarness(root, value);
  const current = load<HarnessIdentity | null>(root, harnessPath, () => null);
  save(root, harnessPath, value, current.revision); return value;
}
export function currentHarness(root: string, context?: ExecutionContext): HarnessIdentity {
  const value = readHarness(root); if (!value) throw new Error('Bind the actual calling harness using tools bind; this records identity, not readiness.');
  validateHarness(root, value, context); return value;
}
export function harnessKey(value: HarnessIdentity): string {
  const { source: _source, ...identity } = value; return digest(JSON.stringify(identity));
}
export interface OperationEvidence { status: 'verified' | 'unverified' | 'denied' | 'unsupported'; evidence: Evidence[]; checkedAt?: string }
