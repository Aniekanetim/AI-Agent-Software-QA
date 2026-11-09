import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyBrowserOrigin, assessBrowserAccess, browserAccessStatus, browserTargets, prepareBrowserAccess, recordBrowserAccess, type AccessTarget, type OriginScope } from '../browser/access.js';
import { nativeRuleAddition, readNativeQaConfig, writeNativeQaConfig } from '../browser/codex-config.js';
import { settingsHash, settingsPath, type ChromeSettings } from '../chrome-devtools/config.js';
import { integrationStatus } from '../onboarding/integrations.js';
import { emptyState, readState, readiness, stages, writeState } from '../onboarding/state.js';
import { acknowledge, commitReply, next, queueQuestions } from '../onboarding/conversation.js';
import { chooseArea, openMenu } from '../settings/menu.js';
import { evidence, revision, verifyEvidence, type Evidence } from '../shared/store.js';
import { recordHost } from '../tools/registry.js';
import { bindHarness } from '../tools/runtime.js';
import { assessTaskTools, type TaskToolPlan } from '../tools/task.js';

const origin = 'https://staging.example.test:8443';
const fixtureOrigin = 'http://127.0.0.1:55414';
const publicEntry = origin + '/welcome';

function fixture() {
  const root = resolve('output/test-fixtures', randomUUID()); mkdirSync(root, { recursive: true });
  const put = (path: string, value: unknown) => {
    const file = resolve(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value)); return evidence(root, path);
  };
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const source = put('.local/observed-browser.json', { purpose: 'Synthetic adapter observations only; no actual tool, human authorization, or application outcome.' });
  const project = { name: 'Synthetic', owners: ['Fixture owner'], source: 'Synthetic only', environments: [{ name: 'staging', url: 'https://STAGING.example.test:8443/welcome?private=value#anchor' }, { name: 'preview', url: 'https://preview.example.test/' }] };
  put('.local/project.json', project);
  bindHarness(root, { id: 'synthetic-host', version: '1', profile: 'isolated', executionContext: 'interactive', source: 'Synthetic fixture only' });
  const target: AccessTarget = { environment: 'staging', tool: 'chromeDevtoolsHost', connection: 'synthetic:qa-browser', generation: 'running-1' };
  const prepare = (scope: OriginScope, selected = target, observedAt = new Date().toISOString()) => prepareBrowserAccess(root, { schemaVersion: 1, target: selected, scope, observedAt, source: 'Synthetic fixture', evidence: [source] });
  const decision = (selected = target, actions = ['navigate', 'addOrigin'], approvedOrigin = origin) => put(`.local/approval-${randomUUID()}.json`, { schemaVersion: 1, decision: 'Approved', environment: selected.environment, origin: approvedOrigin, tool: selected.tool, connection: selected.connection, actions, source: 'Synthetic fixture; not an actual human decision' });
  const probe = (selected: AccessTarget, approval: Evidence, requestedUrl = publicEntry) => ({ target: selected, approval, observedAt: new Date().toISOString(), evidence: [source], requestedUrl, outcome: 'rendered' as const, finalUrl: origin + '/login', httpStatus: 200, scopeEnforced: true });
  return { root, put, read, source, project, target, prepare, decision, probe };
}

test('a saved staging URL surfaces its missing exact browser rule during setup and Settings', () => {
  const f = fixture();
  assert.deepEqual(browserTargets(f.root), [{ environment: 'staging', origin }, { environment: 'preview', origin: 'https://preview.example.test' }]);
  const before = f.read('.local/project.json');
  const access = f.prepare({ kind: 'observedAllowlist', activeOrigins: [fixtureOrigin], savedOrigins: [fixtureOrigin] });
  assert.equal(access.status, 'missingOrigin'); assert.equal(access.additionalOrigin, origin);
  assert.match(integrationStatus(f.root).capabilityIssues.join(' '), /Browser target staging.*8443/);
  openMenu(f.root, 'Synthetic settings request');
  assert.equal(chooseArea(f.root, 'browser').browserAccess?.[0]?.status, 'missingOrigin');
  assert.equal(f.read('.local/project.json'), before);
  assert(!JSON.stringify(browserAccessStatus(f.root)).includes('private=value'));
});

