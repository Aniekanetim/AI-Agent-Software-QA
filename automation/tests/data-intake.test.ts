import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { datasetDirectory, inspectDatasets, type DatasetIndex } from '../data/datasets.js';
import { dataStatus, listIntake, noteCandidate, previewIntake, registerIntake, type IntakeRequest } from '../data/intake.js';
import { inspectSource } from '../data/source-inspection.js';
import { evidence } from '../shared/store.js';

function fixture() {
  const parent = resolve('.local/intake-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(resolve(parent, 'run-'));
  const write = (path: string, content: string) => {
    const file = resolve(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  };
  const file = write('supplied rows.csv', '\uFEFFName,Note\r\n"Adé, Example","First\r\nsecond ""quoted"" line"\r\n,Missing name\r\n');
  const request: IntakeRequest = {
    dataset: { id: 'people', revision: '1', purpose: 'Synthetic input fixture', owner: 'Fixture QA', environments: ['staging'], classification: 'synthetic' },
    reference: 'fixture-source/revision-1', mode: 'curate', source: { file },
    fields: [{ from: 1, to: 'name', required: true }, { from: 2, to: 'note' }],
    exclude: [{ line: 4, reason: 'Blank name belongs in a separate negative fixture.' }],
  };
  return { root, write, file, request };
}

test('source inspection handles CSV quoting and reports issues without exposing source values', () => {
  const { root, file, write } = fixture();
  const output = execFileSync(process.execPath, [
    fileURLToPath(new URL('../cli.js', import.meta.url)), '--root', root, 'data', 'intake-inspect', '--file', file,
  ], { encoding: 'utf8' });
  const table = JSON.parse(output).tables[0];
  assert.equal(table.records, 2);
  assert.deepEqual(table.issues, [{ line: 4, code: 'blankValue', field: 1 }]);
  assert(!output.includes('Adé') && !output.includes('Missing name'));
  assert.throws(() => inspectSource({ file: write('bad.csv', 'name\n"x') }), /Unclosed CSV quote/);
  const duplicates = inspectSource({ file: write('duplicates.csv', 'name,profile\nExample,one\nExample,two\nExample,two\n') }).summary.tables[0]!;
  assert.equal(duplicates.fields[0]?.repeats, 2);
  assert(duplicates.issues.some(issue => issue.code === 'duplicateRecord'));
});

test('Markdown tables and bounded labeled profile blocks ignore fenced examples', () => {
  const { write } = fixture();
  const file = write('profiles.md', [
    '# Fixtures', '| Name | Handle |', '| --- | --- |', '| Example | left\\|right |',
    '## Example A', '- `name`: Example A', '- `handle`: `@example`',
    '```md', '## Ignore this heading', '- `name`: Ignore this fixture', '```',
    '## Example B', '- `name`: Example B',
  ].join('\n'));
  assert.equal(inspectSource({ file, format: 'markdown-table' }).table?.rows[0]?.cells[1], 'left|right');
  const result = inspectSource({ file, format: 'markdown-profiles', fromLine: 5, throughLine: 11 });
  assert.deepEqual(result.table?.rows, [{ line: 5, cells: ['Example A', '@example'] }]);
  assert.throws(() => inspectSource({ file, format: 'markdown-table', table: 2 }), /not found/);
});

test('reviewed registration retains provenance, refuses changed inputs and preserves earlier indexes', () => {
  const { root, file, request, write } = fixture();
  const sourceBytes = readFileSync(file);
  const oldIndex = write(`${datasetDirectory}/index.json`, '{"schemaVersion":1,"datasets":[]}');
  const oldBytes = readFileSync(oldIndex);
  const before = readdirSync(root);
  assert.throws(() => previewIntake(root, { ...request, exclude: [] }), /required value is blank.*line 4/);
  const preview = previewIntake(root, request);
  assert.deepEqual(readdirSync(root), before);
  assert.deepEqual(preview.selection?.sourceLines, [2]);
  assert(!JSON.stringify(preview).includes('Missing name'));
  assert.throws(() => registerIntake(root, { ...request, visibility: 'shared' }, preview.previewSha256, 'Synthetic review'), /changed/);
  writeFileSync(file, Buffer.concat([sourceBytes, Buffer.from('Other,another\n')]));
  assert.throws(() => registerIntake(root, request, preview.previewSha256, 'Synthetic review'), /changed/);
  writeFileSync(file, sourceBytes);
  const first = registerIntake(root, request, preview.previewSha256, 'Synthetic review');
  assert.deepEqual(evidence(root, first.index.path), first.index);
  assert.equal(registerIntake(root, request, preview.previewSha256, 'Synthetic review').state, 'alreadyRegistered');
  const index: DatasetIndex = JSON.parse(readFileSync(resolve(root, first.index.path), 'utf8'));
  assert.equal(inspectDatasets(root, index, true).datasets[0]?.status, 'filesVerified');
  const source = index.datasets[0]!.source;
  assert.equal(source.kind, 'private');
  if (source.kind !== 'private') throw new Error('Expected a private fixture.');
  assert.deepEqual(JSON.parse(readFileSync(resolve(root, source.files[0]!.path), 'utf8')),
    [{ name: 'Adé, Example', note: 'First\r\nsecond "quoted" line' }]);
  const revised = { ...request, dataset: { ...request.dataset, revision: '2' }, visibility: 'shared' as const };
  const second = registerIntake(root, revised, previewIntake(root, revised).previewSha256, 'Synthetic share review');
  assert(!second.index.path.startsWith('.local/'));
  assert.deepEqual(evidence(root, first.index.path), first.index);
  assert.deepEqual(readFileSync(oldIndex), oldBytes);
  assert.deepEqual(readFileSync(file), sourceBytes);
  assert.equal(listIntake(root).registrations.length, 2);
  write(first.index.path, '{}');
  assert.equal(listIntake(root).registrations.find(item => item.revision === '1')?.status, 'needsReview');
});

test('intake defaults to private reference and keeps copies private', () => {
  const { root, file, request, write } = fixture();
  const reference: IntakeRequest = { dataset: { ...request.dataset, id: 'linked' }, reference: request.reference };
  const preview = previewIntake(root, reference);
  assert.equal(preview.filesToWrite.length, 2);
  registerIntake(root, reference, preview.previewSha256, 'Synthetic reference review');
  assert.equal(listIntake(root).registrations[0]?.status, 'externalReference');
  const copy: IntakeRequest = { ...reference, dataset: { ...reference.dataset, id: 'copied' }, mode: 'copy', source: { file } };
  assert.throws(() => previewIntake(root, { ...copy, visibility: 'shared' }), /raw copies private/);
  assert.throws(() => previewIntake(root, { ...copy, source: { file: write('restricted.csv', 'Password\nexample') } }), /secure credential/);
  const approved = previewIntake(root, copy);
  registerIntake(root, copy, approved.previewSha256, 'Synthetic local-copy review');
  const artifact = approved.filesToWrite.find(path => path.endsWith('/source.csv'))!;
  assert.deepEqual(readFileSync(resolve(root, artifact)), readFileSync(file));
  assert.throws(() => previewIntake(root, { ...copy, dataset: { ...copy.dataset, revision: '../escape' } }), /portable/);
});

test('candidate notes retain provenance and the reviewed preview binds the proposed use', () => {
  const { root, file, request } = fixture();
  const first = noteCandidate(root, { reference: request.reference, source: { file } });
  assert.equal(noteCandidate(root, { reference: request.reference, source: { file } }).id, first.id);
  const pending = dataStatus(root);
  assert.equal(pending.state, 'candidates');
  assert.equal(pending.datasets.length, 0);
  assert.equal(pending.candidates[0]?.sourceSha256, first.inspection?.sha256);
  assert(!JSON.stringify(pending).includes('Missing name'));
  request.use = { task: 'QA-001', checks: ['Profile entry'], basis: ['Accepted profile rules'], openQuestions: ['Confirm intended profile field'] };
  const unresolved = previewIntake(root, request);
  assert.deepEqual(unresolved.use?.checks, ['Profile entry']);
  assert.throws(() => registerIntake(root, request, unresolved.previewSha256, 'Synthetic review'), /open questions/);
  request.use.openQuestions = [];
  assert.throws(() => registerIntake(root, request, unresolved.previewSha256, 'Synthetic review'), /changed/);
  const ready = previewIntake(root, request);
  registerIntake(root, request, ready.previewSha256, 'Synthetic review');
  const result = dataStatus(root).datasets[0]!;
  assert.equal(result.purpose, request.dataset.purpose);
  assert.deepEqual(result.environments, ['staging']);
  assert.equal(result.sourceKind, 'private');
});
