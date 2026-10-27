import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform, arch } from 'node:os';
import { privatePath, requireText, digest, save, revision } from '../shared/store.js';

export const ghVersion = '2.102.0';
const exec = promisify(execFile);
export function artifact(os = platform(), cpu = arch()): string {
  const system = { win32: 'windows', linux: 'linux', darwin: 'macOS' }[os as string];
  const architecture = { x64: 'amd64', arm64: 'arm64' }[cpu as string];
  if (!system || !architecture) throw new Error('Use the official GitHub CLI installation procedure for this platform.');
  return `gh_${ghVersion}_${system}_${architecture}.${system === 'linux' ? 'tar.gz' : 'zip'}`;
}
export function expectedChecksum(text: string, name: string): string {
  const line = text.split(/\r?\n/).map(row => row.trim().split(/\s+/)).find(row => row[1]?.replace(/^\*/, '') === name);
  if (!line || !/^[a-f0-9]{64}$/i.test(line[0]!)) throw new Error('The official checksum manifest does not cover the selected archive.');
  return line[0]!.toLowerCase();
}
export function archiveDirectory(name: string, entries: string[]): string {
  const base = name.replace(/\.(zip|tar\.gz)$/, '');
  const windowsFlat = name.includes('_windows_');
  if (!entries.length || entries.some(path => path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..') || (windowsFlat ? !['LICENSE', 'bin/gh.exe'].includes(path) : !path.startsWith(base + '/')))) throw new Error('Archive entries do not stay within the expected tool directory.');
  return windowsFlat ? base : '.';
}
export function localGh(root: string): string {
  return resolve(root, '.local/tools/github-cli', artifact().replace(/\.(zip|tar\.gz)$/, ''), 'bin', platform() === 'win32' ? 'gh.exe' : 'gh');
}
async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Official GitHub CLI download failed (HTTP ${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}
export async function installGh(root: string, source: string) {
  requireText(source, 'Actual tool-install instruction'); const name = artifact();
  const folder = privatePath(root, '.local/tools/github-cli'); mkdirSync(folder, { recursive: true });
  const prefix = `https://github.com/cli/cli/releases/download/v${ghVersion}/`;
  const checksum = expectedChecksum((await download(prefix + `gh_${ghVersion}_checksums.txt`)).toString('utf8'), name);
  const bytes = await download(prefix + name); if (digest(bytes) !== checksum) throw new Error('The GitHub CLI archive checksum differs. Nothing will be extracted.');
  const archive = resolve(folder, name); writeFileSync(archive, bytes);
  const entries = (await exec('tar', ['-tf', archive], { windowsHide: true })).stdout.split(/\r?\n/).filter(Boolean);
  const extraction = resolve(folder, archiveDirectory(name, entries)); mkdirSync(extraction, { recursive: true });
  await exec('tar', ['-xf', archive, '-C', extraction], { windowsHide: true });
  const executable = localGh(root); if (!existsSync(executable)) throw new Error('The expected GitHub CLI executable was not extracted.');
  if (platform() !== 'win32') chmodSync(executable, 0o700);
  const version = (await exec(executable, ['--version'], { windowsHide: true })).stdout.split('\n')[0];
  if (!version?.startsWith(`gh version ${ghVersion} `)) throw new Error('The extracted tool did not report the pinned version.');
  const path = '.local/tools/github-cli/install-record.json'; save(root, path, { version, artifact: name, sha256: checksum, source, platform: platform(), arch: arch(), checkedAt: new Date().toISOString() }, revision(root, path));
  return { version, executable, next: 'Authenticate through the official CLI in an interactive terminal, then verify the selected account/repositories.' };
}
