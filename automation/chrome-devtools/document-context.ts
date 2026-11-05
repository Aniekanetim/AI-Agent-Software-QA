import { digest } from '../shared/store.js';
import { webOrigin } from './config.js';

export interface BrowserDocument { path: string; documentId: string; url: string }

/** Inspect only document identity, not page content. Opaque/oversized trees fail closed. */
export const documentContextScript = `() => {
  const documents = [];
  let complete = true;
  const visit = (frame, path, depth) => {
    if (depth > 16 || documents.length >= 64) { complete = false; return; }
    try {
      // Reading document first also checks access for empty/opaque frames.
      if (!frame.document) { complete = false; return; }
      documents.push({path, documentId: String(frame.performance.timeOrigin), url: frame.location.href});
      for (let i = 0; i < frame.frames.length; i++) visit(frame.frames[i], path + '.' + i, depth + 1);
    } catch { complete = false; }
  };
  visit(window, '0', 0);
  return {documentId: String(performance.timeOrigin), url: location.href, browser: navigator.userAgent,
    apiObserved: !!document.modelContext, documents: complete ? documents : null};
}`;

/** Hash full URLs in memory; never retain query strings or fragments in inventories. */
export function documentTreeHash(documents: unknown, url: string, documentId: string, allowedOrigins: string[]): string | null {
  if (documents === null || documents === undefined) return null;
  if (!Array.isArray(documents) || !documents.length || documents.length > 64) throw new Error('Unsupported browser document tree.');
  const paths = new Set<string>(), rootOrigin = webOrigin(url);
  const normalized = documents.map((entry: BrowserDocument, index) => {
    if (!entry || typeof entry.path !== 'string' || !/^0(?:\.\d+){0,16}$/.test(entry.path) || paths.has(entry.path) || typeof entry.documentId !== 'string' || !entry.documentId.trim() || typeof entry.url !== 'string') throw new Error('Unsupported browser frame identity.');
    if (index === 0 ? entry.path !== '0' || entry.url !== url || entry.documentId !== documentId : !paths.has(entry.path.slice(0, entry.path.lastIndexOf('.')))) throw new Error('The browser document tree is incomplete or changed.');
    // about:blank/srcdoc are readable here only when they inherit accessible context.
    const origin = ['about:blank', 'about:srcdoc'].includes(entry.url) ? rootOrigin : webOrigin(entry.url);
    if (origin !== rootOrigin || !allowedOrigins.includes(origin)) throw new Error('A frame is outside the inspected same-origin scope.');
    paths.add(entry.path);
    return { path: entry.path, documentId: entry.documentId, urlHash: digest(entry.url) };
  });
  return digest(JSON.stringify(normalized));
}

export function requireDocumentBinding(inventory: { documentTreeHash?: string | null }): void {
  if (!inventory.documentTreeHash || !/^[a-f0-9]{64}$/.test(inventory.documentTreeHash)) throw new Error('Frame/document identity is unverified. Refresh with authorized JavaScript inspection of every frame, or use another suitable method; no WebMCP action was sent.');
}