test('onboarding asks for the environment before browser setup, then reuses the recorded URL', () => {
  const f = fixture();
  f.put('.local/project.json', { ...f.project, environments: [] });
  const state = emptyState();
  state.roadmapShown = true;
  writeState(f.root, state, null);
  queueQuestions(f.root, [{ id: 'browser-visibility', stage: 'tools', prompt: 'Which visibility should we use?', path: '.local/browser-preferences.json', required: false }]);
  const first = next(f.root);
  assert.equal(first.action, 'present');
  const id = 'project-target-environment';
  assert.equal(readState(f.root).value.questions.find(q => q.status === 'presenting')?.id, id);
  acknowledge(f.root, id, 'Synthetic first prompt');
  assert.equal(next(f.root).action, 'wait');
  commitReply(f.root, {
    id: 'synthetic-target', source: 'Synthetic target response',
    answers: [{ id, path: '.local/project.json', pointer: '/environments', kind: 'answer' }],
    writes: [{ path: '.local/project.json', expectedSha256: revision(f.root, '.local/project.json'), content: JSON.stringify(f.project), origin: 'human' }],
  });
  assert.equal(next(f.root).action, 'present');
  assert.equal(readState(f.root).value.questions.find(q => q.status === 'presenting')?.id, 'browser-visibility');
  const configured = fixture();
  writeState(configured.root, state, null);
  assert.equal(next(configured.root).action, 'work');
  assert.equal(readState(configured.root).value.questions.length, 0);
});

test('native Codex update changes only qa-webmcp args and verifies the previous rule through readback', async () => {
  const file = resolve('synthetic', 'config.toml');
  const priorArgs = ['--isolated', '--allowedUrlPattern', fixtureOrigin + '/*', 'https://*.example.test/*', '--executablePath', 'fixture-browser'];
  const initial = {
    mcp_servers: {
      'qa-webmcp': { command: 'fixture', args: priorArgs, env: { FIXTURE: 'retained' }, startup_timeout_sec: 15 },
      'chrome-devtools': { command: 'other', args: ['--autoConnect'] },
    },
    approval_policy: 'on-request',
  };
  const state = { config: structuredClone(initial), version: 'v1', shadowed: false, droppedRule: false };
  const request = async (method: string, params: object) => {
    const qa = state.config.mcp_servers['qa-webmcp'];
    if (method === 'config/read') {
      const user = { name: { type: 'user', file, profile: null }, version: state.version, config: structuredClone(state.config) };
      const project = { name: { type: 'project' }, config: { mcp_servers: { 'qa-webmcp': { args: qa.args } } }, disabledReason: null };
      return {
        config: { mcp_servers: { 'qa-webmcp': { ...qa, args: [...qa.args], enabled: true, environment_id: 'local' } } },
        layers: state.shadowed ? [user, project] : [user],
      };
    }
    assert.equal(method, 'config/batchWrite');
    assert.deepEqual(params, { filePath: file, expectedVersion: 'v1', reloadUserConfig: false, edits: [{ keyPath: 'mcp_servers.qa-webmcp.args', mergeStrategy: 'replace', value: expectedArgs }] });
    qa.args = state.droppedRule ? expectedArgs.filter(arg => arg !== fixtureOrigin + '/*') : expectedArgs;
    state.version = 'v2';
    return { filePath: file, status: 'ok', version: 'v2' };
  };
  const rule = origin + '/*';
  const expectedArgs = [...priorArgs.slice(0, 4), rule, ...priorArgs.slice(4)];
  const before = await readNativeQaConfig(request, process.cwd());
  assert.deepEqual(nativeRuleAddition(before.args, rule).args, expectedArgs);
  const after = await writeNativeQaConfig(request, process.cwd(), before, expectedArgs);
  assert.deepEqual(after.config, { ...initial, mcp_servers: { ...initial.mcp_servers, 'qa-webmcp': { ...initial.mcp_servers['qa-webmcp'], args: expectedArgs } } });
  assert.equal(nativeRuleAddition(after.args, rule).present, true);
  assert.throws(() => nativeRuleAddition(['--allowedUrlPattern=' + fixtureOrigin + '/*'], rule), /allowlist format/);
  state.config = structuredClone(initial);
  state.version = 'v1';
  state.droppedRule = true;
  await assert.rejects(writeNativeQaConfig(request, process.cwd(), before, expectedArgs), /could not be verified/);
  state.shadowed = true;
  await assert.rejects(readNativeQaConfig(request, process.cwd()), /unshadowed/);
});

