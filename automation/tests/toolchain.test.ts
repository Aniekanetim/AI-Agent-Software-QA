import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as store from '../shared/store.js';
import { bindHarness, currentHarness, harnessKey } from '../tools/runtime.js';
import * as registry from '../tools/registry.js';
import * as postman from '../postman/postman.js';
import { selectBinding, readConnections, type Binding, type Inventory } from '../email/email.js';
import { packageHarness } from './context.js';

function fixture() {
  const root = resolve('output/toolchain-fixtures', randomUUID()); mkdirSync(root, { recursive: true });
  bindHarness(root, { id: 'synthetic-harness', version: '1', profile: 'test', executionContext: 'interactive', source: 'Synthetic host evidence; not adopting-project setup' });
  const entry = resolve(root, 'fake-tool.cjs'); writeFileSync(entry, '// Synthetic executable fixture');
  return { root: realpathSync(root), command: registry.makeCommand(process.execPath, [entry]) };
}
function put(root: string, path: string, value: unknown) {
  const file = store.contained(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return store.evidence(root, path);
}
const version: registry.Runner = async () => ({ code: 0, stdout: 'Postman CLI 1.79.0', stderr: '' });
async function prepared() { const f = fixture(); await registry.probe(f.root, 'postman', 'Synthetic selected existing tool', version, f.command); return f; }
function request(root: string, id = randomUUID()): postman.RunRequest {
  const collection = '.local/source.collection.json';
  if (!existsSync(store.contained(root, collection))) put(root, collection, { info: { name: 'Synthetic only', _postman_id: 'original-source-id', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [] });
  return { id, source: 'Synthetic regression fixture', authorizationReference: 'Synthetic fixture authorization; not a real human approval', collection: { kind: 'file', reference: collection, format: 'v2.1' }, approvedInputs: [store.evidence(root, collection)], target: { environment: 'synthetic', baseUrl: 'http://127.0.0.1:12345', build: 'fixture-v1', source: 'Synthetic target identity' }, timeoutMs: 1000 };
}
function fakeRunner(failed = 0, requestFailed = 0, assertions = 2): registry.Runner {
  return async (_command, args) => {
    if (args[0] === '--version') return version(_command, args);
    if (args.includes('--help')) return { code: 0, stdout: '--reporters --reporter-json-export --report-events --no-insecure-file-read --json', stderr: '' };
    if (args[0] === 'whoami') return { code: 0, stdout: JSON.stringify({ user: { id: 'selected-account' } }), stderr: '' };
    const file = args[args.indexOf('--reporter-json-export') + 1]!;
    writeFileSync(file, JSON.stringify({ run: { stats: { assertions: { total: assertions, failed }, requests: { total: 1, failed: requestFailed } }, failures: [] }, body: 'PMAK-synthetic-sensitive-material' }));
    return { code: failed || requestFailed ? 1 : 0, stdout: 'Raw output may contain sensitive data', stderr: '' };
  };
}

test('existing compatible selection is reused and rescanning preserves working capabilities', async () => {
  const f = await prepared(), record = registry.readRecord(f.root, 'postman')!;
  const ref = put(f.root, '.local/actual-operation.txt', 'Synthetic execution evidence');
  record.capabilities.localCollectionRun = { status: 'verified', evidence: [ref] }; registry.saveRecord(f.root, record);
  const selection = store.revision(f.root, '.local/tool-selections.json');
  await registry.probe(f.root, 'postman', 'Synthetic second inspection', version);
  assert.equal(store.revision(f.root, '.local/tool-selections.json'), selection);
  assert.equal(registry.selectedCommand(f.root, 'postman').stamp, f.command.stamp);
  assert.equal(registry.status(f.root, 'postman', ['localCollectionRun']).reusable, true);
  assert.equal(postman.loginInstructions(f.root).required, false);
});

test('a version scan cannot refresh old browser or API operation evidence', async () => {
  const f = await prepared(), record = registry.readRecord(f.root, 'postman')!;
  const ref = put(f.root, '.local/old-operation.txt', 'Synthetic historical operation');
  record.capabilities.localCollectionRun = { status: 'verified', evidence: [ref], checkedAt: '2000-01-01T00:00:00Z' }; registry.saveRecord(f.root, record);
  await registry.probe(f.root, 'postman', 'Synthetic new version scan', version);
  assert(!registry.status(f.root, 'postman', ['localCollectionRun']).reusable);
});

test('npm .bin discovery selects the package entry with its browser-engine context before shell shims', () => {
  const f = fixture(), bin = resolve(f.root, 'node_modules/.bin'); mkdirSync(bin, { recursive: true });
  put(f.root, 'node_modules/@playwright/cli/package.json', { name: '@playwright/cli', version: '0.1.22', bin: { 'playwright-cli': 'entry.cjs' } });
  put(f.root, 'node_modules/@playwright/cli/entry.cjs', '// Synthetic CLI entry'); put(f.root, 'node_modules/.bin/playwright-cli', '#!/bin/sh\nexit 99');
  const choices = registry.candidates(f.root, 'playwrightCli', bin);
  assert.equal(choices[0]?.packageRoot, resolve(f.root, 'node_modules/@playwright/cli')); assert.equal(choices[0]?.executable, process.execPath);
});

test('a harness denial preserves the installed selection without falling back or reinstalling', async () => {
  const f = await prepared(); let calls = 0;
  const denied: registry.Runner = async () => { calls++; return { code: null, stdout: '', stderr: '', error: 'denied' }; };
  const record = await registry.probe(f.root, 'postman', 'Synthetic restricted harness', denied);
  assert.equal(calls, 1); assert.equal(record.available, true); assert.equal(record.accessible, false);
  assert.equal(registry.selectedCommand(f.root, 'postman').stamp, f.command.stamp);
  assert(registry.readinessIssues(f.root, record, ['version']).some(s => s.includes('harness cannot')));
});

test('switching harness invalidates only affected capabilities and preserves unrelated onboarding answers', async () => {
  const f = await prepared(); put(f.root, '.local/onboarding-state.json', { answer: 'Preserve this historical answer' });
  const before = store.revision(f.root, '.local/onboarding-state.json'), old = registry.readRecord(f.root, 'postman')!;
  bindHarness(f.root, { ...currentHarness(f.root), id: 'other-harness', source: 'Synthetic actual harness switch' });
  assert.notEqual(harnessKey(old.harness), harnessKey(currentHarness(f.root)));
  assert.equal(registry.readRecord(f.root, 'postman'), null);
  assert.throws(() => registry.selectedCommand(f.root, 'postman'), /harness changed/);
  assert.equal(store.revision(f.root, '.local/onboarding-state.json'), before);
  await registry.probe(f.root, 'postman', 'Synthetic current-context recheck', version);
  assert(registry.readRecord(f.root, 'postman')?.compatible);
});

test('changed executable, stale evidence and unsupported versions cannot be reused', async () => {
  const f = await prepared(), record = registry.readRecord(f.root, 'postman')!;
  record.checkedAt = '2000-01-01T00:00:00Z'; assert(registry.readinessIssues(f.root, record, ['version']).some(s => s.includes('Refresh')));
  writeFileSync(f.command.prefix[0]!, 'Changed executable entry point');
  assert.throws(() => registry.selectedCommand(f.root, 'postman'), /changed/);
  const g = fixture(); const bad = await registry.probe(g.root, 'postman', 'Synthetic incompatible version', async () => ({ code: 0, stdout: 'Postman 2.0.0', stderr: '' }), g.command);
  assert.equal(bad.compatible, false);
});

test('native connector records require evidence and remain specific to the actual harness', () => {
  const f = fixture(); const base = { tool: 'inAppBrowser' as const, source: 'Synthetic actual browser call', connectionReference: 'synthetic-tool-call', version: 'host-managed', available: true, accessible: true, compatible: true, authentication: 'notRequired' as const };
  assert.throws(() => registry.recordHost(f.root, { ...base, capabilities: { navigate: { status: 'verified', evidence: [] } } }), /evidence/);
  const ref = put(f.root, '.local/host-call.txt', 'Synthetic real-call fixture'); registry.recordHost(f.root, { ...base, capabilities: { navigate: { status: 'verified', evidence: [ref] } } });
  assert(registry.status(f.root, 'inAppBrowser', ['navigate']).reusable);
  const expired = registry.readRecord(f.root, 'inAppBrowser')!; expired.authentication = 'needsAuthentication'; registry.saveRecord(f.root, expired);
  assert(!registry.status(f.root, 'inAppBrowser', ['navigate']).reusable);
  put(f.root, ref.path, 'Different observation'); assert(!registry.status(f.root, 'inAppBrowser', ['navigate']).reusable);
});

test('package self-checks preserve an existing adopting harness identity', () => {
  const f = fixture(); if (process.env.CI === 'true') bindHarness(f.root, { ...currentHarness(f.root), executionContext: 'ci' });
  const before = store.revision(f.root, '.local/harness.json'); packageHarness(f.root);
  assert.equal(store.revision(f.root, '.local/harness.json'), before);
});

test('local runs isolate Postman credentials and preserve the users existing environment', () => {
  const f = fixture(); const input = { POSTMAN_API_KEY: 'synthetic-key', POSTMAN_SESSION: 'synthetic-session', HOME: 'original', APP_TOKEN: 'target-runtime-secret' };
  const env = postman.localEnvironment(f.root, input);
  assert.equal(env.POSTMAN_API_KEY, undefined); assert.equal(env.POSTMAN_SESSION, undefined); assert.equal(input.HOME, 'original'); assert.equal(env.APP_TOKEN, input.APP_TOKEN);
  assert(env.HOME?.startsWith(f.root));
  assert.throws(() => store.assertNonsecret({ note: 'PMAK-synthetic-sensitive-material' }), /Secret/);
});

test('local Postman execution retains assertion outcomes, removes raw secrets and never mutates the approved collection', async () => {
  const f = await prepared(), first = request(f.root); const before = store.revision(f.root, first.collection.reference);
  const preservingRunner: registry.Runner = async (command, args, options) => {
    if (args[0] === 'collection' && !args.includes('--help')) assert.equal(store.digest(readFileSync(args[2]!)), first.approvedInputs[0]!.sha256);
    return fakeRunner()(command, args, options);
  };
  const pass = await postman.runCollection(f.root, first, preservingRunner); assert.equal(pass.outcome, 'passed');
  const fail = await postman.runCollection(f.root, request(f.root), fakeRunner(1)); assert.equal(fail.outcome, 'failed'); assert.equal(fail.exitCode, 1);
  assert.equal(store.revision(f.root, first.collection.reference), before);
  const result = readFileSync(store.contained(f.root, `.local/postman/runs/${first.id}.json`), 'utf8'); assert(!result.includes('PMAK-'));
  assert(!existsSync(store.contained(f.root, `.local/postman/work/${first.id}/raw-report.json`)));
  assert(registry.status(f.root, 'postman', ['localCollectionRun']).reusable);
  let calls = 0; const same = await postman.runCollection(f.root, first, async () => { calls++; throw new Error(); }); assert.equal(same.outcome, 'passed'); assert.equal(calls, 0);
});

test('execution errors and missing assertions are not reported as passing API tests', () => {
  assert.equal(postman.summarize(null, 0).outcome, 'incomplete');
  const report = (failed: number, total: number) => ({ run: { stats: { assertions: { total, failed: 0 }, requests: { total: 1, failed } }, failures: [] } });
  assert.equal(postman.summarize(report(1, 2), 1).outcome, 'executionError');
  assert.equal(postman.summarize(report(0, 0), 0).outcome, 'incomplete');
});

test('version-specific CLI tables retain assertion failures and reject missing or ambiguous summaries', () => {
  const table = '             executed    failed\n requests       1          0\n test-scripts   1          0\n assertions     2          1\n';
  assert.equal(postman.summarize(postman.cliSummary(table), 1).outcome, 'failed');
  assert.equal(postman.summarize(postman.cliSummary(table.replace('2          1', '2          0')), 0).outcome, 'passed');
  assert.equal(postman.cliSummary(table + table), null); assert.equal(postman.cliSummary('Command completed successfully'), null);
});

test('changed approved inputs block execution and an interrupted run is not repeated automatically', async () => {
  const f = await prepared(), r = request(f.root);
  put(f.root, r.collection.reference, 'Changed collection'); await assert.rejects(postman.runCollection(f.root, r, fakeRunner()), /evidence/);
  const g = await prepared(), valid = request(g.root); let executions = 0;
  const interrupted: registry.Runner = async (command, args) => { if (args[0] === 'collection' && !args.includes('--help')) { executions++; throw new Error('Synthetic interruption'); } return fakeRunner()(command, args); };
  await assert.rejects(postman.runCollection(g.root, valid, interrupted), /interruption/);
  await assert.rejects(postman.runCollection(g.root, valid, interrupted), /unfinished/); assert.equal(executions, 1);
});

test('cloud mode requires selected resources, exact identity and separate reporting authorization', async () => {
  const f = await prepared(); const r = request(f.root); r.collection = { kind: 'cloud', reference: 'selected-cloud-collection', format: 'v2.1' }; r.approvedInputs = [];
  assert.throws(() => postman.validateRun(f.root, r), /authorization/);
  put(f.root, postman.settingsPath, { schemaVersion: 1, mode: 'cloud', reporting: 'cloudAllowed', region: 'us', credential: 'session', accountId: 'selected-account', collections: [r.collection.reference], environments: [], source: 'Synthetic cloud resource selection' });
  assert.throws(() => postman.validateRun(f.root, r), /authorization/); r.cloudReportingAuthorization = 'Synthetic explicit reporting scope'; postman.validateRun(f.root, r);
  const record = await postman.inspect(f.root, 'Synthetic cloud check', fakeRunner()); assert.equal(record.authentication, 'connected'); assert.equal(postman.loginInstructions(f.root).required, false);
  const wrong: registry.Runner = async (command, args) => args[0] === 'whoami' && !args.includes('--help') ? { code: 0, stdout: '{"user":{"id":"different-account"}}', stderr: '' } : fakeRunner()(command, args);
  assert.equal((await postman.inspect(f.root, 'Synthetic mismatched account', wrong)).authentication, 'denied');
  const local = await postman.runCollection(f.root, request(f.root), fakeRunner()); assert.equal(local.outcome, 'passed'); assert.equal(local.reporting, 'localOnly');
});

test('older identity commands require targeted access work, not installation', async () => {
  const f = await prepared();
  put(f.root, postman.settingsPath, { schemaVersion: 1, mode: 'cloud', reporting: 'cloudAllowed', region: 'us', credential: 'session', accountId: 'selected-account', collections: [], environments: [], source: 'Synthetic cloud choice' });
  const old: registry.Runner = async (command, args) => args[0] === 'whoami' ? { code: 1, stdout: '', stderr: 'Unsupported command' } : fakeRunner()(command, args);
  const record = await postman.inspect(f.root, 'Synthetic older CLI', old);
  assert.equal(record.accessible, true); assert.equal(record.capabilities.identity?.status, 'unsupported'); assert.equal(postman.loginInstructions(f.root).required, true);
  assert.equal(registry.selectedCommand(f.root, 'postman').stamp, f.command.stamp);
});

test('reselecting the same mailbox preserves its existing access evidence', () => {
  const f = fixture(); const binding: Binding = { id: 'mail', provider: 'gmail', accountId: 'id', mailboxId: 'mailbox', address: 'qa@example.test', connectionReference: 'host:gmail', authentication: 'connected', environment: 'staging', transport: 'host', choiceSource: 'Synthetic mailbox selection', scope: { query: 'subject:Verification' }, verification: { context: 'interactive', listedAt: new Date().toISOString(), bodyReadAt: new Date().toISOString(), evidence: [] } };
  put(f.root, '.local/email-connections.json', { schemaVersion: 1, bindings: [binding], history: [] });
  const inventory: Inventory = { schemaVersion: 1, harness: 'synthetic-harness', executionContext: 'interactive', source: 'Synthetic metadata', providers: [{ id: 'gmail', name: 'Gmail', available: true }], accounts: [binding] };
  const before = store.revision(f.root, '.local/email-connections.json'); selectBinding(f.root, binding, inventory);
  assert.equal(store.revision(f.root, '.local/email-connections.json'), before);
  selectBinding(f.root, { ...binding, scope: { query: 'subject:Other' } }, inventory); assert.equal(readConnections(f.root).value.bindings[0]?.verification, undefined);
});
