import { responseMessage, type Bridge } from './transport.js';
import type { startWebMcpFixture } from './fixture.js';

/** Browser API interop checks, distinct from the helper's conservative frame guard. */
export async function rehearseProtocol(bridge: Bridge, pageId: number, fixture: Awaited<ReturnType<typeof startWebMcpFixture>>, require: (ok: boolean, name: string) => void) {
  const inspect = async (script: string) => JSON.parse(responseMessage(await bridge.call('evaluate_script', { pageId, function: script })).match(/```json\s*([\s\S]*?)```/)?.[1] ?? 'null');
  await inspect(`async () => {
    for (const name of ['policy_blocked','not_exposed','partner_exposed']) {
      const frame = document.createElement('iframe'); frame.src = ${JSON.stringify(fixture.partnerUrl)} + '?name=' + name;
      if (name !== 'policy_blocked') frame.allow = 'tools';
      await new Promise(resolve => { frame.onload = resolve; document.body.append(frame); });
    } return true;
  }`);
  const until = Date.now() + 5000;
  while (fixture.state.partnerRegistrations.length !== 3 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 25));
  require(fixture.state.partnerRegistrations.length === 3 && fixture.state.partnerRegistrations.some(r => r.name === 'policy_blocked' && !r.registered), 'cross-origin tools require delegated tools permission');
  require(['not_exposed', 'partner_exposed'].every(name => fixture.state.partnerRegistrations.some(r => r.name === name && r.registered)), 'delegated frames can register native WebMCP tools');
  const tools = await inspect(`async () => {
    const own = await document.modelContext.getTools();
    const partner = await document.modelContext.getTools({fromOrigins:[${JSON.stringify(new URL(fixture.partnerUrl).origin)}]});
    return {own:own.map(t=>t.name), partner:partner.map(t=>({name:t.name,origin:t.origin}))};
  }`);
  require(!tools.own.includes('partner_exposed') && tools.partner.some((t: any) => t.name === 'partner_exposed' && t.origin === new URL(fixture.partnerUrl).origin) && !tools.partner.some((t: any) => ['not_exposed', 'policy_blocked'].includes(t.name)), 'cross-origin discovery requires both exposure and explicit requested origin');
  const before = fixture.state.partnerWrites;
  await inspect(`async () => {
    const tools = await document.modelContext.getTools({fromOrigins:[${JSON.stringify(new URL(fixture.partnerUrl).origin)}]});
    return await document.modelContext.executeTool(tools.find(t=>t.name==='partner_exposed'), {});
  }`);
  const independent = await (await fetch(new URL('/state', fixture.url))).json() as any;
  require(independent.partnerWrites === before + 1, 'native cross-origin execution persists only the explicitly exposed action');
  const canceled = await inspect(`async () => {
    const controller = new AbortController(); let started;
    const ready = new Promise(resolve => started = resolve);
    await document.modelContext.registerTool({name:'imperative_cancel_probe',description:'Synthetic cancellable delayed commit',inputSchema:{type:'object'},execute:async (_input,{signal})=>{
      await fetch('/execution-started',{method:'POST'});
      await new Promise((resolve,reject)=>{
        const timer = setTimeout(resolve,1500);
        signal.addEventListener('abort',()=>{clearTimeout(timer); fetch('/execution-canceled',{method:'POST'}).then(()=>reject(new DOMException('Synthetic canceled operation','AbortError')));},{once:true});
        started();
      });
      await fetch('/execution-commit',{method:'POST'}); return {saved:true};
    }});
    const tool = (await document.modelContext.getTools()).find(t=>t.name==='imperative_cancel_probe');
    const work = document.modelContext.executeTool(tool,{}, {signal:controller.signal}).then(()=> 'resolved',error=>error.name);
    await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Cancellation probe did not start')),5000))]);
    controller.abort(); const outcome = await work;
    await new Promise(resolve=>setTimeout(resolve,1700)); return {outcome};
  }`);
  const after = await (await fetch(new URL('/state', fixture.url))).json() as any;
  require(!!canceled && after.imperativeStarts === 1 && after.imperativeCancellations === 1 && after.imperativeCommits === 0, 'imperative AbortSignal cancellation reaches the handler and prevents the delayed commit');
}
