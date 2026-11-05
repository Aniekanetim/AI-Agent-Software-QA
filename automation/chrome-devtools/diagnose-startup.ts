// Maintainer reproducer: one HTTP response, the pinned bridge's browser/DevTools
// stack, one navigation per fresh browser. No QA framework or MCP transport.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';
import { fixtureBrowser, fixtureChrome, verifyFixtureBridge } from './fixture-browser.js';

const root = process.cwd(), count = Number(process.env.QA_CHROME_STARTUP_RUNS ?? '1');
if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('QA_CHROME_STARTUP_RUNS must be an integer from 1 to 100. No browser was launched.');
verifyFixtureBridge(root);
// These private upstream modules are deliberately bound to the reviewed bridge
// version above. They are used for diagnosis, not a new application adapter.
const { puppeteer } = await import(pathToFileURL(resolve(root, 'node_modules/chrome-devtools-mcp/build/src/third_party/index.js')).href);
const { createTargetUniverse, overrideDevToolsGlobals } = await import(pathToFileURL(resolve(root, 'node_modules/chrome-devtools-mcp/build/src/devtools/DevtoolsUtils.js')).href);
overrideDevToolsGlobals({ loadResource: async () => ({ success: false }) });
const executable = process.env.QA_CHROME_EXECUTABLE ?? fixtureBrowser(root);
for (let iteration = 1; iteration <= count; iteration++) {
  let requests = 0, browser: any, result: Record<string, unknown>;
  const server = createServer((_request, response) => {
    requests++; response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Browser startup diagnosis</title><h1>Ready</h1>');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  try {
    browser = await puppeteer.launch({ executablePath: executable, headless: process.env.QA_CHROME_HEADED === '0', pipe: true, defaultViewport: null,
      args: ['--enable-features=WebMCP', '--hide-crash-restore-bubble'], allowlist: [new URL(url).origin + '/*'] });
    const [page] = await browser.pages(), session = await page.createCDPSession();
    await session.send('Page.enable'); await createTargetUniverse(session, { sourceMaps: true });
    void page.emulateFocusedPage(true).catch(() => {}); // Mirrors upstream's asynchronous focus setup.
    let error: string | undefined; const started = Date.now();
    try { await page.goto(url, { timeout: 10_000 }); } catch (cause) { error = String(cause); }
    result = { iteration, synthetic: true, bridge: fixtureChrome.bridge, browser: await browser.version(), executable,
      passed: page.url() === url && requests > 0, requests, blank: page.url() === 'about:blank', elapsedMs: Date.now() - started, error };
  } catch (cause) { result = { iteration, synthetic: true, passed: false, phase: 'setup', requests, error: String(cause) }; }
  finally {
    try { await browser?.close(); }
    finally { await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }); }
  }
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
}
