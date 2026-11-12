import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { contained, digest } from '../shared/store.js';

export const boardRoot = 'QA task management Board';
export const statuses = ['Ready for QA', 'Dev Todo', 'Tested-Ok', 'Retest', 'Rework', 'Deferred', 'Canceled'] as const;
export type Status = typeof statuses[number];
export const validId = (id: string) => /^[A-Z][A-Z0-9]{0,15}-\d{1,9}$/.test(id);

export function regularDirectory(root: string, path: string) {
  const target = contained(root, path);
  if (existsSync(target) && (!lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink())) {
    throw new Error('Board directories must be regular directories.');
  }
}

export function field(text: string, name: string) {
  const prefix = `| ${name} |`, line = text.split(/\r?\n/).find(row => row.startsWith(prefix));
  return line ? line.slice(prefix.length).replace(/\|\s*$/, '').trim().replace(/\\\|/g, '|') : 'Not recorded';
}

export function boardFiles(root: string) {
  regularDirectory(root, boardRoot);
  return statuses.flatMap(status => {
    const folder = `${boardRoot}/${status}`;
    regularDirectory(root, folder);
    if (!existsSync(contained(root, folder))) throw new Error('The canonical local board is incomplete. Run board upgrade or reconcile its visibility.');
    return readdirSync(contained(root, folder), { withFileTypes: true }).flatMap(entry => {
      if (!entry.name.endsWith('.md')) return [];
      if (entry.isSymbolicLink()) throw new Error('Use regular Markdown ticket files; reconcile symbolic links before board intake.');
      if (!entry.isFile()) return [];
      const path = `${folder}/${entry.name}`, text = readFileSync(contained(root, path), 'utf8');
      const id = text.match(/^\uFEFF?#\s+([A-Z][A-Z0-9]{0,15}-\d{1,9})(?=[:\s]|$)/m)?.[1];
      if (!id || !validId(id)) throw new Error(`Record a stable ticket ID in the heading of ${path}.`);
      return [{ id, status, path, text, revision: digest(text) }];
    });
  });
}
