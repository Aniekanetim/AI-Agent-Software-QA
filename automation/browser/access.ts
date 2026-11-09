import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { webOrigin, settingsHash, settingsPath, validateSettings, type ChromeSettings } from '../chrome-devtools/config.js';
import { assertNonsecret, atPointer, contained, digest, load, requireText, revision, save, verifyEvidence, withLock, type Evidence } from '../shared/store.js';
import { assertToolId, type ToolId } from '../tools/registry.js';
import { readToolPolicy } from '../tools/policy.js';
import { currentHarness, harnessKey } from '../tools/runtime.js';

const targetsPath = '.local/browser-access/targets';
const lifetime = 24 * 60 * 60_000;
const hashPattern = /^[a-f0-9]{64}$/;
const browserTools: readonly string[] = ['inAppBrowser', 'harnessMcp', 'playwrightCli', 'playwrightMcp', 'playwrightLibrary', 'playwrightTest', 'chromeDevtoolsHost', 'chromeDevtoolsMcp', 'chromeDevtoolsCli'];

export interface AccessTarget {
  environment: string; tool: ToolId; connection: string; generation: string;
}
export type OriginScope =
  | { kind: 'projectChrome'; activeSettingsHash: string | null }
  | { kind: 'observedAllowlist'; activeOrigins: string[] | null; savedOrigins: string[] | null }
  | { kind: 'noAllowlist' | 'unknown' };
export interface AccessPreparation {
  schemaVersion: 1; target: AccessTarget; scope: OriginScope; observedAt: string; source: string; evidence: Evidence[];
}
interface Prepared extends AccessPreparation {
  harness: string; environmentRevision: string; origin: string; observation?: Evidence;
}
type Outcome = 'rendered' | 'originDenied' | 'networkFailed' | 'httpError' | 'redirectBlocked' | 'scopeUnverified';
const outcomes: readonly Outcome[] = ['rendered', 'originDenied', 'networkFailed', 'httpError', 'redirectBlocked', 'scopeUnverified'];
export interface AccessObservation {
  target: AccessTarget; approval: Evidence; observedAt: string; evidence: Evidence[];
  outcome: Outcome; requestedUrl: string; finalUrl?: string; httpStatus?: number; scopeEnforced?: boolean;
}
interface Receipt {
  schemaVersion: 1; binding: string; outcome: Outcome; observedAt: string; approval: Evidence; evidence: Evidence[];
  finalOrigin?: string; httpStatus?: number; scopeEnforced?: boolean;
}
type Status = 'needsConnectionCheck' | 'missingOrigin' | 'reloadRequired' | 'scopeUnverified' | 'needsProbe' | 'verified' | Exclude<Outcome, 'rendered'>;
interface AccessReport {
  target: AccessTarget; origin: string; status: Status; next: string;
  additionalOrigin?: string; settingsRevision?: string; observation?: Evidence;
}

