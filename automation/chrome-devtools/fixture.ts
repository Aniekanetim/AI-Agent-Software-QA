import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Synthetic, loopback-only native WebMCP fixture. It never installs a polyfill. */
export async function startWebMcpFixture() {
  let requests = 0;
  const state: { drafts: { name: string }[]; profiles: { name: string }[]; cancel: boolean } = { drafts: [], profiles: [], cancel: false };
  const server = createServer(async (req, res) => {
    requests++;
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/state') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(state)); return; }
    if (url.pathname === '/cancel' && req.method === 'POST') { state.cancel = true; res.end('ok'); return; }
    if (['/draft', '/profile'].includes(url.pathname) && req.method === 'POST') {
      let bytes = ''; for await (const chunk of req) { bytes += chunk; if (bytes.length > 2048) { res.writeHead(413).end(); return; } }
      let input: any; try { input = JSON.parse(bytes); } catch { res.writeHead(400).end(); return; }
      if (typeof input.name !== 'string' || input.name.length < 2) { res.writeHead(422).end('Invalid name'); return; }
      (url.pathname === '/draft' ? state.drafts : state.profiles).push({ name: input.name });
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ saved: true, name: input.name })); return;
    }
    if (url.pathname !== '/') { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic WebMCP rehearsal</title>
      <h1>Synthetic WebMCP rehearsal</h1><p id="availability">Checking native API</p><output id="result"></output>
      <button id="role">Change synthetic role</button><p id="role-state">reader</p>
      <form id="automatic" toolname="save_profile" tooldescription="Save a synthetic profile" toolautosubmit>
        <label>Name <input name="name" required minlength="2"></label><button>Save profile</button>
      </form>
      <form id="manual" toolname="prepare_profile" tooldescription="Prepare a synthetic profile for human submission">
        <label>Manual name <input name="name" required></label><button>Submit manually</button>
      </form>
      <script>
      const api = document.modelContext;
      document.querySelector('#availability').textContent = api ? 'Native WebMCP available' : 'Native WebMCP unavailable';
      const send = async (path, input) => { const r = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(input)}); if (!r.ok) throw new Error('Invalid synthetic input'); const v = await r.json(); document.querySelector('#result').textContent = 'Saved ' + v.name; return v; };
      if (api) {
        api.registerTool({ name:'create_draft', description:'Create one synthetic draft', inputSchema:{type:'object',properties:{name:{type:'string',minLength:2}},required:['name'],additionalProperties:false}, execute:async input => { if (typeof input.name !== 'string' || input.name.length < 2) throw new Error('Invalid synthetic name'); const v = await send('/draft', input); return {content:[{type:'text',text:JSON.stringify(v)}]}; } });
        document.querySelector('#role').onclick = () => { document.querySelector('#role-state').textContent = 'editor'; api.registerTool({name:'editor_only',description:'Read the synthetic editor state',inputSchema:{type:'object'},annotations:{readOnlyHint:true},execute:async()=>({content:[{type:'text',text:'editor'}]})}); };
        api.addEventListener('toolactivated', ({toolName}) => { if (toolName === 'prepare_profile') { const timer = setInterval(async () => { const v = await (await fetch('/state')).json(); if (v.cancel) { clearInterval(timer); document.querySelector('#manual').reset(); } }, 100); } });
      }
      document.querySelector('#automatic').onsubmit = event => { event.preventDefault(); const work = send('/profile', Object.fromEntries(new FormData(event.target))); if (event.agentInvoked) event.respondWith(work.then(v => ({content:[{type:'text',text:JSON.stringify(v)}]}))); };
      </script></html>`);
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  return { url, state, requestCount: () => requests, close: () => new Promise<void>((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeAllConnections(); }) };
}
