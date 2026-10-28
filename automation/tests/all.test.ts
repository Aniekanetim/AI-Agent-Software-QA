import test from 'node:test';
import './toolchain.test.js';
import './email-aliases.test.js';
import './coverage.test.js';
import './flow-map.test.js';
import './documents.test.js';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { platform, arch } from 'node:os';
import * as s from '../shared/store.js';
import * as c from '../onboarding/conversation.js';
import { readState, readiness, stages } from '../onboarding/state.js';
import * as menu from '../settings/menu.js';
import * as mail from '../email/email.js';
import { AgentMailAdapter, GmailAdapter, htmlText } from '../email/adapters.js';
import * as gh from '../github/github.js';
import { artifact, expectedChecksum, archiveDirectory } from '../github/install.js';
import { validateReport, type BrowserReport } from '../browser/tools.js';
import { bindHarness } from '../tools/runtime.js';

function root() { const path = resolve('output/test-fixtures', randomUUID()); mkdirSync(path, { recursive: true }); return realpathSync(path); }
function put(r: string, path: string, value: unknown) { const file = s.contained(r, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return s.evidence(r, path); }
function question(id: string, path = '.local/project.json', pointer?: string) { return { id, stage: 'project' as const, prompt: `Synthetic decision ${id}?`, path, pointer, required: true }; }
function reply(r: string, id: string, values: Record<string, unknown>, path = '.local/project.json'): c.Reply {
  return { id, source: 'Synthetic reply fixture; not human approval', answers: Object.keys(values).map(key => ({ id: key, path, pointer: '/' + key, kind: 'answer' })), writes: [{ path, content: JSON.stringify(values), expectedSha256: s.revision(r, path), origin: 'human' }] };
}
test('safe persistence rejects traversal, stale revisions, secret fields and unsafe pointers', () => {
  const r = root(); assert.throws(() => s.contained(r, '../escape'));
  assert.throws(() => s.privatePath(r, 'public-state.json'));
  s.save(r, '.local/value.json', { version: 1 }, null);
  assert.throws(() => s.save(r, '.local/value.json', { version: 2 }, null));
  assert.throws(() => s.save(r, '.local/secret.json', { accessToken: 'synthetic' }, null));
  assert.throws(() => s.atPointer({}, '/__proto__'));
  put(r, '.local/broken.json', '{'); assert.throws(() => s.load(r, '.local/broken.json', () => ({})), /Preserve/);
});
test('evidence hashes track individual decisions without invalidating unrelated fields', () => {
  const r = root(); put(r, '.local/preferences.json', { browser: 'cli', timezone: 'UTC' }); const ref = s.evidence(r, '.local/preferences.json', '/browser');
  put(r, '.local/preferences.json', { browser: 'cli', timezone: 'Africa/Lagos' }); s.verifyEvidence(r, ref);
  put(r, '.local/preferences.json', { browser: 'inApp', timezone: 'UTC' }); assert.throws(() => s.verifyEvidence(r, ref));
});
test('focused conversation saves the whole clear reply and does not repeat asked questions', () => {
  const r = root(); c.queueQuestions(r, [question('name', undefined, '/name'), question('owner', undefined, '/owner')]);
  assert.equal(c.next(r).action, 'present'); assert.equal(c.next(r).action, 'verifyPresentation');
  c.acknowledge(r, 'name', 'Synthetic displayed question'); assert.equal(c.next(r).action, 'wait');
  c.commitReply(r, reply(r, 'reply-1', { name: 'Fixture', owner: 'Fixture owner' }));
  assert(readState(r).value.questions.every(q => q.status === 'answered'));
  assert.throws(() => c.commitReply(r, reply(r, 'reply-2', { name: 'Changed' })), /correction/);
  assert.throws(() => c.deferQuestion(r, 'owner', 'Synthetic defer'), /required/);
  c.pause(r, true, 'Synthetic pause'); assert.equal(c.next(r).action, 'paused'); c.pause(r, false, 'Synthetic resume');
  c.clarify(r, 'name', 'Which fixture name?', 'Synthetic clarification'); assert.equal(readState(r).value.questions[0]!.clarificationHistory.length, 1);
});
test('interrupted response recovers applied writes and preserves history exactly once', () => {
  const r = root(); c.queueQuestions(r, [question('name', undefined, '/name')]); const value = reply(r, 'interrupted', { name: 'Fixture' });
  assert.throws(() => c.commitReply(r, value, () => { throw new Error('Synthetic interruption'); }));
  assert.equal(c.next(r).action, 'recoverResponse'); c.recover(r); c.commitReply(r, value);
  assert.equal(readState(r).value.responses.length, 1); assert.equal(readState(r).value.questions[0]!.status, 'answered');
});
test('recovery refuses a newer edit and accepts an explicit merged comparison', () => {
  const r = root(); c.queueQuestions(r, [question('name', undefined, '/name')]); const value = reply(r, 'conflict', { name: 'Original' });
  assert.throws(() => c.commitReply(r, value, () => { throw new Error('Synthetic interruption'); }));
  put(r, '.local/project.json', { name: 'Newer', other: 'preserve' }); assert.throws(() => c.recover(r), /newer edit/);
  const merged = { ...value.writes[0]!, expectedSha256: s.revision(r, '.local/project.json'), content: JSON.stringify({ name: 'Merged', other: 'preserve' }) };
  c.reconcile(r, [merged], 'Synthetic actual comparison'); c.recover(r);
  assert.equal(JSON.parse(readFileSync(s.contained(r, '.local/project.json'), 'utf8')).other, 'preserve');
});
test('baseline edits require named human maintenance authority; discoveries cannot promote themselves', () => {
  const r = root(), path = 'Project Context/product/PRD.md'; c.queueQuestions(r, [question('baseline', path)]);
  const value: c.Reply = { id: 'baseline', source: 'Synthetic source', answers: [{ id: 'baseline', path, kind: 'answer' }], writes: [{ path, content: '# Synthetic human requirement', origin: 'agent', expectedSha256: null }] };
  assert.throws(() => c.commitReply(r, value), /baseline/);
  value.writes[0]!.origin = 'human'; value.baselineMaintenance = { source: 'Synthetic named-document maintenance grant', paths: [path] }; c.commitReply(r, value);
  assert(existsSync(s.contained(r, path)));
});
test('settings preserve current values and onboarding focus; cancel/close do not edit preferences', () => {
  const r = root(); put(r, '.local/browser-preferences.json', { method: 'cli', visibility: 'headed' }); c.queueQuestions(r, [question('name', undefined, '/name')]); c.next(r); c.acknowledge(r, 'name', 'Synthetic display');
  menu.openMenu(r, 'Synthetic open'); menu.chooseArea(r, '7'); const before = s.revision(r, '.local/browser-preferences.json');
  menu.startEdit(r, { id: 'browser-edit', file: '.local/browser-preferences.json', pointer: '/method', prompt: 'Choose a browser?', source: 'Synthetic change' });
  menu.presentEdit(r); c.acknowledge(r, 'browser-edit', 'Synthetic display'); menu.cancelEdit(r); menu.chooseArea(r, 'close');
  assert.equal(s.revision(r, '.local/browser-preferences.json'), before); assert.equal(c.next(r).action, 'wait');
});
test('settings save preserves unrelated fields and can recover a cleared answer focus', () => {
  const r = root(); put(r, '.local/browser-preferences.json', { method: 'cli', visibility: 'headed', source: 'Synthetic preference' }); menu.openMenu(r, 'Synthetic open'); menu.chooseArea(r, 'browser');
  menu.startEdit(r, { id: 'method', file: '.local/browser-preferences.json', pointer: '/method', prompt: 'Which browser?', source: 'Synthetic edit' });
  const value = reply(r, 'settings-reply', { method: 'inApp' }, '.local/browser-preferences.json');
  value.writes[0]!.content = JSON.stringify({ method: 'inApp', visibility: 'headed', source: 'Synthetic reply' }); c.commitReply(r, value);
  menu.presentEdit(r); assert.equal(menu.menuState(r).value.questionId, null); assert.equal(JSON.parse(readFileSync(s.contained(r, '.local/browser-preferences.json'), 'utf8')).visibility, 'headed');
});
test('readiness requires all five domains and evidence, not folders or booleans', () => {
  const r = root(); assert.equal(readiness(r, readState(r).value).ready, false);
  const ref = put(r, '.local/actual-source.md', '# Synthetic reviewed context; no product execution');
  c.recordDomains(r, ['business', 'product', 'technical', 'design', 'decisions'].map(domain => ({ domain: domain as any, state: 'gap' as const, owner: 'Fixture owner', sources: [ref], questionReference: 'Synthetic original question' })));
  assert.equal(readState(r).value.domains.length, 5); assert.throws(() => c.finish(r, ref), /incomplete/);
});
test('scoped onboarding completion revalidates actual sources and does not survive evidence changes', () => {
  const r = root(), ref = put(r, '.local/source.md', '# Synthetic scoped context and onboarding handoff evidence; this is a fixture, not a human approval or product result.');
  bindHarness(r, { id: 'synthetic-harness', version: '1', profile: 'test', executionContext: 'interactive', source: 'Synthetic harness setup' });
  put(r, '.local/project.json', { name: 'Fixture', environments: ['Synthetic'], owners: ['Fixture owner'], source: 'Synthetic actual reply reference' });
  put(r, '.local/context-settings.json', { route: 'provide', source: 'Synthetic choice' }); put(r, '.local/operation-preferences.json', { mode: 'onDemand', source: 'Synthetic choice' });
  for (const stage of stages.filter(s => s !== 'handoff')) c.recordCheck(r, stage, { status: 'verified', checkedAt: new Date().toISOString(), evidence: [ref], reason: null, nextAction: null });
  c.recordDomains(r, ['business', 'product', 'technical', 'design', 'decisions'].map(domain => ({ domain: domain as any, state: 'documented' as const, owner: 'Fixture owner', sources: [ref] })));
  c.finish(r, ref); assert.equal(c.next(r).action, 'complete');
  put(r, ref.path, '# Changed synthetic source'); assert.equal(readiness(r, readState(r).value).ready, false);
});
const account: mail.Account = { provider: 'gmail', accountId: 'qa@example.test', mailboxId: 'qa@example.test', address: 'qa@example.test', connectionReference: 'host:test-connection', authentication: 'connected' };
const inventory = (): mail.Inventory => ({ schemaVersion: 1, harness: 'Synthetic fixture', executionContext: 'interactive', source: 'Synthetic metadata observation', providers: [{ id: 'gmail', name: 'Gmail', available: true }], accounts: [account, { ...account, accountId: 'other@example.test', mailboxId: 'other@example.test', address: 'other@example.test' }] });
function binding(): mail.Binding { return { ...account, id: 'test', environment: 'Synthetic staging', transport: 'host', choiceSource: 'Synthetic mailbox choice', scope: {} }; }
function mailFixture(r: string) { mail.selectBinding(r, binding(), inventory()); const time = 1_800_000_000_000; const attempt = mail.beginVerification(r, 'test', account.address, 'service@example.test', 'Verification', 'Synthetic authorized attempt', 30_000, time); return { time, attempt }; }
function message(time: number): mail.Message { return { id: 'message', mailboxId: account.mailboxId, sentAt: new Date(time + 100).toISOString(), from: 'Service <service@example.test>', to: [account.address], subject: 'Verification code', text: 'Your synthetic code is 123456' }; }
test('provider availability does not choose an account or establish message access', async () => {
  const r = root(); assert.equal(mail.providerOptions(inventory())[0]!.accounts.length, 2);
  assert.throws(() => mail.selectBinding(r, { ...binding(), mailboxId: 'missing' }, inventory()));
  mail.selectBinding(r, binding(), inventory()); const ref = put(r, '.local/mail-scope.md', 'Synthetic permitted message check');
  const fake: mail.MailAdapter = { account: async () => account, list: async () => [{ ...message(Date.now()), id: 'message' }], read: async () => { throw new Error('Synthetic HTTP 403'); } };
  const checked = await mail.verifyBinding(r, 'test', fake, 'interactive', [ref]); assert.equal(checked.verification!.bodyReadAt, null);
  await assert.rejects(mail.verifyBinding(r, 'test', fake, 'interactive', [ref], 'message'), /403/);
  await assert.rejects(mail.verifyBinding(r, 'test', fake, 'interactive', [ref], 'out-of-scope'), /listing scope/);
  await assert.rejects(mail.verifyBinding(r, 'test', { ...fake, account: async () => ({ ...account, address: 'other@example.test' }) }, 'interactive', [ref]), /match/);
});
test('verification rejects stale, ambiguous and expired messages and never saves a code', async () => {
  const r = root(), { time, attempt } = mailFixture(r); const m = message(time);
  assert.equal(mail.matchingMessages([{ ...m, sentAt: new Date(time - 1).toISOString() }], attempt, time + 200).length, 0);
  const fake: mail.MailAdapter = { account: async () => account, list: async () => [m], read: async () => m };
  await assert.rejects(mail.pollVerification(r, attempt, { ...fake, list: async () => [m, { ...m, id: 'another' }] }, { timeoutMs: 0, now: () => time + 200 }), /Multiple/);
  const result = await mail.pollVerification(r, attempt, fake, { timeoutMs: 0, now: () => time + 200 }); assert.equal(result.secret, '123456');
  assert(!readFileSync(s.contained(r, `.local/verification/${attempt.id}-receipt.json`), 'utf8').includes('123456'));
  await assert.rejects(mail.pollVerification(r, attempt, fake, { timeoutMs: 0, now: () => time + 200 }), /already/);
  assert.throws(() => mail.matchingMessages([m], attempt, time + 31_000), /expired/);
});
test('verification rejects changed mailbox bindings and unapproved link hosts', async () => {
  const r = root(), { time, attempt } = mailFixture(r); const m = { ...message(time), text: 'https://wrong.example.test/verify' };
  const fake: mail.MailAdapter = { account: async () => account, list: async () => [m], read: async () => m };
  await assert.rejects(mail.pollVerification(r, attempt, fake, { timeoutMs: 0, now: () => time + 200, mode: 'link', linkHost: 'allowed.example.test' }), /unique link/);
  mail.selectBinding(r, { ...binding(), choiceSource: 'Synthetic later choice' }, inventory());
  await assert.rejects(mail.pollVerification(r, attempt, fake, { timeoutMs: 0, now: () => time + 200 }), /binding changed/);
});
test('Gmail metadata discovery reads only profile; HTML-only messages are parsed without hidden code', async () => {
  const calls: string[] = []; const raw = { id: 'm', internalDate: '1800000000000', payload: { mimeType: 'text/html', headers: [{ name: 'To', value: account.address }], body: { data: Buffer.from('<script>999999</script><p>Use 123456</p>').toString('base64url') } } };
  const fake = async (url: string | URL) => { calls.push(String(url)); return Response.json(String(url).endsWith('/profile') ? { emailAddress: account.address } : raw); };
  const adapter = new GmailAdapter('synthetic-token-in-memory', fake); await adapter.account(); assert.equal(calls.length, 1); assert(calls[0]!.endsWith('/profile'));
  const full = await adapter.read('m'); assert(full.text.includes('123456')); assert(!full.text.includes('999999'));
  assert.equal(htmlText('<p hidden>999999</p><a href="https://example.test/verify">Continue</a>'), 'Continue https://example.test/verify');
  await assert.rejects(new GmailAdapter('synthetic', async () => new Response('', { status: 403 })).read('m'), /HTTP 403/);
});
test('AgentMail paginates inbox metadata and refuses unsupported narrowing filters', async () => {
  let calls = 0; const fake = async (url: string | URL) => { calls++; return Response.json(String(url).includes('page_token=next') ? { inboxes: [{ inbox_id: 'two@example.test' }] } : { inboxes: [{ inbox_id: 'one@example.test' }], next_page_token: 'next' }); };
  const inboxes = await AgentMailAdapter.inboxes('synthetic', fake); assert.equal(inboxes.length, 2); assert.equal(calls, 2);
  const adapter = new AgentMailAdapter({ mailboxId: 'one@example.test', address: 'one@example.test', connectionReference: 'synthetic' }, 'synthetic', fake);
  await assert.rejects(adapter.list({ query: 'not-implemented' }), /does not implement/);
  await assert.rejects(AgentMailAdapter.createInbox('synthetic', { source: '', purpose: 'Fixture' }, fake), /requires/);
});
const rule: gh.RepositoryRule = { repository: 'fixture/product', branches: ['main'], labels: ['qa-ready'], includeDrafts: false, reporting: 'localOnly' };
function pr(head = 'a'.repeat(40)): gh.PullRequest { return { repository: rule.repository, number: 1, title: 'Synthetic PR', url: 'https://github.com/fixture/product/pull/1', head, base: 'main', labels: ['qa-ready'], draft: false, mergeCommit: null, fromFork: false }; }
function board(r: string) { for (const f of ['Ready for QA', 'Dev Todo', 'Retest', 'Rework', 'Tested-Ok']) mkdirSync(s.contained(r, `QA task management Board/${f}`), { recursive: true }); }
test('PR intake deduplicates events, preserves developer history and creates a new completed-revision assignment', () => {
  const r = root(); board(r); const first = gh.ingestPr(r, pr(), rule, 'Synthetic event'); assert.equal(first.action, 'created');
  assert.equal(gh.ingestPr(r, pr(), rule, 'Synthetic repeated event').action, 'unchanged');
  assert(readFileSync(s.contained(r, first.ticket!), 'utf8').includes('[QA Process Context](../../QA%20Process%20Context/README.md)'));
  assert(readFileSync(s.contained(r, first.ticket!), 'utf8').includes('[Application Flow Map](../../Application%20Flow%20Map/README.md)'));
  const path = first.ticket!; writeFileSync(s.contained(r, path), readFileSync(s.contained(r, path), 'utf8') + '\nDeveloper response: preserve this.\n');
  assert.equal(gh.ingestPr(r, pr('b'.repeat(40)), rule, 'Synthetic changed PR').action, 'updated'); assert(readFileSync(s.contained(r, path), 'utf8').includes('preserve this'));
  assert.equal(gh.ingestPr(r, pr(), rule, 'Synthetic force-push back to an earlier head').action, 'updated');
  renameSync(s.contained(r, path), s.contained(r, path.replace('/Ready for QA/', '/Tested-Ok/')));
  assert.equal(gh.ingestPr(r, pr('c'.repeat(40)), rule, 'Synthetic new revision').action, 'created');
  assert.equal(gh.ingestPr(r, { ...pr(), draft: true }, rule, 'Synthetic draft').action, 'ineligible');
});
function reviewedPolicy(r: string) {
  const suite = put(r, '.local/fixture-suite.txt', 'Synthetic suite fingerprint');
  const observation = { id: 'fixture-target', commit: pr().head, buildId: 'fixture-build', observedAt: new Date().toISOString(), source: 'Synthetic build observation' };
  const target: gh.ObservedTarget = { id: observation.id, commit: observation.commit, buildId: observation.buildId, evidence: put(r, '.local/target-observation.json', observation) };
  const policy: gh.RegressionPolicy = { schemaVersion: 1, id: 'fixture-policy', revision: '1', approval: { path: '.local/approval.json', sha256: '0'.repeat(64) }, repositories: [rule], allowForks: false, allowMergeCommit: false, suiteId: 'fixture-suite', suiteEvidence: [suite], command: { executable: process.execPath, args: ['-e', 'process.exit(0)'] }, timeoutMs: 1000, targetId: target.id, dispatch: { workflow: 'fixture.yml', ref: 'main' } };
  policy.approval = put(r, '.local/approval.json', { decision: 'Approved', reviewer: 'Synthetic fixture; not a human decision', source: 'Synthetic approval fixture', policyDigest: gh.policyDigest(policy) });
  return { policy, target };
}
test('regression authorization binds exact policy, suite and observed target identities', () => {
  const r = root(), { policy, target } = reviewedPolicy(r); assert.equal(gh.assertRegression(r, policy, pr(), target).length, 64);
  assert.throws(() => gh.assertRegression(r, { ...policy, allowForks: true }, pr(), target), /approval/);
  assert.throws(() => gh.assertRegression(r, policy, pr(), { ...target, commit: 'b'.repeat(40) }), /revision/);
  assert.throws(() => gh.assertRegression(r, policy, pr(), { ...target, buildId: 'forged' }), /observation/);
  assert.throws(() => gh.assertRegression(r, policy, pr(), { ...target, evidence: { ...target.evidence, pointer: '/id' } }), /full-record/);
  put(r, '.local/fixture-suite.txt', 'Changed assertions'); assert.throws(() => gh.assertRegression(r, policy, pr(), target), /evidence/);
});
test('a separately approved changed command gets its own regression key even if a revision label was reused', () => {
  const r = root(), { policy, target } = reviewedPolicy(r); const first = gh.assertRegression(r, policy, pr(), target);
  policy.command.args = ['-e', 'process.exit(1)']; policy.approval = put(r, '.local/approval.json', { decision: 'Approved', reviewer: 'Synthetic fixture', source: 'Synthetic changed-scope review', policyDigest: gh.policyDigest(policy) });
  assert.notEqual(gh.assertRegression(r, policy, pr(), target), first);
});
test('uncertain dispatch cannot be duplicated and local-only policy cannot publish comments', async () => {
  const r = root(), { policy, target } = reviewedPolicy(r); let calls = 0;
  await assert.rejects(gh.dispatchRegression(r, policy, pr(), target, async () => { calls++; throw new Error('Synthetic timeout'); }), /uncertain/);
  await assert.rejects(gh.dispatchRegression(r, policy, pr(), target, async () => { calls++; return ''; }), /already/); assert.equal(calls, 1);
  await assert.rejects(gh.publishComment(r, policy, pr(), target, '.local/report.md', async () => ''), /comments/);
  const r2 = root(), reviewed = reviewedPolicy(r2); let publications = 0;
  await gh.dispatchRegression(r2, reviewed.policy, pr(), reviewed.target, async () => { publications++; return 'Synthetic dispatch receipt'; });
  assert.equal((await gh.dispatchRegression(r2, reviewed.policy, pr(), reviewed.target, async () => { publications++; return ''; })).action, 'unchanged');
  reviewed.policy.repositories = [{ ...rule, reporting: 'comment' }]; reviewed.policy.approval = put(r2, '.local/approval.json', { decision: 'Approved', reviewer: 'Synthetic fixture', source: 'Synthetic report-scope approval', policyDigest: gh.policyDigest(reviewed.policy) });
  put(r2, '.local/report.md', '# Synthetic reviewed report; no live publication');
  assert.equal((await gh.publishComment(r2, reviewed.policy, pr(), reviewed.target, '.local/report.md', async () => { publications++; return 'Synthetic comment receipt'; })).action, 'published');
  assert.equal((await gh.publishComment(r2, reviewed.policy, pr(), reviewed.target, '.local/report.md', async () => { publications++; return ''; })).action, 'unchanged'); assert.equal(publications, 2);
});
test('regression records completed failures, preserves results per revision and blocks uncertain retries', async () => {
  const r = root(), { policy, target } = reviewedPolicy(r); let calls = 0;
  const run: gh.RegressionRunner = async (_command, options) => { calls++; assert.equal(options.env.QA_TESTED_COMMIT, target.commit); assert(options.env.QA_RESULT_DIR); throw { code: 1, killed: false }; };
  const first = await gh.executeRegression(r, policy, pr(), target, 'Synthetic policy-scoped execution', run); assert.equal(first.record.exitCode, 1); assert.equal(first.record.productVerdict, 'Not assessed');
  assert.equal((await gh.executeRegression(r, policy, pr(), target, 'Synthetic repeated event', run)).action, 'unchanged'); assert.equal(calls, 1);
  const r2 = root(), reviewed = reviewedPolicy(r2);
  await assert.rejects(gh.executeRegression(r2, reviewed.policy, pr(), reviewed.target, 'Synthetic process denial', async () => { throw { code: 'EPERM' }; }), /uncertain/);
  await assert.rejects(gh.executeRegression(r2, reviewed.policy, pr(), reviewed.target, 'Synthetic retry', run), /uncertain/);
});
test('browser connection reports require actual operations, evidence and machine/context match', () => {
  const r = root(), ref = put(r, '.local/browser-observation.md', 'Synthetic host capability evidence');
  const harness = bindHarness(r, { id: 'synthetic-host', version: '1', profile: 'fixture', executionContext: 'interactive', source: 'Synthetic actual-host identity' });
  const report: BrowserReport = { schemaVersion: 1, harness, provider: 'inApp', executionContext: 'interactive', visibility: 'hostManaged', root: r, platform: platform(), arch: arch(), nodeMajor: Number(process.versions.node.split('.')[0]), version: 'synthetic-host', checkedAt: new Date().toISOString(), operations: Object.fromEntries(['navigate', 'interact', 'inspect'].map(name => [name, { status: 'verified', evidence: [ref] }])) };
  assert.deepEqual(validateReport(r, report, 'interactive'), []); assert(validateReport(r, report, 'scheduled').length);
  put(r, ref.path, 'Changed evidence'); assert(validateReport(r, report, 'interactive').some(i => i.includes('changed')));
});
test('pinned GitHub CLI artifacts and checksum selection reject unsupported or unlisted downloads', () => {
  assert.equal(artifact('win32', 'x64'), 'gh_2.102.0_windows_amd64.zip'); assert.equal(artifact('linux', 'arm64'), 'gh_2.102.0_linux_arm64.tar.gz');
  assert.throws(() => artifact('freebsd', 'x64')); assert.equal(expectedChecksum('a'.repeat(64) + '  selected.zip\n', 'selected.zip'), 'a'.repeat(64)); assert.throws(() => expectedChecksum('not-a-checksum  selected.zip', 'selected.zip'));
  assert.equal(archiveDirectory('gh_2.102.0_windows_amd64.zip', ['LICENSE', 'bin/gh.exe']), 'gh_2.102.0_windows_amd64');
  assert.equal(archiveDirectory('gh_2.102.0_macOS_arm64.zip', ['gh_2.102.0_macOS_arm64/bin/gh']), '.');
  assert.throws(() => archiveDirectory('gh_2.102.0_windows_amd64.zip', ['../escape']));
});
