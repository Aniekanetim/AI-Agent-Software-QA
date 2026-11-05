import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Browser, BrowserPlatform, computeExecutablePath } from '@puppeteer/browsers';
import { fixtureChrome, fixtureChromeOptions, fixtureBrowser, verifyFixtureBridge } from '../chrome-devtools/fixture-browser.js';

test('the DevTools fixture selects one reviewed browser revision on Windows and Linux', () => {
  verifyFixtureBridge(process.cwd());
  for (const platform of [BrowserPlatform.WIN64, BrowserPlatform.LINUX]) {
    assert.deepEqual(fixtureChromeOptions(process.cwd(), platform), {
      browser: Browser.CHROME, buildId: fixtureChrome.build, cacheDir: resolve('.local/chrome-for-testing'), platform,
    });
  }
});

test('missing DevTools fixture browser fails before launch without a Playwright/system fallback', () => {
  const root = resolve('output/Chrome fixture selection', randomUUID());
  mkdirSync(resolve(root, 'node_modules/chrome-devtools-mcp'), { recursive: true });
  writeFileSync(resolve(root, 'node_modules/chrome-devtools-mcp/package.json'), JSON.stringify({ version: fixtureChrome.bridge }));
  assert.throws(() => fixtureBrowser(root), /npm run chrome:install explicitly/);
  assert.equal(existsSync(resolve(root, '.local/chrome-for-testing')), false);
  assert.throws(() => fixtureChromeOptions(root, 'unknown' as BrowserPlatform), /platform/);
  const emptyExecutable = computeExecutablePath(fixtureChromeOptions(root));
  mkdirSync(resolve(emptyExecutable, '..'), { recursive: true }); writeFileSync(emptyExecutable, '');
  assert.throws(() => fixtureBrowser(root), /cached fixture executable is empty/);
});

test('a bridge upgrade requires deliberate browser-baseline review', () => {
  const root = resolve('output/Chrome fixture selection', randomUUID());
  mkdirSync(resolve(root, 'node_modules/chrome-devtools-mcp'), { recursive: true });
  writeFileSync(resolve(root, 'node_modules/chrome-devtools-mcp/package.json'), JSON.stringify({ version: '0.21.0' }));
  assert.throws(() => verifyFixtureBridge(root), /bridge changed/);
});
