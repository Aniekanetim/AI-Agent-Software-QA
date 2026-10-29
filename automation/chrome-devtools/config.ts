import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { load, privatePath, requireText, verifyEvidence, assertNonsecret, digest, type Evidence } from '../shared/store.js';
import { selectedCommand } from '../tools/registry.js';
import { toolVisibility, readToolPolicy } from '../tools/policy.js';

export const settingsPath = '.local/chrome-devtools-settings.json';
export interface ChromeSettings {
  schemaVersion: 1; source: string; evidence: Evidence[];
  visibility: 'headed' | 'headless';
  connection: { mode: 'launch'; executablePath: string; profile: 'isolated' | 'project' } | { mode: 'existing'; browserUrl: string } | { mode: 'host'; connectionReference: string };
  allowedOrigins: string[]; debuggingTools: boolean; javascriptEvaluation: boolean;
  usageStatistics: boolean; performanceCrux: boolean;
}
export function nodeCompatible(version = process.versions.node): boolean {
  const [major, minor] = version.split('.').map(Number);
  return Number.isInteger(major) && Number.isInteger(minor) && (major! > 22 || major === 22 && minor! >= 12);
}
export function webOrigin(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol) || url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Use HTTPS or a loopback HTTP origin, without credentials.');
  return url.origin;
}
export function validateSettings(root: string, settings: ChromeSettings): void {
  assertNonsecret(settings);
  if (!settings || settings.schemaVersion !== 1) throw new Error('Unsupported Chrome settings; preserve them for explicit migration.');
  requireText(settings.source, 'Actual settings source');
  if (!Array.isArray(settings.evidence) || !settings.evidence.length) throw new Error('Reference the actual settings/scope evidence.');
  settings.evidence.forEach(ref => verifyEvidence(root, ref));
  if (!['headed', 'headless'].includes(settings.visibility)) throw new Error('Set actual browser visibility.');
  for (const key of ['debuggingTools', 'javascriptEvaluation', 'usageStatistics', 'performanceCrux'] as const) if (typeof settings[key] !== 'boolean') throw new Error(`Set ${key} explicitly.`);
  if (!Array.isArray(settings.allowedOrigins) || !settings.allowedOrigins.length || settings.allowedOrigins.some(o => webOrigin(o) !== o) || new Set(settings.allowedOrigins).size !== settings.allowedOrigins.length) throw new Error('Specify unique exact allowed origins.');
  if (settings.connection?.mode === 'launch') {
    if (!['isolated', 'project'].includes(settings.connection.profile) || !isAbsolute(settings.connection.executablePath) || !existsSync(settings.connection.executablePath)) throw new Error('Select an existing absolute browser executable and project/isolated profile.');
  } else if (settings.connection?.mode === 'existing') {
    const url = new URL(settings.connection.browserUrl);
    if (webOrigin(url.href) !== url.origin || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/' || url.search || url.hash) throw new Error('Select an explicitly authorized loopback debugging endpoint; do not store credentials.');
  } else if (settings.connection?.mode === 'host') requireText(settings.connection.connectionReference, 'Actual native harness connection');
  else throw new Error('Choose an explicit launch, existing-browser or native-host connection.');
  const required = toolVisibility(root);
  if (required !== 'any' && required !== settings.visibility) throw new Error('Chrome visibility conflicts with project constraints.');
}
export function readSettings(root: string): ChromeSettings | null {
  const value = load<ChromeSettings | null>(root, settingsPath, () => null).value;
  if (value) validateSettings(root, value); return value;
}
export function requireSettings(root: string): ChromeSettings {
  const value = readSettings(root); if (!value) throw new Error('Configure only the missing Chrome settings; preserve other onboarding answers.'); return value;
}
export function settingsHash(settings: ChromeSettings): string { return digest(JSON.stringify(settings)); }
export function checkPolicy(root: string, tool: 'chromeDevtoolsMcp' | 'chromeDevtoolsCli'): void {
  if (!nodeCompatible()) throw new Error('Chrome DevTools requires Node 22.12+ in this package.');
  const policy = readToolPolicy(root);
  if (policy?.prohibitedTools.includes(tool) || policy?.allowedTools && !policy.allowedTools.includes(tool)) throw new Error('This tool is outside the project tool policy.');
}
export function launchArguments(root: string, settings: ChromeSettings): string[] {
  validateSettings(root, settings);
  if (settings.connection.mode === 'host') throw new Error('Reuse the actual native harness connection. Host mode does not launch or reconfigure a local browser.');
  const args = [
    `--headless=${settings.visibility === 'headless'}`, '--categoryExperimentalWebmcp=true',
    `--categoryExperimentalThirdParty=${settings.debuggingTools}`, '--categoryExtensions=false', '--categoryPwa=false',
    `--javascriptEvaluation=${settings.javascriptEvaluation}`, '--fileNavigations=false', '--redactNetworkHeaders=true',
    '--experimentalStructuredContent=true', `--usageStatistics=${settings.usageStatistics}`, `--performanceCrux=${settings.performanceCrux}`,
    '--workspace', realpathSync(root), '--allowedUrlPattern', ...settings.allowedOrigins.map(o => `${o}/*`),
  ];
  if (settings.connection.mode === 'existing') args.push('--browserUrl', settings.connection.browserUrl);
  else {
    args.push('--executablePath', settings.connection.executablePath, '--chromeArg=--enable-features=WebMCP');
    if (settings.connection.profile === 'isolated') args.push('--isolated=true');
    else args.push('--isolated=false', '--userDataDir', privatePath(root, '.local/chrome-devtools/profile'));
  }
  return args;
}
export function chromeEnvironment(settings?: ChromeSettings): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY: '1', NO_UPDATE_NOTIFIER: '1' };
  // Do not let a parent's privacy opt-out be removed by this integration.
  if (!settings?.usageStatistics) env.CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS = '1';
  return env;
}
export function configurationObject(root: string, settings: ChromeSettings): Record<string, unknown> {
  const result: Record<string, unknown> = {}, args = launchArguments(root, settings);
  for (let i = 0; i < args.length; i++) {
    const item = args[i]!.slice(2), at = item.indexOf('=');
    const key = at < 0 ? item : item.slice(0, at), inline = at < 0 ? undefined : item.slice(at + 1);
    if (inline !== undefined) {
      result[key!] = inline === 'true' ? true : inline === 'false' ? false : inline;
    } else if (['workspace', 'allowedUrlPattern'].includes(key!)) {
      const values: string[] = []; while (args[i + 1] && !args[i + 1]!.startsWith('--')) values.push(args[++i]!);
      result[key!] = values;
    } else result[key!] = args[++i];
  }
  // Keep Chrome flags as an array. A string here is not an equivalent launch configuration.
  if (result.chromeArg) result.chromeArg = [String(result.chromeArg)];
  return result;
}
export function mcpConfiguration(root: string) {
  checkPolicy(root, 'chromeDevtoolsMcp');
  const settings = requireSettings(root), command = selectedCommand(root, 'chromeDevtoolsMcp');
  return { mcpServers: { chromeDevtools: { command: command.executable, args: [...command.prefix, ...launchArguments(root, settings)], env: { CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY: '1', ...(!settings.usageStatistics ? { CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' } : {}) } } },
    connectionState: 'Not established by configuration output', next: 'Connect through the actual harness and retain its operation evidence as chromeDevtoolsHost. Local SDK checks do not establish native host access.' };
}