test('a saved native rule needs reload and a successful bounded probe in the refreshed connection', () => {
  const f = fixture(), permission = f.decision();
  assert.equal(f.prepare({ kind: 'observedAllowlist', activeOrigins: [fixtureOrigin], savedOrigins: [fixtureOrigin, origin] }).status, 'reloadRequired');
  assert.throws(() => recordBrowserAccess(f.root, f.probe(f.target, permission)), /active, bounded/);
  assert.throws(() => applyBrowserOrigin(f.root, { target: f.target, approval: permission, expectedSettingsRevision: '0'.repeat(64) }), /only updates existing project/);
  const reloaded = { ...f.target, generation: 'running-2' };
  assert.equal(f.prepare({ kind: 'observedAllowlist', activeOrigins: [fixtureOrigin, origin], savedOrigins: [fixtureOrigin, origin] }, reloaded).status, 'needsProbe');
  assert.equal(recordBrowserAccess(f.root, f.probe(reloaded, permission)).status, 'verified');
  assert.equal(assessBrowserAccess(f.root, f.target).status, 'needsConnectionCheck');
  assert.equal(f.prepare({ kind: 'observedAllowlist', activeOrigins: [fixtureOrigin, origin], savedOrigins: [fixtureOrigin, origin] }, reloaded).status, 'verified');
});

test('project origin apply preserves existing settings and requires a current exact authorized addition', () => {
  const f = fixture(), target = { ...f.target, tool: 'chromeDevtoolsCli' as const };
  const original: ChromeSettings = { schemaVersion: 1, source: 'Synthetic fixture', evidence: [f.source], visibility: 'headed', connection: { mode: 'launch', executablePath: process.execPath, profile: 'isolated' }, allowedOrigins: [fixtureOrigin], debuggingTools: false, javascriptEvaluation: true, usageStatistics: false, performanceCrux: false };
  f.put(settingsPath, original);
  const planned = f.prepare({ kind: 'projectChrome', activeSettingsHash: settingsHash(original) }, target);
  assert.equal(planned.status, 'missingOrigin');
  const request = { target, expectedSettingsRevision: planned.settingsRevision!, approval: f.decision(target) };
  const before = f.read(settingsPath);
  assert.throws(() => applyBrowserOrigin(f.root, { ...request, approval: f.decision(target, ['navigate']) }), /exact environment/);
  assert.throws(() => applyBrowserOrigin(f.root, { ...request, approval: f.decision(target, ['addOrigin'], 'https://other.example.test') }), /exact environment/);
  assert.equal(f.read(settingsPath), before);
  const edited = { ...original, javascriptEvaluation: false };
  const concurrent = f.put(settingsPath, edited);
  assert.throws(() => applyBrowserOrigin(f.root, request), /settings changed/);
  assert.equal(revision(f.root, settingsPath), concurrent.sha256);
  const applied = applyBrowserOrigin(f.root, { ...request, expectedSettingsRevision: concurrent.sha256 });
  assert.equal(applied.access.status, 'reloadRequired'); assert.equal(applied.changed, true);
  verifyEvidence(f.root, applied.delta!);
  const updated = { ...edited, allowedOrigins: [fixtureOrigin, origin], evidence: [f.source, request.approval] };
  assert.deepEqual(JSON.parse(f.read(settingsPath)), updated);
  const after = f.read(settingsPath);
  assert.equal(applyBrowserOrigin(f.root, request).changed, false); assert.equal(f.read(settingsPath), after);
  const reloaded = { ...target, generation: 'new-settings' };
  assert.equal(f.prepare({ kind: 'projectChrome', activeSettingsHash: settingsHash(updated) }, reloaded).status, 'needsProbe');
  assert.equal(recordBrowserAccess(f.root, f.probe(reloaded, request.approval)).status, 'verified');
});