function environments(root: string): { name?: unknown; url?: unknown }[] {
  const project = load<{ environments?: unknown } | null>(root, '.local/project.json', () => null).value;
  return Array.isArray(project?.environments) ? project.environments.filter(env => env && typeof env === 'object') : [];
}
function entryUrl(value: string) {
  webOrigin(value);
  const url = new URL(value);
  url.search = ''; url.hash = '';
  return url;
}
function environment(root: string, name: string) {
  const matches = environments(root).filter(env => env.name === name);
  if (matches.length !== 1 || typeof matches[0]?.url !== 'string') throw new Error('Choose one saved environment with a browser URL.');
  const url = entryUrl(matches[0].url);
  return { url, origin: url.origin, revision: digest(new URL(matches[0].url).href) };
}
export function browserTargets(root: string) {
  const names = new Set(environments(root).flatMap(env => typeof env.name === 'string' && env.name.trim() ? [env.name] : []));
  return [...names].map(name => {
    try { return { environment: name, origin: environment(root, name).origin }; }
    catch { return { environment: name, issue: 'The saved browser URL is missing, invalid or ambiguous. Clarify only this target.' }; }
  });
}
function validateTarget(target: AccessTarget) {
  assertNonsecret(target);
  for (const field of ['environment', 'connection', 'generation'] as const) requireText(target?.[field], `Browser target ${field}`);
  assertToolId(target.tool);
  if (!browserTools.includes(target.tool) && !target.tool.startsWith('custom:')) throw new Error('Identify the actual selected browser tool.');
}
function targetPath(target: AccessTarget, harness: string) {
  return `${targetsPath}/${digest(JSON.stringify([target.environment, target.tool, target.connection, harness]))}.json`;
}
function sameTarget(left: AccessTarget, right: AccessTarget) {
  return left.environment === right.environment && left.tool === right.tool && left.connection === right.connection && left.generation === right.generation;
}
function fresh(value: string, now: number) {
  const at = Date.parse(value);
  return Number.isFinite(at) && at <= now && now - at <= lifetime;
}
function verifyRefs(root: string, refs: Evidence[]) {
  if (!Array.isArray(refs) || !refs.length) throw new Error('Link the actual browser observation or authorization evidence.');
  for (const ref of refs) {
    if (ref?.path?.replaceAll('\\', '/').startsWith(targetsPath + '/')) throw new Error('Use a retained evidence record, not mutable browser readiness state.');
    verifyEvidence(root, ref);
  }
}
function validateScope(target: AccessTarget, scope: OriginScope) {
  if (scope?.kind === 'projectChrome') {
    if (!['chromeDevtoolsMcp', 'chromeDevtoolsCli'].includes(target.tool) || !(scope.activeSettingsHash === null || hashPattern.test(scope.activeSettingsHash))) throw new Error('Use observed settings for the actual project-owned Chrome launcher.');
  } else if (scope?.kind === 'observedAllowlist') {
    for (const origins of [scope.activeOrigins, scope.savedOrigins]) {
      if (origins !== null && (!Array.isArray(origins) || new Set(origins).size !== origins.length || origins.some(origin => typeof origin !== 'string' || webOrigin(origin) !== origin))) throw new Error('Record unique exact observed origins or null when unknown.');
    }
  } else if (scope?.kind !== 'noAllowlist' && scope?.kind !== 'unknown') throw new Error('Describe the actual browser origin controls; retain unknown scope explicitly.');
}
function checkPolicy(root: string, tool: ToolId) {
  const policy = readToolPolicy(root);
  if (policy?.prohibitedTools.includes(tool) || policy?.allowedTools && !policy.allowedTools.includes(tool)) throw new Error('Selected browser is outside the current tool policy.');
}

