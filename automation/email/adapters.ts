import type { Account, Binding, MailAdapter, Message } from './email.js';
import { parse } from 'parse5';

export function htmlText(html: string): string {
  function text(node: any): string {
    if (['script', 'style', 'template', 'head'].includes(node.nodeName) || node.attrs?.some((a: any) => a.name === 'hidden' || a.name === 'aria-hidden' && a.value === 'true')) return '';
    if (node.nodeName === '#text') return node.value;
    const href = node.nodeName === 'a' ? node.attrs?.find((a: any) => a.name === 'href')?.value : null;
    return (node.childNodes ?? []).map(text).join(' ') + (href?.startsWith('https://') ? ` ${href}` : '');
  }
  return text(parse(html)).replace(/\s+/g, ' ').trim();
}

export type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
async function json<T>(transport: Fetch, url: string, key: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try { response = await transport(url, { method, redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new Error('Email provider connection failed; credentials and response bodies are suppressed.'); }
  if (!response.ok) throw new Error(`Email provider access failed (HTTP ${response.status}); verify the selected account and permissions.`);
  try { return await response.json() as T; } catch { throw new Error('The email provider returned an invalid response.'); }
}
async function pages<T>(read: (cursor?: string) => Promise<{ values: T[]; next?: string }>): Promise<T[]> {
  const all: T[] = [], seen = new Set<string>(); let cursor: string | undefined;
  for (let count = 0; count < 100; count++) {
    const page = await read(cursor); all.push(...page.values); cursor = page.next; if (!cursor) return all;
    if (seen.has(cursor)) throw new Error('The provider repeated its pagination cursor.'); seen.add(cursor);
  }
  throw new Error('The bounded mailbox pagination limit was reached; narrow the authorized scope.');
}
export class AgentMailAdapter implements MailAdapter {
  constructor(private binding: Pick<Binding, 'mailboxId' | 'address' | 'connectionReference'>, private key: string, private transport: Fetch = fetch) { if (!key.trim()) throw new Error('Configure the AgentMail key through its secure source.'); }
  async account(): Promise<Account> {
    const inbox = await json<{ inbox_id: string }>(this.transport, `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(this.binding.mailboxId)}`, this.key);
    if (inbox.inbox_id !== this.binding.mailboxId || inbox.inbox_id.toLowerCase() !== this.binding.address.toLowerCase()) throw new Error('AgentMail inbox identity differs from the selected address.');
    return { provider: 'agentmail', accountId: null, mailboxId: inbox.inbox_id, address: inbox.inbox_id, connectionReference: this.binding.connectionReference, authentication: 'connected' };
  }
  async list(scope: Binding['scope']) {
    if (scope.query || scope.labels?.length) throw new Error('This AgentMail adapter does not implement provider-side query/label restrictions. Select a dedicated test inbox without those filters.');
    return pages<Omit<Message, 'text'>>(async cursor => {
      const url = new URL(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(this.binding.mailboxId)}/messages`); url.searchParams.set('limit', '100'); if (cursor) url.searchParams.set('page_token', cursor);
      const page = await json<{ messages: any[]; next_page_token?: string }>(this.transport, url.href, this.key);
      if (!Array.isArray(page.messages)) throw new Error('AgentMail listing did not return message metadata.');
      return { values: page.messages.map(m => ({ id: m.message_id, mailboxId: this.binding.mailboxId, sentAt: m.timestamp, from: m.from, to: m.to ?? [], subject: m.subject ?? '' })), next: page.next_page_token };
    });
  }
  async read(id: string): Promise<Message> {
    const m = await json<any>(this.transport, `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(this.binding.mailboxId)}/messages/${encodeURIComponent(id)}`, this.key);
    const text = typeof m.text === 'string' && m.text.trim() ? m.text : typeof m.html === 'string' ? htmlText(m.html) : '';
    if (m.message_id !== id || m.inbox_id !== this.binding.mailboxId || !text) throw new Error('AgentMail full text or message identity was not established.');
    return { id, mailboxId: m.inbox_id, sentAt: m.timestamp, from: m.from, to: m.to ?? [], subject: m.subject ?? '', text };
  }
  static async inboxes(key: string, transport: Fetch = fetch): Promise<Account[]> {
    return pages<Account>(async cursor => {
      const url = new URL('https://api.agentmail.to/v0/inboxes'); if (cursor) url.searchParams.set('page_token', cursor);
      const page = await json<{ inboxes: { inbox_id: string }[]; next_page_token?: string }>(transport, url.href, key);
      if (!Array.isArray(page.inboxes)) throw new Error('AgentMail did not return inbox metadata.');
      return { values: page.inboxes.map(i => ({ provider: 'agentmail', accountId: null, mailboxId: i.inbox_id, address: i.inbox_id, connectionReference: 'env:AGENTMAIL_API_KEY', authentication: 'connected' })), next: page.next_page_token };
    });
  }
  static async createInbox(key: string, authorization: { source: string; purpose: string }, transport: Fetch = fetch) {
    if (!authorization.source?.trim() || !authorization.purpose?.trim()) throw new Error('Creating a test inbox requires the actual scoped instruction reference and purpose.');
    return json<{ inbox_id: string }>(transport, 'https://api.agentmail.to/v0/inboxes', key, 'POST', { display_name: authorization.purpose });
  }
}
export class GmailAdapter implements MailAdapter {
  constructor(private token: string, private transport: Fetch = fetch) { if (!token.trim()) throw new Error('Use the selected host connection or an authorized Gmail token source.'); }
  async account(): Promise<Account> {
    const p = await json<{ emailAddress: string }>(this.transport, 'https://gmail.googleapis.com/gmail/v1/users/me/profile', this.token);
    if (!p.emailAddress) throw new Error('Gmail account identity is unavailable.');
    return { provider: 'gmail', accountId: p.emailAddress, mailboxId: p.emailAddress, address: p.emailAddress, connectionReference: 'env:GMAIL_ACCESS_TOKEN', authentication: 'connected' };
  }
  async list(scope: Binding['scope']) {
    const account = await this.account();
    const ids = await pages<{ id: string }>(async cursor => {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages'); url.searchParams.set('maxResults', '100');
      if (scope.query) url.searchParams.set('q', scope.query); for (const label of scope.labels ?? []) url.searchParams.append('labelIds', label); if (cursor) url.searchParams.set('pageToken', cursor);
      const page = await json<{ messages?: { id: string }[]; nextPageToken?: string }>(this.transport, url.href, this.token);
      return { values: page.messages ?? [], next: page.nextPageToken };
    });
    const result: Omit<Message, 'text'>[] = [];
    for (const entry of ids) { const raw = await this.get(entry.id, 'metadata'); result.push(this.normalize(raw, account.address, false)); }
    return result;
  }
  private async get(id: string, format: string) {
    const raw = await json<any>(this.transport, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=${format}`, this.token);
    if (raw.id !== id) throw new Error('Gmail returned a different message identity.'); return raw;
  }
  private normalize(raw: any, address: string, full: boolean): Message {
    const headers = raw.payload?.headers ?? []; const header = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name)?.value ?? '';
    function body(part: any): string {
      if (part.filename) return '';
      if (part.body?.data && ['text/plain', 'text/html'].includes(part.mimeType)) { const decoded = Buffer.from(part.body.data, 'base64url').toString('utf8'); return part.mimeType === 'text/html' ? htmlText(decoded) : decoded; }
      const parts = part.parts ?? []; const plain = parts.find((p: any) => p.mimeType === 'text/plain' && !p.filename);
      return plain ? body(plain) : parts.map(body).join('\n');
    }
    const text = full ? body(raw.payload ?? {}) : '';
    if (full && !text.trim()) throw new Error('Gmail full text is unavailable; metadata/snippets do not establish verification content.');
    return { id: raw.id, mailboxId: address, sentAt: new Date(Number(raw.internalDate)).toISOString(), from: header('from'), to: header('to').split(','), subject: header('subject'), text };
  }
  async read(id: string): Promise<Message> { const account = await this.account(); return this.normalize(await this.get(id, 'full'), account.address, true); }
}
/** Native connectors are invoked by the host agent; this bridge never invents tools or OAuth access. */
export class HostMailAdapter implements MailAdapter {
  constructor(private bridge: { account: () => Promise<Account>; list: (scope: Binding['scope']) => Promise<Omit<Message, 'text'>[]>; read: (id: string) => Promise<Message> }) {}
  account() { return this.bridge.account(); }
  list(scope: Binding['scope']) { return this.bridge.list(scope); }
  read(id: string) { return this.bridge.read(id); }
}
