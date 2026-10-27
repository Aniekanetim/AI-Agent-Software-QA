import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

/** Loopback-only synthetic fixture. It never contacts an application or mailbox. */
export async function startFixture() {
  const draft = randomUUID(), saved = new Map<string, { name: string; file: string }>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.searchParams.get('draft') !== draft) { res.writeHead(404).end(); return; }
    if (req.method === 'POST' && url.pathname === '/save') {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) { res.writeHead(413).end(); return; } }
      try { const value = JSON.parse(body); saved.set(draft, { name: String(value.name).slice(0, 100), file: String(value.file).slice(0, 100) }); res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ draft, saved: true })); }
      catch { res.writeHead(400).end(); } return;
    }
    if (req.method !== 'GET' || url.pathname !== '/') { res.writeHead(404).end(); return; }
    const value = saved.get(draft) ?? { name: '', file: '' };
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><html lang="en"><title>Synthetic QA rehearsal</title><body><h1>Tool rehearsal</h1>
      <form id="form"><label>Name <input id="name" name="name"></label><label>Attachment <input id="file" type="file"></label><button>Save draft</button></form><output id="result"></output>
      <script>const initial=${JSON.stringify(value).replaceAll('<', '\\u003c')}; document.querySelector('#name').value=initial.name;
      document.querySelector('#result').textContent=initial.name?'Recovered '+initial.name+' '+initial.file:'';
      document.querySelector('#form').onsubmit=async e=>{e.preventDefault(); const response=await fetch('/save?draft=${draft}',{method:'POST',body:JSON.stringify({name:document.querySelector('#name').value,file:document.querySelector('#file').files[0]?.name||''})}); if(response.ok)document.querySelector('#result').textContent='Saved '+document.querySelector('#name').value;};</script></body></html>`);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture did not bind loopback.');
  return { url: `http://127.0.0.1:${address.port}/?draft=${draft}`, draft,
    close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }) };
}
