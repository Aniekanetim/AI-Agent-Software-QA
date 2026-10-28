import { readFileSync, realpathSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { platform, arch } from 'node:os';
import * as store from './shared/store.js';
import * as conversation from './onboarding/conversation.js';
import { readState, writeState, readiness, labels } from './onboarding/state.js';
import * as settings from './settings/menu.js';
import * as browser from './browser/tools.js';
import { startFixture } from './browser/fixture.js';
import * as email from './email/email.js';
import { mailboxPolicy } from './email/policy.js';
import { prepareTestAccount, readTestAccounts, type AccountRequest } from './email/accounts.js';
import { AgentMailAdapter, GmailAdapter } from './email/adapters.js';
import * as github from './github/github.js';
import { installGh } from './github/install.js';
import * as registry from './tools/registry.js';
import { bindHarness, currentHarness, readHarness, harnessKey, type ExecutionContext } from './tools/runtime.js';
import * as postman from './postman/postman.js';
import { assessCoverage, type CoverageSnapshot } from './coverage/coverage.js';
import { validateFlowMap, traceFlowMap, type FlowMapSnapshot, type Direction } from './flow-map/flow-map.js';

const args = process.argv.slice(2), options = new Map<string, string>();
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i]!.startsWith('--')) { const key = args[i]!.slice(2); const value = args[i + 1]; options.set(key, value && !value.startsWith('--') ? args[++i]! : 'true'); }
  else positional.push(args[i]!);
}
const root = realpathSync(resolve(options.get('root') ?? process.cwd()));
process.chdir(root);
const option = (name: string) => { const value = options.get(name); store.requireText(value, `--${name}`); return value; };
const input = <T>(): T => store.readInput<T>(root, option('input'));
const output = (value: unknown) => { store.assertNonsecret(value); process.stdout.write(JSON.stringify(value, null, 2) + '\n'); };
const fromFile = <T>(path: string): T => JSON.parse(readFileSync(store.contained(root, path), 'utf8')) as T;
const context = () => { const value = options.get('context') ?? 'interactive'; if (!['interactive', 'scheduled'].includes(value)) throw new Error('Use interactive or scheduled context.'); return value as 'interactive' | 'scheduled'; };
function adapter(binding: email.Binding): email.MailAdapter {
  if (binding.transport === 'gmailApi') return new GmailAdapter(process.env.GMAIL_ACCESS_TOKEN ?? '');
  if (binding.transport === 'agentmail') return new AgentMailAdapter(binding, process.env.AGENTMAIL_API_KEY ?? '');
  throw new Error('Host/human email requires the actual agent connector or human handoff; use HostMailAdapter in the host session.');
}
function selectedBinding(id: string) { const b = email.readConnections(root).value.bindings.find(b => b.id === id); if (!b) throw new Error('Select the actual mailbox first.'); return b; }
async function currentPr(repository: string, number: number) {
  const raw = JSON.parse(await github.runGh(['api', `repos/${repository}/pulls/${number}`])); return github.normalizePr(repository, raw);
}
const help = {
  'flow-map': 'validate --input | trace --input --features id,id [--direction upstream/downstream/both] [--max-depth 8] : read-only candidate impact; no test execution or approval',
  coverage: 'assess --input : read-only consistency/count check of a canonical-record snapshot; no execution, approval or product verdict',
  tools: 'bind --input | scan --source [--tool] | select --input | status --tool [--requires operation,operation] | import-host --input',
  postman: 'check --source | login-instructions | run --input : detects/reuses the CLI; local runs need no login; cloud operations need selected account/reporting scope',
  onboarding: 'start | roadmap-shown --source | status | next | queue --input | shown/not-shown --id --source | reply --input | recover | reconcile --input | pause/resume --source | clarify/defer --input | check/domains --input | finish --input',
  settings: 'open --source | show | choose --area | edit --input | present | save --input | cancel | back | close',
  browser: 'versions | install | mcp-config | check --provider library/cli/mcpServer [--headless] [--context interactive/scheduled/ci] | import-report --input | fixture',
  email: 'policy | account --input | accounts | options --input | discover --provider gmailApi/agentmail --source | create-inbox --input | select --input | verify --input | begin --input | outcome --input',
  github: 'install --source | check --repository | check-in --source | event --repository --number --source | policy-digest --policy | run/dispatch --policy --target --repository --number --source | comment --policy --target --repository --number --body --source',
  evidence: '--path [--pointer] : calculate an evidence reference; no product verdict is inferred',
  note: 'Use project-private JSON under .local/ for inputs. The agent presents questions and performs authorized host connections. CLI output is a model, not an actual human conversation or approval. See Onboarding/README.md.',
};
async function main() {
  const [area, action] = positional;
  if (!area || area === 'help') { output(help); return; }
  if (area === 'evidence') { output(store.evidence(root, option('path'), options.get('pointer'))); return; }
  if (area === 'flow-map') {
    const snapshot = input<FlowMapSnapshot>();
    if (action === 'validate') {
      const report = validateFlowMap(root, snapshot); output(report);
      if (report.status === 'needsReview') process.exitCode = 1;
    } else if (action === 'trace') {
      const report = traceFlowMap(root, snapshot, { features: option('features').split(','), direction: options.get('direction') as Direction | undefined,
        maxDepth: options.has('max-depth') ? Number(option('max-depth')) : undefined }); output(report);
      if (report.selectionStatus === 'needsReview') process.exitCode = 1;
    } else throw new Error('Use flow-map validate or trace.');
    return;
  }
  if (area === 'coverage') {
    if (action !== 'assess') throw new Error('Use coverage assess --input.');
    const assessment = assessCoverage(root, input<CoverageSnapshot>()); output(assessment);
    if (assessment.status === 'needsReview') process.exitCode = 1;
    return;
  }
  if (area === 'tools') {
    if (action === 'bind') output(bindHarness(root, input()));
    else if (action === 'scan') output(await registry.scan(root, option('source'), options.has('tool') ? [option('tool') as registry.NativeTool] : undefined));
    else if (action === 'select') {
      const v = input<{ tool: registry.NativeTool; executable: string; prefix?: string[]; source: string }>();
      output(await registry.probe(root, v.tool, v.source, registry.runProcess, registry.makeCommand(v.executable, v.prefix)));
    } else if (action === 'status') {
      const tool = option('tool') as registry.ToolId, required = (options.get('requires') ?? 'version').split(',');
      output(tool === 'postman' ? postman.status(root, required) : registry.status(root, tool, required));
    }
    else if (action === 'import-host') output(registry.recordHost(root, input()));
    else throw new Error('Unknown tools command.');
    return;
  }
  if (area === 'postman') {
    if (action === 'check') output(await postman.inspect(root, option('source')));
    else if (action === 'login-instructions') output(postman.loginInstructions(root));
    else if (action === 'run') { const result = await postman.runCollection(root, input()); output(result); if (result.outcome !== 'passed') process.exitCode = 1; }
    else throw new Error('Unknown Postman command.');
    return;
  }
  if (area === 'onboarding') {
    if (action === 'start') { output({ roadmap: labels, progress: readState(root).value, harness: readHarness(root), next: 'Inspect existing records. Bind the actual calling harness and discover/reuse tools before asking setup questions. Present the roadmap and register only missing decisions.' }); return; }
    if (action === 'status') { const state = readState(root).value; output({ state, readiness: readiness(root, state) }); return; }
    if (action === 'next') { output(conversation.next(root, options.get('repeat-source'))); return; }
    if (action === 'queue') conversation.queueQuestions(root, input());
    else if (action === 'shown' || action === 'not-shown') conversation.acknowledge(root, option('id'), option('source'), action === 'shown');
    else if (action === 'reply') conversation.commitReply(root, input());
    else if (action === 'recover') conversation.recover(root);
    else if (action === 'reconcile') { const v = input<{ writes: conversation.ProposedWrite[]; source: string }>(); conversation.reconcile(root, v.writes, v.source); }
    else if (action === 'pause' || action === 'resume') conversation.pause(root, action === 'pause', option('source'));
    else if (action === 'clarify') { const v = input<{ id: string; prompt: string; source: string }>(); conversation.clarify(root, v.id, v.prompt, v.source); }
    else if (action === 'defer') { const v = input<{ id: string; source: string }>(); conversation.deferQuestion(root, v.id, v.source); }
    else if (action === 'roadmap-shown') { const source = option('source'); const current = readState(root); current.value.roadmapShown = true; current.value.roadmapSource = source; writeState(root, current.value, current.revision); }
    else if (action === 'check') { const v = input<{ stage: Parameters<typeof conversation.recordCheck>[1]; check: Parameters<typeof conversation.recordCheck>[2] }>(); conversation.recordCheck(root, v.stage, v.check); }
    else if (action === 'domains') conversation.recordDomains(root, input());
    else if (action === 'finish') conversation.finish(root, input());
    else throw new Error('Unknown onboarding command. Run help.');
    output({ saved: true, next: conversation.next(root) }); return;
  }
  if (area === 'settings') {
    let value: unknown;
    if (action === 'open') value = settings.openMenu(root, option('source'));
    else if (action === 'show') value = settings.showMenu(root);
    else if (action === 'choose') value = settings.chooseArea(root, option('area'));
    else if (action === 'edit') value = settings.startEdit(root, input());
    else if (action === 'present') value = settings.presentEdit(root);
    else if (action === 'save') value = settings.saveEdit(root, input());
    else if (action === 'cancel' || action === 'back') value = settings.cancelEdit(root, action === 'back');
    else if (action === 'close') { settings.closeMenu(root); value = settings.showMenu(root); }
    else throw new Error('Unknown settings command.');
    output(value); return;
  }
  if (area === 'browser') {
    const browserContext = (): ExecutionContext => { const value = options.get('context') ?? currentHarness(root).executionContext; if (!['interactive', 'scheduled', 'ci'].includes(value)) throw new Error('Use interactive, scheduled or ci context.'); return value as ExecutionContext; };
    if (action === 'versions') output(browser.versions(root));
    else if (action === 'install') { await browser.installBrowsers(root); output({ installed: true, next: 'Run the selected actual capability rehearsal. Installation is not browser or host-connection verification.' }); }
    else if (action === 'mcp-config') output(browser.mcpConfiguration(root));
    else if (action === 'check') { const provider = option('provider'); if (!['library', 'cli', 'mcpServer'].includes(provider)) throw new Error('Rehearse library, cli or mcpServer; native host tools require actual host observation.'); output(await browser.rehearse(root, provider as 'library' | 'cli' | 'mcpServer', options.has('headless'), browserContext())); }
    else if (action === 'import-report') {
      const report = input<browser.BrowserReport>(); if (!['inApp', 'harnessMcp'].includes(report.provider)) throw new Error('Only actual native-connection reports may be imported.');
      const issues = browser.validateReport(root, report, browserContext()); if (issues.length) throw new Error(issues.join('; '));
      const path = `.local/browser-reports/${report.provider}-${browserContext()}.json`; store.save(root, path, report, store.revision(root, path));
      store.save(root, `.local/browser-reports/history/${harnessKey(report.harness!)}/${report.provider}-${Date.now()}.json`, report, null);
      registry.recordHost(root, { tool: report.provider === 'inApp' ? 'inAppBrowser' : 'harnessMcp', source: 'Actual host browser report', connectionReference: report.harness!.source, version: report.version, available: true, accessible: true, compatible: true, authentication: 'notRequired', capabilities: report.operations });
      output({ saved: path });
    }
    else if (action === 'fixture') {
      const fixture = await startFixture(); const file = store.contained(root, '.local/rehearsal/synthetic.txt'); mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, 'Synthetic QA capability check only.');
      output({ synthetic: true, url: fixture.url, attachment: file, expiresInMinutes: 5, next: 'Use the chosen host browser to fill Name, attach this file, Save draft and reopen the same draft URL. Record actual tool calls and outcomes, then import its capability report.' });
      await new Promise<void>(done => { const timer = setTimeout(done, 300_000); process.once('SIGTERM', () => { clearTimeout(timer); done(); }); process.once('SIGINT', () => { clearTimeout(timer); done(); }); }); await fixture.close();
    } else throw new Error('Unknown browser command.');
    return;
  }
  if (area === 'email') {
    if (action === 'policy') output(mailboxPolicy);
    else if (action === 'account') output(prepareTestAccount(root, input<AccountRequest>()));
    else if (action === 'accounts') output(readTestAccounts(root).value);
    else if (action === 'options') output(email.providerOptions(input()));
    else if (action === 'create-inbox') { const v = input<{ source: string; purpose: string }>(); const inbox = await AgentMailAdapter.createInbox(process.env.AGENTMAIL_API_KEY ?? '', v); output({ inbox, next: 'Refresh AgentMail inbox metadata and ask for mailbox selection; creating it does not select or authorize testing it.' }); }
    else if (action === 'discover') {
      const provider = option('provider'); const source = option('source'); let accounts: email.Account[];
      if (provider === 'gmailApi') accounts = [await new GmailAdapter(process.env.GMAIL_ACCESS_TOKEN ?? '').account()];
      else if (provider === 'agentmail') accounts = await AgentMailAdapter.inboxes(process.env.AGENTMAIL_API_KEY ?? '');
      else throw new Error('Inspect actual host integration/account metadata for native connectors; direct discovery supports gmailApi or agentmail.');
      const inventory: email.Inventory = { schemaVersion: 1, harness: 'directApi', executionContext: context(), source, providers: [{ id: provider === 'gmailApi' ? 'gmail' : 'agentmail', name: provider, available: true }], accounts };
      const path = '.local/email-inventory.json'; store.save(root, path, inventory, store.revision(root, path)); output({ inventory, next: 'Present available account addresses and ask for an actual mailbox selection. No message bodies were read.' });
    } else if (action === 'select') { const v = input<{ binding: email.Binding; inventory: email.Inventory }>(); email.selectBinding(root, v.binding, v.inventory); output({ saved: true, next: 'Verify the required selected-mailbox access.' }); }
    else if (action === 'verify') { const v = input<{ bindingId: string; evidence: store.Evidence[]; messageId?: string }>(); const b = selectedBinding(v.bindingId); const verified = await email.verifyBinding(root, b.id, adapter(b), context(), v.evidence, v.messageId); output({ id: verified.id, verification: verified.verification }); }
    else if (action === 'begin') { const v = input<{ bindingId: string; recipient: string; sender: string; subjectContains: string; source: string; durationMs?: number }>(); output(email.beginVerification(root, v.bindingId, v.recipient, v.sender, v.subjectContains, v.source, v.durationMs)); }
    else if (action === 'outcome') { const v = input<{ attemptId: string; outcome: 'verified' | 'failed' | 'blocked'; evidence: store.Evidence[]; source: string }>(); email.confirmApplication(root, v.attemptId, v.outcome, v.evidence, v.source); output({ saved: true }); }
    else throw new Error('Unknown email command. OTP/link retrieval is an in-memory adapter API, never terminal output. See automation/email/README.md.');
    return;
  }
  if (area === 'github') {
    if (action === 'install') { output(await installGh(root, option('source'))); return; }
    if (action === 'check') {
      const access = await github.inspectConnection(option('repository')); const path = `.local/github-access/${access.repository.replace('/', '--')}.json`;
      store.save(root, path, { ...access, root, harness: currentHarness(root) }, store.revision(root, path));
      const record = await registry.probe(root, 'github', options.get('source') ?? 'Actual GitHub identity/repository check');
      if (record.compatible) { record.authentication = 'connected'; record.account = access.account; record.capabilities[`repository:${access.repository.toLowerCase()}`] = { status: 'verified', evidence: [store.evidence(root, path)] }; registry.saveRecord(root, record); }
      output(access); return;
    }
    if (action === 'policy-digest') { output({ policyDigest: github.policyDigest(fromFile(option('policy'))) }); return; }
    const configuration = fromFile<github.GithubSettings>('.local/github-settings.json'); github.validateSettings(configuration);
    const source = option('source');
    if (action === 'check-in' || action === 'event') {
      const results = [];
      for (const rule of configuration.repositories.filter(r => action === 'check-in' || r.repository === option('repository'))) {
        const access = await github.inspectConnection(rule.repository); if (access.account !== configuration.account) throw new Error('GitHub is authenticated as a different account.');
        const prs = action === 'event' ? [await currentPr(rule.repository, Number(option('number')))] : await github.listPrs(rule.repository);
        for (const pr of prs) results.push(github.ingestPr(root, pr, rule, source));
      }
      output({ results, next: 'Intake does not execute tests. Follow the task workflow or an applicable reviewed regression policy.' }); return;
    }
    const repository = option('repository'); if (!configuration.repositories.some(r => r.repository === repository)) throw new Error('This repository was not selected.');
    const pr = await currentPr(repository, Number(option('number'))), policy = fromFile<github.RegressionPolicy>(option('policy')), target = fromFile<github.ObservedTarget>(option('target'));
    const access = await github.inspectConnection(repository); if (access.account !== configuration.account) throw new Error('GitHub is authenticated as a different account.');
    if (action === 'run') output(await github.executeRegression(root, policy, pr, target, source));
    else if (action === 'dispatch') output(await github.dispatchRegression(root, policy, pr, target));
    else if (action === 'comment') output(await github.publishComment(root, policy, pr, target, option('body')));
    else throw new Error('Unknown GitHub command.');
    return;
  }
  throw new Error('Unknown command. Run npm run qa -- help.');
}
main().catch(error => {
  const message = error instanceof Error ? error.message : 'Operation failed; inspect retained state.';
  try { store.assertNonsecret(message); process.stderr.write(message + '\n'); } catch { process.stderr.write('Operation failed; sensitive details suppressed.\n'); }
  process.exitCode = 1;
});
