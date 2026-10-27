import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { contained, privatePath, load, save, revision, requireText, digest, evidence, verifyEvidence, assertNonsecret, type Evidence } from '../shared/store.js';
import { probe, selectedCommand, runProcess, readRecord, saveRecord, readinessIssues, isolatedPostmanEnvironment, type Runner, type ToolRecord, type Command } from '../tools/registry.js';
import { currentHarness, harnessKey } from '../tools/runtime.js';

export const settingsPath = '.local/postman-settings.json';
export interface PostmanSettings {
  schemaVersion: 1; mode: 'local' | 'cloud'; reporting: 'localOnly' | 'cloudAllowed';
  region: 'us' | 'eu'; credential: 'session' | 'environment'; accountId?: string;
  collections: string[]; environments: string[]; source: string;
}
export function validateSettings(value: PostmanSettings): void {
  if (!value || value.schemaVersion !== 1 || !['local', 'cloud'].includes(value.mode) || !['localOnly', 'cloudAllowed'].includes(value.reporting) || !['us', 'eu'].includes(value.region) || !['session', 'environment'].includes(value.credential) || !Array.isArray(value.collections) || !Array.isArray(value.environments)) throw new Error('Use valid nonsecret Postman settings.');
  requireText(value.source);
  for (const ref of [...value.collections, ...value.environments]) if (typeof ref !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(ref)) throw new Error('Select actual cloud resource IDs, not URLs, shell arguments or secret values.');
  if (value.mode === 'local' && value.reporting !== 'localOnly') throw new Error('Local mode does not authorize cloud reporting.');
  if (value.mode === 'cloud' && (!value.accountId?.trim() || value.reporting !== 'cloudAllowed')) throw new Error('Cloud runs need a selected account and explicit cloud-reporting preference.');
}
export function settings(root: string): PostmanSettings | null {
  const value = load<PostmanSettings | null>(root, settingsPath, () => null).value;
  if (value) validateSettings(value); return value;
}
export function localEnvironment(root: string, input: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return isolatedPostmanEnvironment(root, input);
}
function cloudEnvironment(configuration: PostmanSettings): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (configuration.credential === 'session') delete env.POSTMAN_API_KEY;
  else if (!env.POSTMAN_API_KEY?.trim()) throw new Error('POSTMAN_API_KEY is missing or empty in this harness. Keep the key outside project records.');
  return env;
}
function cloudBinding(configuration: PostmanSettings) {
  return { accountId: configuration.accountId, region: configuration.region, credential: configuration.credential };
}
function matchesCloudReceipt(root: string, record: ToolRecord | null, operation: string, configuration: PostmanSettings, expected: Record<string, unknown> = {}): boolean {
  return (record?.capabilities[operation]?.evidence ?? []).some(ref => {
    try {
      // Binding receipts are complete files; a pointer to unrelated evidence is not identity proof.
      if (ref.pointer) return false;
      verifyEvidence(root, ref);
      const receipt = JSON.parse(readFileSync(contained(root, ref.path), 'utf8'));
      const age = Date.now() - Date.parse(receipt.checkedAt);
      return Number.isFinite(age) && age >= -60_000 && age <= 86_400_000 &&
        harnessKey(receipt.harness) === harnessKey(record!.harness) &&
        Object.entries({ ...cloudBinding(configuration), ...expected }).every(([key, value]) => receipt[key] === value);
    } catch { return false; }
  });
}
/** Reuse cloud evidence only for the identity and credential selection that produced it. */
export function capabilityIssues(root: string, record: ToolRecord | null, required: string[], configuration = settings(root)): string[] {
  const issues = readinessIssues(root, record, required);
  if (configuration?.mode !== 'cloud' || !required.includes('identity')) return issues;
  if (record?.authentication !== 'connected' || record.account !== configuration.accountId || !matchesCloudReceipt(root, record, 'identity', configuration)) {
    issues.push('identity: verify the selected Postman account, region and credential source with postman check.');
  }
  for (const operation of required) {
    const resource = /^(collection|environment):(.+)$/.exec(operation);
    if (resource && !matchesCloudReceipt(root, record, operation, configuration, { kind: resource[1], reference: resource[2], access: 'read' })) {
      issues.push(`${operation}: verify access for the selected account, region and credential source.`);
    }
  }
  return issues;
}
function retainIdentityCheck(root: string, record: ToolRecord, configuration: PostmanSettings, source: string): void {
  const path = `.local/postman/identity-${harnessKey(record.harness)}.json`;
  save(root, path, { ...cloudBinding(configuration), observedAccount: record.account ?? null, authentication: record.authentication, harness: record.harness, source, checkedAt: new Date().toISOString() }, revision(root, path));
  record.capabilities.identity!.evidence = [evidence(root, path)];
  // This is a fresh attempt, even when it establishes that authentication is missing.
  record.capabilities.identity!.checkedAt = new Date().toISOString();
}
export async function inspect(root: string, source: string, runner: Runner = runProcess, mode?: 'local' | 'cloud'): Promise<ToolRecord> {
  const record = await probe(root, 'postman', source, runner); if (!record.compatible || !record.command) return record;
  const configured = settings(root), configuration = mode === 'local' ? null : configured;
  if (configuration?.mode === 'cloud') { delete record.account; record.capabilities.identity = { status: 'unverified', evidence: [] }; }
  let env: NodeJS.ProcessEnv;
  try { env = configuration?.mode === 'cloud' ? cloudEnvironment(configuration) : localEnvironment(root); }
  catch { record.authentication = 'needsAuthentication'; record.capabilities.identity = { status: 'unverified', evidence: [] }; record.diagnostic = 'The selected environment credential is missing or empty. Supply it through the harness secret facility; do not repeat installation.'; if (configuration?.mode === 'cloud') retainIdentityCheck(root, record, configuration, source); saveRecord(root, record); return record; }
  const help = await runner(record.command, ['collection', 'run', '--help'], { cwd: root, env });
  const helpText = (help.stdout + '\n' + help.stderr).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  const flags = { collectionRun: help.code === 0 && /postman\s+collection\s+run|--reporters\b/.test(helpText), localJsonReport: /--reporters\b/.test(helpText), cliSummary: record.version === '1.79.0' && /--disable-unicode\b/.test(helpText), noReportEvents: /--no-report-events\b/.test(helpText), fileBoundary: /--no-insecure-file-read\b/.test(helpText) };
  const file = `.local/postman/capabilities-${harnessKey(record.harness)}.json`;
  save(root, file, { version: record.version, flags, harness: record.harness, source, checkedAt: new Date().toISOString() }, revision(root, file));
  for (const [name, supported] of Object.entries(flags)) record.capabilities[name] = { status: help.code !== 0 ? (help.error === 'denied' ? 'denied' : 'unverified') : supported ? 'verified' : 'unsupported', evidence: supported && help.code === 0 ? [evidence(root, file)] : [] };
  record.authentication = configuration?.mode === 'cloud' ? 'unverified' : 'notRequired';
  if (configuration?.mode === 'cloud') {
    const authHelp = await runner(record.command, ['whoami', '--help'], { cwd: root, env });
    if (authHelp.code === 0 && /--json\b/.test(authHelp.stdout)) {
      const result = await runner(record.command, ['whoami', '--json'], { cwd: root, env });
      let identity: any; try { identity = JSON.parse(result.stdout); } catch { /* No raw credential diagnostics are retained. */ }
      const id = identity?.user?.id ?? identity?.account?.id ?? identity?.id;
      if (id != null) record.account = String(id);
      if (result.code === 0 && id != null && String(id) === configuration.accountId && !identity?.guest && !identity?.isGuest && identity?.authenticated !== false && identity?.type !== 'guest') {
        record.account = String(id); record.authentication = 'connected';
        record.capabilities.identity = { status: 'verified', evidence: [] };
      } else {
        const missingAuthentication = !result.error && result.code !== 0 && /\b(?:not (?:logged|signed) in|session (?:has )?expired|authentication (?:is )?required|(?:missing|invalid|expired) (?:api key|credentials))\b/i.test(`${result.stdout}\n${result.stderr}`);
        record.authentication = result.error ? 'unverified' : result.code === 0 && id != null ? 'denied' : missingAuthentication ? 'needsAuthentication' : 'unverified';
        record.capabilities.identity = { status: record.authentication === 'denied' ? 'denied' : 'unverified', evidence: [] };
        record.diagnostic = record.authentication === 'denied' ? 'The CLI identity differs from the selected account. Confirm account selection; do not silently switch accounts.' : record.authentication === 'unverified' ? 'Identity could not be established from this tool invocation/response. Resolve access or command compatibility before assuming authentication is missing. Raw output suppressed.' : 'Verify the selected credential source and region, then sign in only if necessary. Raw output suppressed.';
      }
    } else { record.capabilities.identity = { status: 'unsupported', evidence: [] }; record.diagnostic = 'This CLI cannot verify identity through whoami --json. Use a documented version-compatible check before cloud work.'; }
    retainIdentityCheck(root, record, configuration, source);
    if (record.authentication === 'connected') {
      for (const [kind, references] of [['collection', configuration.collections], ['environment', configuration.environments]] as const) for (const reference of references) {
        const name = `${kind}:${reference}`;
        const result = await runner(record.command, [kind, 'get', reference, '--json'], { cwd: root, env });
        let resource: any; try { resource = JSON.parse(result.stdout); } catch { /* Help text or an unknown response is not resource access. */ }
        if (result.code === 0 && resource && typeof resource === 'object' && !Array.isArray(resource) && Object.keys(resource).length > 0 && !resource.error && !resource.errors) {
          const path = `.local/postman/access/${digest(JSON.stringify([record.harness, kind, reference])).slice(0, 32)}.json`;
          save(root, path, { kind, reference, ...cloudBinding(configuration), access: 'read', checkedAt: new Date().toISOString(), source, harness: record.harness }, revision(root, path));
          record.capabilities[name] = { status: 'verified', evidence: [evidence(root, path)] };
        } else {
          record.capabilities[name] = { status: result.error === 'denied' ? 'denied' : 'unverified', evidence: [] };
          record.diagnostic = 'Selected cloud resource access failed. Check resource permissions or documented CLI command compatibility; do not reinstall or assume login is the cause. Raw resource content/diagnostics suppressed.';
        }
      }
    }
  }
  saveRecord(root, record); return record;
}
export interface LoginGuidance {
  required: boolean | null; action: 'local' | 'reuse' | 'check' | 'login' | 'configureCredential' | 'resolveIdentity';
  next: string; executable?: Command; args?: string[];
}
export function loginInstructions(root: string): LoginGuidance {
  const configuration = settings(root);
  if (!configuration || configuration.mode === 'local') return { required: false, action: 'local', next: 'Local-file operation needs no Postman login. Verify the selected harness and collection capability.' };
  const current = readRecord(root, 'postman');
  if (!capabilityIssues(root, current, ['identity'], configuration).length) return { required: false, action: 'reuse', next: 'Reuse the verified selected account. Revalidate identity before cloud execution.' };
  const checkedSelection = current && !readinessIssues(root, current, ['version']).length && matchesCloudReceipt(root, current, 'identity', configuration, { authentication: current.authentication, observedAccount: current.account ?? null });
  if (checkedSelection && current.authentication === 'needsAuthentication') {
    if (configuration.credential === 'environment') return { required: true, action: 'configureCredential', next: 'Configure the authorized POSTMAN_API_KEY through the harness/CI secret facility. Do not paste it into project records or command arguments. Run postman check afterwards.' };
    return { required: true, action: 'login', executable: selectedCommand(root, 'postman'), args: ['login', ...(configuration.region === 'eu' ? ['--region', 'eu'] : [])], next: 'Complete browser sign-in interactively using this selected executable, then run postman check. This helper does not start login or create an account.' };
  }
  if (checkedSelection && current.authentication === 'denied') return { required: null, action: 'resolveIdentity', next: 'The observed CLI account differs from the selected identity or is not eligible. Confirm account selection, then run postman check; do not switch accounts or sign in automatically.' };
  return { required: null, action: 'check', next: 'Run postman check for the selected account, region and credential source. Changed, stale, unavailable or unsupported verification does not establish a need to sign in. Resolve the reported capability gap first.' };
}
export interface RunRequest {
  id: string; source: string; authorizationReference: string;
  collection: { kind: 'file' | 'cloud'; reference: string; format: 'v2.1' | 'v3' };
  environment?: { kind: 'file' | 'cloud'; reference: string }; dataFile?: string;
  approvedInputs: Evidence[];
  workingDirectory?: string;
  target: { environment: string; baseUrl: string; build: string; source: string };
  timeoutMs: number; cloudReportingAuthorization?: string;
}
export interface RunResult {
  schemaVersion: 1; id: string; requestDigest: string; state: 'running' | 'completed'; outcome: 'passed' | 'failed' | 'executionError' | 'incomplete';
  harness: ToolRecord['harness']; version: string | null; executable: string; startedAt: string; completedAt?: string;
  collection: RunRequest['collection']; target: RunRequest['target']; source: string; authorizationReference: string; inputs: Evidence[];
  reporting: 'localOnly' | 'cloudAllowed'; exitCode: number | null;
  reportFormat?: 'json' | 'cli-summary' | 'unavailable';
  assertions?: { total: number; failed: number }; requests?: { total: number; failed: number }; reason?: string;
}
export function validateRun(root: string, request: RunRequest): void {
  assertNonsecret(request);
  if (!request || !/^[A-Za-z0-9_-]{1,80}$/.test(request.id)) throw new Error('Use a unique, simple execution ID.');
  requireText(request.source); requireText(request.authorizationReference, 'Actual scoped execution authorization');
  requireText(request.target?.environment); requireText(request.target?.build); requireText(request.target?.source);
  const target = new URL(request.target.baseUrl); if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) throw new Error('Record a nonsecret target base URL without credentials/query/fragment.');
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 1000 || request.timeoutMs > 900_000) throw new Error('Use a bounded timeout between 1 and 900 seconds.');
  if (!['file', 'cloud'].includes(request.collection.kind) || !['v2.1', 'v3'].includes(request.collection.format)) throw new Error('Identify collection source and format.');
  if (!Array.isArray(request.approvedInputs) || (request.environment && !['file', 'cloud'].includes(request.environment.kind))) throw new Error('Identify approved input evidence and environment source.');
  const configuration = settings(root);
  const cloud = request.collection.kind === 'cloud' || request.environment?.kind === 'cloud';
  if (cloud && (!configuration || configuration.mode !== 'cloud' || configuration.reporting !== 'cloudAllowed' || !request.cloudReportingAuthorization?.trim())) throw new Error('Cloud execution and result reporting need actual scoped authorization and selected resources.');
  if (cloud) {
    if (request.collection.kind === 'cloud' && !configuration!.collections.includes(request.collection.reference)) throw new Error('Select this cloud collection in Postman settings first.');
    if (request.environment?.kind === 'cloud' && !configuration!.environments.includes(request.environment.reference)) throw new Error('Select this cloud environment first.');
  }
  for (const ref of request.approvedInputs ?? []) verifyEvidence(root, ref);
  for (const file of [request.collection.kind === 'file' ? request.collection.reference : null, request.environment?.kind === 'file' ? request.environment.reference : null, request.dataFile]) {
    if (file && !request.approvedInputs.some(ref => ref.path === file && !ref.pointer)) throw new Error('Every local collection, environment and data file needs its approved full-file evidence.');
  }
}
export function summarize(report: any, exitCode: number | null): Pick<RunResult, 'outcome' | 'assertions' | 'requests' | 'reason'> {
  const stats = report?.run?.stats;
  const assertions = stats?.assertions, requests = stats?.requests;
  if (![assertions?.total, assertions?.failed, requests?.total, requests?.failed].every(n => Number.isInteger(n) && n >= 0) || assertions.failed > assertions.total || requests.failed > requests.total) return { outcome: exitCode === 0 ? 'incomplete' : 'executionError', reason: 'No supported structured assertion summary was produced. Retain reviewed evidence; exit status alone is not a passing verdict.' };
  const result = { assertions: { total: assertions.total, failed: assertions.failed }, requests: { total: requests.total, failed: requests.failed } };
  if (assertions.failed > 0) return { ...result, outcome: 'failed' };
  if (exitCode !== 0 || requests.failed > 0 || (report.run.failures?.length ?? 0) > 0) return { ...result, outcome: 'executionError', reason: 'A request, script or CLI execution failed; investigate separately from a product assertion.' };
  return { ...result, outcome: assertions.total > 0 && requests.total > 0 ? 'passed' : 'incomplete', ...(assertions.total > 0 && requests.total > 0 ? {} : { reason: 'Requests and assertions are required for a passing test verdict.' }) };
}
export function cliSummary(text: string): unknown {
  const plain = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[│┃┆┊|]/g, ' ');
  // Only the observed 1.79.0 table is supported. Ambiguous/changed output stays incomplete.
  if ((plain.match(/\bexecuted\s+failed\b/gi) ?? []).length !== 1) return null;
  const rows = [...plain.matchAll(/^\s*(requests|assertions|test-scripts|prerequest-scripts)\s+(\d+)\s+(\d+)\s*$/gmi)];
  const find = (name: string) => rows.filter(r => r[1]!.toLowerCase() === name);
  if (find('requests').length !== 1 || find('assertions').length !== 1) return null;
  const counts = (name: string) => ({ total: Number(find(name)[0]![2]), failed: Number(find(name)[0]![3]) });
  return { run: { stats: { requests: counts('requests'), assertions: counts('assertions') }, failures: rows.some(row => row[1]!.toLowerCase() !== 'assertions' && Number(row[3]) > 0) ? [{ type: 'ExecutionFailure' }] : [] } };
}
export async function runCollection(root: string, request: RunRequest, runner: Runner = runProcess): Promise<RunResult> {
  validateRun(root, request); const identity = currentHarness(root), requestDigest = digest(JSON.stringify(request));
  const path = `.local/postman/runs/${request.id}.json`, previous = load<RunResult | null>(root, path, () => null);
  if (previous.value) {
    if (previous.value.requestDigest !== requestDigest || harnessKey(previous.value.harness) !== harnessKey(identity)) throw new Error('This execution ID already belongs to different inputs or a different harness.');
    if (previous.value.state === 'running') throw new Error('This run is unfinished or uncertain. Inspect it before explicitly authorizing a new execution ID.');
    return previous.value;
  }
  const cloud = request.collection.kind === 'cloud' || request.environment?.kind === 'cloud';
  const record = await inspect(root, request.source, runner, cloud ? 'cloud' : 'local');
  const required = ['version', 'collectionRun'];
  if (cloud) {
    required.push('identity');
    if (request.collection.kind === 'cloud') required.push(`collection:${request.collection.reference}`);
    if (request.environment?.kind === 'cloud') required.push(`environment:${request.environment.reference}`);
  }
  const issues = capabilityIssues(root, record, required); if (issues.length) throw new Error(issues.join('; '));
  const command = selectedCommand(root, 'postman', false);
  const work = privatePath(root, `.local/postman/work/${request.id}`); mkdirSync(work, { recursive: true });
  const reportFile = resolve(work, 'raw-report.json'), configuration = settings(root);
  const env = cloud ? cloudEnvironment(configuration!) : localEnvironment(root);
  let collection = request.collection.reference;
  if (request.collection.kind === 'file') {
    if (request.collection.format === 'v2.1') {
      const original = readFileSync(contained(root, collection));
      const body = JSON.parse(original.toString('utf8'));
      if (body.info?.schema !== 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json') throw new Error('The collection is not the declared v2.1 format.');
      // Preserve approved scripts and metadata byte-for-byte; local profile isolation prevents session reuse.
      collection = resolve(work, 'collection.json'); writeFileSync(collection, original, { mode: 0o600 });
    } else collection = contained(root, collection);
  }
  const args = ['collection', 'run', collection, '--timeout', String(request.timeoutMs)];
  const json = request.collection.format === 'v2.1' && record.capabilities.localJsonReport?.status === 'verified';
  const table = !json && request.collection.format === 'v2.1' && record.capabilities.cliSummary?.status === 'verified';
  if (json) args.push('--reporters', 'json', '--reporter-json-export', reportFile);
  else if (table) args.push('--disable-unicode');
  if (record.capabilities.noReportEvents?.status === 'verified') args.push('--no-report-events');
  if (record.capabilities.fileBoundary?.status === 'verified') args.push('--no-insecure-file-read');
  if (request.environment) args.push('--environment', request.environment.kind === 'file' ? contained(root, request.environment.reference) : request.environment.reference);
  if (request.dataFile) args.push('--iteration-data', contained(root, request.dataFile));
  const result: RunResult = { schemaVersion: 1, id: request.id, requestDigest, state: 'running', outcome: 'incomplete', harness: identity, version: record.version, executable: command.executable,
    collection: request.collection, target: request.target, startedAt: new Date().toISOString(), source: request.source, authorizationReference: request.authorizationReference, inputs: request.approvedInputs, reporting: cloud ? 'cloudAllowed' : 'localOnly', exitCode: null };
  save(root, path, result, null);
  try {
    const execution = await runner(command, args, { cwd: contained(root, request.workingDirectory ?? '.'), env, timeout: request.timeoutMs + 15_000 });
    result.exitCode = execution.code;
    let report: unknown;
    if (json) { try { report = JSON.parse(readFileSync(reportFile, 'utf8')); } catch { /* Missing report remains incomplete. */ } }
    else if (table) report = cliSummary(execution.stdout);
    result.reportFormat = json ? 'json' : table ? 'cli-summary' : 'unavailable';
    Object.assign(result, summarize(report, execution.code));
    if (execution.error) { result.outcome = 'executionError'; result.reason = `Tool execution: ${execution.error}. No product verdict was inferred.`; }
    result.state = 'completed'; result.completedAt = new Date().toISOString();
    save(root, path, result, revision(root, path));
    if (result.assertions && result.requests && result.assertions.total > 0 && result.requests.total > 0 && !execution.error) {
      record.capabilities[cloud ? 'cloudCollectionRun' : 'localCollectionRun'] = { status: 'verified', evidence: [evidence(root, path)] };
      saveRecord(root, record);
    }
    return result;
  } finally {
    // Raw reports can contain tokens, bodies and personal data; retain only the nonsecret summary.
    for (const file of [reportFile, resolve(work, 'collection.json')]) if (existsSync(file)) unlinkSync(file);
  }
}
