import { load, save, digest, requireText, verifyEvidence, type Evidence } from '../shared/store.js';
import { prefix, jsonFiles, readObject } from './store.js';
import { assertCompanyBasis } from './guards.js';
import type { BasisBinding, Basis } from './types.js';

/** Derived from canonical source/basis records; no board move or QA decision is implied. */
export function assessImpacts(root: string) {
  return jsonFiles(root, `${prefix}/bindings`).map(path => {
    const binding = load<BasisBinding>(root, path, () => { throw new Error('Missing source basis.'); }).value;
    const basis = readObject<Basis>(root, binding.basis);
    try { assertCompanyBasis(root, basis.assignment); return { assignment: basis.assignment, state: 'current', basis: binding.basis }; }
    catch (error) { return { assignment: basis.assignment, state: 'needsAssessment', basis: binding.basis, issue: error instanceof Error ? error.message : 'Assess the affected source basis.' }; }
  });
}
export function recordImpactDisposition(root: string, input: { basis: Evidence; state: 'learningOnly' | 'needsClarification' | 'requiresGateReview' | 'noMaterialImpact'; reason: string; source: string; evidence: Evidence[] }) {
  readObject<Basis>(root, input.basis); requireText(input.reason); requireText(input.source); input.evidence.forEach(ref => verifyEvidence(root, ref));
  if (!['learningOnly', 'needsClarification', 'requiresGateReview', 'noMaterialImpact'].includes(input.state)) throw new Error('Record an actual impact disposition.');
  const id = digest(JSON.stringify(input)); const path = `${prefix}/impacts/${id}.json`, old = load(root, path, () => null);
  save(root, path, { schemaVersion: 1, ...input }, old.revision);
  return { recorded: true, next: 'Link the affected rules/flows/cases on the original task. A disposition does not replace source evidence, change the board or approve execution.' };
}
