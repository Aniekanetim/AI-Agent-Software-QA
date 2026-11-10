import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assertNonsecret, contained, digest, load, privatePath, requireText, withLock } from '../shared/store.js';
import { datasetDirectory, inspectDatasets, type Dataset, type DatasetIndex } from './datasets.js';
import { inspectSource, type SourceSelection } from './source-inspection.js';

const privateDirectory = '.local/test-data/registrations';
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

interface FieldMapping { from: number; to: string; required?: boolean }
interface Exclusion { line: number; reason: string }
export interface IntakeRequest {
  dataset: Omit<Dataset, 'source'>;
  reference: string;
  visibility?: 'private' | 'shared';
  mode?: 'reference' | 'copy' | 'curate';
  source?: SourceSelection;
  fields?: FieldMapping[];
  exclude?: Exclusion[];
}

function portableName(value: string) {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9._-]{0,78}[a-z0-9_-])?$/.test(value) &&
    !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/.test(value);
}

function curated(request: IntakeRequest, inspected: ReturnType<typeof inspectSource>) {
  const { table } = inspected;
  if (!table) throw new Error('Select one structured source table or profile section to curate.');
  const fields = request.fields;
  if (!Array.isArray(fields) || !fields.length) throw new Error('Supply the field mapping for the curated dataset.');
  const names = new Set<string>();
  for (const field of fields) {
    if (!Number.isSafeInteger(field.from) || field.from < 1 || field.from > table.fields.length ||
        typeof field.to !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(field.to) ||
        ['constructor', 'prototype'].includes(field.to.toLowerCase()) || names.has(field.to.toLowerCase()) ||
        (field.required !== undefined && typeof field.required !== 'boolean')) throw new Error('Use valid source positions and distinct output field names.');
    names.add(field.to.toLowerCase());
  }
  const rows = new Map(table.rows.map(row => [row.line, row]));
  const exclusions = new Map<number, string>();
  for (const { line, reason } of request.exclude ?? []) {
    requireText(reason, 'Exclusion reason');
    if (!rows.has(line) || exclusions.has(line)) throw new Error('Name each excluded record by its distinct source line.');
    exclusions.set(line, reason);
  }
  const records: Record<string, string>[] = [], sourceLines: number[] = [];
  for (const { line, cells } of rows.values()) {
    if (exclusions.has(line)) continue;
    if (cells.length !== table.fields.length || cells.every(cell => !cell.trim())) {
      throw new Error(`Resolve the record at source line ${line} or explicitly exclude it with a reason.`);
    }
    const record = Object.fromEntries(fields.map(({ from, to, required }) => {
      const value = cells[from - 1]!;
      if (required && !value.trim()) throw new Error(`A required value is blank at source line ${line}. Resolve it or explicitly exclude the record.`);
      return [to, value];
    }));
    records.push(record);
    sourceLines.push(line);
  }
  if (!records.length) throw new Error('Select at least one usable record.');
  assertNonsecret(records);
  return { records, sourceLines, exclusions: [...exclusions].map(([line, reason]) => ({ line, reason })) };
}

function prepare(root: string, request: IntakeRequest) {
  const { id, revision, purpose, owner, environments, classification } = request.dataset;
  if (!portableName(id) || id.includes('.') || !portableName(revision)) throw new Error('Use lowercase portable dataset and revision names. Dataset IDs cannot contain dots.');
  const visibility = request.visibility ?? 'private', mode = request.mode ?? 'reference';
  if (!['private', 'shared'].includes(visibility) || !['reference', 'copy', 'curate'].includes(mode)) throw new Error('Choose private or shared storage and reference, copy, or curate.');
  if (mode === 'copy' && visibility !== 'private') throw new Error('Keep approved raw copies private. Use curation for files reviewed for repository sharing.');
  if (mode !== 'curate' && (request.fields !== undefined || request.exclude !== undefined)) throw new Error('Use field mapping and record exclusions only with curation.');
  const reference = request.reference;
  const entry: Dataset = { id, revision, purpose, owner, environments, classification, source: { kind: 'external', reference } };
  // Validate shared metadata and the nonsecret canonical source before handling file content.
  inspectDatasets(root, { schemaVersion: 1, datasets: [entry] }, visibility === 'private');
  const inspected = request.source && inspectSource(request.source);
  if (!inspected && mode !== 'reference') throw new Error('Select a local file for copying or curation.');
  const directory = `${visibility === 'private' ? privateDirectory : datasetDirectory}/${id}/${revision}`;
  let artifact: { name: string; bytes: Buffer } | undefined;
  const selection = mode === 'curate' && inspected ? curated(request, inspected) : undefined;
  if (selection) artifact = { name: 'fixtures.json', bytes: Buffer.from(json(selection.records)) };
  if (mode === 'copy' && inspected) {
    assertNonsecret(inspected.source.content);
    for (const label of inspected.table?.fields ?? []) {
      assertNonsecret({ [label.replace(/[\s_-]/g, '')]: '' });
    }
    artifact = { name: inspected.summary.format === 'csv' ? 'source.csv' : 'source.md', bytes: inspected.source.bytes };
  }
  if (artifact) entry.source = { kind: visibility, files: [{ path: `${directory}/${artifact.name}`, sha256: digest(artifact.bytes) }] };
  const index: DatasetIndex = { schemaVersion: 1, datasets: [entry] };
  const indexReference = { path: `${directory}/index.json`, sha256: digest(json(index)) };
  const preview = {
    dataset: entry, reference, mode, visibility, inspection: inspected?.summary ?? null,
    selection: selection && {
      fields: request.fields!.map(({ from, to, required }) => ({ from, to, required: required ?? false })),
      sourceLines: selection.sourceLines, exclusions: selection.exclusions,
    },
    index: indexReference,
    filesToWrite: [indexReference.path, `${directory}/intake.json`, ...(artifact ? [`${directory}/${artifact.name}`] : [])],
  };
  assertNonsecret(preview);
  return { preview, previewSha256: digest(json(preview)), index, directory, artifact };
}