test('an unknown scope, an HTTP response, or an outside-origin redirect cannot certify rendered target access', () => {
  const f = fixture();
  assert.equal(f.prepare({ kind: 'unknown' }).status, 'scopeUnverified');
  const observation = f.probe(f.target, f.decision());
  assert.throws(() => recordBrowserAccess(f.root, { ...observation, finalUrl: undefined, scopeEnforced: false }), /rendered target/);
  assert.throws(() => recordBrowserAccess(f.root, { ...observation, httpStatus: 403 }), /rendered target/);
  assert.throws(() => recordBrowserAccess(f.root, { ...observation, requestedUrl: origin + '/unrelated' }), /saved public entry page/);
  assert.throws(() => recordBrowserAccess(f.root, { ...observation, finalUrl: 'https://sso.example.test/' }), /approved origin/);
  assert.equal(recordBrowserAccess(f.root, { ...observation, outcome: 'redirectBlocked', finalUrl: 'https://sso.example.test/' }).status, 'redirectBlocked');
  const noList = { ...f.target, generation: 'different-browser', tool: 'inAppBrowser' as const };
  const unrestricted = f.prepare({ kind: 'noAllowlist' }, noList);
  assert.equal(unrestricted.status, 'needsProbe'); assert.equal(unrestricted.additionalOrigin, undefined);
  assert.equal(recordBrowserAccess(f.root, f.probe(noList, f.decision(noList))).status, 'verified');
});

test('invalid and wildcard origins are never proposed or prepared', () => {
  const f = fixture();
  const rejected = ['https://*.example.test/', 'https://user:pass@staging.example.test/', 'http://remote.example.test/', 'file:///private.txt'];
  for (const url of rejected) {
    f.put('.local/project.json', { ...f.project, environments: [{ name: 'staging', url }] });
    const targets = browserTargets(f.root);
    assert.equal(targets.length, 1); assert('issue' in targets[0]!); assert(!JSON.stringify(targets).includes(url));
    assert.throws(() => f.prepare({ kind: 'unknown' }));
  }
});

test('a changed target, connection or authorization invalidates only its matching proof', () => {
  const f = fixture();
  f.prepare({ kind: 'noAllowlist' });
  const permission = f.decision();
  const first = recordBrowserAccess(f.root, f.probe(f.target, permission));
  const preview = { ...f.target, environment: 'preview' }, previewUrl = 'https://preview.example.test/';
  f.prepare({ kind: 'noAllowlist' }, preview);
  assert.equal(recordBrowserAccess(f.root, { ...f.probe(preview, f.decision(preview, ['navigate'], 'https://preview.example.test'), previewUrl), finalUrl: previewUrl }).status, 'verified');
  assert.equal(assessBrowserAccess(f.root, { ...f.target, connection: 'synthetic:another' }).status, 'needsConnectionCheck');
  f.put('.local/project.json', { ...f.project, environments: [{ name: 'staging', url: origin + '/new-route' }, f.project.environments[1]] });
  assert.equal(assessBrowserAccess(f.root, f.target).status, 'needsConnectionCheck');
  assert.equal(assessBrowserAccess(f.root, preview).status, 'verified');
  verifyEvidence(f.root, first.observation!);
});

