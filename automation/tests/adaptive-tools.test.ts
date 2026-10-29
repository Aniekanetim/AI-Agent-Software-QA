import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { platform, arch } from 'node:os';
import { evidence, type Evidence } from '../shared/store.js';
import { bindHarness } from '../tools/runtime.js';
import { recordHost, readRecord } from '../tools/registry.js';
import { assessTaskTools, type TaskToolPlan } from '../tools/task.js';
import { emptyState, readiness, stages, readState } from '../onboarding/state.js';
import { queueQuestions, retireToolQuestions, commitReply, recover } from '../onboarding/conversation.js';
import type { BrowserReport } from '../browser/tools.js';

function fixture() {
  const root = resolve('.local/adaptive-fixtures', randomUUID()); mkdirSync(root, { recursive: true });
  const put = (file: string, value: unknown): Evidence => { mkdirSync(resolve(root, file, '..'), { recursive: true }); writeFileSync(resolve(root, file), typeof value === 'string' ? value : JSON.stringify(value)); return evidence(root, file); };
  const harness = bindHarness(root, { id: 'synthetic-host', version: '1', profile: 'fixture', executionContext: 'interactive', source: 'Synthetic harness only' });
  const source = put('.local/task.md', '# Synthetic task, constraints and operation evidence only; no human authorization or product execution.');
  const plan: TaskToolPlan = { schemaVersion: 1, id: 'SYNTHETIC-TASK', revision: '1', task: source, objective: 'Synthetic UI flow', executionContext: 'interactive', requirements: [{ id: 'UI', browser: true, operations: ['navigate', 'interact', 'inspect'], requiredTool: null, basis: [source] }], selections: [{ requirementId: 'UI', tool: 'inAppBrowser', rationale: 'Synthetic native interaction and evidence fit', limitations: [] }] };
  function browser(visibility: BrowserReport['visibility'] = 'headed') {
    const operations = Object.fromEntries(['navigate', 'interact', 'inspect'].map(op => [op, { status: 'verified' as const, evidence: [source] }]));
    recordHost(root, { tool: 'inAppBrowser', source: 'Synthetic actual-operation fixture', available: true, accessible: true, compatible: true, version: 'host-1', authentication: 'connected', connectionReference: 'synthetic:browser', capabilities: operations });
    const report: BrowserReport = { schemaVersion: 1, provider: 'inApp', executionContext: 'interactive', visibility, root, platform: platform(), arch: arch(), nodeMajor: Number(process.versions.node.split('.')[0]), version: 'host-1', checkedAt: new Date().toISOString(), harness, operations };
    put('.local/browser-reports/inApp-interactive.json', report); return report;
  }
  function custom() { recordHost(root, { tool: 'custom:http-client', source: 'Synthetic external tool operation', available: true, accessible: true, compatible: true, version: '1', authentication: 'notRequired', connectionReference: 'synthetic:terminal-operation', capabilities: { request: { status: 'verified', evidence: [source] } } }); }
  return { root, put, source, harness, plan, browser, custom };
}
test('native browser work does not require Playwright or Postman installation/selection', () => {
  const f = fixture(); f.browser(); const report = assessTaskTools(f.root, f.plan);
  assert.equal(report.status, 'capabilitiesVerified'); assert.equal(report.productVerdict, 'Not assessed'); assert.equal(report.authorization, 'Not established by this assessment');
  assert.equal(readRecord(f.root, 'playwrightCli'), null); assert.equal(readRecord(f.root, 'postman'), null);
});
test('task selects another accessible tool and may combine browser and API methods', () => {
  const f = fixture(); f.browser(); f.custom();
  f.plan.requirements.push({ id: 'API', browser: false, operations: ['request'], requiredTool: null, basis: [f.source] });
  f.plan.selections.push({ requirementId: 'API', tool: 'custom:http-client', rationale: 'Synthetic contract operation', limitations: ['Target authentication checked separately'] });
  assert.equal(assessTaskTools(f.root, f.plan).status, 'capabilitiesVerified');
  f.plan.requirements.shift(); f.plan.selections.shift(); assert.equal(assessTaskTools(f.root, f.plan).status, 'capabilitiesVerified');
});
test('an explicit task tool requirement cannot be silently substituted', () => {
  const f = fixture(); f.browser(); f.plan.requirements[0]!.requiredTool = 'postman';
  const report = assessTaskTools(f.root, f.plan); assert.equal(report.status, 'needsPreparation'); assert(report.requirements[0]!.issues.some(i => i.includes('explicitly requires')));
});
test('agent-selected methods respect allowed/prohibited tools and source freshness', () => {
  const f = fixture(); f.browser();
  f.put('.local/tool-policy.json', { schemaVersion: 1, selection: 'agent', source: 'Synthetic constraint', evidence: [f.source], visibility: 'any', allowedTools: null, prohibitedTools: ['inAppBrowser'] });
  assert(assessTaskTools(f.root, f.plan).requirements[0]!.issues.some(i => i.includes('constraints')));
  f.put('.local/task.md', '# Changed synthetic scope'); assert(assessTaskTools(f.root, f.plan).globalIssues.length > 0);
});
test('a sourced tool whitelist and a visibility constraint apply only to their actual scope', () => {
  const f = fixture(); f.custom(); f.plan.requirements = [{ id: 'API', browser: false, operations: ['request'], requiredTool: null, basis: [f.source] }];
  f.plan.selections = [{ requirementId: 'API', tool: 'custom:http-client', rationale: 'Synthetic API operation', limitations: [] }];
  f.put('.local/browser-preferences.json', '{ broken legacy browser configuration');
  assert.equal(assessTaskTools(f.root, f.plan).status, 'capabilitiesVerified');
  f.put('.local/tool-policy.json', { schemaVersion: 1, selection: 'agent', source: 'Synthetic whitelist', evidence: [f.source], visibility: 'headed', allowedTools: ['postman'], prohibitedTools: [] });
  assert(assessTaskTools(f.root, f.plan).requirements[0]!.issues.some(i => i.includes('constraints')));
});
test('legacy visibility survives while a historical method does not force tool selection', () => {
  const f = fixture(); f.browser();
  const legacy = f.put('.local/browser-preferences.json', { method: 'cli', visibility: 'headed', fallback: null, source: 'Synthetic earlier preference' });
  assert.equal(assessTaskTools(f.root, f.plan).status, 'capabilitiesVerified');
  f.browser('headless'); assert(assessTaskTools(f.root, f.plan).requirements[0]!.issues.some(i => i.includes('visibility')));
  assert.equal(evidence(f.root, legacy.path).sha256, legacy.sha256);
});
test('additional browser tools can prove visibility and legacy mailbox names remain compatible', () => {
  const f = fixture();
  recordHost(f.root, { tool: 'custom:browser', source: 'Synthetic observed browser fixture', available: true, accessible: true, compatible: true, version: '1', authentication: 'notRequired', connectionReference: 'synthetic:browser', capabilities: Object.fromEntries(['navigate', 'interact', 'inspect', 'visibility:headed'].map(op => [op, { status: 'verified' as const, evidence: [f.source] }])) });
  f.plan.selections[0]!.tool = 'custom:browser'; f.put('.local/tool-policy.json', { schemaVersion: 1, selection: 'agent', source: 'Synthetic visibility constraint', evidence: [f.source], visibility: 'headed', allowedTools: null, prohibitedTools: [] });
  assert.equal(assessTaskTools(f.root, f.plan).status, 'capabilitiesVerified');
  recordHost(f.root, { tool: 'email:Shared QA inbox', source: 'Synthetic preexisting mailbox name', available: true, accessible: true, compatible: true, version: 'host', authentication: 'connected', connectionReference: 'synthetic:mail', capabilities: { listMessages: { status: 'verified', evidence: [f.source] } } });
  assert(readRecord(f.root, 'email:Shared QA inbox'));
});
test('task context and selected operation evidence cannot be replaced by another harness or stale evidence', () => {
  const f = fixture(); f.browser(); f.plan.executionContext = 'scheduled'; assert.equal(assessTaskTools(f.root, f.plan).status, 'needsPreparation');
  f.plan.executionContext = 'interactive'; f.put('.local/task.md', '# Stale operation/source'); assert.equal(assessTaskTools(f.root, f.plan).status, 'needsPreparation');
});
test('missing selections and unsupported operation claims remain preparation gaps', () => {
  const f = fixture(); f.browser(); f.plan.requirements[0]!.operations.push('upload');
  assert(assessTaskTools(f.root, f.plan).requirements[0]!.issues.some(i => i.includes('upload')));
  f.plan.selections = []; assert.equal(assessTaskTools(f.root, f.plan).status, 'needsPreparation');
});
test('invalid and duplicate selection bindings, schemas and secret-bearing records are rejected', () => {
  const f = fixture(); assert.throws(() => assessTaskTools(f.root, { ...f.plan, schemaVersion: 2 } as any));
  assert.throws(() => assessTaskTools(f.root, { ...f.plan, selections: [...f.plan.selections, ...f.plan.selections] }));
  assert.throws(() => assessTaskTools(f.root, { ...f.plan, selections: [{ ...f.plan.selections[0]!, requirementId: 'MISSING' }] }));
  assert.throws(() => assessTaskTools(f.root, { ...f.plan, password: 'synthetic' } as any));
});
test('project readiness retains optional capability gaps without globally blocking an independent task', () => {
  const f = fixture(); f.browser(); f.put('.local/project.json', { name: 'Synthetic', environments: ['Synthetic'], owners: ['Fixture owner'], source: 'Synthetic source' });
  f.put('.local/context-settings.json', { route: 'combined', source: 'Synthetic choice' }); f.put('.local/operation-preferences.json', { mode: 'onDemand', source: 'Synthetic choice' });
  f.put('.local/browser-preferences.json', { method: 'cli', visibility: 'headed', fallback: null, source: 'Synthetic historical choice' });
  f.put('.local/postman-settings.json', { schemaVersion: 1, mode: 'local', reporting: 'localOnly', region: 'us', credential: 'session', accountId: null, collections: [], environments: [], source: 'Synthetic optional Postman' });
  const state = emptyState(); for (const stage of stages) state.checks[stage] = { status: 'verified', evidence: [f.source], checkedAt: new Date().toISOString(), reason: null, nextAction: null };
  state.domains = ['business', 'product', 'technical', 'design', 'decisions'].map(domain => ({ domain: domain as any, owner: 'Fixture owner', state: 'documented', sources: [f.source] }));
  const result = readiness(f.root, state); assert.equal(result.ready, true); assert(result.capabilityIssues.length > 0); assert.equal(assessTaskTools(f.root, f.plan).status, 'capabilitiesVerified');
  f.plan.requirements[0]!.requiredTool = 'postman'; assert.equal(assessTaskTools(f.root, f.plan).status, 'needsPreparation');
});
test('corrupt optional configuration stays visible without hiding independent verified capabilities', () => {
  const f = fixture(); f.browser(); f.put('.local/postman-settings.json', '{ broken json');
  assert.equal(assessTaskTools(f.root, f.plan).status, 'capabilitiesVerified');
  const result = readiness(f.root, emptyState()); assert(result.capabilityIssues.some(i => i.includes('Postman')));
});
test('retiring obsolete method questions preserves history, answers and visibility questions', () => {
  const f = fixture(); queueQuestions(f.root, ['method', 'visibility'].map(id => ({ id, stage: 'tools', path: '.local/browser-preferences.json', pointer: '/' + id, prompt: 'Synthetic ' + id, required: true })));
  retireToolQuestions(f.root, { ids: ['method'], source: 'Synthetic reviewed migration' }); retireToolQuestions(f.root, { ids: ['method'], source: 'Synthetic repeated migration' });
  const state = readState(f.root).value; assert.equal(state.questions[0]!.status, 'canceled'); assert.equal(state.questions[0]!.required, false); assert.equal(state.questions[0]!.clarificationHistory.length, 1); assert.equal(state.questions[1]!.status, 'queued');
  assert.throws(() => retireToolQuestions(f.root, { ids: ['visibility'], source: 'Synthetic invalid migration' }));
});
test('answered legacy choices and interrupted replies cannot be retired or lost', () => {
  const f = fixture(); queueQuestions(f.root, [{ id: 'method', stage: 'tools', path: '.local/browser-preferences.json', pointer: '/method', prompt: 'Synthetic old choice', required: true }]);
  const reply = { id: 'synthetic-reply', source: 'Synthetic response', answers: [{ id: 'method', path: '.local/browser-preferences.json', pointer: '/method', kind: 'answer' as const }], writes: [{ path: '.local/browser-preferences.json', expectedSha256: null, content: JSON.stringify({ method: 'cli', visibility: 'headed', fallback: null, source: 'Synthetic earlier choice' }), origin: 'human' as const }] };
  assert.throws(() => commitReply(f.root, reply, () => { throw new Error('Synthetic interruption'); }));
  assert.throws(() => retireToolQuestions(f.root, { ids: ['method'], source: 'Synthetic migration' }), /Recover/);
  recover(f.root); assert.throws(() => retireToolQuestions(f.root, { ids: ['method'], source: 'Synthetic migration' }), /unanswered/);
  assert.equal(readState(f.root).value.questions[0]!.answerReferences[0]!.source, reply.source);
});
test('task assessment is read-only and preserves earlier onboarding and source bytes', () => {
  const f = fixture(); f.browser(); f.put('.local/onboarding-state.json', emptyState()); const before = readFileSync(resolve(f.root, '.local/onboarding-state.json'));
  const input = f.put('.local/task-tools.json', f.plan); const one = assessTaskTools(f.root, f.plan); assert.deepEqual(assessTaskTools(f.root, f.plan), one);
  assert.deepEqual(readFileSync(resolve(f.root, '.local/onboarding-state.json')), before); assert.equal(evidence(f.root, input.path).sha256, input.sha256);
});
