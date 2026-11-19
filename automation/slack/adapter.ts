import { ContextError, sameIdentity, validateIdentity, validateChannel, validateMessage, key, timestamp, type Identity, type Page, type Channel, type Message, type Person } from '../company-context/types.js';

export function assertIdentity(actual: Identity, expected: Identity) { validateIdentity(actual); if (!sameIdentity(actual, expected)) throw new ContextError('IDENTITY_MISMATCH', 'The Slack response belongs to a different workspace or principal.'); }
export function checkPage<T>(page: Page<T>, identity: Identity, validate: (item: T) => void) {
  assertIdentity(page.identity, identity);
  if (!Array.isArray(page.items) || !(page.nextCursor === null || typeof page.nextCursor === 'string' && page.nextCursor.length > 0) || !page.source?.trim() || !Array.isArray(page.evidence)) throw new ContextError('INVALID_PAGE', 'Slack returned an incomplete page or missing operation provenance.');
  page.items.forEach(validate); return page;
}
export const channelPage = (page: Page<Channel>, identity: Identity) => checkPage(page, identity, validateChannel);
export function messagePage(page: Page<Message>, identity: Identity, channel: string) {
  return checkPage(page, identity, item => { validateMessage(item); if (item.channelId !== channel) throw new ContextError('CHANNEL_MISMATCH', 'The source read belongs to a different channel.'); });
}
export function person(value: Person) { key(value?.id); if (typeof value.name !== 'string' || [value.bot, value.guest, value.deactivated].some(item => typeof item !== 'boolean')) throw new Error('Invalid Slack directory entry.'); }
export function slackChannel(value: any): Channel {
  if (!value || value.is_im || value.is_mpim) throw new Error('Select channels separately from direct messages.');
  const result: Channel = { id: value.id, name: value.name, type: value.is_private ? 'private' : 'public', archived: value.is_archived === true, member: value.is_member === true, shared: value.is_shared === true || value.is_ext_shared === true };
  validateChannel(result); return result;
}
export function slackMessage(value: any, channelId: string): Message {
  if (!value || typeof value.text !== 'string' || typeof value.ts !== 'string') throw new Error('Slack did not return a readable message.');
  const result: Message = { channelId, ts: timestamp(value.ts), authorId: value.user ?? value.bot_id ?? 'unknown', text: value.text,
    ...(value.thread_ts ? { threadTs: timestamp(value.thread_ts) } : {}), ...(value.edited?.ts ? { editedTs: timestamp(value.edited.ts) } : {}),
    ...(typeof value.reply_count === 'number' ? { replyCount: value.reply_count } : {}) };
  validateMessage(result); return result;
}
