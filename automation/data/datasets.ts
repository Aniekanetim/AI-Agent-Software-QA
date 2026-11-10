import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { assertNonsecret, contained, privatePath, requireText, verifyEvidence, type Evidence } from '../shared/store.js';
import { uniqueTexts } from '../tools/policy.js';

export const datasetDirectory = 'QA Process Context/Test Data Management/datasets';
export interface Dataset {
  id: string;
  revision: string;
  purpose: string;
  owner: string;
  environments: string[];
  classification: 'synthetic' | 'explicitlyPermitted';
  source: { kind: 'shared' | 'private'; files: Evidence[] } | { kind: 'external'; reference: string };
}
export interface DatasetIndex { schemaVersion: 1; datasets: Dataset[] }

function verifyFile(root: string, directory: string, ref: Evidence, isPrivate: boolean) {
  if (!ref || ref.pointer !== undefined) throw new Error('Dataset files need full-file hashes.');
  const path = isPrivate ? privatePath(root, ref.path) : contained(root, ref.path);
  const folder = resolve(realpathSync(root), directory);
  const actual = realpathSync(path);
  const part = relative(folder, path).replaceAll('\\', '/');
  if (!part || part === '..' || part.startsWith('../') || isAbsolute(part) || actual !== path || !lstatSync(actual).isFile()) {
    throw new Error('Keep regular files in their designated dataset directory and use their real paths.');
  }
  verifyEvidence(root, ref);
}

export function inspectDatasets(root: string, index: DatasetIndex, privateIndex = false) {
  assertNonsecret(index);
  if (index?.schemaVersion !== 1 || !Array.isArray(index.datasets)) throw new Error('Use a version 1 dataset index.');
  uniqueTexts(index.datasets.map(item => item.id?.toLowerCase()), 'Dataset IDs');
  const datasets = index.datasets.map(item => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(item.id)) throw new Error('Use a stable dataset ID with letters, digits, underscores or hyphens.');
    for (const value of [item.revision, item.purpose, item.owner]) requireText(value);
    if (!Array.isArray(item.environments) || !item.environments.length) throw new Error('Record permitted dataset environments.');
    uniqueTexts(item.environments, 'Dataset environments');
    if (!['synthetic', 'explicitlyPermitted'].includes(item.classification)) throw new Error('Record the permitted dataset classification.');
    const { source } = item;
    if (source?.kind === 'external') {
      requireText(source.reference, 'Nonsecret external reference');
      if (/[?#]/.test(source.reference) || /:\/\/[^/]*@/.test(source.reference)) throw new Error('Use an external reference without URL credentials, query or fragment.');
      return { id: item.id, revision: item.revision, status: 'externalReference', issues: [] };
    }
    if (!source || !['shared', 'private'].includes(source.kind) || !Array.isArray(source.files) || !source.files.length) throw new Error('Identify the dataset files or external reference.');
    if (source.kind === 'private' && !privateIndex) throw new Error('Keep private file references in a private dataset index.');
    uniqueTexts(source.files.map(ref => ref.path.toLowerCase().replaceAll('\\', '/')), 'Dataset files');
    const privateFiles = source.kind === 'private';
    const directory = privateFiles ? '.local/test-data' : `${datasetDirectory}/${item.id}`;
    const issues = source.files.flatMap((ref, number) => {
      try { verifyFile(root, directory, ref, privateFiles); return []; }
      catch { return [`File ${number + 1} is unavailable, outside the dataset area or differs from its recorded hash.`]; }
    });
    return { id: item.id, revision: item.revision, status: issues.length ? 'needsReview' : 'filesVerified', issues };
  });
  return { datasets, effect: 'Read-only inventory. Usage authority and application state are assessed for the task.' };
}
