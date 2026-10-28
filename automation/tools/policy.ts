import { load, requireText, assertNonsecret, verifyEvidence, type Evidence } from '../shared/store.js';
import { assertToolId } from './registry.js';

export interface ToolPolicy {
  schemaVersion: 1; selection: 'agent'; source: string; evidence: Evidence[];
  visibility: 'headed' | 'headless' | 'any'; allowedTools: string[] | null; prohibitedTools: string[];
}
export const toolPolicyPath = '.local/tool-policy.json';
export function uniqueTexts(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  value.forEach(item => requireText(item, label));
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates.`);
}
export function validateToolPolicy(value: ToolPolicy): void {
  if (!value || value.schemaVersion !== 1 || value.selection !== 'agent') throw new Error('Use a supported agent-selection policy; preserve earlier settings for explicit migration.');
  assertNonsecret(value); requireText(value.source, 'Actual policy source');
  if (!['headed', 'headless', 'any'].includes(value.visibility)) throw new Error('Record actual visibility constraints.');
  if (value.allowedTools !== null) uniqueTexts(value.allowedTools, 'Allowed tools');
  uniqueTexts(value.prohibitedTools, 'Prohibited tools');
  value.allowedTools?.forEach(tool => assertToolId(tool)); value.prohibitedTools.forEach(tool => assertToolId(tool));
  if (!Array.isArray(value.evidence) || !value.evidence.length) throw new Error('Policy constraints need their actual source evidence.');
  if (value.allowedTools?.some(tool => value.prohibitedTools.includes(tool))) throw new Error('Resolve contradictory allowed/prohibited tool constraints.');
}
export function readToolPolicy(root: string): ToolPolicy | null {
  const policy = load<ToolPolicy | null>(root, toolPolicyPath, () => null).value;
  if (policy) { validateToolPolicy(policy); policy.evidence.forEach(ref => verifyEvidence(root, ref)); }
  return policy;
}
export function toolVisibility(root: string): ToolPolicy['visibility'] {
  const policy = readToolPolicy(root); if (policy) return policy.visibility;
  const legacy = load<{ visibility?: string; source?: string } | null>(root, '.local/browser-preferences.json', () => null).value;
  if (!legacy) return 'any';
  if (!['headed', 'headless'].includes(legacy.visibility ?? '')) throw new Error('Resolve the recorded legacy visibility constraint; retain its history.');
  requireText(legacy.source, 'Legacy visibility source'); return legacy.visibility as 'headed' | 'headless';
}
