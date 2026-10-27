import { readFileSync, existsSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform, arch } from 'node:os';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { contained, requireText, evidence, verifyEvidence, save, revision, assertNonsecret, type Evidence } from '../shared/store.js';
import { startFixture } from './fixture.js';
import { selectedCommand, selectCommand, readRecord, saveRecord, type NativeTool } from '../tools/registry.js';
import { currentHarness, harnessKey, type HarnessIdentity, type ExecutionContext } from '../tools/runtime.js';

export type BrowserMethod = 'cli' | 'mcp' | 'inApp' | 'recommend';
export interface BrowserPreference { method: BrowserMethod; visibility: 'headed' | 'headless'; fallback: 'cli' | 'mcp' | null; source: string }
export interface BrowserReport {
  schemaVersion: 1; provider: 'library' | 'cli' | 'mcpServer' | 'inApp' | 'harnessMcp';
  executionContext: ExecutionContext; visibility: 'headed' | 'headless' | 'hostManaged';
  root: string; platform: string; arch: string; nodeMajor: number; version: string; checkedAt: string;
  limitation?: string;
  harness?: HarnessIdentity;
  operations: Record<string, { status: 'verified' | 'unsupported' | 'unverified' | 'denied'; evidence: Evidence[] }>;
}
const exec = promisify(execFile);
const browserTool = (name: string): NativeTool => name === '@playwright/cli' ? 'playwrightCli' : name === '@playwright/mcp' ? 'playwrightMcp' : name === '@playwright/test' ? 'playwrightTest' : 'playwrightLibrary';
function toolVersion(root: string, name: string): string {
  const command = selectedCommand(root, browserTool(name));
  if (command.packageRoot) return JSON.parse(readFileSync(resolve(command.packageRoot, 'package.json'), 'utf8')).version;
  const record = readRecord(root, browserTool(name)); if (!record?.version) throw new Error('Verify the selected browser executable version first.'); return record.version;
}
export function binary(root: string, name: string): string {
  const file = resolve(root, 'node_modules', name, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8')); const entry = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin ?? {})[0];
  if (typeof entry !== 'string') throw new Error('Install the pinned tool dependencies first.');
  return resolve(dirname(file), entry);
}
export function versions(root: string) {
  return Object.fromEntries(['playwright', '@playwright/test', '@playwright/cli', '@playwright/mcp'].map(name => [name, toolVersion(root, name)]));
}
export async function installBrowsers(root: string): Promise<void> {
  // Install both actual engine revisions required by the pinned library and CLI/MCP.
  const entries = ['playwright', '@playwright/cli', '@playwright/mcp'].map(name => {
    if (name === 'playwright') return binary(root, name);
    const command = selectedCommand(root, browserTool(name));
    if (!command.packageRoot) throw new Error('Browser installation for this executable needs its documented version-specific procedure; preserve the selected installation.');
    const manifest = createRequire(resolve(command.packageRoot, 'package.json')).resolve('playwright/package.json');
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
  const command = selectedCommand(root, 'playwrightMcp');
  return { mcpServers: { playwright: { command: command.executable, args: [...command.prefix, '--isolated', ...(preference?.visibility === 'headless' ? ['--headless'] : [])], env: { PLAYWRIGHT_BROWSERS_PATH: resolve(root, '.local/browsers') } } } };
}
export function validatePreference(value: BrowserPreference): void {
  if (!['cli', 'mcp', 'inApp', 'recommend'].includes(value.method) || !['headed', 'headless'].includes(value.visibility) || ![null, 'cli', 'mcp'].includes(value.fallback)) throw new Error('Invalid browser preference.');
  requireText(value.source, 'Actual browser choice');
}
export function validateReport(root: string, report: BrowserReport, context: ExecutionContext, required: string[] = ['navigate', 'interact', 'inspect']): string[] {
  const issues: string[] = [];
  try { if (!report.harness || harnessKey(report.harness) !== harnessKey(currentHarness(root, context))) issues.push('Verify this browser through the current harness; legacy evidence is retained.'); } catch { issues.push('Identify the calling harness before browser verification.'); }
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
  const command = selectedCommand(root, 'playwrightCli');
  return exec(command.executable, [...command.prefix, `-s=${session}`, ...args], {
    cwd: root, windowsHide: true, timeout: 90_000, maxBuffer: 4_000_000,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1', PLAYWRIGHT_BROWSERS_PATH: resolve(root, '.local/browsers') },
  });
}
export async function rehearse(root: string, provider: 'library' | 'cli' | 'mcpServer', headless = false, context: ExecutionContext = 'interactive'): Promise<BrowserReport> {
  const harness = currentHarness(root, context);
  const selectedTool = provider === 'library' ? 'playwrightLibrary' : provider === 'cli' ? 'playwrightCli' : 'playwrightMcp';
  const selected = selectedCommand(root, selectedTool);
  if (provider !== 'library' && !selected.packageRoot) throw new Error('This browser executable needs its package location for engine-compatible rehearsal. Select its npm package entry or use its documented host verification; preserve the installation.');
  selectCommand(root, selectedTool, selected, 'Actual browser rehearsal executable selection');
  const fixture = await startFixture(), folder = contained(root, '.local/rehearsal'); mkdirSync(folder, { recursive: true });
  const attachment = resolve(folder, 'synthetic.txt'); writeFileSync(attachment, 'Synthetic QA capability check only.');
  const session = 'qa-' + fixture.draft.slice(0, 12), toolVersions = versions(root);
  const cache = resolve(root, '.local/browsers');
  // Explicitly select this package's browser cache without changing system/user profiles.
  const manifest = provider === 'library' ? resolve(root, 'package.json') : resolve(selected.packageRoot ?? dirname(selected.executable), 'package.json');
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
      const transport = new StdioClientTransport({ command: selected.executable, args: [...selected.prefix, '--isolated', '--executable-path', selectedExecutable, ...(headless ? ['--headless'] : [])], cwd: root, stderr: 'pipe' });
      client = new Client({ name: 'qa-capability-rehearsal', version: '1.3.0' }); await client.connect(transport);
      const tools = await client.listTools();
      for (const name of ['browser_navigate', 'browser_type', 'browser_click', 'browser_file_upload', 'browser_wait_for', 'browser_snapshot']) if (!tools.tools.some(t => t.name === name)) throw new Error(`The pinned MCP server did not expose ${name}.`);
      const call = async (name: string, args: Record<string, unknown>) => {
        const result = await client!.callTool({ name, arguments: args }); const text = JSON.stringify(result); trace += `${name}: ${text}\n`;
        if (result.isError) throw new Error(`Synthetic MCP ${name} failed: ${text.slice(0, 1500)}`); return text;
      };
      await call('browser_navigate', { url: fixture.url });
      await call('browser_type', { target: '#name', text: 'Synthetic QA', element: 'Synthetic Name field' });
      await call('browser_click', { target: '#file', element: 'Synthetic attachment input' });
      await call('browser_file_upload', { paths: [attachment] });
      await call('browser_click', { target: 'button', element: 'Save synthetic draft' });
      await call('browser_wait_for', { text: 'Saved Synthetic QA' });
      await call('browser_navigate', { url: fixture.url });
      const recovered = await call('browser_snapshot', {});
      if (!recovered.includes('Recovered Synthetic QA synthetic.txt')) throw new Error('MCP did not show the recovered synthetic draft.');
    }
    const tracePath = `.local/rehearsal/${harnessKey(harness)}/${provider}-${context}-${Date.now()}.txt`; mkdirSync(dirname(contained(root, tracePath)), { recursive: true }); writeFileSync(contained(root, tracePath), trace);
    const report: BrowserReport = { schemaVersion: 1, harness, provider, executionContext: context, visibility: headless ? 'headless' : 'headed', root: realpathSync(root), platform: platform(), arch: arch(), nodeMajor: Number(process.versions.node.split('.')[0]), version: provider === 'cli' ? toolVersions['@playwright/cli']! : provider === 'mcpServer' ? toolVersions['@playwright/mcp']! : toolVersions.playwright!, checkedAt: new Date().toISOString(), operations: Object.fromEntries(['navigate', 'interact', 'inspect', 'upload', 'recover'].map(name => [name, { status: 'verified', evidence: [evidence(root, tracePath)] }])) };
    const path = `.local/browser-reports/${provider}-${context}.json`; save(root, path, report, revision(root, path));
    const history = `.local/browser-reports/history/${harnessKey(harness)}/${provider}-${context}-${Date.now()}.json`; save(root, history, report, null);
    saveRecord(root, { schemaVersion: 1, tool: provider === 'library' ? 'playwrightLibrary' : provider === 'cli' ? 'playwrightCli' : 'playwrightMcp', harness, source: 'Actual synthetic browser rehearsal', checkedAt: report.checkedAt, available: true, accessible: true, compatible: true, version: report.version, authentication: 'notRequired', command: selected, capabilities: report.operations });
    return report;
  } catch (error: any) {
    let diagnostic = String(error.message ?? 'Unknown fixture error').slice(0, 1800); try { assertNonsecret(diagnostic); } catch { diagnostic = 'Sensitive diagnostic suppressed.'; }
    const report: BrowserReport = { schemaVersion: 1, harness, provider, executionContext: context, visibility: headless ? 'headless' : 'headed', root: realpathSync(root), platform: platform(), arch: arch(), nodeMajor: Number(process.versions.node.split('.')[0]), version: provider === 'cli' ? toolVersions['@playwright/cli']! : provider === 'mcpServer' ? toolVersions['@playwright/mcp']! : toolVersions.playwright!, checkedAt: new Date().toISOString(), limitation: error.code === 'EPERM' ? 'This execution environment denied child-process creation. Rehearse in a permitted host; do not treat installation/configuration as readiness.' : `Synthetic capability rehearsal failed: ${diagnostic}`, operations: Object.fromEntries(['navigate', 'interact', 'inspect', 'upload', 'recover'].map(name => [name, { status: error.code === 'EPERM' ? 'denied' as const : 'unverified' as const, evidence: [] }])) };
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
