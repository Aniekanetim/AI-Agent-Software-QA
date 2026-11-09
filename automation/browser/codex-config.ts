import { spawn } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { digest } from '../shared/store.js';

export const nativeQaConnection = 'qa-webmcp';
type Config = { mcp_servers?: Record<string, Record<string, unknown>> };
interface ConfigResponse {
  config: Config;
  layers: { name: { type: string; file?: string; profile?: string | null }; version: string; config: Config; disabledReason?: string | null }[];
}
type Request = (method: string, params: object) => Promise<unknown>;

/** Use a separate stdio config client. It cannot verify or reload the caller's browser connection. */
export async function withCodexConfig<T>(action: (request: Request) => Promise<T>, executable?: string): Promise<T> {
  if (executable && !isAbsolute(executable)) throw new Error('Use the absolute path to the actual Codex executable.');
  const child = spawn(executable ?? (process.platform === 'win32' ? 'codex.exe' : 'codex'), ['app-server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout });
  let sequence = 0;
  let pending: { id: number; accept: (value: unknown) => void; fail: (error: Error) => void } | undefined;
  const unavailable = () => new Error('Codex config access is unavailable. Check the selected host and executable, or hand off the exact rule to its owner.');
  const fail = () => pending?.fail(unavailable());
  child.on('error', fail);
  child.on('exit', fail);
  child.stdin.on('error', fail);
  lines.on('line', line => {
    if (!pending) return;
    try {
      const response = JSON.parse(line);
      if (response.id !== pending.id) return;
      if ('result' in response) pending.accept(response.result);
      else pending.fail(new Error('Codex rejected the configuration request. Inspect the current saved rule before retrying.'));
    } catch { fail(); }
  });
  const request: Request = async (method, params) => {
    const id = ++sequence;
    const timer = setTimeout(fail, 15_000);
    try {
      return await new Promise((accept, reject) => {
        pending = { id, accept, fail: reject };
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      });
    } finally { clearTimeout(timer); pending = undefined; }
  };
  try {
    await request('initialize', { clientInfo: { name: 'ai-agent-software-qa', version: '1' }, capabilities: { experimentalApi: true } });
    child.stdin.write('{"method":"initialized"}\n');
    return await action(request);
  } finally { lines.close(); child.stdin.destroy(); child.kill(); }
}

export async function readNativeQaConfig(request: Request, root: string) {
  const response = await request('config/read', { cwd: root, includeLayers: true }) as ConfigResponse;
  const layer = response?.layers?.find(item => item.name.type === 'user' && item.name.profile == null && item.disabledReason == null);
  const file = layer?.name.file, version = layer?.version;
  const server = layer?.config?.mcp_servers?.[nativeQaConnection];
  const effective = response?.config?.mcp_servers?.[nativeQaConnection];
  const overridden = response?.layers?.some(item => item !== layer && item.disabledReason == null && item.config?.mcp_servers?.[nativeQaConnection] !== undefined);
  if (!file || !isAbsolute(file) || !version || !server || typeof server.command !== 'string' || !effective || effective.enabled === false || effective.environment_id !== 'local' || overridden || server.command !== effective.command || !Array.isArray(server.args) || server.args.some(arg => typeof arg !== 'string') || !isDeepStrictEqual(server.args, effective.args)) {
    throw new Error('Use the supported setup or owner handoff for this qa-webmcp connection. An editable, unshadowed local user configuration was not verified.');
  }
  return { file, version, revision: digest(JSON.stringify([resolve(file), version])), config: layer.config, effective, args: server.args as string[] };
}

export function nativeRuleAddition(args: string[], rule: string) {
  const flag = '--allowedUrlPattern';
  const start = args.indexOf(flag);
  if (start === -1 || args.lastIndexOf(flag) !== start || args.slice(0, start).includes('--') || args.some(arg => arg.startsWith(flag + '='))) throw new Error('Use the owner handoff for this qa-webmcp allowlist format.');
  const next = args.findIndex((arg, index) => index > start && arg.startsWith('-'));
  const end = next === -1 ? args.length : next;
  const rules = args.slice(start + 1, end);
  if (!rules.length) throw new Error('Confirm the existing qa-webmcp allowlist before editing it.');
  const present = rules.includes(rule);
  return { present, rules, args: present ? args : [...args.slice(0, end), rule, ...args.slice(end)] };
}

export async function writeNativeQaConfig(request: Request, root: string, before: Awaited<ReturnType<typeof readNativeQaConfig>>, args: string[]) {
  const result = await request('config/batchWrite', {
    edits: [{ keyPath: 'mcp_servers.qa-webmcp.args', mergeStrategy: 'replace', value: args }],
    filePath: before.file, expectedVersion: before.version, reloadUserConfig: false,
  }) as { status: string; version: string; filePath: string };
  const after = await readNativeQaConfig(request, root);
  const expected = structuredClone(before.config);
  expected.mcp_servers![nativeQaConnection]!.args = args;
  if (result?.status !== 'ok' || result.version !== after.version || before.file !== after.file || result.filePath !== after.file || !isDeepStrictEqual(after.config, expected) || !isDeepStrictEqual(after.effective, { ...before.effective, args })) {
    throw new Error('The saved qa-webmcp rule could not be verified. Inspect current settings before retrying or claiming access.');
  }
  return after;
}
