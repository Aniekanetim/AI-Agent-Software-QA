import { existsSync, readFileSync, statSync, statfsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Browser, BrowserPlatform, computeExecutablePath, detectBrowserPlatform, install } from '@puppeteer/browsers';

// Package-fixture compatibility baseline; deliberately independent of the
// Playwright browser and Puppeteer's default download. Validate both platforms
// and modes before changing this pair. See docs/windows-browser-startup.md.
export const fixtureChrome = Object.freeze({ bridge: '1.12.0', build: '156.0.8078.80' });

export function fixtureChromeOptions(root: string, platform = detectBrowserPlatform()) {
  if (!platform || !Object.values(BrowserPlatform).includes(platform)) throw new Error('No Chrome for Testing fixture is configured for this platform. Use an explicitly verified compatible --executable.');
  return { browser: Browser.CHROME, buildId: fixtureChrome.build, cacheDir: resolve(root, '.local/chrome-for-testing'), platform };
}

export function verifyFixtureBridge(root: string) {
  const actual = JSON.parse(readFileSync(resolve(root, 'node_modules/chrome-devtools-mcp/package.json'), 'utf8')).version;
  if (actual !== fixtureChrome.bridge) throw new Error('The Chrome DevTools bridge changed. Review its browser compatibility baseline before installing/running the package fixture.');
}

export function fixtureBrowser(root: string): string {
  verifyFixtureBridge(root);
  const executable = computeExecutablePath(fixtureChromeOptions(root));
  if (!existsSync(executable)) throw new Error('The pinned Chrome for Testing fixture is absent. Run npm run chrome:install explicitly, or pass an actual compatible --executable. No browser was installed or substituted automatically.');
  if (statSync(executable).size === 0) throw new Error('The cached fixture executable is empty, possibly after an interrupted extraction. Preserve diagnostics and remove/reinstall that exact disposable browser version with the browser installer.');
  return executable;
}

export async function installFixtureChrome(root: string) {
  verifyFixtureBridge(root);
  const options = fixtureChromeOptions(root), executable = computeExecutablePath(options);
  if (!existsSync(executable)) {
    const disk = statfsSync(root);
    if (disk.bavail * disk.bsize < 2 * 1024 ** 3) throw new Error('At least 2 GiB of free disk space is required before downloading/extracting the fixture browser. No download started. Reuse a complete compatible installation or free space first.');
  } else fixtureBrowser(root); // Reject a known empty extraction instead of claiming installation success.
  const browser = await install({ ...options, installDeps: false });
  fixtureBrowser(root);
  return { browser: 'Chrome for Testing', build: browser.buildId, bridge: fixtureChrome.bridge, executable: browser.executablePath,
    operationVerified: false, note: 'Package fixture installation only; no browser launch, native harness connection or product testing.' };
}
