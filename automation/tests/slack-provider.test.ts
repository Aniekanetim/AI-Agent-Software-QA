import test from 'node:test';
import assert from 'node:assert/strict';
import { SlackApi } from '../slack/api.js';
import { companyFixture } from './company-fixture.js';
import { HostSlackAdapter } from '../slack/host.js';
import { importHostCatalog, importHostPage, hostPageDigest } from '../slack/import.js';
import { startRefresh } from '../company-context/sync.js';
import { recordConnection, joinChannel } from '../company-context/config.js';
import { bindHarness } from '../tools/runtime.js';
import { connection, status } from '../company-context/store.js';
import { assertNonsecret } from '../shared/store.js';

const ok = (value: unknown) => new Response(JSON.stringify({ ok: true, ...(value as object) }), { status: 200, headers: { 'content-type': 'application/json' } });
test('Slack API binds every read to the observed workspace and uses fixed header-authenticated HTTPS methods', async () => {
  const calls: string[] = []; const adapter = new SlackApi('synthetic-token', async (url, init) => {
    const parsed = new URL(url); calls.push(parsed.pathname); assert.equal(parsed.origin, 'https://slack.com'); assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer synthetic-token'); assert(!url.includes('synthetic-token')); assert.equal(init.redirect, 'error');
    return parsed.pathname.endsWith('auth.test') ? ok({ team_id: 'T1', user_id: 'U1' }) : ok({ channels: [{ id: 'C1', name: 'product', is_channel: true }] });
  });
  const page = await adapter.channels(); assert.equal(page.identity.workspaceId, 'T1'); assert.equal(page.items[0]!.type, 'public'); assert.deepEqual(calls, ['/api/auth.test', '/api/conversations.list']);
});
for (const [provider, code] of [['invalid_auth', 'AUTH_REQUIRED'], ['missing_scope', 'SCOPE_DENIED'], ['not_in_channel', 'MEMBERSHIP_REQUIRED'], ['channel_not_found', 'SOURCE_UNAVAILABLE']]) test(`Slack HTTP 200 error ${provider} is diagnosed as ${code}`, async () => {
  const adapter = new SlackApi('synthetic', async () => new Response(JSON.stringify({ ok: false, error: provider, token: 'must-not-be-printed' })));
  await assert.rejects(adapter.identity(), error => (error as any).code === code && !String(error).includes('must-not-be-printed'));
});
test('Slack 429 records Retry-After without a blocking sleep', async () => {
  const adapter = new SlackApi('synthetic', async () => new Response(null, { status: 429, headers: { 'Retry-After': '30' } }), () => 1_000);
  await assert.rejects(adapter.identity(), error => (error as any).code === 'RATE_LIMITED' && (error as any).retryAt === new Date(31_000).toISOString());
});
test('Slack direct messages do not enter the selected channel catalog', async () => {
  const adapter = new SlackApi('synthetic', async url => url.includes('auth.test') ? ok({ team_id: 'T1', user_id: 'U1' }) : ok({ channels: [{ id: 'D1', name: 'private-chat', is_im: true }] }));
  await assert.rejects(adapter.channels(), /separately from direct messages/);
});
test('Slack directory does not assume email access or decision ownership from title', async () => {
  const adapter = new SlackApi('synthetic', async url => url.includes('auth.test') ? ok({ team_id: 'T1', user_id: 'U1' }) : ok({ members: [{ id: 'U2', real_name: 'Team member', deleted: true, is_bot: false, is_restricted: true, profile: { title: 'CEO' } }] }));
  const result = await adapter.directory(); assert.equal(result.items[0]!.deactivated, true); assert.equal(result.items[0]!.guest, true); assert.equal('authority' in result.items[0]!, false); assert.equal('email' in result.items[0]!, false);
});
test('CC-38 uncertain membership is reconciled by readback without repeating the join', async () => {
  const f = await companyFixture(); f.adapter.channelList[0]!.member = false; let joins = 0;
  f.adapter.join = async id => { joins++; f.adapter.channelList.find(item => item.id === id)!.member = true; throw new Error('Synthetic lost join response'); };
  const request = { bindingId: 'company', channelId: 'C1', authorization: f.put('join-auth.json', { action: 'join', workspaceId: 'T1', userId: 'U1', channelId: 'C1', source: 'Synthetic membership authorization' }), source: 'Synthetic selected membership action' };
  await assert.rejects(joinChannel(f.root, request, f.adapter), /lost join/);
  await assert.rejects(joinChannel(f.root, request, f.adapter), /original membership/);
  assert.equal((await joinChannel(f.root, { ...request, recover: true }, f.adapter)).member, true); assert.equal(joins, 1);
});
test('CC-39 credential patterns cannot be saved or emitted through shared output', () => {
  for (const prefix of ['xoxb-', 'xoxp-', 'xapp-']) assert.throws(() => assertNonsecret({ text: prefix + '12345678901234567890' }), /Secret-bearing/);
});
test('CC-42 a changed harness cannot inherit interactive Slack access evidence', async () => {
  const f = await companyFixture(); bindHarness(f.root, { id: 'new-host', version: '2', profile: 'scheduled', executionContext: 'scheduled', source: 'Synthetic new host inspection' });
  assert.throws(() => connection(f.root, 'slack', true), /current harness/);
});
test('native catalog and history use actual request-bound call evidence', async () => {
  const f = await companyFixture();
  const page = await f.adapter.channels();
  const call = f.put('native-catalog-call.json', { connectionId: 'slack', identity: f.adapter.principal, cursor: null, source: 'Synthetic actual native call', resultDigest: hostPageDigest(page) });
  assert.equal(importHostCatalog(f.root, { connectionId: 'slack', pages: [{ page, cursor: null, call }], source: 'Synthetic native catalog' }).complete, true);
  const job = startRefresh(f.root, 'company').job, unit = job.units[0]!;
  const body = await f.adapter.history('C1', unit.oldest!, job.cutoff);
  const request = { jobId: job.id, operation: 'history' as const, channelId: 'C1', oldest: unit.oldest, latest: job.cutoff };
  const readCall = f.put('native-history-call.json', { ...request, identity: f.adapter.principal, source: 'Synthetic actual native history call', resultDigest: hostPageDigest(body) });
  const result = await importHostPage(f.root, { ...request, page: body, call: readCall }); assert.equal(result.job.units[0]!.done, true);
  await assert.rejects(importHostPage(f.root, { ...request, channelId: 'C2', page: body, call: readCall }), /exact recorded Slack request/);
});
