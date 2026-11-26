// Disposable-process verification helper. Never used by product entry points.
import fs from 'node:fs';
import { resolve } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { catalogProgress, reserveCatalogPage, commitCatalogPage, failCatalogPage } from '../company-context/catalog.js';
import { readObject, connection, headPath } from '../company-context/store.js';
import { refresh } from '../company-context/sync.js';
import { FakeSlack } from './company-fixture.js';
const [root, mode, id] = process.argv.slice(2) as [string, string, string];
const wait = () => new Promise<void>(done => process.once('message', () => done()));
try {
  if (mode === 'catalog') {
    const catalog = readObject<any>(root, catalogProgress(root, id).value.catalog);
    const token = reserveCatalogPage(root, catalog);
    process.send?.({ stage: 'reserved', token }); await wait();
    try { const result = commitCatalogPage(root, catalog, new FakeSlack().page([]), Date.now(), token); process.send?.({ stage: 'completed', complete: result.complete }); }
    catch (error) { process.send?.({ stage: 'rejected', error: failCatalogPage(root, catalog, error, token).message }); }
  } else if (mode === 'inflight') {
    const adapter = new FakeSlack(); adapter.historyHook = async () => { process.send?.({ stage: 'reading' }); await wait(); return adapter.page([{ channelId: 'C1', ts: '200.000001', authorId: 'U2', text: 'Must not restore removed scope' }]); };
    const result = await refresh(root, id, adapter, { budget: 1 }); process.send?.({ stage: 'completed', state: result.job.state });
  } else {
    const rename = fs.renameSync; let jobWrites = 0;
    const headFile = resolve(root, headPath(connection(root, 'slack').identity));
    const originalHead = fs.readFileSync(headFile, 'utf8');
    fs.renameSync = ((from: fs.PathLike, to: fs.PathLike) => {
      const path = String(to);
      if (path === resolve(root, `.local/company-context/sync/${id}.json`)) jobWrites++;
      if (mode === 'head-crash' && jobWrites >= 2 && path === resolve(root, `.local/company-context/sync/${id}.json`) && fs.readFileSync(headFile, 'utf8') !== originalHead ||
          mode === 'completion-crash' && path.includes(`${resolve(root, '.local/company-context/completion-heads')}`)) {
        process.send?.({ stage: 'crashed', mode, jobWrites }); process.exit(73);
      }
      return rename(from, to);
    }) as typeof fs.renameSync;
    syncBuiltinESMExports();
    await refresh(root, id, new FakeSlack());
    throw new Error('The requested persistence seam was not reached.');
  }
} catch (error) { process.send?.({ stage: 'error', message: (error as Error).message }); process.exitCode = 1; }
process.disconnect?.();
