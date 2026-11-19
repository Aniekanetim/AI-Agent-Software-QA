import { ContextError, key, timestamp, type Adapter, type Identity, type Page, type Channel, type Message, type Person } from '../company-context/types.js';
import { slackChannel, slackMessage, assertIdentity, person } from './adapter.js';

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
export class SlackApi implements Adapter {
  private observed?: Identity;
  constructor(private token: string, private send: Fetch = fetch, private now: () => number = Date.now, private expected?: Identity) {
    if (!token.trim()) throw new ContextError('AUTH_REQUIRED', 'Use an existing Slack connection or the selected runtime credential source.');
  }
  private async call(method: string, query: Record<string, string> = {}): Promise<any> {
    if (!['auth.test', 'conversations.list', 'conversations.info', 'conversations.history', 'conversations.replies', 'users.list', 'conversations.join', 'chat.getPermalink'].includes(method)) throw new Error('Unsupported Slack operation.');
    let response: Response;
    try { response = await this.send(`https://slack.com/api/${method}?${new URLSearchParams(query)}`, { method: method === 'conversations.join' ? 'POST' : 'GET', headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(20_000), redirect: 'error' }); }
    catch { throw new ContextError('READ_UNCERTAIN', 'The Slack operation did not return a verified outcome. Inspect or retry the safe read; inspect membership before retrying a join.'); }
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After')); const delay = Number.isFinite(seconds) && seconds >= 0 ? Math.max(seconds, 1) * 1000 : 60_000;
      throw new ContextError('RATE_LIMITED', 'Slack rate limited this operation. Resume after its recorded cooldown.', new Date(this.now() + delay).toISOString());
    }
    if (!response.ok) throw new ContextError('PROVIDER_FAILURE', 'Slack could not complete this operation; retain prior coverage.');
    let value: any; try { value = await response.json(); } catch { throw new ContextError('INVALID_PAGE', 'Slack returned an unreadable response.'); }
    if (value?.ok !== true) {
      const code = ['invalid_auth', 'not_authed', 'token_revoked', 'account_inactive'].includes(value?.error) ? 'AUTH_REQUIRED'
        : value?.error === 'missing_scope' ? 'SCOPE_DENIED' : value?.error === 'not_in_channel' ? 'MEMBERSHIP_REQUIRED'
        : ['channel_not_found', 'thread_not_found'].includes(value?.error) ? 'SOURCE_UNAVAILABLE' : 'PROVIDER_FAILURE';
      throw new ContextError(code, 'The selected Slack operation is unavailable. Verify its identity, scope and membership; absence does not establish deletion.');
    }
    return value;
  }
  async identity(): Promise<Identity> {
    const value = await this.call('auth.test');
    const actual: Identity = { workspaceId: key(value.team_id), userId: key(value.user_id), ...(value.bot_id ? { botId: key(value.bot_id) } : {}), ...(value.enterprise_id ? { enterpriseId: key(value.enterprise_id) } : {}), ...(value.team ? { name: String(value.team) } : {}) };
    if (this.expected) assertIdentity(actual, this.expected); if (this.observed) assertIdentity(actual, this.observed); this.observed = actual; return actual;
  }
  private async page<T>(method: string, query: Record<string, string>, field: string, normalize: (value: any) => T): Promise<Page<T>> {
    const identity = this.observed ?? await this.identity(), value = await this.call(method, { limit: '100', ...query });
    if (!Array.isArray(value[field])) throw new ContextError('INVALID_PAGE', 'Slack returned an incomplete collection.');
    return { identity, items: value[field].map(normalize), nextCursor: value.response_metadata?.next_cursor || null, source: `Slack Web API ${method} observed ${new Date(this.now()).toISOString()}`, evidence: [] };
  }
  channels(cursor?: string) { return this.page<Channel>('conversations.list', { types: 'public_channel,private_channel', ...(cursor ? { cursor } : {}) }, 'channels', slackChannel); }
  history(channelId: string, oldest: string, latest: string, cursor?: string) {
    return this.page<Message>('conversations.history', { channel: key(channelId), oldest: timestamp(oldest), latest: timestamp(latest), inclusive: 'true', ...(cursor ? { cursor } : {}) }, 'messages', item => slackMessage(item, channelId));
  }
  thread(channelId: string, ts: string, cursor?: string) { return this.page<Message>('conversations.replies', { channel: key(channelId), ts: timestamp(ts), ...(cursor ? { cursor } : {}) }, 'messages', item => slackMessage(item, channelId)); }
  directory(cursor?: string) { return this.page<Person>('users.list', { ...(cursor ? { cursor } : {}) }, 'members', item => { const result: Person = { id: item.id, name: item.real_name ?? item.name ?? '', displayName: item.profile?.display_name ?? '', ...(typeof item.profile?.title === 'string' ? { title: item.profile.title } : {}), ...(typeof item.profile?.email === 'string' ? { email: item.profile.email } : {}), deactivated: item.deleted === true, bot: item.is_bot === true, guest: item.is_restricted === true || item.is_ultra_restricted === true }; person(result); return result; }); }
  async channel(channelId: string) { await this.identity(); const value = await this.call('conversations.info', { channel: key(channelId) }); return slackChannel(value.channel); }
  async join(channelId: string) { const target = await this.channel(channelId); if (target.type !== 'public' || target.archived) throw new ContextError('MEMBERSHIP_REQUIRED', 'Private/archived channels need their actual authorized Slack membership procedure.'); await this.call('conversations.join', { channel: key(channelId) }); }
  async permalink(channelId: string, ts: string) { await this.identity(); const value = await this.call('chat.getPermalink', { channel: key(channelId), message_ts: timestamp(ts) }); if (typeof value.permalink !== 'string') throw new Error('Slack did not supply the canonical message link.'); return value.permalink; }
}