function currentPrepared(root: string, target: AccessTarget, now: number) {
  validateTarget(target);
  const harness = harnessKey(currentHarness(root));
  const current = environment(root, target.environment);
  const path = targetPath(target, harness);
  const stored = load<Prepared | null>(root, path, () => null);
  const plan = stored.value;
  if (!plan || plan.schemaVersion !== 1 || plan.harness !== harness || !sameTarget(plan.target, target) || plan.origin !== current.origin || plan.environmentRevision !== current.revision || !fresh(plan.observedAt, now)) return { current, path, stored, plan: null };
  validateScope(target, plan.scope);
  try { verifyRefs(root, plan.evidence); } catch { return { current, path, stored, plan: null }; }
  return { current, path, stored, plan };
}
function projectChromeSettings(root: string) {
  const current = load<ChromeSettings | null>(root, settingsPath, () => null);
  if (!current.value || current.value.connection.mode === 'host') throw new Error('Set up the selected project Chrome launcher or inspect the actual native connection.');
  validateSettings(root, current.value);
  return { config: current.value, revision: current.revision! };
}
function configuration(root: string, plan: Prepared): { report: AccessReport; settingsRevision: string | null } {
  const { target, origin, scope } = plan;
  const base = { target, origin };
  let configRevision: string | null = null;
  if (scope.kind === 'projectChrome') {
    const current = projectChromeSettings(root), config = current.config;
    configRevision = current.revision;
    if (!config.allowedOrigins.includes(origin)) return { settingsRevision: configRevision, report: { ...base, status: 'missingOrigin', additionalOrigin: origin, settingsRevision: configRevision, next: 'Review the exact origin addition and reuse existing authorization or obtain the missing decision during setup.' } };
    if (scope.activeSettingsHash !== settingsHash(config)) return { settingsRevision: configRevision, report: { ...base, status: 'reloadRequired', next: 'Start or reload the selected connection with the saved project settings, then verify the actual target.' } };
  }
  if (scope.kind === 'observedAllowlist' && scope.activeOrigins !== null && !scope.activeOrigins.includes(origin)) {
    return { settingsRevision: null, report: scope.savedOrigins?.includes(origin)
      ? { ...base, status: 'reloadRequired', next: 'The saved rule differs from the running connection. Reload the selected connection, then verify actual access.' }
      : { ...base, status: 'missingOrigin', additionalOrigin: origin, next: 'Prepare the exact addition for the selected host, using supported setup or a specific owner handoff. Reuse existing authorization.' } };
  }
  if (scope.kind === 'observedAllowlist' && scope.activeOrigins?.includes(origin) && scope.savedOrigins && !scope.savedOrigins.includes(origin)) {
    return { settingsRevision: null, report: { ...base, status: 'scopeUnverified', next: 'The running rule differs from the saved scope. Reconcile the current authorized scope before browser work.' } };
  }
  const unknown = scope.kind === 'unknown' || scope.kind === 'observedAllowlist' && scope.activeOrigins === null;
  return { settingsRevision: configRevision, report: unknown
    ? { ...base, status: 'scopeUnverified', next: 'Inspect the actual connection scope or verify the approved target through a bounded browser probe.' }
    : { ...base, status: 'needsProbe', next: 'Verify the saved public entry page through the selected browser within the approved origin.' } };
}
function binding(plan: Prepared, settingsRevision: string | null) {
  return digest(JSON.stringify([plan.target.environment, plan.target.tool, plan.target.connection, plan.target.generation, plan.harness, plan.environmentRevision, plan.scope, settingsRevision]));
}

/** A recorded decision supports only the exact origin, environment and connection it names. */
function authorization(root: string, ref: Evidence, target: AccessTarget, origin: string, action: 'addOrigin' | 'navigate') {
  if (ref?.path?.replaceAll('\\', '/') === settingsPath) throw new Error('Use an independent authorization record, not the settings being changed.');
  verifyRefs(root, [ref]);
  const value = JSON.parse(readFileSync(contained(root, ref.path), 'utf8'));
  const decision = ref.pointer ? atPointer(value, ref.pointer) : value;
  assertNonsecret(decision);
  if (decision?.schemaVersion !== 1 || decision.decision !== 'Approved' || decision.environment !== target.environment || decision.origin !== origin || decision.tool !== target.tool || decision.connection !== target.connection || !Array.isArray(decision.actions) || !decision.actions.includes(action)) throw new Error('Link the actual decision for this exact environment, origin, connection and action.');
  requireText(decision.source, 'Actual human authorization source');
}

