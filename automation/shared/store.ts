import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, rmdirSync, realpathSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export interface Evidence { path: string; sha256: string; pointer?: string }
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function requireText(value: unknown, label = 'Value'): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || /\0/.test(value)) throw new Error(`${label} is required.`);
}
export function assertNonsecret(value: unknown): void {
  if (typeof value === 'string' && /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{25,}|\bgithub_pat_[A-Za-z0-9_]{25,}|\bPMAK-[A-Za-z0-9-]{12,}|Authorization:\s*Bearer\s+\S+/i.test(value)) throw new Error('Secret-bearing material cannot be saved in reusable records.');
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (/^(password|apiKey|accessToken|refreshToken|otp|cookie|sessionToken)$/i.test(key)) throw new Error('Use a secure credential reference, not secret values.');
    assertNonsecret(child);
  }
}
export function contained(root: string, path: string): string {
  if (!path || isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.split(/[\\/]/).includes('..') || /\0/.test(path)) throw new Error('Use a project-relative path without parent traversal.');
  const base = realpathSync(root), target = resolve(base, path);
  let current = target;
  while (!existsSync(current)) current = dirname(current);
  const actual = realpathSync(current), part = relative(base, actual);
  if (part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) throw new Error('The path escapes the project through a link.');
  return target;
}
export function privatePath(root: string, path: string): string {
  if (!path.replaceAll('\\', '/').startsWith('.local/')) throw new Error('Operational state must stay under .local/.');
  const target = contained(root, path);
  if (existsSync(resolve(root, '.git'))) {
    const options = { cwd: root, encoding: 'utf8' as const, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] };
    if (execFileSync('git', ['ls-files', '--', path], options).trim()) throw new Error('Private state is tracked by Git; correct storage before saving.');
    try { execFileSync('git', ['check-ignore', '--no-index', '--quiet', path], options); }
    catch { throw new Error('Private state must be ignored by Git.'); }
  }
  return target;
}
export function revision(root: string, path: string): string | null {
  const target = contained(root, path);
  return existsSync(target) ? digest(readFileSync(target)) : null;
}
export function load<T>(root: string, path: string, empty: () => T): { value: T; revision: string | null } {
  const target = contained(root, path);
  if (!existsSync(target)) return { value: empty(), revision: null };
  const bytes = readFileSync(target);
  try { return { value: JSON.parse(bytes.toString('utf8')) as T, revision: digest(bytes) }; }
  catch { throw new Error('Saved state is unreadable. Preserve it and reconcile; do not reset it.'); }
}
export function withLock<T>(root: string, resource: string, action: () => T): T {
  const folder = privatePath(root, '.local/locks'); mkdirSync(folder, { recursive: true });
  const lock = resolve(folder, digest(resource) + '.lock');
  try { mkdirSync(lock); } catch { throw new Error('Another writer owns this operation. Reload or inspect the existing claim.'); }
  try { writeFileSync(resolve(lock, 'owner.json'), JSON.stringify({ pid: process.pid, resource, created: new Date().toISOString() })); return action(); }
  finally { if (existsSync(resolve(lock, 'owner.json'))) unlinkSync(resolve(lock, 'owner.json')); rmdirSync(lock); }
}
export function replace(root: string, path: string, content: string, expected: string | null): boolean {
  const target = contained(root, path);
  if (revision(root, path) !== expected) throw new Error('The file changed. Preserve the pending work and reconcile against its current revision.');
  if (expected === digest(content)) return false;
  mkdirSync(dirname(target), { recursive: true }); contained(root, path);
  const temporary = target + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
    if (revision(root, path) !== expected) throw new Error('A concurrent edit changed the destination.');
    renameSync(temporary, target);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  return true;
}
export function save<T>(root: string, path: string, value: T, expected: string | null): boolean {
  privatePath(root, path); assertNonsecret(value);
  return replace(root, path, JSON.stringify(value, null, 2) + '\n', expected);
}
export function atPointer(value: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) throw new Error('A JSON pointer must start with /.');
  let current = value;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (['__proto__', 'prototype', 'constructor'].includes(key) || current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) throw new Error('The referenced field is missing.');
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
export function evidence(root: string, path: string, pointer?: string): Evidence {
  const bytes = readFileSync(contained(root, path));
  return { path, sha256: pointer ? digest(JSON.stringify(atPointer(JSON.parse(bytes.toString('utf8')), pointer))) : digest(bytes), ...(pointer ? { pointer } : {}) };
}
export function verifyEvidence(root: string, ref: Evidence): void {
  if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256) || evidence(root, ref.path, ref.pointer).sha256 !== ref.sha256) throw new Error('Referenced evidence is missing or changed; revalidate affected preparation.');
}
export function readInput<T>(root: string, path: string): T {
  privatePath(root, path);
  try { return JSON.parse(readFileSync(contained(root, path), 'utf8')) as T; }
  catch { throw new Error('Use a readable private JSON input file.'); }
}
