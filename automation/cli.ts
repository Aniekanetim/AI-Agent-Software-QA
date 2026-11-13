import { readFileSync, realpathSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { platform, arch } from 'node:os';
import * as store from './shared/store.js';
import * as conversation from './onboarding/conversation.js';
import { readState, writeState, readiness, labels } from './onboarding/state.js';
import * as settings from './settings/menu.js';
import * as browser from './browser/tools.js';
import * as browserAccess from './browser/access.js';
import { startFixture } from './browser/fixture.js';
import * as email from './email/email.js';
import { planEmail, type EmailPlanRequest } from './email/planning.js';
import { mailboxPolicy } from './email/policy.js';
import { prepareTestAccount, readTestAccounts, type AccountRequest } from './email/accounts.js';
import { AgentMailAdapter, GmailAdapter } from './email/adapters.js';
import * as github from './github/github.js';
import { installGh } from './github/install.js';
import * as board from './board/board.js';
import * as taskSource from './task-source/work.js';
import { activeSource, providers as taskProviders, requireLocalSource } from './task-source/config.js';
import { linearOAuthVariable, tokenVariables } from './task-source/provider.js';
import * as attentionPreferences from './attention/preferences.js';
import * as blockers from './attention/blockers.js';
import * as attention from './attention/notifications.js';
import * as registry from './tools/registry.js';
import { bindHarness, currentHarness, readHarness, harnessKey, type ExecutionContext } from './tools/runtime.js';
import * as postman from './postman/postman.js';
import { assessCoverage, type CoverageSnapshot } from './coverage/coverage.js';
import { browseLibrary } from './release/library.js';
import { assessRound, recordAssessment, retainRun, retainedRuns, verifyAssessment } from './release/round.js';
import { handoffRoute, reportingPreference } from './release/handoff.js';
import { invalidateReleaseScope, releaseScope } from './release/scope.js';
import { approveFixPlan, fixStatus, recordFixReview, registerFix, retainFixResults } from './regression/fix.js';
import { validateFlowMap, traceFlowMap, type FlowMapSnapshot, type Direction } from './flow-map/flow-map.js';
import { assessTaskTools, assessLiveTaskTools, type TaskToolPlan } from './tools/task.js';
import { assessData, type DataPreparation } from './data/preparation.js';
import { datasetDirectory, inspectDatasets, type DatasetIndex } from './data/datasets.js';
import { preflightLocalData, prepareLocalCase } from './data/local.js';
import * as caseExecution from './execution/cases.js';
import { inspectSource, type SourceFormat } from './data/source-inspection.js';
import { dataStatus, listIntake, noteCandidate, previewIntake, registerIntake, type CandidateRequest, type IntakeRequest } from './data/intake.js';
import * as chromeConfig from './chrome-devtools/config.js';
import * as chromeTransport from './chrome-devtools/transport.js';
import * as webmcp from './chrome-devtools/webmcp.js';
import { rehearseChrome } from './chrome-devtools/rehearsal.js';

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
  cases: 'validate --input | start --input | next --input | observe --input | status --id | finish --id',
  regression: 'register --input | approve-plan --input | status --fix | retain-results --input | record-review --input | release --input',
  release: 'library --input | scope --input | preview-scope --input | bind-scope --input | invalidate-scope --input | retain-run --input | runs --input | assess --input | record-assessment --input | verify-assessment --input | route [--ticket-url]',
  attention: 'status | proposal/configure --input | record --input | list --recipient [--offset N --limit N --snapshot hash --all] | index | update-index --input | preview --recipient --notifier [--at ISO] | reserve --input | preflight --id --notifier | receipt --input | respond --input : optional blocker reminders; no task execution, lifecycle move or approval',
  'task-source': 'status | providers | inspect --input | preview --input | save --input | check-in | details --ticket | claim --input | history --claim | recheck --claim | preflight --input | begin --input | settle --input | publication-preview --input | publish --input | reconcile-publication --input | observe-completion --input | close --input',
  board: 'status [--ticket ID] | upgrade --source | transition --input | recover --id | reviews [--at ISO] [--trigger key] | acknowledge-review --input | assert-executable --ticket ID [--generation ID] | operations --ticket ID | settle-operation --input : lifecycle controls preserve actual human decisions; no test authorization',
  'flow-map': 'validate --input | trace --input --features id,id [--direction upstream/downstream/both] [--max-depth 8] : read-only candidate impact; no test execution or approval',
  coverage: 'assess --input : read-only consistency/count check of a canonical-record snapshot; no execution, approval or product verdict',
  tools: 'bind --input | scan --source [--tool] | select --input | status --tool [--requires operation,operation] | import-host --input | assess-task --input [--claim ID] : read-only assessment of agent-selected capabilities',
  data: 'status [--input] | inventory [--input] | assess --input | preflight --input | intake-inspect --file [--format] [--table N] [--from-line N] [--through-line N] | intake-note --input | intake-preview --input | intake-register --input --preview-sha256 --review-source | intake-list',
  chrome: 'check --source | mcp-config | rehearse --provider cli/mcpServer [--headless] [--executable path] | session-start --input | page --input | inventory --input | import-host-inventory --input | case-input-digest --input | execute --input | confirm --input | session-stop --id : explicit scoped WebMCP operations; no implicit product authorization',
  postman: 'check --source | login-instructions | case-input-digest --input | run --input | run-status --id : detects/reuses the CLI; local runs need no login; cloud operations need selected account/reporting scope',
  onboarding: 'start | roadmap-shown --source | status | next | queue --input | shown/not-shown --id --source | reply --input | recover | reconcile --input | retire-tool-questions --input | pause/resume --source | clarify/defer --input | check/domains --input | finish --input',
  settings: 'open --source | show | choose --area | edit --input | present | save --input | attention-shown --source | save-attention --input | cancel | back | close',
  browser: 'versions | install | mcp-config | check --provider library/cli/mcpServer [--headless] [--context interactive/scheduled/ci] | import-report --input | fixture',
  'browser-access': 'targets | status | ensure-standard --input | prepare --input | apply --input | native-plan --input | native-apply --input | record --input : prepare the project browser and verify target access',
  email: 'policy | account --input | accounts | options --input | plan --input | discover --provider gmailApi/agentmail --source | create-inbox --input | select --input | verify --input | begin --input | outcome --input',
  github: 'pending-comments | reconcile-comment --input | reconcile-legacy --input --repository --number --policy --target --source | install --source | check --repository | check-in --source | event --repository --number --source | policy-digest --policy | run/dispatch --policy --target --repository --number --source [--data-observations] [--data-scope-digest] [--case-batch-digest] | comment --policy --target --repository --number --body --source',
  evidence: '--path [--pointer] : calculate an evidence reference; no product verdict is inferred',
  note: 'Use project-private JSON under .local/ for inputs. The agent presents questions and performs authorized host connections. CLI output is a model, not an actual human conversation or approval. See Onboarding/README.md.',
};
async function main() {
  const [area, action] = positional;
  if (!area || area === 'help') { output(help); return; }
  if (Object.hasOwn(help, area) && (action === 'help' || options.has('help') || (!action && area !== 'evidence'))) {
    output({ area, commands: help[area as keyof typeof help] }); return;
  }
  if (area === 'evidence') { output(store.evidence(root, option('path'), options.get('pointer'))); return; }
  if (area === 'cases') {
    if (action === 'validate') {
      const { batch, cases } = caseExecution.verifyCaseAuthorization(root, input());
      output({ assignment: batch.assignment, target: batch.target, cases: [...cases.keys()] });
    } else if (action === 'start') {
      requireLocalSource(root);
      const request = input<Parameters<typeof preflightLocalData>[1]>();
      if (!request.caseExecution) throw new Error('Include the case execution ID in the local preflight request.');
      output(preflightLocalData(root, request));
    } else if (action === 'next') {
      const request = input<Parameters<typeof caseExecution.prepareCheckpoint>[1]>();
      output(activeSource(root).value.choice.kind === 'local'
        ? prepareLocalCase(root, request)
        : await taskSource.prepareLiveCase(root, request));
    } else if (action === 'observe') output(caseExecution.observeCheckpoint(root, input()));
    else if (action === 'status') output(caseExecution.inspectCases(root, option('id')));
    else if (action === 'finish') { requireLocalSource(root); output(caseExecution.finishCases(root, option('id'))); }
    else throw new Error('Run cases help to see the available commands.');
    return;
  }
  if (area === 'attention') {
    if (action === 'status') output(attention.status(root));
    else if (action === 'proposal') output(attentionPreferences.proposal(root, input()));
    else if (action === 'configure') output(attentionPreferences.savePreferences(root, input()));
    else if (action === 'record') output(blockers.recordBlocker(root, input()));
    else if (action === 'list') output(blockers.page(root, { recipient: option('recipient'), offset: options.has('offset') ? Number(option('offset')) : undefined, limit: options.has('limit') ? Number(option('limit')) : undefined, snapshot: options.get('snapshot'), all: options.has('all') }));
    else if (action === 'index') output({ markdown: blockers.indexText(root), effect: 'Read-only proposal; no shared document changed.' });
    else if (action === 'update-index') output(blockers.updateIndex(root, input()));
    else if (action === 'preview') output(attention.preview(root, { recipient: option('recipient'), notifier: option('notifier'), at: options.get('at') }));
    else if (action === 'reserve') output(attention.reserve(root, input()));
    else if (action === 'preflight') output({ delivery: attention.beforePresentation(root, option('id'), option('notifier')), effect: 'Presentation claim only. Use the selected actual host tool once, then record its observed outcome; this command sends no message.' });
    else if (action === 'receipt') output(attention.outcome(root, input()));
    else if (action === 'respond') output(attention.respond(root, input()));
    else throw new Error('Use an attention command from help. CLI output is not proof of actual host presentation.');
    return;
  }
  if (area === 'task-source') {
    if (action === 'status') output(activeSource(root));
    else if (action === 'providers') output(taskProviders.map(provider => ({ provider, credentials: (provider === 'linear' ? [tokenVariables.linear, linearOAuthVariable] : [tokenVariables[provider]]).map(variable => ({ variable, present: !!process.env[variable] })), readiness: 'Verify the actual account and board with inspect.' })));
    else if (action === 'inspect') output(await taskSource.inspect(input()));
    else if (action === 'preview') output(await taskSource.preview(root, input()));
    else if (action === 'save') output(await taskSource.configure(root, input()));
    else if (action === 'check-in') output(await taskSource.checkIn(root));
    else if (action === 'details') output(await taskSource.details(root, option('ticket')));
    else if (action === 'claim') output(await taskSource.claim(root, input()));
    else if (action === 'history') output(taskSource.claimHistory(root, option('claim')));
    else if (action === 'recheck') { const { claim } = await taskSource.recheck(root, option('claim')); output(claim); }
    else if (action === 'preflight') output(await taskSource.preflight(root, input()));
    else if (action === 'begin') output(await taskSource.beginExecution(root, { ...input<Parameters<typeof taskSource.beginExecution>[1]>(), requireCaseBatch: true }));
    else if (action === 'settle') output(taskSource.settleExecution(root, input()));
    else if (action === 'publication-preview') output(await taskSource.publicationPreview(root, { ...input<Parameters<typeof taskSource.publicationPreview>[1]>(), requireCases: true }));
    else if (action === 'publish') output(await taskSource.publish(root, { ...input<Parameters<typeof taskSource.publish>[1]>(), requireCases: true }));
    else if (action === 'reconcile-publication') output(await taskSource.reconcileCurrentPublication(root, { ...input<Parameters<typeof taskSource.reconcileCurrentPublication>[1]>(), requireCases: true }));
    else if (action === 'observe-completion') output(await taskSource.observeReleaseCompletion(root, { ...input<Parameters<typeof taskSource.observeReleaseCompletion>[1]>(), requireCases: true }));
    else if (action === 'close') output(await taskSource.closeCurrentClaim(root, { ...input<Parameters<typeof taskSource.closeCurrentClaim>[1]>(), requireCases: true }));
    else throw new Error('Unknown task-source operation; use help.');
    return;
  }
  if (area === 'board') {
    requireLocalSource(root);
    if (action === 'upgrade') output(board.upgradeBoard(root, option('source')));
    else if (action === 'status') {
      const missing = board.missingFolders(root), pending = board.pendingTransitions(root);
      if (missing.length || pending.length) output({ missing, pending, next: missing.length ? 'Run board upgrade with the actual instruction.' : 'Recover the original transition ID; do not reset its journal.' });
      else {
        const tickets = board.tickets(root).filter(t => !options.has('ticket') || t.id === option('ticket')).map(ticket => {
          const fixVerification = board.defectRetestStatus(root, ticket);
          const { text, ...summary } = ticket;
          return { ...summary, ...(fixVerification ? { fixVerification } : {}),
            issues: [...ticket.issues, ...(ticket.releaseReviewRequired ? [ticket.releaseReviewRequired] : []),
              ...(board.inactive(ticket.status) && !ticket.lifecycle ? ['Actual lifecycle decision is missing; execution remains blocked.'] : [])] };
        });
        const next = options.has('ticket') && !tickets.length ? 'Check the ticket ID or run board status to list all tickets.'
          : tickets.some(ticket => ticket.releaseReviewRequired) ? 'Reconcile the flagged board move and its current review. Independent eligible tickets can proceed.'
          : tickets.some(ticket => ['Ready for QA', 'Retest'].includes(ticket.status))
            ? 'Review Ready for QA and Retest tickets for eligible work and the next required decision.'
            : 'Share a testing objective to prepare a Ready for QA ticket, or wait for a defect to return for retest.';
        output({ tickets, authorization: 'Use the reviewed task scope before execution.', next });
      }
    } else if (action === 'transition' || action === 'recover') {
      let record;
      if (action === 'transition') {
        const request = input<board.Transition>();
        if (request.release) request.release.requireCases = true;
        record = board.transitionTicket(root, request, true);
      } else record = board.recoverTransition(root, option('id'), true);
      output({ id: record.id, ticketId: record.ticketId, state: record.state, recordedDestination: record.to, ownerUpdates: record.ownerUpdates, linkUpdates: record.linkUpdates ?? [],
        ...(record.releaseReviewRequired ? { releaseReviewRequired: record.releaseReviewRequired } : {}) });
    }
    else if (action === 'assert-executable') { const t = board.assertExecutable(root, option('ticket'), options.get('generation')); output({ ticketId: t.id, status: t.status, generation: t.generation, authorization: 'Actual test scope/review still required.' }); }
    else if (action === 'operations') output(board.operations(root, option('ticket')));
    else if (action === 'settle-operation') output(board.settleOperation(root, input<Parameters<typeof board.settleOperation>[1]>()));
    else if (action === 'reviews') output(board.reviews(root, options.get('at'), options.get('trigger')));
    else if (action === 'acknowledge-review') { const value = input<{ ticketId: string; generation: string; source: string }>(); board.acknowledgeReview(root, value.ticketId, value.generation, value.source); output({ recorded: true, execution: 'Not authorized by a review notification.' }); }
    else throw new Error('Unknown board operation; use help.');
    return;
  }
  if (area === 'data') {
    if (action === 'status') { output(dataStatus(root, options.has('input') ? option('input') : undefined)); return; }
    if (action === 'intake-note') { output(noteCandidate(root, input<CandidateRequest>())); return; }
    if (action === 'intake-inspect') {
      output(inspectSource({
        file: option('file'), format: options.get('format') as SourceFormat | undefined,
        table: options.has('table') ? Number(option('table')) : undefined,
        fromLine: options.has('from-line') ? Number(option('from-line')) : undefined,
        throughLine: options.has('through-line') ? Number(option('through-line')) : undefined,
      }).summary);
      return;
    }
    if (action === 'intake-preview') { output(previewIntake(root, input<IntakeRequest>())); return; }
    if (action === 'intake-register') {
      output(registerIntake(root, input<IntakeRequest>(), option('preview-sha256'), option('review-source')));
      return;
    }
    if (action === 'intake-list') { output(listIntake(root)); return; }
    if (action === 'inventory') {
      const privateIndex = options.has('input');
      const index = privateIndex ? input<DatasetIndex>() : store.load<DatasetIndex>(root, `${datasetDirectory}/index.json`, () => ({ schemaVersion: 1, datasets: [] })).value;
      const report = inspectDatasets(root, index, privateIndex); output(report);
      if (report.datasets.some(dataset => dataset.status === 'needsReview')) process.exitCode = 1;
      return;
    }
    if (action === 'preflight') { output(preflightLocalData(root, input())); return; }
    if (action !== 'assess') throw new Error('Use data inventory, assess, preflight, or an intake command listed in help.');
    const report = assessData(root, input<DataPreparation>()); output(report);
    if (report.status === 'needsPreparation') process.exitCode = 1; return;
  }
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
  if (area === 'regression') {
    if (action === 'register') output(registerFix(root, input()));
    else if (action === 'approve-plan') output(approveFixPlan(root, { ...input<Parameters<typeof approveFixPlan>[1]>(), requireCases: true }));
    else if (action === 'status') output(fixStatus(root, option('fix')));
    else if (action === 'retain-results') output(retainFixResults(root, input()));
    else if (action === 'record-review') output(recordFixReview(root, { ...input<Parameters<typeof recordFixReview>[1]>(), requireCases: true }));
    else if (action === 'release') output(await taskSource.reconcileReleaseBoard(root, input()));
    else throw new Error('Run regression help to see the available commands.');
    return;
  }
  if (area === 'release') {
    if (action === 'library') output(browseLibrary(root, input()));
    else if (action === 'scope') output(releaseScope(root, input()));
    else if (action === 'preview-scope') output(await taskSource.previewCurrentReleaseScope(root, input()));
    else if (action === 'bind-scope') output(await taskSource.bindCurrentReleaseScope(root, { ...input<Parameters<typeof taskSource.bindCurrentReleaseScope>[1]>(), requireCases: true }));
    else if (action === 'invalidate-scope') output(invalidateReleaseScope(root, input()));
    else if (action === 'retain-run') output(retainRun(root, input()));
    else if (action === 'runs') output(retainedRuns(root, input<{ round: store.Evidence }>().round));
    else if (action === 'assess') output(assessRound(root, input()));
    else if (action === 'record-assessment') output(recordAssessment(root, input()));
    else if (action === 'verify-assessment') output(verifyAssessment(root, input()));
    else if (action === 'route') {
      const preference = reportingPreference(root);
      output(preference ? handoffRoute(preference, options.get('ticket-url')) : { state: 'unconfigured' });
    } else throw new Error('Run release help to see the available commands.');
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
    else if (action === 'assess-task') {
      const plan = input<TaskToolPlan>();
      const report = options.has('claim') ? await assessLiveTaskTools(root, plan, option('claim')) : assessTaskTools(root, plan);
      output(report); if (report.status === 'needsPreparation') process.exitCode = 1;
    }
    else throw new Error('Unknown tools command.');
    return;
  }
  if (area === 'chrome') {
    if (action === 'check') {
      output({ installation: await registry.scan(root, option('source'), ['chromeDevtoolsMcp', 'chromeDevtoolsCli']), settings: chromeConfig.readSettings(root) ? 'Configured; verify actual browser/connection and task operations' : 'Not configured', hostConnection: registry.status(root, 'chromeDevtoolsHost', ['hostConnection']), browser: 'Not launched by this check' });
    } else if (action === 'mcp-config') output(chromeConfig.mcpConfiguration(root));
    else if (action === 'rehearse') {
      const provider = option('provider'); if (!['cli', 'mcpServer'].includes(provider)) throw new Error('Use cli or mcpServer for local fixture rehearsal.');
      output(await rehearseChrome(root, provider as 'cli' | 'mcpServer', options.has('headless') ? 'headless' : 'headed', options.get('executable')));
    } else if (action === 'session-start') output(await chromeTransport.startCliSession(root, chromeConfig.requireSettings(root), input()));
    else if (action === 'page') {
      const value = input<{ sessionId: string; url: string; source: string; authorization: store.Evidence[] }>();
      output(await webmcp.openPage(root, chromeTransport.cliBridge(root, value.sessionId), chromeConfig.requireSettings(root), value.url, value));
    } else if (action === 'import-host-inventory') output(webmcp.importHostInventory(root, chromeConfig.requireSettings(root), input()));
    else if (action === 'inventory') {
      const value = input<{ sessionId: string; target: webmcp.Target; source: string; channel?: webmcp.Inventory['channel'] }>();
      output(await webmcp.captureInventory(root, chromeTransport.cliBridge(root, value.sessionId), chromeConfig.requireSettings(root), value.target, value.source, value.channel));
    } else if (action === 'case-input-digest') output({ inputDigest: webmcp.caseInputDigest(input()) });
    else if (action === 'execute') {
      const value = input<{ sessionId: string; request: webmcp.Invocation }>();
      const result = await webmcp.execute(root, chromeTransport.cliBridge(root, value.sessionId), chromeConfig.requireSettings(root), value.request);
      output(result); if (result.invocation !== 'reportedCompleted') process.exitCode = 1;
    } else if (action === 'confirm') { const value = input<{ id: string; confirmation: Parameters<typeof webmcp.confirmOutcome>[2] }>(); output(webmcp.confirmOutcome(root, value.id, value.confirmation)); }
    else if (action === 'session-stop') { await chromeTransport.stopCliSession(root, option('id')); output({ stoppedOwnedSession: option('id') }); }
    else throw new Error('Unknown Chrome command; see help.');
    return;
  }
  if (area === 'postman') {
    if (action === 'check') output(await postman.inspect(root, option('source')));
    else if (action === 'login-instructions') output(postman.loginInstructions(root));
    else if (action === 'run-status') output(postman.runStatus(root, option('id')));
    else if (action === 'case-input-digest') output({ inputDigest: postman.caseInputDigest(input()) });
    else if (action === 'run') { const result = await postman.runCollection(root, input()); output(result); if (result.outcome !== 'passed') process.exitCode = 1; }
    else throw new Error('Unknown Postman command.');
    return;
  }
  if (area === 'onboarding') {
    if (action === 'start') { output({ roadmap: labels, progress: readState(root).value, harness: readHarness(root), next: 'Inspect existing records and reuse the supplied target. Show the roadmap and use onboarding next to present the first missing target decision before browser setup. Reconcile legacy browser setup with the Standard default unless the project opted in to Strict.', testData: 'Continue if data will arrive later. When a task needs it, use data status to find or prepare a suitable dataset.' }); return; }
    if (action === 'status') { const state = readState(root).value; output({ state, readiness: readiness(root, state), browserAccess: browserAccess.browserAccessStatus(root) }); return; }
    if (action === 'next') { output(conversation.next(root, options.get('repeat-source'))); return; }
    if (action === 'queue') conversation.queueQuestions(root, input());
    else if (action === 'shown' || action === 'not-shown') conversation.acknowledge(root, option('id'), option('source'), action === 'shown');
    else if (action === 'reply') conversation.commitReply(root, input());
    else if (action === 'recover') conversation.recover(root);
    else if (action === 'retire-tool-questions') conversation.retireToolQuestions(root, input());
    else if (action === 'reconcile') { const v = input<{ writes: conversation.ProposedWrite[]; source: string }>(); conversation.reconcile(root, v.writes, v.source); }
    else if (action === 'pause' || action === 'resume') conversation.pause(root, action === 'pause', option('source'));
    else if (action === 'clarify') { const v = input<{ id: string; prompt: string; source: string }>(); conversation.clarify(root, v.id, v.prompt, v.source); }
    else if (action === 'defer') { const v = input<{ id: string; source: string }>(); conversation.deferQuestion(root, v.id, v.source); }
    else if (action === 'roadmap-shown') { const source = option('source'); const current = readState(root); current.value.roadmapShown = true; current.value.roadmapSource = source; writeState(root, current.value, current.revision); }
    else if (action === 'check') { const v = input<{ stage: Parameters<typeof conversation.recordCheck>[1]; check: Parameters<typeof conversation.recordCheck>[2] }>(); conversation.recordCheck(root, v.stage, v.check); }
    else if (action === 'domains') conversation.recordDomains(root, input());
    else if (action === 'finish') conversation.finish(root, input());
    else throw new Error('Unknown onboarding command. Run help.');
    output({ saved: true, next: conversation.next(root, undefined, false) }); return;
  }
  if (area === 'settings') {
    let value: unknown;
    if (action === 'open') value = settings.openMenu(root, option('source'));
    else if (action === 'show') value = settings.showMenu(root);
    else if (action === 'choose') value = settings.chooseArea(root, option('area'));
    else if (action === 'edit') value = settings.startEdit(root, input());
    else if (action === 'present') value = settings.presentEdit(root);
    else if (action === 'save') value = settings.saveEdit(root, input());
    else if (action === 'attention-shown') { attentionPreferences.markEdit(root, 'asked', option('source')); value = settings.showMenu(root); }
    else if (action === 'save-attention') value = settings.saveAttentionEdit(root, input());
    else if (action === 'cancel' || action === 'back') value = settings.cancelEdit(root, action === 'back');
    else if (action === 'close') { settings.closeMenu(root); value = settings.showMenu(root); }
    else throw new Error('Unknown settings command.');
    output(value); return;
  }
  if (area === 'browser-access') {
    if (action === 'targets') output(browserAccess.browserTargets(root));
    else if (action === 'status') output(browserAccess.browserAccessStatus(root));
    else if (action === 'ensure-standard') output(browserAccess.ensureStandardChrome(root, input()));
    else if (action === 'prepare') output(browserAccess.prepareBrowserAccess(root, input()));
    else if (action === 'apply') output(browserAccess.applyBrowserOrigin(root, input()));
    else if (action === 'native-plan') output(await browserAccess.planNativeBrowserOrigin(root, input(), options.get('codex-executable')));
    else if (action === 'native-apply') output(await browserAccess.applyNativeBrowserOrigin(root, input(), options.get('codex-executable')));
    else if (action === 'record') output(browserAccess.recordBrowserAccess(root, input()));
    else throw new Error('Unknown browser access command. Run help.');
    return;
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
    else if (action === 'plan') output(planEmail(root, input<EmailPlanRequest>()));
    else if (action === 'create-inbox') { const v = input<{ source: string; purpose: string }>(); const inbox = await AgentMailAdapter.createInbox(process.env.AGENTMAIL_API_KEY ?? '', v); output({ inbox, next: 'Refresh AgentMail inbox metadata and ask for mailbox selection; creating it does not select or authorize testing it.' }); }
    else if (action === 'discover') {
      const provider = option('provider'); const source = option('source'); let accounts: email.Account[];
      if (provider === 'gmailApi') accounts = [await new GmailAdapter(process.env.GMAIL_ACCESS_TOKEN ?? '').account()];
      else if (provider === 'agentmail') accounts = await AgentMailAdapter.inboxes(process.env.AGENTMAIL_API_KEY ?? '');
      else throw new Error('Inspect actual host integration/account metadata for native connectors; direct discovery supports gmailApi or agentmail.');
      const inventory: email.Inventory = { schemaVersion: 1, harness: 'directApi', executionContext: context(), source, providers: [{ id: provider === 'gmailApi' ? 'gmail' : 'agentmail', name: provider, available: true }], accounts };
      const path = '.local/email-inventory.json'; store.save(root, path, inventory, store.revision(root, path)); output({ inventory, next: 'Check the destination and any saved mailbox with email plan. Use the observed addresses when a selection is needed.' });
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
    if (action === 'pending-comments') { output(github.pendingCommentPublications(root)); return; }
    if (action === 'reconcile-comment') { output(github.reconcileCommentPublication(root, input())); return; }
    requireLocalSource(root);
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
    if (action === 'reconcile-legacy') output(github.reconcileLegacy(root, policy, pr, target, input<Parameters<typeof github.reconcileLegacy>[4]>()));
    else if (action === 'run' || action === 'dispatch') {
      const data = {
        observations: options.has('data-observations') ? store.readInput<store.Evidence[]>(root, option('data-observations')) : undefined,
        expectedDigest: options.get('data-scope-digest'),
        expectedCaseDigest: options.get('case-batch-digest'),
        requireCaseBatch: true,
      };
      output(action === 'run' ? await github.executeRegression(root, policy, pr, target, source, undefined, data) : await github.dispatchRegression(root, policy, pr, target, undefined, data));
    }
    else if (action === 'comment') output(await github.publishComment(root, policy, pr, target, option('body')));
    else throw new Error('Unknown GitHub command.');
    return;
  }
  throw new Error('Unknown command. Run npm run qa -- help.');
}
main().catch(error => {
  if (error instanceof taskSource.LiveCheckInError) output(error.guidance);
  const message = error instanceof Error ? error.message : 'Operation failed; inspect retained state.';
  try { store.assertNonsecret(message); process.stderr.write(message + '\n'); } catch { process.stderr.write('Operation failed; sensitive details suppressed.\n'); }
  process.exitCode = 1;
});