export function assessBrowserAccess(root: string, target: AccessTarget, now = Date.now()): AccessReport {
  const { current, plan } = currentPrepared(root, target, now);
  if (!plan) return { target, origin: current.origin, status: 'needsConnectionCheck', next: 'Inspect the selected browser and refresh only this target/connection preparation.' };
  checkPolicy(root, target.tool);
  const { report, settingsRevision } = configuration(root, plan);
  if (report.status === 'missingOrigin' || report.status === 'reloadRequired' || !plan.observation) return report;
  try {
    verifyRefs(root, [plan.observation]);
    const receipt = load<Receipt | null>(root, plan.observation.path, () => null).value;
    if (!receipt || receipt.schemaVersion !== 1 || !outcomes.includes(receipt.outcome) || receipt.binding !== binding(plan, settingsRevision) || !fresh(receipt.observedAt, now)) return report;
    authorization(root, receipt.approval, target, current.origin, 'navigate'); verifyRefs(root, receipt.evidence);
    if (receipt.outcome === 'rendered') {
      if (receipt.scopeEnforced !== true || receipt.finalOrigin !== current.origin || (report.status === 'scopeUnverified' && plan.scope.kind === 'observedAllowlist' && plan.scope.activeOrigins !== null)) return report;
      return { ...report, status: 'verified', observation: plan.observation, next: 'Target page access verified for this connection. Application authentication and task authorization remain separate.' };
    }
    return { ...report, status: receipt.outcome, observation: plan.observation, next: 'Resolve the recorded browser access outcome for this target before dependent work. Reuse other verified preparation.' };
  } catch { return report; }
}

export function prepareBrowserAccess(root: string, input: AccessPreparation, now = Date.now()) {
  assertNonsecret(input); if (input?.schemaVersion !== 1) throw new Error('Use a browser access preparation with schemaVersion 1.');
  validateTarget(input.target); validateScope(input.target, input.scope); checkPolicy(root, input.target.tool);
  requireText(input.source, 'Actual browser preparation source'); verifyRefs(root, input.evidence);
  if (!fresh(input.observedAt, now)) throw new Error('Inspect the current browser scope before preparing this target.');
  return withLock(root, 'browser-access', () => {
    const { current, path, stored, plan } = currentPrepared(root, input.target, now);
    if (stored.value && Date.parse(stored.value.observedAt) > Date.parse(input.observedAt)) throw new Error('A newer browser preparation exists. Preserve it and inspect current access.');
    const prepared: Prepared = { schemaVersion: 1, target: input.target, scope: input.scope, source: input.source, evidence: input.evidence, observedAt: input.observedAt, harness: harnessKey(currentHarness(root)), origin: current.origin, environmentRevision: current.revision };
    const { settingsRevision } = configuration(root, prepared);
    if (plan?.observation && binding(plan, settingsRevision) === binding(prepared, settingsRevision)) prepared.observation = plan.observation;
    save(root, path, prepared, stored.revision);
    return assessBrowserAccess(root, input.target, now);
  });
}

export function applyBrowserOrigin(root: string, input: { target: AccessTarget; expectedSettingsRevision: string; approval: Evidence }, now = Date.now()) {
  return withLock(root, 'browser-access', () => {
    const { current, plan } = currentPrepared(root, input.target, now);
    if (plan?.scope.kind !== 'projectChrome') throw new Error('This helper only updates existing project Chrome settings. Prepare a supported host setup handoff for native connections.');
    checkPolicy(root, input.target.tool);
    authorization(root, input.approval, input.target, current.origin, 'addOrigin');
    const saved = projectChromeSettings(root), config = saved.config;
    if (config.allowedOrigins.includes(current.origin)) return { changed: false, access: assessBrowserAccess(root, input.target, now) };
    if (!hashPattern.test(input.expectedSettingsRevision) || input.expectedSettingsRevision !== saved.revision) throw new Error('Browser settings changed. Review the exact addition again without overwriting current settings.');
    const updated = { ...config, allowedOrigins: [...config.allowedOrigins, current.origin], evidence: [...config.evidence, input.approval] };
    validateSettings(root, updated);
    const delta = { schemaVersion: 1, environment: input.target.environment, origin: current.origin, before: saved.revision, proposed: digest(JSON.stringify(updated, null, 2) + '\n'), approval: input.approval, effect: 'Proposed exact rule addition. Compare against actual settings revision to establish whether it was applied.' };
    const deltaPath = `.local/browser-access/changes/${digest(JSON.stringify(delta))}.json`;
    if (revision(root, deltaPath) === null) save(root, deltaPath, delta, null);
    save(root, settingsPath, updated, input.expectedSettingsRevision);
    return { changed: true, delta: { path: deltaPath, sha256: digest(JSON.stringify(delta, null, 2) + '\n') }, access: assessBrowserAccess(root, input.target, now) };
  });
}