test('existing in-progress and completed onboarding retain decisions, mailbox and operating settings', () => {
  for (const completed of [false, true]) {
    const f = fixture();
    f.put('.local/context-settings.json', { route: 'combined', source: 'Synthetic context choice' });
    f.put('.local/operation-preferences.json', { mode: 'onDemand', source: 'Synthetic operating choice' });
    f.put('.local/email-connections.json', { schemaVersion: 1, bindings: [], history: [] });
    f.put('.local/verification-settings.json', { providerPreference: 'agentmail', mailboxPreference: 'fixture@example.test', aliasPolicy: 'synthetic existing preference' });
    const state = emptyState();
    for (const stage of stages) state.checks[stage] = { status: 'verified', evidence: [f.source], checkedAt: new Date().toISOString(), reason: null, nextAction: null };
    state.completed = completed;
    state.questions.push({ id: 'saved', stage: 'contextRoute', prompt: 'Synthetic prior question?', path: '.local/context-settings.json', required: true, status: 'answered', promptReferences: ['Synthetic'], answerReferences: [{ source: 'Synthetic', evidence: f.source }], clarificationHistory: [] });
    state.domains = (['business', 'product', 'technical', 'design', 'decisions'] as const).map(domain => ({ domain, state: 'documented', owner: 'Fixture owner', sources: [f.source] }));
    writeState(f.root, state, null);
    const preserved = ['.local/project.json', '.local/context-settings.json', '.local/operation-preferences.json', '.local/email-connections.json', '.local/verification-settings.json', '.local/onboarding-state.json'];
    const hashes = preserved.map(path => revision(f.root, path));
    const before = readiness(f.root, state);
    f.prepare({ kind: 'observedAllowlist', activeOrigins: [fixtureOrigin], savedOrigins: [fixtureOrigin] });
    const after = readiness(f.root, state);
    assert.equal(after.ready, before.ready); assert.deepEqual(after.issues, before.issues);
    assert(after.capabilityIssues.some(issue => issue.includes('Browser target staging')));
    assert.deepEqual(preserved.map(path => revision(f.root, path)), hashes);
  }
});

test('only the explicit targeted browser requirement needs this proof; independent API and legacy plans keep their status', () => {
  const f = fixture(), target = { ...f.target, tool: 'custom:fixture-browser' as const };
  for (const [tool, operation] of [[target.tool, 'navigate'], ['custom:fixture-http', 'request']] as const) {
    recordHost(f.root, { tool, source: 'Synthetic operation', available: true, accessible: true, compatible: true, version: '1', authentication: 'notRequired', connectionReference: target.connection, capabilities: { [operation]: { status: 'verified', evidence: [f.source] } } });
  }
  const { tool: _tool, ...access } = target;
  const plan: TaskToolPlan = { schemaVersion: 1, id: 'fixture', revision: '1', task: f.source, objective: 'Synthetic targeted browser and API', executionContext: 'interactive', requirements: [{ id: 'browser', browser: true, operations: ['navigate'], requiredTool: null, basis: [f.source], browserAccess: access }, { id: 'api', browser: false, operations: ['request'], requiredTool: null, basis: [f.source] }], selections: [{ requirementId: 'browser', tool: target.tool, rationale: 'Synthetic selection', limitations: [] }, { requirementId: 'api', tool: 'custom:fixture-http', rationale: 'Synthetic selection', limitations: [] }] };
  assert.deepEqual(assessTaskTools(f.root, plan).requirements.map(item => item.status), ['needsPreparation', 'capabilitiesVerified']);
  const legacy = { ...plan, requirements: plan.requirements.map(({ browserAccess: _access, ...requirement }) => requirement) };
  assert.equal(assessTaskTools(f.root, legacy).status, 'capabilitiesVerified');
  f.prepare({ kind: 'noAllowlist' }, target);
  recordBrowserAccess(f.root, f.probe(target, f.decision(target)));
  assert.equal(assessTaskTools(f.root, plan).status, 'capabilitiesVerified');
  plan.requirements[0]!.browserAccess = { ...access, generation: 'not-the-same-session' };
  assert.deepEqual(assessTaskTools(f.root, plan).requirements.map(item => item.status), ['needsPreparation', 'capabilitiesVerified']);
});
