import { readFileSync, existsSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform, arch } from 'node:os';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { contained, requireText, evidence, verifyEvidence, save, revision, type Evidence } from '../shared/store.js';
import { startFixture } from './fixture.js';

export type BrowserMethod = 'cli' | 'mcp' | 'inApp' | 'recommend';
export interface BrowserPreference { method: BrowserMethod; visibility: 'headed' | 'headless'; fallback: 'cli' | 'mcp' | null; source: string }
export interface BrowserReport {
  schemaVersion: 1; provider: 'library' | 'cli' | 'mcpServer' | 'inApp' | 'harnessMcp';
  executionContext: 'interactive' | 'scheduled'; visibility: 'headed' | 'headless' | 'hostManaged';
  root: string; platform: string; arch: string; nodeMajor: number; version: string; checkedAt: string;
  limitation?: string;
  operations: Record<string, { status: 'verified' | 'unsupported' | 'unverified' | 'denied'; evidence: Evidence[] }>;
}
const exec = promisify(execFile);
export function binary(root: string, name: string): string {
  const file = resolve(root, 'node_modules', name, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8')); const entry = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin ?? {})[0];
  if (typeof entry !== 'string') throw new Error('Install the pinned tool dependencies first.');
  return resolve(dirname(file), entry);
}
export function versions(root: string) {
  return Object.fromEntries(['playwright', '@playwright/test', '@playwright/cli', '@playwright/mcp'].map(name => [name, JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version as string]));
}
export async function installBrowsers(root: string): Promise<void> {
  // Install both actual engine revisions required by the pinned library and CLI/MCP.
  const entries = ['playwright', '@playwright/cli', '@playwright/mcp'].map(name => {
    if (name === 'playwright') return binary(root, name);
    const manifest = createRequire(resolve(root, 'node_modules', name, 'package.json')).resolve('playwright/package.json');
    return resolve(dirname(manifest), JSON.parse(readFileSync(manifest, 'utf8')).bin.playwright);
  });
  for (const entry of new Set(entries)) {
    await exec(process.execPath, [entry, 'install', 'chromium'], { cwd: root, windowsHide: true, timeout: 300_000, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve(root, '.local/browsers') } });
  }
}
export function mcpConfiguration(root: string) {
  const path = contained(root, '.local/browser-preferences.json');
  const preference = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as BrowserPreference : null;
  if (preference) validatePreference(preference);
  return { mcpServers: { playwright: { command: process.execPath, args: [binary(root, '@playwright/mcp'), '--isolated', ...(preference?.visibility === 'headless' ? ['--headless'] : [])], env: { PLAYWRIGHT_BROWSERS_PATH: resolve(root, '.local/browsers') } } } };
}
export function validatePreference(value: BrowserPreference): void {
  if (!['cli', 'mcp', 'inApp', 'recommend'].includes(value.method) || !['headed', 'headless'].includes(value.visibility) || ![null, 'cli', 'mcp'].includes(value.fallback)) throw new Error('Invalid browser preference.');
  requireText(value.source, 'Actual browser choice');
}
export function validateReport(root: string, report: BrowserReport, context: 'interactive' | 'scheduled', required: string[] = ['navigate', 'interact', 'inspect']): string[] {
  const issues: string[] = [];
  if (!report || report.schemaVersion !== 1 || report.root !== realpathSync(root) || report.platform !== platform() || report.arch !== arch() || report.nodeMajor !== Number(process.versions.node.split('.')[0]) || report.executionContext !== context || !report.version || !Number.isFinite(Date.parse(report.checkedAt))) return ['Browser report does not match this machine, root or execution context.'];
  const packageName = report.provider === 'library' ? 'playwright' : report.provider === 'cli' ? '@playwright/cli' : report.provider === 'mcpServer' ? '@playwright/mcp' : null;
  if (packageName && versions(root)[packageName] !== report.version) issues.push('The installed browser tool version changed.');
  for (const operation of required) {
    const value = report.operations[operation];
    if (!value || value.status !== 'verified' || !value.evidence.length) issues.push(`${operation}: not verified`);
    else for (const ref of value.evidence) { try { verifyEvidence(root, ref); } catch { issues.push(`${operation}: evidence changed`); } }
  }
  return issues;
}
export async function cli(root: string, args: string[], session: string) {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(session)) throw new Error('Use a named project session.');
  return exec(process.execPath, [binary(root, '@playwright/cli'), `-s=${session}`, ...args], {
    cwd: root, windowsHide: true, timeout: 90_000, maxBuffer: 4_000_000,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve(root, '.local/browsers') },
  });
}
export async function rehearse(root: string, provider: 'library' | 'cli' | 'mcpServer', headless = false, context: 'interactive' | 'scheduled' = 'interactive'): Promise<BrowserReport> {
  const fixture = await startFixture(), folder = contained(root, '.local/rehearsal'); mkdirSync(folder, { recursive: true });
  const attachment = resolve(folder, 'synthetic.txt'); writeFileSync(attachment, 'Synthetic QA capability check only.');
  const session = 'qa-' + fixture.draft.slice(0, 12), toolVersions = versions(root);
  const cache = resolve(root, '.local/browsers');
  // Explicitly select this package's browser cache without changing system/user profiles.
  const manifest = provider === 'library' ? resolve(root, 'package.json') : resolve(root, 'node_modules', provider === 'cli' ? '@playwright/cli' : '@playwright/mcp', 'package.json');
  const libraryExecutable = createRequire(manifest)('playwright').chromium.executablePath({});
  const browserPath = existsSync(cache) ? resolve(cache, relativeExecutable(libraryExecutable)) : libraryExecutable;
  const selectedExecutable = existsSync(browserPath) ? browserPath : libraryExecutable;
  const code = `async (page) => { await page.getByLabel('Name', {exact:true}).fill('Synthetic QA'); await page.getByLabel('Attachment').setInputFiles(${JSON.stringify(attachment)}); await page.getByRole('button', {name:'Save draft'}).click(); await page.locator('#result').filter({hasText:'Saved Synthetic QA'}).waitFor(); await page.reload(); await page.locator('#result').filter({hasText:'Recovered Synthetic QA synthetic.txt'}).waitFor(); return 'SYNTHETIC_OK'; }`;
  let trace = '', client: Client | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    if (provider === 'library') {
      browser = await chromium.launch({ headless, executablePath: selectedExecutable }); const page = await browser.newPage(); await page.goto(fixture.url);
      await page.getByLabel('Name', { exact: true }).fill('Synthetic QA'); await page.getByLabel('Attachment').setInputFiles(attachment); await page.getByRole('button', { name: 'Save draft' }).click(); await page.locator('#result').filter({ hasText: 'Saved Synthetic QA' }).waitFor();
      const recovered = await browser.newContext(); const other = await recovered.newPage(); await other.goto(fixture.url); await other.locator('#result').filter({ hasText: 'Recovered Synthetic QA synthetic.txt' }).waitFor();
      trace = 'Library navigation, form, upload, persisted draft and second-context recovery observed: SYNTHETIC_OK';
    } else if (provider === 'cli') {
      const config = resolve(folder, 'cli.json'); writeFileSync(config, JSON.stringify({ browser: { browserName: 'chromium', launchOptions: { headless, executablePath: selectedExecutable } }, outputDir: folder }));
      await cli(root, ['open', fixture.url, '--config', config], session);
      const result = await cli(root, ['run-code', code], session); trace = result.stdout;
      if (!trace.includes('SYNTHETIC_OK')) throw new Error('CLI did not confirm the synthetic outcome.');
    } else {
      const transport = new StdioClientTransport({ command: process.execPath, args: [binary(root, '@playwright/mcp'), '--isolated', '--executable-path', selectedExecutable, ...(headless ? ['--headless'] : [])], cwd: root, stderr: 'pipe' });
      client = new Client({ name: 'qa-capability-rehearsal', version: '1.3.0' }); await client.connect(transport);
      const tools = await client.listTools();
      if (!tools.tools.some(t => t.name === 'browser_navigate') || !tools.tools.some(t => t.name === 'browser_run_code')) throw new Error('The MCP server lacks the required rehearsal tools.');
      const nav = await client.callTool({ name: 'browser_navigate', arguments: { url: fixture.url } }); if (nav.isError) throw new Error('MCP navigation failed.');
      const result = await client.callTool({ name: 'browser_run_code', arguments: { code } }); trace = JSON.stringify(result);
      if (result.isError || !trace.includes('SYNTHETIC_OK')) throw new Error('MCP did not confirm the synthetic outcome.');
    }
    const tracePath = `.local/rehearsal/${provider}-${context}.txt`; writeFileSync(contained(root, tracePath), trace);
    const report: BrowserReport = { schemaVersion: 1, provider, executionContext: context, visibility: headless ? 'headless' : 'headed', root: realpathSync(root), platform: platform(), arch: arch(), nodeMajor: Number(process.versions.node.split('.')[0]), version: provider === 'cli' ? toolVersions['@playwright/cli']! : provider === 'mcpServer' ? toolVersions['@playwright/mcp']! : toolVersions.playwright!, checkedAt: new Date().toISOString(), operations: Object.fromEntries(['navigate', 'interact', 'inspect', 'upload', 'recover'].map(name => [name, { status: 'verified', evidence: [evidence(root, tracePath)] }])) };
    const path = `.local/browser-reports/${provider}-${context}.json`; save(root, path, report, revision(root, path)); return report;
  } catch (error: any) {
    const report: BrowserReport = { schemaVersion: 1, provider, executionContext: context, visibility: headless ? 'headless' : 'headed', root: realpathSync(root), platform: platform(), arch: arch(), nodeMajor: Number(process.versions.node.split('.')[0]), version: provider === 'cli' ? toolVersions['@playwright/cli']! : provider === 'mcpServer' ? toolVersions['@playwright/mcp']! : toolVersions.playwright!, checkedAt: new Date().toISOString(), limitation: error.code === 'EPERM' ? 'This execution environment denied child-process creation. Rehearse in a permitted host; do not treat installation/configuration as readiness.' : 'Capability rehearsal failed; inspect local tool/browser installation and retry after resolving the cause.', operations: Object.fromEntries(['navigate', 'interact', 'inspect', 'upload', 'recover'].map(name => [name, { status: error.code === 'EPERM' ? 'denied' as const : 'unverified' as const, evidence: [] }])) };
    const path = `.local/browser-reports/${provider}-${context}.json`; save(root, path, report, revision(root, path)); return report;
  } finally {
    await client?.close().catch(() => {}); await browser?.close().catch(() => {});
    if (provider === 'cli') await cli(root, ['close'], session).catch(() => {});
    await fixture.close();
  }
}
function relativeExecutable(executable: string): string {
  // Cache-independent suffix, e.g. chromium-1234/chrome-win64/chrome.exe.
  const normalized = executable.replaceAll('\\', '/'); const match = normalized.match(/((?:chromium|chromium_headless_shell)-\d+\/.*)$/);
  return match?.[1] ?? '__browser_not_found__';
}