export function recordBrowserAccess(root: string, input: AccessObservation, now = Date.now()) {
  assertNonsecret(input);
  return withLock(root, 'browser-access', () => {
    const { current, path, stored, plan } = currentPrepared(root, input.target, now);
    if (!plan) throw new Error('Refresh the selected browser preparation before recording target access.');
    checkPolicy(root, input.target.tool);
    authorization(root, input.approval, input.target, current.origin, 'navigate'); verifyRefs(root, input.evidence);
    if (!fresh(input.observedAt, now) || Date.parse(input.observedAt) < Date.parse(plan.observedAt) || entryUrl(input.requestedUrl).href !== current.url.href) throw new Error('Record a current browser probe of the actual saved public entry page.');
    if (!outcomes.includes(input.outcome)) throw new Error('Record the actual browser outcome.');
    const { report, settingsRevision } = configuration(root, plan);
    const finalOrigin = input.finalUrl ? webOrigin(input.finalUrl) : undefined;
    if (input.httpStatus !== undefined && (!Number.isInteger(input.httpStatus) || input.httpStatus < 100 || input.httpStatus > 599)) throw new Error('Use the observed HTTP status or omit it.');
    if (input.outcome === 'rendered' && (input.scopeEnforced !== true || finalOrigin !== current.origin || (input.httpStatus !== undefined && (input.httpStatus < 200 || input.httpStatus >= 300)) || ['missingOrigin', 'reloadRequired'].includes(report.status) || (report.status === 'scopeUnverified' && plan.scope.kind === 'observedAllowlist' && plan.scope.activeOrigins !== null))) throw new Error('Access requires a rendered target inside the approved origin through the active, bounded browser connection.');
    if (plan.observation) {
      const prior = load<Receipt | null>(root, plan.observation.path, () => null).value;
      if (prior && Date.parse(prior.observedAt) > Date.parse(input.observedAt)) throw new Error('Keep the newer browser observation. Do not replace it with an older result.');
    }
    const receipt: Receipt = { schemaVersion: 1, binding: binding(plan, settingsRevision), outcome: input.outcome, observedAt: input.observedAt, approval: input.approval, evidence: input.evidence, ...(finalOrigin ? { finalOrigin } : {}), ...(input.httpStatus !== undefined ? { httpStatus: input.httpStatus } : {}), ...(input.outcome === 'rendered' ? { scopeEnforced: true } : {}) };
    const receiptPath = `.local/browser-access/observations/${digest(JSON.stringify(receipt))}.json`;
    if (revision(root, receiptPath) === null) save(root, receiptPath, receipt, null);
    const observation = { path: receiptPath, sha256: digest(JSON.stringify(receipt, null, 2) + '\n') };
    verifyEvidence(root, observation);
    save(root, path, { ...plan, observation }, stored.revision);
    return assessBrowserAccess(root, input.target, now);
  });
}

/** Optional preparations are independently reported. No readiness or legacy state is written. */
export function browserAccessStatus(root: string) {
  const unresolved = { status: 'needsConnectionCheck' as const, next: 'Inspect the saved browser preparation and affected environment; preserve the original evidence.' };
  try {
    const directory = contained(root, targetsPath);
    if (!existsSync(directory)) return [];
    const harness = harnessKey(currentHarness(root));
    return readdirSync(directory, { withFileTypes: true }).filter(file => file.isFile() && /^[a-f0-9]{64}\.json$/.test(file.name)).map(file => {
      try {
        const plan = load<Prepared | null>(root, `${targetsPath}/${file.name}`, () => null).value;
        if (!plan || plan.harness !== harness) return null;
        return assessBrowserAccess(root, plan.target);
      } catch { return unresolved; }
    }).filter(item => item !== null);
  } catch { return [unresolved]; }
}
