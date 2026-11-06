import { existsSync, realpathSync } from 'node:fs';
import { contained, verifyEvidence, type Evidence } from '../shared/store.js';

/** Evidence must survive the write it justifies, including aliases to mutable files. */
export function verifyImmutable(root: string, refs: Evidence[], excluded: string[]) {
  const identity = (path: string) => { const full = contained(root, path), actual = existsSync(full) ? realpathSync(full) : full; return process.platform === 'win32' ? actual.toLowerCase() : actual; };
  const mutable = excluded.map(identity);
  for (const ref of refs) {
    if (mutable.includes(identity(ref.path))) throw new Error('Use immutable source/message evidence outside the mutable ticket, index, preferences or delivery state.');
    verifyEvidence(root, ref);
  }
}
