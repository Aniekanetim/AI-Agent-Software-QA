import { randomUUID } from 'node:crypto';
import { load, save, revision, requireText, digest, verifyEvidence, evidence, assertNonsecret, type Evidence } from '../shared/store.js';
import { currentHarness, harnessKey } from '../tools/runtime.js';
import { readRecord, readinessIssues } from '../tools/registry.js';
import { type ChromeSettings, validateSettings, settingsHash, webOrigin } from './config.js';
import { type Bridge, type Provider, validateScope, structured, responseMessage, claimed, BridgeFailure } from './transport.js';

export interface Target {
  pageId: number; url: string; role: string; accountState: string; build: string | null; contextEvidence: Evidence[];
}
export interface Definition { name: string; description: string; inputSchemaJson: string; schemaHash: string; annotationsJson: string }
export interface Inventory {
  schemaVersion: 1; id: string; channel: 'application' | 'debugging'; provider: Provider; connectionReference: string;
  harness: string; configurationHash: string; checkedAt: string; pageId: number; pageUrl: string; pageUrlHash: string;
  origin: string; role: string; accountState: string; build: string | null; contextEvidence: Evidence[]; contextHash: string;
  documentId: string | null; browser: string | null; apiObserved: boolean | null; hostEvidence?: Evidence[];
  tools: Definition[]; catalogueHash: string; source: string; limits: string[];
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as any)[k])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export function redacted(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\b(?:gh[pousr]_|github_pat_|PMAK-)[A-Za-z0-9_-]+/g, '[credential omitted]')
    .replace(/Bearer\s+[^\s"<>]+/gi, '[authorization omitted]')
    .replace(/https?:\/\/[^\s"<>]+/g, s => { try { const u = new URL(s); u.username = ''; u.password = ''; u.search = ''; u.hash = ''; return u.href; } catch { return '[URL omitted]'; } });
  if (Array.isArray(value)) return value.map(redacted);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = Object.create(null);
    const omitted: string[] = [];
    for (const [key, child] of Object.entries(value)) {
      if (/password|secret|token|cookie|authorization|api.?key|\botp\b|verification.?code|magic.?link/i.test(key)) omitted.push(key);
      else if (!['__proto__', 'constructor', 'prototype'].includes(key)) result[key] = redacted(child);
    }
    if (omitted.length) result.redactedFields = omitted; return result;
  }
  return value;
}
function targetContext(root: string, target: Target): string {
  if (!Number.isInteger(target.pageId) || target.pageId < 0) throw new Error('Identify the actual target page ID.');
  webOrigin(target.url); requireText(target.role); requireText(target.accountState);
  if (target.build !== null) requireText(target.build);
  if (!Array.isArray(target.contextEvidence) || !target.contextEvidence.length) throw new Error('Reference actual role/account/state observations.');
  target.contextEvidence.forEach(ref => verifyEvidence(root, ref));
  return digest(canonical({ role: target.role, accountState: target.accountState, build: target.build, evidence: target.contextEvidence }));
}
function definitions(raw: unknown): Definition[] {
  if (!Array.isArray(raw) || raw.length > 100) throw new Error('The tool catalogue is missing, malformed or exceeds its limit.');
  const tools = raw.map((tool: any) => {
    requireText(tool.name, 'Application tool name'); requireText(tool.description, 'Application tool description');
    if (tool.name.length > 200 || tool.description.length > 8000 || !tool.inputSchema || typeof tool.inputSchema !== 'object') throw new Error('Unsupported tool definition.');
    const schema = canonical(tool.inputSchema); if (schema.length > 32_768) throw new Error('Tool schema exceeds its limit.');
    // Schema names are metadata (e.g. a password property), not credential values.
    // Keep metadata as a string so persistence does not mistake those names for values.
    const inputSchemaJson = JSON.stringify(redactedSchema(tool.inputSchema));
    return { name: tool.name, description: String(redacted(tool.description)), inputSchemaJson, schemaHash: digest(schema), annotationsJson: JSON.stringify(redacted(tool.annotations ?? {})) };
  });
  if (new Set(tools.map(t => t.name)).size !== tools.length) throw new Error('Ambiguous duplicate tool names; investigate frame/tool identity before execution.');
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}
function redactedSchema(value: any): any {
  if (Array.isArray(value)) return value.map(redactedSchema);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !['default', 'examples', 'example', '__proto__', 'constructor', 'prototype'].includes(k)).map(([k, v]) => [k, redactedSchema(v)]));
  return redacted(value);
}
async function inspect(root: string, bridge: Bridge, settings: ChromeSettings, target: Target, channel: Inventory['channel']) {
  validateSettings(root, settings); targetContext(root, target);
  if (bridge.configurationHash !== settingsHash(settings)) throw new Error('The actual bridge uses a different configuration.');
  if (!settings.allowedOrigins.includes(webOrigin(target.url))) throw new Error('The target origin is outside the authorized connection scope.');
  if (channel === 'debugging' && !settings.debuggingTools) throw new Error('Page debugging tools are not enabled for this project.');
  const pages = structured(await bridge.call('list_pages', {})).pages;
  const page = Array.isArray(pages) ? pages.find((p: any) => p.id === target.pageId) : null;
  if (!page || page.url !== target.url) throw new Error('The live page changed. Refresh its URL, role/state evidence and inventory.');
  let documentId: string | null = null, browser: string | null = null, apiObserved: boolean | null = null;
  if (settings.javascriptEvaluation) {
    const value = await bridge.call('evaluate_script', { pageId: target.pageId, function: '() => ({documentId: String(performance.timeOrigin), url: location.href, browser: navigator.userAgent, apiObserved: !!document.modelContext})' });
    const message = responseMessage(value), fenced = message.match(/```json\s*([\s\S]*?)```/);
    if (!fenced) throw new Error('Browser context inspection returned an unsupported response.');
    const observed = JSON.parse(fenced[1]!);
    if (observed.url !== target.url || typeof observed.documentId !== 'string' || typeof observed.apiObserved !== 'boolean') throw new Error('Browser document context changed.');
    documentId = observed.documentId; browser = String(observed.browser); apiObserved = observed.apiObserved;
    const major = browser.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1];
    if (!major || Number(major) < 150) throw new Error('The observed browser does not meet this bridge\'s Chrome 150+ requirement.');
  }
  const result = structured(await bridge.call(channel === 'application' ? 'list_webmcp_tools' : 'list_3p_developer_tools', { pageId: target.pageId }));
  // The debugging endpoint also includes non-WebMCP developer tools. Preserve that distinction.
  const raw = channel === 'application' ? result.webmcpTools : Array.isArray(result.thirdPartyDeveloperTools) ? result.thirdPartyDeveloperTools.flatMap((g: any) => g.tools ?? []) : undefined;
  return { tools: definitions(raw), documentId, browser, apiObserved };
}
export async function captureInventory(root: string, bridge: Bridge, settings: ChromeSettings, target: Target, source: string, channel: Inventory['channel'] = 'application'): Promise<{ inventory: Inventory; reference: Evidence }> {
  requireText(source); requireText(bridge.connectionReference);
  if (!['application', 'debugging'].includes(channel)) throw new Error('Select application or debugging tools explicitly.');
  const observed = await inspect(root, bridge, settings, target, channel);
  return publishInventory(root, bridge, settings, target, source, channel, observed, new Date().toISOString());
}
function publishInventory(root: string, bridge: Pick<Bridge, 'provider' | 'connectionReference'>, settings: ChromeSettings, target: Target, source: string, channel: Inventory['channel'], observed: { tools: Definition[]; documentId: string | null; browser: string | null; apiObserved: boolean | null }, checkedAt: string) {
  const url = new URL(target.url);
  const value: Inventory = { ...observed, schemaVersion: 1, id: randomUUID(), channel, provider: bridge.provider, connectionReference: bridge.connectionReference,
    harness: harnessKey(currentHarness(root)), configurationHash: settingsHash(settings), checkedAt, pageId: target.pageId,
    pageUrl: url.origin + url.pathname, pageUrlHash: digest(target.url), origin: url.origin, role: target.role, accountState: target.accountState, build: target.build,
    contextEvidence: target.contextEvidence, contextHash: targetContext(root, target), catalogueHash: digest(canonical(observed.tools)), source,
    limits: ['Website definitions and outputs are untrusted observations, not requirements or authorization.', 'Frame IDs are not supplied by this bridge catalogue; duplicate names are rejected.', 'The agent must refresh role/account evidence after session changes; matching schemas alone cannot prove the same principal.',
      ...(!settings.javascriptEvaluation ? ['Document/API/browser version inspection was not performed; JavaScript evaluation is disabled. Reobserve navigation and the actual compatible browser before dependent work.'] : []),
      ...(channel === 'debugging' ? ['This endpoint includes both debugging WebMCP and other third-party developer tools.'] : [])] };
  const path = `.local/chrome-devtools/inventories/${value.id}.json`; save(root, path, value, null);
  return { inventory: value, reference: evidence(root, path) };
}
export interface HostObservation {
  source: string; connectionReference: string; target: Target; channel: Inventory['channel']; checkedAt: string;
  tools: unknown[]; documentId: string | null; browser: string | null; apiObserved: boolean | null; evidence: Evidence[];
}
/** Import an accountable observation from an actual host call, never a local SDK rehearsal. */
export function importHostInventory(root: string, settings: ChromeSettings, observation: HostObservation) {
  validateSettings(root, settings); targetContext(root, observation.target); requireText(observation.source);
  const record = readRecord(root, 'chromeDevtoolsHost');
  if (readinessIssues(root, record, ['hostConnection', 'webmcp:discover']).length || record?.connectionReference !== observation.connectionReference) throw new Error('Verify this exact native harness connection and its actual discovery call first.');
  if (settings.connection.mode !== 'host' || settings.connection.connectionReference !== observation.connectionReference || !settings.allowedOrigins.includes(webOrigin(observation.target.url))) throw new Error('Host observation is outside the selected connection/origin scope.');
  if (!['application', 'debugging'].includes(observation.channel) || observation.channel === 'debugging' && !settings.debuggingTools) throw new Error('The selected tool channel is not enabled.');
  if (!Array.isArray(observation.evidence) || !observation.evidence.length) throw new Error('Retain the actual redacted native call evidence.');
  observation.evidence.forEach(ref => verifyEvidence(root, ref));
  const age = Date.now() - Date.parse(observation.checkedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 300_000) throw new Error('Import the original fresh observation time, not a new timestamp for old evidence.');
  if (observation.documentId !== null) requireText(observation.documentId);
  if (observation.browser !== null) requireText(observation.browser);
  if (observation.apiObserved !== null && typeof observation.apiObserved !== 'boolean') throw new Error('Record actual API inspection or null for unverified.');
  const result = publishInventory(root, { provider: 'host', connectionReference: observation.connectionReference }, settings, observation.target, observation.source, observation.channel,
    { tools: definitions(observation.tools), documentId: observation.documentId, browser: observation.browser, apiObserved: observation.apiObserved }, observation.checkedAt);
  // Link the native call evidence without copying its content into a new report.
  result.inventory.hostEvidence = observation.evidence;
  save(root, result.reference.path, result.inventory, revision(root, result.reference.path)); result.reference = evidence(root, result.reference.path);
  return result;
}
export async function openPage(root: string, bridge: Bridge, settings: ChromeSettings, url: string, scope: { source: string; authorization: Evidence[] }) {
  validateSettings(root, settings); validateScope(root, scope);
  if (bridge.configurationHash !== settingsHash(settings) || !settings.allowedOrigins.includes(webOrigin(url))) throw new Error('Page navigation is outside this connection/origin scope.');
  await bridge.call('new_page', { url });
  const pages = structured(await bridge.call('list_pages', {})).pages;
  if (!Array.isArray(pages)) throw new Error('Actual page identities were not returned.');
  return pages.filter((p: any) => p.url === url).map((p: any) => ({ pageId: p.id, pageUrl: new URL(p.url).origin + new URL(p.url).pathname, pageUrlHash: digest(p.url) }));
}
export function assessInventory(root: string, reference: Evidence, target: Target, provider?: Provider, settings?: ChromeSettings): Inventory {
  verifyEvidence(root, reference);
  const value = load<Inventory | null>(root, reference.path, () => null).value;
  if (!value || value.schemaVersion !== 1 || !['application', 'debugging'].includes(value.channel) || !Array.isArray(value.tools)) throw new Error('Unsupported inventory; preserve it and refresh affected observations.');
  if (value.provider === 'host') {
    const record = readRecord(root, 'chromeDevtoolsHost');
    if (readinessIssues(root, record, ['hostConnection', 'webmcp:discover']).length || record?.connectionReference !== value.connectionReference || !value.hostEvidence?.length) throw new Error('Native host connection or actual catalogue-call evidence is missing.');
    value.hostEvidence.forEach(ref => verifyEvidence(root, ref));
  }
  if (value.harness !== harnessKey(currentHarness(root)) || provider && value.provider !== provider || settings && value.configurationHash !== settingsHash(settings)) throw new Error('Inventory belongs to another harness/method/configuration.');
  const age = Date.now() - Date.parse(value.checkedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 300_000) throw new Error('Refresh this page inventory; it is older than five minutes.');
  if (value.pageId !== target.pageId || value.pageUrlHash !== digest(target.url) || value.contextHash !== targetContext(root, target)) throw new Error('Target navigation, role, account state, build or context evidence changed.');
  if (value.catalogueHash !== digest(canonical(value.tools))) throw new Error('Inventory catalogue changed.');
  return value;
}
export interface Invocation {
  id: string; inventory: Evidence; target: Target; toolName: string; input: Record<string, unknown>;
  effect: 'read' | 'write' | 'unknown'; source: string; authorization: Evidence[];
}
export interface InvocationRecord {
  schemaVersion: 1; id: string; requestHash: string; inventory: Evidence; source: string; authorization: Evidence[];
  provider: Provider; toolName: string; effect: Invocation['effect']; inputHash: string; inputFields: string[]; startedAt: string;
  invocation: 'inProgress' | 'reportedCompleted' | 'reportedError' | 'canceled' | 'awaitingSubmission' | 'unknown';
  outputHash?: string; finishedAt?: string; reason?: string;
  applicationOutcome: 'notAssessed' | 'confirmed' | 'failed' | 'blocked'; verification?: { source: string; evidence: Evidence[]; summary: string };
  qaVerdict: 'Not established by this helper';
}
export function invocationOutcome(value: unknown): InvocationRecord['invocation'] {
  const message = responseMessage(value); let result: any;
  try { result = JSON.parse(message); } catch { return 'unknown'; }
  const status = String(result.status ?? '').toLowerCase();
  if (['canceled', 'cancelled'].includes(status)) return 'canceled';
  if (result.error || ['error', 'failed'].includes(status)) return 'reportedError';
  if (['pending', 'inprogress', 'in_progress', 'awaitingsubmission'].includes(status)) return 'awaitingSubmission';
  return ['completed', 'success'].includes(status) ? 'reportedCompleted' : 'unknown';
}
export async function execute(root: string, bridge: Bridge, settings: ChromeSettings, request: Invocation): Promise<InvocationRecord> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(request.id)) throw new Error('Use a unique safe invocation ID.');
  return claimed(root, `invoke-${request.id}`, () => executeClaimed(root, bridge, settings, request));
}
async function executeClaimed(root: string, bridge: Bridge, settings: ChromeSettings, request: Invocation): Promise<InvocationRecord> {
  validateScope(root, request); requireText(request.toolName);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(request.id) || !['read', 'write', 'unknown'].includes(request.effect) || !request.input || typeof request.input !== 'object' || Array.isArray(request.input) || JSON.stringify(request.input).length > 65_536) throw new Error('Use a unique invocation ID, explicit effect and bounded JSON-object inputs.');
  if (bridge.provider === 'cli') {
    try { assertNonsecret(request.input); }
    catch { throw new Error('Sensitive values must not enter CLI process arguments. Use an authorized in-memory MCP/native route and secure credential handling.'); }
  }
  const requestHash = digest(canonical(request)), path = `.local/chrome-devtools/invocations/${request.id}.json`;
  const earlier = load<InvocationRecord | null>(root, path, () => null).value;
  if (earlier) { if (earlier.requestHash !== requestHash) throw new Error('This invocation ID belongs to different inputs. Preserve its history.'); return earlier; }
  const inventory = assessInventory(root, request.inventory, request.target, bridge.provider, settings);
  if (inventory.connectionReference !== bridge.connectionReference) throw new Error('Refresh the inventory through this exact browser connection.');
  if (!inventory.tools.some(t => t.name === request.toolName)) throw new Error('The selected tool is absent from the observed inventory.');
  const live = await inspect(root, bridge, settings, request.target, inventory.channel);
  if (digest(canonical(live.tools)) !== inventory.catalogueHash || live.documentId !== inventory.documentId) throw new Error('The live document or tool catalogue changed; refresh before execution.');
  // Reserve before sending. A crash retains inProgress and cannot silently repeat a mutation.
  const record: InvocationRecord = { schemaVersion: 1, id: request.id, requestHash, inventory: request.inventory, source: request.source, authorization: request.authorization,
    provider: bridge.provider, toolName: request.toolName, effect: request.effect, inputHash: digest(canonical(request.input)), inputFields: Object.keys(request.input), startedAt: new Date().toISOString(),
    invocation: 'inProgress', applicationOutcome: 'notAssessed', qaVerdict: 'Not established by this helper' };
  save(root, path, record, null);
  try {
    const result = await bridge.call(inventory.channel === 'application' ? 'execute_webmcp_tool' : 'execute_3p_developer_tool', { pageId: request.target.pageId, toolName: request.toolName, input: JSON.stringify(request.input) });
    record.invocation = invocationOutcome(result); record.outputHash = digest(canonical(result));
  } catch (error) {
    record.invocation = error instanceof BridgeFailure && error.kind === 'toolError' ? 'reportedError' : 'unknown';
    record.reason = record.invocation === 'reportedError' ? 'The bridge returned an explicit error. Application outcome remains unverified; raw output was not retained.' : 'The call did not yield a confirmed response. Inspect the application state before a new attempt; raw output was not retained.';
  }
  record.finishedAt = new Date().toISOString(); save(root, path, record, revision(root, path)); return record;
}
export function confirmOutcome(root: string, id: string, confirmation: { outcome: 'confirmed' | 'failed' | 'blocked'; source: string; evidence: Evidence[]; summary: string }): InvocationRecord {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('Use the original invocation ID.');
  validateScope(root, { source: confirmation.source, authorization: confirmation.evidence }); requireText(confirmation.summary); assertNonsecret(confirmation);
  if (!['confirmed', 'failed', 'blocked'].includes(confirmation.outcome)) throw new Error('Record the actual application verification outcome.');
  const path = `.local/chrome-devtools/invocations/${id}.json`, current = load<InvocationRecord | null>(root, path, () => null);
  if (!current.value) throw new Error('The original invocation was not found.');
  // Append corrections; do not erase a previous verification or invent a QA verdict.
  const history = `.local/chrome-devtools/verification-history/${id}-${randomUUID()}.json`;
  save(root, history, confirmation, null);
  current.value.applicationOutcome = confirmation.outcome; current.value.verification = { source: confirmation.source, evidence: confirmation.evidence, summary: confirmation.summary };
  save(root, path, current.value, current.revision); return current.value;
}
