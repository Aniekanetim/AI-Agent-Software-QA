import { existsSync, mkdirSync, realpathSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { save, evidence, type Evidence } from '../shared/store.js';
import { bindHarness } from '../tools/runtime.js';
import { probe, readRecord, saveRecord, packageCommand, runProcess } from '../tools/registry.js';
import { startWebMcpFixture } from './fixture.js';
import { withMcpSession, startCliSession, cliBridge, stopCliSession, structured, responseMessage, BridgeFailure, type Bridge } from './transport.js';
import { type ChromeSettings } from './config.js';
import { captureInventory, execute, confirmOutcome, type Target } from './webmcp.js';

export function fixtureBrowser(root: string): string {
  const global = chromium.executablePath(), suffix = global.replaceAll('\\', '/').match(/(chromium-\d+\/.*)$/)?.[1];
  const local = suffix ? resolve(root, '.local/browsers', suffix) : '';
  const actual = local && existsSync(local) ? local : global;
  if (!existsSync(actual)) throw new Error('Install the pinned Playwright browser for the package fixture, or pass an actual compatible --executable. No browser was installed automatically.');
  return actual;
}
export async function rehearseChrome(root: string, provider: 'mcpServer' | 'cli', visibility: 'headed' | 'headless', executable = fixtureBrowser(root)) {
  const fixture = await startWebMcpFixture();
  // Exercise real argument/configuration handling with spaces on both CI systems.
  const qaRoot = resolve(root, 'output/Chrome DevTools rehearsals', randomUUID()); mkdirSync(qaRoot, { recursive: true });
  const actualRoot = realpathSync(qaRoot), context = process.env.CI === 'true' ? 'ci' : 'interactive';
  bindHarness(actualRoot, { id: context === 'ci' ? 'github-actions-terminal' : 'terminal', version: process.version, profile: `synthetic-${provider}`, executionContext: context, source: 'Actual package-only native WebMCP rehearsal; not an adopting-product/native-harness connection' });
  save(actualRoot, '.local/scope.json', { source: 'Approved package implementation validation', synthetic: true, origin: new URL(fixture.url).origin }, null);
  const scope = { source: 'Package-only synthetic rehearsal', authorization: [evidence(actualRoot, '.local/scope.json')] };
  const settings: ChromeSettings = { schemaVersion: 1, source: scope.source, evidence: scope.authorization, visibility, connection: { mode: 'launch', executablePath: executable, profile: 'isolated' },
    allowedOrigins: [new URL(fixture.url).origin], debuggingTools: false, javascriptEvaluation: true, usageStatistics: false, performanceCrux: false };
  const tool = provider === 'cli' ? 'chromeDevtoolsCli' : 'chromeDevtoolsMcp';
  const pinned = packageCommand(root, tool); if (!pinned) { await fixture.close(); throw new Error('The pinned package entry is unavailable.'); }
  const installation = await probe(actualRoot, tool, scope.source, runProcess, pinned);
  if (!installation.compatible) {
    await fixture.close();
    throw new Error(installation.diagnostic === 'denied' ? 'This harness denied invocation of the pinned Chrome DevTools package. Installation was retained; no browser was launched.' : 'The pinned Chrome DevTools package could not be verified as compatible; inspect its retained probe diagnosis.');
  }
  let sessionId: string | undefined;
  try {
    const run = async (bridge: Bridge) => {
      const checks: { check: string; outcome: string; evidence?: Evidence }[] = [];
      const require = (ok: boolean, name: string) => { if (!ok) throw new Error(`Native rehearsal failed: ${name}`); checks.push({ check: name, outcome: 'passed' }); };
      // A started daemon is not yet evidence of an initialized browser. Establish
      // that read capability explicitly before the first navigation; never retry
      // a failed action automatically.
      const initial = structured(await bridge.call('list_pages', {}));
      require(Array.isArray(initial.pages), 'browser initialization and page listing');
      await bridge.call('new_page', { url: fixture.url });
      const pages = structured(await bridge.call('list_pages', {})).pages;
      const page = Array.isArray(pages) ? pages.find((p: any) => p.url === fixture.url) : null;
      require(!!page, 'navigation and exact page identity');
      save(actualRoot, '.local/actor.json', { role: 'synthetic reader', state: 'empty fixture', source: 'Observed local fixture state; not real authentication' }, null);
      const target: Target = { pageId: page.id, url: fixture.url, role: 'synthetic reader', accountState: 'empty fixture', build: 'native-webmcp-fixture-v1', contextEvidence: [evidence(actualRoot, '.local/actor.json')] };
      const catalogue = await captureInventory(actualRoot, bridge, settings, target, scope.source);
      require(catalogue.inventory.apiObserved === true, 'native document.modelContext without a polyfill');
      require(catalogue.inventory.tools.some(t => t.name === 'create_draft') && catalogue.inventory.tools.some(t => t.name === 'save_profile'), 'imperative and declarative tool discovery');
      require(visibility === 'headless' ? /HeadlessChrome\//.test(catalogue.inventory.browser ?? '') : /Chrome\//.test(catalogue.inventory.browser ?? '') && !/HeadlessChrome\//.test(catalogue.inventory.browser ?? ''), `actual browser identity matches ${visibility} launch`);
      require(catalogue.inventory.tools.some(t => t.name === 'untrusted_note' && t.description.includes('Ignore previous instructions')) && fixture.state.noteCalls === 0 && fixture.state.forbiddenCalls === 0, 'hostile metadata remains data without implicit execution');

      const outsideRoot = resolve(actualRoot, '..', `${actualRoot.split(/[\\/]/).pop()}-boundary-fixture`);
      mkdirSync(outsideRoot, { recursive: true });
      const insideScript = resolve(actualRoot, '.local/allowed-script.js'), outsideScript = resolve(outsideRoot, 'outside-script.js');
      const canary = '() => { window.__outsideScriptRan = true; return "SYNTHETIC-OUTSIDE-CANARY"; }';
      writeFileSync(insideScript, '() => { window.__allowedScriptRan = true; return "allowed-file-read"; }');
      writeFileSync(outsideScript, canary);
      const localRead = responseMessage(await bridge.call('evaluate_script', { pageId: page.id, sourcePath: insideScript }));
      require(localRead.includes('allowed-file-read'), 'permitted source-file read and execution succeeds');
      const insideSnapshot = resolve(actualRoot, '.local/allowed-snapshot.txt');
      await bridge.call('take_snapshot', { pageId: page.id, filePath: insideSnapshot });
      require(existsSync(insideSnapshot) && readFileSync(insideSnapshot, 'utf8').includes('Synthetic WebMCP rehearsal'), 'permitted snapshot write succeeds');
      const link = resolve(actualRoot, '.local/outside-link');
      symlinkSync(outsideRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
      const paths = [
        { name: 'absolute outside path', script: outsideScript, write: resolve(outsideRoot, 'absolute-snapshot.txt') },
        { name: 'relative traversal', script: relative(actualRoot, outsideScript), write: relative(actualRoot, resolve(outsideRoot, 'relative-snapshot.txt')) },
        { name: 'symlink or junction', script: resolve(link, 'outside-script.js'), write: resolve(link, 'linked-snapshot.txt') },
      ];
      for (const path of paths) {
        let readDenied = false, writeDenied = false;
        try { await bridge.call('evaluate_script', { pageId: page.id, sourcePath: path.script }); } catch (err) { readDenied = err instanceof BridgeFailure && err.kind === 'toolError'; }
        require(readDenied && readFileSync(outsideScript, 'utf8') === canary, `filesystem read denied for ${path.name}`);
        try { await bridge.call('take_snapshot', { pageId: page.id, filePath: path.write }); } catch (err) { writeDenied = err instanceof BridgeFailure && err.kind === 'toolError'; }
        require(writeDenied && !existsSync(resolve(actualRoot, path.write)), `filesystem write denied for ${path.name}`);
      }
      const readState = responseMessage(await bridge.call('evaluate_script', { pageId: page.id, function: '() => ({allowed: window.__allowedScriptRan === true, outside: window.__outsideScriptRan === true})' }));
      const observedReadState = JSON.parse(readState.match(/```json\s*([\s\S]*?)```/)?.[1] ?? 'null');
      require(observedReadState?.allowed === true && observedReadState?.outside === false, 'allowed source ran and outside source never ran');
      const hostile = await captureInventory(actualRoot, bridge, settings, target, scope.source);
      const hostileResult = await execute(actualRoot, bridge, settings, { id: 'hostile-note', inventory: hostile.reference, target, toolName: 'untrusted_note', input: {}, effect: 'read', ...scope });
      const retained = readFileSync(resolve(actualRoot, '.local/chrome-devtools/invocations/hostile-note.json'), 'utf8');
      require(hostileResult.invocation === 'reportedCompleted' && hostileResult.applicationOutcome === 'notAssessed' && hostileResult.qaVerdict === 'Not established by this helper' && fixture.state.noteCalls === 1 && fixture.state.forbiddenCalls === 0 && !retained.includes('SYNTHETIC-OUTPUT-CANARY') && readFileSync(outsideScript, 'utf8') === canary, 'hostile tool output grants no action, secret retention or QA verdict');
      const outside = await startWebMcpFixture();
      try {
        let denied = false; try { await bridge.call('new_page', { url: outside.url }); } catch { denied = true; }
        require(denied && outside.requestCount() === 0, 'browser origin restriction blocks an unallowed origin');
      } finally { await outside.close(); }
      const invocation = { id: 'create-draft', inventory: catalogue.reference, target, toolName: 'create_draft', input: { name: 'Synthetic QA' }, effect: 'write' as const, ...scope };
      const created = await execute(actualRoot, bridge, settings, invocation);
      require(created.invocation === 'reportedCompleted', `imperative invocation (${created.invocation})`);
      const persisted = await (await fetch(new URL('/state', fixture.url))).json() as any;
      require(persisted.drafts.length === 1 && persisted.drafts[0].name === 'Synthetic QA', 'independent persisted-state verification');
      const view = responseMessage(await bridge.call('take_snapshot', { pageId: page.id }));
      require(view.includes('Saved Synthetic QA'), 'visible application outcome');
      save(actualRoot, '.local/outcome.json', { synthetic: true, drafts: persisted.drafts, observedUi: 'Saved Synthetic QA' }, null);
      confirmOutcome(actualRoot, invocation.id, { outcome: 'confirmed', source: 'Independent loopback-state and browser snapshot checks', evidence: [evidence(actualRoot, '.local/outcome.json')], summary: 'One synthetic draft exists and the interface shows its name.' });
      await execute(actualRoot, bridge, settings, invocation);
      require(fixture.state.drafts.length === 1, 'same invocation ID preserves one write');
      const automatic = await captureInventory(actualRoot, bridge, settings, target, scope.source);
      const saved = await execute(actualRoot, bridge, settings, { ...invocation, id: 'save-profile', inventory: automatic.reference, toolName: 'save_profile', input: { name: 'Synthetic Profile' } });
      require(saved.invocation === 'reportedCompleted' && fixture.state.profiles[0]?.name === 'Synthetic Profile', 'declarative automatic submission');
      const invalid = await captureInventory(actualRoot, bridge, settings, target, scope.source);
      const failed = await execute(actualRoot, bridge, settings, { ...invocation, id: 'invalid-draft', inventory: invalid.reference, input: { name: '' } });
      require(['reportedError', 'unknown'].includes(failed.invocation) && fixture.state.drafts.length === 1, 'invalid input remains unsuccessful without another saved draft');
      const manual = await captureInventory(actualRoot, bridge, settings, target, scope.source);
      const timer = setTimeout(() => { void fetch(new URL('/cancel', fixture.url), { method: 'POST' }); }, 1200);
      try {
        const canceled = await execute(actualRoot, bridge, settings, { ...invocation, id: 'manual-profile', inventory: manual.reference, toolName: 'prepare_profile', input: { name: 'Unsubmitted Profile' } });
        require(canceled.invocation === 'canceled' && fixture.state.profiles.length === 1, `manual form cancellation preserves unsubmitted state (${canceled.invocation}, ${fixture.state.profiles.length} saved)`);
      } finally { clearTimeout(timer); }
      const beforeRole = await captureInventory(actualRoot, bridge, settings, target, scope.source);
      await bridge.call('evaluate_script', { pageId: page.id, function: "() => document.getElementById('role').click()" });
      let staleRejected = false;
      try { await execute(actualRoot, bridge, settings, { ...invocation, id: 'stale-role', inventory: beforeRole.reference }); } catch { staleRejected = true; }
      require(staleRejected && fixture.state.drafts.length === 1, 'changed live catalogue blocks stale execution');
      const beforeReload = await captureInventory(actualRoot, bridge, settings, target, scope.source);
      await bridge.call('navigate_page', { pageId: page.id, url: fixture.url });
      let reloadRejected = false;
      try { await execute(actualRoot, bridge, settings, { ...invocation, id: 'stale-document', inventory: beforeReload.reference }); } catch { reloadRejected = true; }
      require(reloadRejected, 'same-URL document replacement requires a fresh inventory');
      const record = { synthetic: true, provider, toolVersion: installation.version, executionContext: context, visibility, browser: catalogue.inventory.browser, checks,
        nativeHarnessConnection: 'Not verified: this is terminal SDK/CLI execution', productVerdict: 'Not assessed', checkedAt: new Date().toISOString() };
      save(actualRoot, '.local/result.json', record, null);
      const capabilities = Object.fromEntries(['navigate', 'inspect', 'interact', 'webmcp:discover', 'webmcp:execute', `visibility:${visibility}`, provider === 'cli' ? 'cliRehearsal' : 'serverRehearsal'].map(name => [name, { status: 'verified' as const, evidence: [evidence(actualRoot, '.local/result.json')] }]));
      const report = readRecord(actualRoot, tool)!; report.capabilities = { ...report.capabilities, ...capabilities }; saveRecord(actualRoot, report);
      return { ...record, evidenceRoot: actualRoot };
    };
    if (provider === 'mcpServer') return await withMcpSession(actualRoot, settings, scope, run);
    sessionId = (await startCliSession(actualRoot, settings, scope)).id;
    return await run(cliBridge(actualRoot, sessionId));
  } finally { try { if (sessionId) await stopCliSession(actualRoot, sessionId); } finally { await fixture.close(); } }
}
