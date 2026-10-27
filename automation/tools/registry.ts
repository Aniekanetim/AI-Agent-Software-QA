import { existsSync, readFileSync, realpathSync, statSync, mkdirSync } from 'node:fs';
import { resolve, dirname, delimiter, isAbsolute, basename, sep } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { privatePath, load, save, revision, digest, requireText, verifyEvidence, assertNonsecret, withLock } from '../shared/store.js';
import { localGh } from '../github/install.js';
import { currentHarness, harnessKey, type HarnessIdentity, type OperationEvidence } from './runtime.js';

export const tools = ['playwrightCli', 'playwrightMcp', 'playwrightLibrary', 'playwrightTest', 'github', 'postman'] as const;
export type NativeTool = typeof tools[number];
export type ToolId = NativeTool | 'inAppBrowser' | 'harnessMcp' | `email:${string}`;
const definitions: Record<NativeTool, { name: string; packageName?: string; major?: number }> = {
  playwrightCli: { name: 'playwright-cli', packageName: '@playwright/cli', major: 0 },
  playwrightMcp: { name: 'playwright-mcp', packageName: '@playwright/mcp', major: 0 },
  playwrightLibrary: { name: 'playwright', packageName: 'playwright', major: 1 },
  playwrightTest: { name: 'playwright', packageName: '@playwright/test', major: 1 },
  github: { name: 'gh', major: 2 }, postman: { name: 'postman', packageName: 'postman-cli', major: 1 },
};
export interface Command { executable: string; prefix: string[]; origin: 'explicit' | 'path' | 'bundled'; packageRoot?: string; stamp: string }
export interface ToolRecord {
  schemaVersion: 1; tool: ToolId; harness: HarnessIdentity; source: string; checkedAt: string;
  available: boolean; accessible: boolean; compatible: boolean; version: string | null;
  authentication: 'notRequired' | 'connected' | 'needsAuthentication' | 'denied' | 'unverified';
  account?: string; command?: Command; connectionReference?: string;
  capabilities: Record<string, OperationEvidence>; diagnostic?: string;
}
interface Selection { command: Command; harnessKey: string; source: string }
const selectionsPath = '.local/tool-selections.json';
export const commandStamp = (command: Pick<Command, 'executable' | 'prefix'>) => digest(JSON.stringify([command.executable, ...command.prefix].map(path => {
  if (!isAbsolute(path)) throw new Error('Tool executable and entry point must be absolute paths.');
  const s = statSync(path); if (!s.isFile()) throw new Error('Tool entry is not a file.');
  return [realpathSync(path), s.size, s.mtimeMs];
})));
export function makeCommand(executable: string, prefix: string[] = [], origin: Command['origin'] = 'explicit', packageRoot?: string): Command {
  if (/\.(cmd|bat|ps1)$/i.test(executable)) throw new Error('Use the native binary or Node entry point instead of a shell shim.');
  const command = { executable: realpathSync(executable), prefix, origin, ...(packageRoot ? { packageRoot } : {}) };
  return { ...command, stamp: commandStamp(command) };
}
export function packageCommand(root: string, tool: NativeTool, origin: Command['origin'] = 'bundled'): Command | null {
  const name = definitions[tool].packageName; if (!name) return null;
  try {
    const manifest = createRequire(resolve(root, 'package.json')).resolve(`${name}/package.json`);
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    const entry = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin ?? {})[0];
    if (tool === 'postman') {
      const os = ({ win32: 'windows', darwin: 'macos', linux: 'linux' } as Record<string, string>)[process.platform];
      const binary = createRequire(manifest).resolve(`@postman/pm-bin-${os}-${process.arch}/bin/postman${process.platform === 'win32' ? '.exe' : ''}`);
      return makeCommand(binary, [], origin, dirname(manifest));
    }
    return typeof entry === 'string' ? makeCommand(process.execPath, [resolve(dirname(manifest), entry)], origin, dirname(manifest)) : null;
  } catch { return null; }
}
export function candidates(root: string, tool: NativeTool, searchPath = process.env.PATH ?? ''): Command[] {
  const result: Command[] = [], definition = definitions[tool];
  if (tool === 'playwrightLibrary' || tool === 'playwrightTest') { const item = packageCommand(root, tool); return item ? [item] : []; }
  for (const dir of searchPath.split(delimiter).filter(Boolean)) {
    const folder = resolve(dir.replace(/^"|"$/g, ''));
    if (definition.packageName) for (const base of [folder, resolve(folder, '..', 'lib'), ...(basename(folder) === '.bin' ? [resolve(folder, '..', '..')] : [])]) {
      const manifest = resolve(base, 'node_modules', definition.packageName, 'package.json');
      if (existsSync(manifest)) {
        // Standard npm shims resolve to the actual package entry; never execute shell text.
        const command = packageCommand(base, tool, 'path'); if (command) result.push(command);
      }
    }
    for (const suffix of process.platform === 'win32' ? ['.exe', ''] : ['']) {
      const file = resolve(folder, definition.name + suffix);
      if (existsSync(file)) { try { result.push(makeCommand(file, [], 'path')); } catch { /* A directory or shell wrapper is not a callable native tool. */ } }
    }
  }
  if (tool === 'github') { try { const file = localGh(root); if (existsSync(file)) result.push(makeCommand(file, [], 'bundled')); } catch { /* Optional platform installer. */ } }
  const bundled = packageCommand(root, tool); if (bundled) result.push(bundled);
  // npm prepends this framework's .bin to PATH. It is still a fallback, not a pre-existing user installation.
  const frameworkModules = resolve(root, 'node_modules') + sep;
  for (const item of result) if (item.origin === 'path' && [item.executable, ...item.prefix].some(path => path.startsWith(frameworkModules))) item.origin = 'bundled';
  result.sort((a, b) => Number(a.origin === 'bundled') - Number(b.origin === 'bundled'));
  return result.filter((item, index) => result.findIndex(other => other.stamp === item.stamp) === index);
}
export interface ProcessResult { code: number | null; stdout: string; stderr: string; error?: 'denied' | 'missing' | 'timeout' | 'launchFailed' }
export type Runner = (command: Command, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number }) => Promise<ProcessResult>;
export function isolatedPostmanEnvironment(root: string, input: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const home = privatePath(root, '.local/postman/isolated-home'); mkdirSync(home, { recursive: true });
  const env = { ...input }; for (const key of Object.keys(env)) if (/^POSTMAN_/i.test(key)) delete env[key];
  return { ...env, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, XDG_CONFIG_HOME: home, POSTMAN_CLI_SKIP_GUEST_NOTICE: '1' };
}
const exec = promisify(execFile);
export const runProcess: Runner = async (command, args, options = {}) => {
  try {
    if (commandStamp(command) !== command.stamp) return { code: null, stdout: '', stderr: '', error: 'launchFailed' };
    const result = await exec(command.executable, [...command.prefix, ...args], { ...options, windowsHide: true, timeout: options.timeout ?? 30_000, maxBuffer: 16_000_000, encoding: 'utf8', shell: false });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    return { code: typeof error.code === 'number' ? error.code : null, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? ''),
      ...(typeof error.code === 'number' ? {} : { error: error.code === 'EPERM' || error.code === 'EACCES' ? 'denied' as const : error.code === 'ENOENT' ? 'missing' as const : error.killed ? 'timeout' as const : 'launchFailed' as const }) };
  }
};
export function selectedCommand(root: string, tool: NativeTool, fallback = true): Command {
  const selections = load<Record<string, Selection>>(root, selectionsPath, () => ({})).value;
  const selected = selections[tool];
  if (selected) {
    if (selected.harnessKey !== harnessKey(currentHarness(root)) || selected.command.stamp !== commandStamp(selected.command)) throw new Error(`${tool}: selected tool or calling harness changed. Recheck only this capability; do not reinstall automatically.`);
    return selected.command;
  }
  if (!fallback) throw new Error(`${tool}: run tools scan or tools select first.`);
  const candidate = candidates(root, tool)[0]; if (!candidate) throw new Error(`${tool}: no callable installation was found.`); return candidate;
}
export function selectCommand(root: string, tool: NativeTool, command: Command, source: string): void {
  requireText(source); const identity = currentHarness(root);
  if (!tools.includes(tool) || commandStamp(command) !== command.stamp) throw new Error('Select an unchanged supported executable.');
  if (['playwrightLibrary', 'playwrightTest'].includes(tool) && command.stamp !== packageCommand(root, tool)?.stamp) throw new Error('Library/Test use the project suite dependency; do not substitute a global library.');
  withLock(root, 'tool-selections', () => {
    const current = load<Record<string, Selection>>(root, selectionsPath, () => ({}));
    const old = current.value[tool];
    if (old?.command.stamp === command.stamp && old.harnessKey === harnessKey(identity)) return;
    current.value[tool] = { command, harnessKey: harnessKey(identity), source }; save(root, selectionsPath, current.value, current.revision);
  });
}
export const recordPath = (tool: ToolId, identity: HarnessIdentity) => `.local/tools/reports/${digest(tool).slice(0, 12)}-${harnessKey(identity)}.json`;
export function readRecord(root: string, tool: ToolId): ToolRecord | null { return load<ToolRecord | null>(root, recordPath(tool, currentHarness(root)), () => null).value; }
export function saveRecord(root: string, record: ToolRecord): void {
  if (!record.source?.trim() || record.schemaVersion !== 1 || harnessKey(currentHarness(root)) !== harnessKey(record.harness)) throw new Error('Capability evidence must identify the actual calling harness and source.');
  assertNonsecret(record);
  for (const capability of Object.values(record.capabilities)) {
    if (!['verified', 'unverified', 'denied', 'unsupported'].includes(capability.status)) throw new Error('Invalid capability state.');
    if (capability.status === 'verified' && !capability.evidence.length) throw new Error('Verified capabilities need actual evidence.');
    if (capability.status === 'verified') capability.checkedAt ??= record.checkedAt;
    for (const ref of capability.evidence) verifyEvidence(root, ref);
  }
  const path = recordPath(record.tool, record.harness); save(root, path, record, revision(root, path));
}
export function readinessIssues(root: string, record: ToolRecord | null, required: string[], maxAgeMs = 86_400_000): string[] {
  if (!record) return ['No capability verification exists for this calling harness.'];
  const issues: string[] = [];
  if (harnessKey(currentHarness(root)) !== harnessKey(record.harness)) issues.push('The harness or execution context changed.');
  if (!record.available) issues.push('Tool not found.');
  else if (!record.accessible) issues.push('This harness cannot invoke the tool; installation may already exist.');
  else if (!record.compatible) issues.push('Required command compatibility has not been established.');
  if (required.some(name => name !== 'version') && !['notRequired', 'connected'].includes(record.authentication)) issues.push('Verify the affected account authentication; preserve the working installation.');
  const age = Date.now() - Date.parse(record.checkedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > maxAgeMs) issues.push('Refresh the affected capability evidence.');
  if (record.command) { try { if (selectedCommand(root, record.tool as NativeTool, false).stamp !== record.command.stamp) issues.push('The executable selection changed.'); } catch { issues.push('Recheck the selected executable.'); } }
  for (const name of required) {
    const item = record.capabilities[name]; if (item?.status !== 'verified') issues.push(`${name}: ${item?.status ?? 'unverified'}`);
    if (item?.status === 'verified') { const age = Date.now() - Date.parse(item.checkedAt ?? record.checkedAt); if (!Number.isFinite(age) || age < -60_000 || age > maxAgeMs) issues.push(`${name}: refresh this operation's evidence`); }
    for (const ref of item?.evidence ?? []) { try { verifyEvidence(root, ref); } catch { issues.push(`${name}: evidence changed`); } }
  }
  return issues;
}
export async function probe(root: string, tool: NativeTool, source: string, runner: Runner = runProcess, explicit?: Command): Promise<ToolRecord> {
  requireText(source); if (!tools.includes(tool)) throw new Error('Unknown bundled tool.');
  const identity = currentHarness(root), previous = load<Record<string, Selection>>(root, selectionsPath, () => ({})).value[tool];
  // A saved explicit choice is never silently replaced when it fails.
  const options = explicit ? [explicit] : previous ? [previous.command] : candidates(root, tool);
  let record: ToolRecord = { schemaVersion: 1, tool, harness: identity, source, checkedAt: new Date().toISOString(), available: options.length > 0, accessible: false, compatible: false, version: null, authentication: 'notRequired', capabilities: {} };
  for (const command of options) {
    const result = await runner(command, ['--version'], { cwd: root, env: tool === 'postman' ? isolatedPostmanEnvironment(root) : { ...process.env, NO_UPDATE_NOTIFIER: '1' } });
    const version = result.stdout.match(/\b(\d+\.\d+\.\d+(?:-[\w.]+)?)/)?.[1] ?? null;
    const compatible = result.code === 0 && version !== null && Number(version.split('.')[0]) === definitions[tool].major;
    record = { ...record, accessible: result.code === 0, compatible, version, command, diagnostic: result.error ?? (compatible ? undefined : 'Required version could not be verified.') };
    if (compatible) {
      selectCommand(root, tool, command, source);
      const earlier = readRecord(root, tool);
      if (earlier?.command?.stamp === command.stamp && earlier.version === version) {
        record.capabilities = { ...earlier.capabilities };
        record.authentication = earlier.authentication;
        if (earlier.account) record.account = earlier.account;
      }
      const path = `.local/tools/probes/${digest(tool).slice(0, 12)}-${harnessKey(identity)}.json`;
      const observed = { tool, version, executable: command.executable, prefix: command.prefix, harness: identity, source, checkedAt: record.checkedAt };
      save(root, path, observed, revision(root, path));
      const { evidence } = await import('../shared/store.js');
      record.capabilities.version = { status: 'verified', evidence: [evidence(root, path)] }; break;
    }
    if (result.error === 'denied') break;
  }
  saveRecord(root, record); return record;
}
export async function scan(root: string, source: string, requested: NativeTool[] = [...tools]): Promise<{ records: ToolRecord[]; next: string }> {
  const records: ToolRecord[] = []; for (const tool of requested) records.push(await probe(root, tool, source));
  return { records, next: 'Reuse compatible selections. Version checks do not establish browser interaction, API execution or account access. Run only the missing relevant capability check; inspect native host integrations separately.' };
}
export function recordHost(root: string, input: Omit<ToolRecord, 'schemaVersion' | 'harness' | 'checkedAt'>): ToolRecord {
  if (!['inAppBrowser', 'harnessMcp'].includes(input.tool) && !input.tool.startsWith('email:')) throw new Error('Native executables require the real CLI probe.');
  requireText(input.connectionReference, 'Actual host connection reference');
  if (input.command) throw new Error('Host reports cannot replace executable selections.');
  const record: ToolRecord = { ...input, schemaVersion: 1, harness: currentHarness(root), checkedAt: new Date().toISOString() };
  saveRecord(root, record); return record;
}
export function status(root: string, tool: ToolId, required: string[]) {
  const record = readRecord(root, tool), issues = readinessIssues(root, record, required);
  return { tool, reusable: !issues.length, issues, record, next: issues.length ? 'Resolve only these missing capabilities; do not repeat installation or account selection without a reason.' : 'Reuse the verified configuration. Recheck live access before dependent task execution.' };
}
