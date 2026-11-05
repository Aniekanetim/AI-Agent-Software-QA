import { mkdirSync, existsSync, rmdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { privatePath, load, save, revision, verifyEvidence, requireText, digest, type Evidence } from '../shared/store.js';
import { currentHarness, harnessKey } from '../tools/runtime.js';
import { selectedCommand, selectCommand, commandStamp, runProcess, readRecord, readinessIssues, type Runner, type Command } from '../tools/registry.js';
import { checkPolicy, chromeEnvironment, configurationObject, launchArguments, settingsHash, validateSettings, type ChromeSettings } from './config.js';

export type Provider = 'mcpServer' | 'cli' | 'host';
export interface Bridge {
  provider: Provider; connectionReference: string; configurationHash: string;
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
}
export interface Scope { source: string; authorization: Evidence[] }
export class BridgeFailure extends Error {
  constructor(readonly kind: 'toolError' | 'transport' | 'unsupportedResponse', message: string) { super(message); }
}
interface CliSession {
  schemaVersion: 1; id: string; source: string; authorization: Evidence[]; harness: string;
  command: Command; settings: ChromeSettings; settingsHash: string; configPath: string; configHash: string;
  state: 'starting' | 'running' | 'closed' | 'uncertain'; createdAt: string;
}
export function validateScope(root: string, scope: Scope): void {
  requireText(scope.source, 'Actual task/preparation source');
  if (!Array.isArray(scope.authorization) || !scope.authorization.length) throw new Error('Link the actual scoped authorization; this helper cannot grant approval.');
  scope.authorization.forEach(ref => verifyEvidence(root, ref));
}
function verifiedInstallation(root: string, tool: 'chromeDevtoolsMcp' | 'chromeDevtoolsCli'): void {
  if (readinessIssues(root, readRecord(root, tool), ['version']).length) throw new Error('Scan the actual selected Chrome DevTools executable before starting this session.');
}
function idPath(id: string): string {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Use the exact integration-owned session ID.');
  return `.local/chrome-devtools/sessions/${id}.json`;
}
function profileClaim(settings: ChromeSettings): string | null {
  if (settings.connection.mode === 'existing') return 'existing-' + digest(new URL(settings.connection.browserUrl).origin).slice(0, 24);
  return settings.connection.mode === 'launch' && settings.connection.profile === 'project' ? 'project-profile' : null;
}
/** Hold the claim through async execution; the shared synchronous lock is intentionally not used. */
export async function claimed<T>(root: string, key: string, action: () => Promise<T>): Promise<T> {
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(key)) throw new Error('Use an integration-owned claim key.');
  const path = privatePath(root, `.local/chrome-devtools/claims/${key}`); mkdirSync(dirname(path), { recursive: true });
  try { mkdirSync(path); } catch { throw new Error('This browser/session is claimed. Preserve it; inspect its owner before recovery.'); }
  save(root, `.local/chrome-devtools/claims/${key}/owner.json`, { pid: process.pid, checkedAt: new Date().toISOString() }, null);
  try { return await action(); }
  finally {
    // Remove only this claim's exact files, never another profile or daemon.
    const { unlinkSync } = await import('node:fs'); unlinkSync(privatePath(root, `.local/chrome-devtools/claims/${key}/owner.json`)); rmdirSync(path);
  }
}
function checkResponse(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The bridge returned an unsupported response.');
  if ((value as { isError?: boolean }).isError) throw new BridgeFailure('toolError', 'The browser tool returned an explicit error; retain the application outcome separately.');
  if (JSON.stringify(value).length > 262_144) throw new Error('Browser response exceeded the integration limit. Inspect affected work before retry.');
  return value;
}
export function structured(value: unknown): Record<string, any> {
  const result = checkResponse(value) as Record<string, any>;
  return result.structuredContent && typeof result.structuredContent === 'object' ? result.structuredContent : result;
}
/** The upstream CLI can emit a text-error array with exit code zero. */
export function decodeCliResponse(stdout: string): unknown {
  if (stdout.length > 262_144) throw new BridgeFailure('unsupportedResponse', 'CLI response exceeded the integration limit. Inspect affected work before retry.');
  let value: unknown;
  try { value = JSON.parse(stdout); }
  catch { throw new BridgeFailure('unsupportedResponse', 'CLI did not return supported JSON. Inspect the application outcome before retry.'); }
  if (Array.isArray(value)) {
    if (value.some(part => part && part.type === 'text' && typeof part.text === 'string' && /^Error:/m.test(part.text))) throw new BridgeFailure('toolError', 'The browser tool reported an explicit error despite CLI exit code zero. Inspect the application outcome before retry.');
    throw new BridgeFailure('unsupportedResponse', 'CLI returned legacy text without the required structured result.');
  }
  return checkResponse(value);
}
export function responseMessage(value: unknown): string {
  const result = structured(value);
  if (typeof result.message === 'string') return result.message;
  if (result.snapshot && typeof result.snapshot === 'object') return JSON.stringify(result.snapshot);
  const content = Array.isArray(result.content) ? result.content : (value as any)?.content;
  if (Array.isArray(content)) return content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  return '';
}
export async function withMcpSession<T>(root: string, settings: ChromeSettings, scope: Scope, action: (bridge: Bridge) => Promise<T>): Promise<T> {
  checkPolicy(root, 'chromeDevtoolsMcp'); validateSettings(root, settings); validateScope(root, scope);
  verifiedInstallation(root, 'chromeDevtoolsMcp');
  const harness = currentHarness(root), command = selectedCommand(root, 'chromeDevtoolsMcp');
  selectCommand(root, 'chromeDevtoolsMcp', command, scope.source);
  const id = randomUUID();
  const run = async () => {
    const client = new Client({ name: 'ai-agent-software-qa', version: '1.9.1' });
    const transport = new StdioClientTransport({ command: command.executable, args: [...command.prefix, ...launchArguments(root, settings)], cwd: root, env: chromeEnvironment(settings) as Record<string, string>, stderr: 'pipe' });
    const bridge: Bridge = { provider: 'mcpServer', connectionReference: `local-sdk:${harnessKey(harness)}:${id}`, configurationHash: settingsHash(settings),
      call: async (name, args) => {
        checkPolicy(root, 'chromeDevtoolsMcp');
        if (harnessKey(currentHarness(root)) !== harnessKey(harness)) throw new Error('The calling harness changed; preserve this session and reverify affected access.');
        validateScope(root, scope); validateSettings(root, settings);
        if (commandStamp(command) !== command.stamp) throw new Error('The selected MCP executable changed.');
        return checkResponse(await client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 }));
      } };
    transport.stderr?.on('data', () => { /* Never retain raw browser/server diagnostics. */ });
    try { await client.connect(transport); return await action(bridge); }
    finally { await client.close().catch(() => {}); await transport.close().catch(() => {}); }
  };
  const claim = profileClaim(settings); return claim ? claimed(root, claim, run) : run();
}
function session(root: string, id: string, permitClosed = false): CliSession {
  const value = load<CliSession | null>(root, idPath(id), () => null).value;
  if (!value || value.schemaVersion !== 1 || value.id !== id || value.harness !== harnessKey(currentHarness(root))) throw new Error('Session does not belong to this root/harness.');
  if (!permitClosed) { validateScope(root, value); validateSettings(root, value.settings); }
  if ((!permitClosed && (value.settingsHash !== settingsHash(value.settings) || revision(root, value.configPath) !== value.configHash)) || commandStamp(value.command) !== value.command.stamp || selectedCommand(root, 'chromeDevtoolsCli').stamp !== value.command.stamp) throw new Error('Session configuration/executable changed. Preserve it for investigation.');
  if (!permitClosed && value.state !== 'running') throw new Error('Session is not running. Preserve uncertain outcomes; start a new explicit session only after investigation.');
  return value;
}
function cliEnvironment(root: string, value: CliSession): NodeJS.ProcessEnv {
  const env = chromeEnvironment(value.settings);
  // The CLI can auto-start a lost daemon. Its only discoverable configuration must
  // still be this session's pinned settings, never global/default settings.
  delete env.CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY;
  env.PLUGIN_DATA = dirname(privatePath(root, value.configPath));
  return env;
}
export async function startCliSession(root: string, settings: ChromeSettings, scope: Scope, runner: Runner = runProcess): Promise<{ id: string; state: string }> {
  checkPolicy(root, 'chromeDevtoolsCli'); validateSettings(root, settings); validateScope(root, scope);
  verifiedInstallation(root, 'chromeDevtoolsCli');
  const command = selectedCommand(root, 'chromeDevtoolsCli'), id = randomUUID();
  selectCommand(root, 'chromeDevtoolsCli', command, scope.source);
  const configPath = `.local/chrome-devtools/config/${id}/cd4a.config.json`;
  save(root, configPath, configurationObject(root, settings), null);
  const value: CliSession = { ...scope, schemaVersion: 1, id, harness: harnessKey(currentHarness(root)), command, settings, settingsHash: settingsHash(settings), configPath, configHash: revision(root, configPath)!, state: 'starting', createdAt: new Date().toISOString() };
  save(root, idPath(id), value, null);
  const claimKey = profileClaim(settings);
  if (claimKey) {
    const claim = privatePath(root, `.local/chrome-devtools/claims/${claimKey}`); mkdirSync(dirname(claim), { recursive: true });
    try { mkdirSync(claim); } catch { throw new Error('A project-profile claim exists. Inspect its recorded owner before recovery.'); }
    save(root, `.local/chrome-devtools/claims/${claimKey}/owner.json`, { id, source: scope.source, pid: process.pid }, null);
  }
  const result = await runner(command, ['start', '--sessionId', id, '--config', privatePath(root, configPath)], { cwd: root, env: cliEnvironment(root, value), timeout: 60_000 });
  value.state = result.code === 0 ? 'running' : 'uncertain'; save(root, idPath(id), value, revision(root, idPath(id)));
  if (value.state !== 'running') throw new Error(`CLI session start failed (${result.error ?? 'executionError'}). Inspect the retained session; no automatic restart occurred.`);
  return { id, state: value.state };
}
export function cliBridge(root: string, id: string, runner: Runner = runProcess): Bridge {
  const initial = session(root, id);
  return { provider: 'cli', connectionReference: `owned-cli:${id}`, configurationHash: initial.settingsHash,
    call: async (name, args) => claimed(root, id, async () => {
      checkPolicy(root, 'chromeDevtoolsCli'); const value = session(root, id);
      const status = await runner(value.command, ['status', '--sessionId', id], { cwd: root, env: cliEnvironment(root, value) });
      const identity = status.stdout.match(/pid=(\d+).*version=([^\s]+)/);
      let actualArgs: unknown; try { actualArgs = JSON.parse(status.stdout.match(/^args=(.+)$/m)?.[1] ?? 'null'); } catch { /* Unsupported status. */ }
      const at = Array.isArray(actualArgs) ? actualArgs.indexOf('--config') : -1;
      const actualConfig = Array.isArray(actualArgs) ? at >= 0 ? actualArgs[at + 1] : actualArgs.find(a => typeof a === 'string' && a.startsWith('--config='))?.slice('--config='.length) : undefined;
      if (status.code !== 0 || !identity || actualConfig !== privatePath(root, value.configPath)) throw new Error('The owned daemon is unavailable or its settings changed. No tool call was sent.');
      if (name === 'evaluate_script' && args.sourcePath !== undefined && (typeof args.sourcePath !== 'string' || !args.sourcePath.trim() || /^(?:https?|file):/i.test(args.sourcePath))) throw new Error('Use an actual local source path for this filesystem operation; remote source retrieval is not supported by this adapter.');
      const positional: Record<string, string[]> = { new_page: ['url'], navigate_page: ['pageId'], list_webmcp_tools: ['pageId'], list_3p_developer_tools: ['pageId'], execute_webmcp_tool: ['pageId', 'toolName'], execute_3p_developer_tool: ['pageId', 'toolName'], take_snapshot: ['pageId'], evaluate_script: args.sourcePath !== undefined ? [] : ['function'] };
      if (!['list_pages', ...Object.keys(positional)].includes(name)) throw new Error('Use a supported structured Chrome adapter operation.');
      const required = positional[name] ?? [], commandArgs = [name, ...required.map(key => { if (args[key] === undefined) throw new Error(`Missing ${key}.`); return String(args[key]); })];
      for (const [key, val] of Object.entries(args)) if (!required.includes(key)) commandArgs.push(`--${key}`, typeof val === 'string' ? val : JSON.stringify(val));
      commandArgs.push('--sessionId', id, '--output-format=json');
      const result = await runner(value.command, commandArgs, { cwd: root, env: cliEnvironment(root, value), timeout: 60_000 });
      if (result.code !== 0) throw new BridgeFailure(!result.error && /^Error:/m.test(result.stderr) ? 'toolError' : 'transport', 'Browser call did not complete successfully; inspect actual application state before retry.');
      const after = await runner(value.command, ['status', '--sessionId', id], { cwd: root, env: cliEnvironment(root, value) });
      if (after.code !== 0 || after.stdout.match(/pid=(\d+)/)?.[1] !== identity[1]) throw new Error('Daemon changed during the call. Investigate the application outcome before retry.');
      return decodeCliResponse(result.stdout);
    }) };
}
export async function stopCliSession(root: string, id: string, runner: Runner = runProcess): Promise<void> {
  await claimed(root, id, async () => {
    const value = session(root, id, true); if (value.state === 'closed') return;
    const result = await runner(value.command, ['stop', '--sessionId', id], { cwd: root, env: cliEnvironment(root, value), timeout: 30_000 });
    if (result.code !== 0) throw new Error('Owned daemon cleanup failed; retain its claim for recovery.');
    value.state = 'closed'; save(root, idPath(id), value, revision(root, idPath(id)));
    const claimKey = profileClaim(value.settings);
    if (claimKey) {
      const ownerPath = `.local/chrome-devtools/claims/${claimKey}/owner.json`;
      const owner = load<{ id: string } | null>(root, ownerPath, () => null).value;
      if (owner?.id === id) { const { unlinkSync } = await import('node:fs'); unlinkSync(privatePath(root, ownerPath)); rmdirSync(dirname(privatePath(root, ownerPath))); }
    }
  });
}