export function previewIntake(root: string, request: IntakeRequest) {
  const { preview, previewSha256 } = prepare(root, request);
  return { ...preview, previewSha256, state: 'preview', next: 'Review the exact selection, usage, and destination before registration.' };
}

function realDestination(root: string, path: string, isPrivate: boolean) {
  const target = isPrivate ? privatePath(root, path) : contained(root, path);
  let ancestor = target;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (realpathSync(ancestor) !== ancestor) throw new Error('Use a dataset destination without link aliases.');
  return target;
}

export function registerIntake(root: string, request: IntakeRequest, approvedPreview: string, reviewSource: string) {
  requireText(reviewSource, 'Actual data review reference');
  assertNonsecret(reviewSource);
  const { preview, previewSha256, directory, index, artifact } = prepare(root, request);
  if (previewSha256 !== approvedPreview) throw new Error('The source or intake plan changed. Review a fresh preview before registration.');
  const isPrivate = preview.visibility === 'private';
  const receipt = json({ previewSha256, reviewSource, ...preview });
  const files = [
    { name: 'index.json', bytes: Buffer.from(json(index)) },
    { name: 'intake.json', bytes: Buffer.from(receipt) },
    ...(artifact ? [artifact] : []),
  ];
  return withLock(root, 'dataset-intake', () => {
    const destination = realDestination(root, directory, isPrivate);
    for (const { name } of files) realDestination(root, `${directory}/${name}`, isPrivate);
    if (existsSync(destination)) {
      if (!lstatSync(destination).isDirectory() || !files.every(({ name, bytes }) => {
        const file = join(destination, name);
        return existsSync(file) && lstatSync(file).isFile() && readFileSync(file).equals(bytes);
      })) throw new Error('This dataset revision already exists with different contents. Select a new revision.');
      return { state: 'alreadyRegistered', id: preview.dataset.id, revision: preview.dataset.revision, index: preview.index };
    }
    const parent = dirname(destination);
    mkdirSync(parent, { recursive: true });
    if (realpathSync(parent) !== parent) throw new Error('Use a dataset destination without link aliases.');
    const pending = mkdtempSync(join(parent, '.intake-'));
    try {
      for (const { name, bytes } of files) writeFileSync(join(pending, name), bytes, { flag: 'wx', mode: 0o600 });
      if (existsSync(destination)) throw new Error('The dataset revision was registered concurrently. Reload it before retrying.');
      renameSync(pending, destination);
    } finally {
      if (existsSync(pending)) {
        for (const { name } of files) if (existsSync(join(pending, name))) unlinkSync(join(pending, name));
        rmdirSync(pending);
      }
    }
    return { state: 'registered', id: preview.dataset.id, revision: preview.dataset.revision, index: preview.index };
  });
}

export function listIntake(root: string) {
  const registrations = [];
  for (const [directory, isPrivate] of [[datasetDirectory, false], [privateDirectory, true]] as const) {
    const base = realDestination(root, directory, isPrivate);
    if (!existsSync(base)) continue;
    for (const id of readdirSync(base, { withFileTypes: true })) {
      if (!id.isDirectory() || !portableName(id.name)) continue;
      for (const rev of readdirSync(join(base, id.name), { withFileTypes: true })) {
        if (!rev.isDirectory() || !portableName(rev.name)) continue;
        const path = `${directory}/${id.name}/${rev.name}`;
        if (!existsSync(join(base, id.name, rev.name, 'intake.json'))) continue;
        try {
          const indexPath = `${path}/index.json`;
          realDestination(root, indexPath, isPrivate);
          const receiptPath = `${path}/intake.json`;
          realDestination(root, receiptPath, isPrivate);
          const { value: receipt } = load<{ index: { path: string; sha256: string } }>(root, receiptPath, () => { throw new Error('Missing intake record.'); });
          const { value, revision } = load<DatasetIndex>(root, indexPath, () => { throw new Error('Missing registration index.'); });
          if (receipt.index?.path !== indexPath || receipt.index.sha256 !== revision) throw new Error('The registration index changed.');
          const report = inspectDatasets(root, value, isPrivate).datasets;
          if (report.length !== 1 || report[0]!.id !== id.name || report[0]!.revision !== rev.name) throw new Error('Invalid registration identity.');
          registrations.push({ ...report[0]!, index: { path: indexPath, sha256: revision } });
        } catch {
          registrations.push({ id: id.name, revision: rev.name, status: 'needsReview', issues: ['Registration index or dataset files need review.'] });
        }
      }
    }
  }
  return { registrations };
}
