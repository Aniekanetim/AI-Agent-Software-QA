import { randomUUID } from 'node:crypto';
import { load, save, revision, digest, requireText, withLock, type Evidence, verifyEvidence } from '../shared/store.js';

export interface Account { provider: string; accountId: string | null; mailboxId: string; address: string; connectionReference: string; authentication: 'connected' | 'needsAuthentication' | 'denied' | 'unverified' }
export interface Inventory { schemaVersion: 1; harness: string; executionContext: 'interactive' | 'scheduled'; source: string; providers: { id: string; name: string; available: boolean; connectionReference?: string }[]; accounts: Account[] }
export interface Binding extends Account { id: string; environment: string; transport: 'host' | 'gmailApi' | 'agentmail' | 'human'; choiceSource: string; scope: { query?: string; labels?: string[] }; verification?: { context: 'interactive' | 'scheduled'; listedAt: string; bodyReadAt: string | null; evidence: Evidence[] } }
export interface Message { id: string; mailboxId: string; sentAt: string; from: string; to: string[]; subject: string; text: string }
export interface MailAdapter { account(): Promise<Account>; list(scope: Binding['scope']): Promise<Omit<Message, 'text'>[]>; read(id: string): Promise<Message> }
interface Connections { schemaVersion: 1; bindings: Binding[]; history: { id: string; previousDigest: string | null; choiceSource: string; updatedAt: string }[] }
const connectionsPath = '.local/email-connections.json';
export function readConnections(root: string) {
  const value = load<Connections>(root, connectionsPath, () => ({ schemaVersion: 1, bindings: [], history: [] }));
  if (value.value.schemaVersion !== 1 || !Array.isArray(value.value.bindings)) throw new Error('Invalid email connections; preserve and reconcile them.');
  return value;
}
const isAddress = (value: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export function providerOptions(inventory: Inventory) {
  if (inventory.schemaVersion !== 1 || !inventory.source?.trim() || !Array.isArray(inventory.providers) || !Array.isArray(inventory.accounts)) throw new Error('Supply actual observed provider/account metadata.');
  const google = inventory.providers.find(p => p.id === 'gmail');
  return [ { id: 'gmail', name: 'Google — Gmail / Google Workspace', availability: google?.available ? 'available' : 'notYetVerified', accounts: inventory.accounts.filter(a => a.provider === 'gmail') },
    ...inventory.providers.filter(p => !['gmail', 'agentmail'].includes(p.id)).map(p => ({ id: p.id, name: p.name, availability: p.available ? 'available' : 'notYetVerified', accounts: inventory.accounts.filter(a => a.provider === p.id) })),
    { id: 'agentmail', name: 'AgentMail', availability: 'optional', accounts: inventory.accounts.filter(a => a.provider === 'agentmail') },
    { id: 'human', name: 'Human-assisted verification', availability: 'choice', accounts: [] },
    { id: 'later', name: 'Set up email later', availability: 'choice', accounts: [] } ];
}
export function selectBinding(root: string, binding: Binding, inventory: Inventory): void {
  providerOptions(inventory); requireText(binding.id); requireText(binding.choiceSource); requireText(binding.environment);
  if (!isAddress(binding.address) || !['host', 'gmailApi', 'agentmail', 'human'].includes(binding.transport)) throw new Error('Use an actual mailbox address and supported transport.');
  if (binding.transport !== 'human' && !inventory.accounts.some(a => a.provider === binding.provider && a.accountId === binding.accountId && a.mailboxId === binding.mailboxId && a.address.toLowerCase() === binding.address.toLowerCase() && a.connectionReference === binding.connectionReference)) throw new Error('The selected mailbox must match actual account metadata; connection availability alone is insufficient.');
  withLock(root, 'email-connections', () => {
    const current = readConnections(root), old = current.value.bindings.find(b => b.id === binding.id);
    const actual = inventory.accounts.find(a => a.provider === binding.provider && a.mailboxId === binding.mailboxId && a.connectionReference === binding.connectionReference);
    const selected = { ...binding, authentication: actual?.authentication ?? 'unverified' as Account['authentication'], verification: undefined };
    current.value.bindings = [...current.value.bindings.filter(b => b.id !== binding.id), selected];
    current.value.history.push({ id: binding.id, previousDigest: old ? digest(JSON.stringify(old)) : null, choiceSource: binding.choiceSource, updatedAt: new Date().toISOString() });
    save(root, connectionsPath, current.value, current.revision);
  });
}
export async function verifyBinding(root: string, id: string, adapter: MailAdapter, context: 'interactive' | 'scheduled', evidence: Evidence[], messageId?: string): Promise<Binding> {
  if (!evidence.length) throw new Error('Retain actual access-check evidence.');
  for (const ref of evidence) verifyEvidence(root, ref);
  const current = readConnections(root), binding = current.value.bindings.find(b => b.id === id); if (!binding) throw new Error('Select a mailbox first.');
  const account = await adapter.account();
  if (account.authentication !== 'connected' || account.mailboxId !== binding.mailboxId || account.address.toLowerCase() !== binding.address.toLowerCase() || account.provider !== binding.provider || account.accountId !== binding.accountId || account.connectionReference !== binding.connectionReference) throw new Error('The authenticated mailbox does not match the selection.');
  const listed = await adapter.list(binding.scope); let bodyReadAt: string | null = null;
  if (messageId) {
    if (!listed.some(m => m.id === messageId && m.mailboxId === binding.mailboxId)) throw new Error('The selected access-check message is outside the permitted listing scope.');
    const message = await adapter.read(messageId); if (message.id !== messageId || message.mailboxId !== binding.mailboxId || typeof message.text !== 'string') throw new Error('Full-message access was not established.'); bodyReadAt = new Date().toISOString();
  }
  binding.authentication = 'connected'; binding.verification = { context, listedAt: new Date().toISOString(), bodyReadAt, evidence };
  withLock(root, 'email-connections', () => save(root, connectionsPath, current.value, current.revision)); return binding;
}
export interface VerificationAttempt { schemaVersion: 1; id: string; bindingId: string; bindingDigest: string; recipient: string; sender: string; subjectContains: string; triggerTime: string; expiresAt: string; source: string }
export function beginVerification(root: string, bindingId: string, recipient: string, sender: string, subjectContains: string, source: string, durationMs = 300_000, now = Date.now()): VerificationAttempt {
  const binding = readConnections(root).value.bindings.find(b => b.id === bindingId);
  if (!binding || !isAddress(recipient) || !isAddress(sender) || recipient.toLowerCase() !== binding.address.toLowerCase() || durationMs < 1000 || durationMs > 900_000) throw new Error('Use the selected destination mailbox, exact recipient/sender and bounded verification lifetime.');
  requireText(source); requireText(subjectContains);
  const attempt: VerificationAttempt = { schemaVersion: 1, id: randomUUID(), bindingId, bindingDigest: digest(JSON.stringify(binding)), recipient, sender, subjectContains, triggerTime: new Date(now).toISOString(), expiresAt: new Date(now + durationMs).toISOString(), source };
  save(root, `.local/verification/${attempt.id}.json`, attempt, null); return attempt;
}
const addressFromHeader = (value: string) => (value.match(/[^\s<>(),;]+@[^\s<>(),;]+/g) ?? []).map(s => s.toLowerCase());
export function matchingMessages(messages: Omit<Message, 'text'>[], attempt: VerificationAttempt, now = Date.now()) {
  if (now > Date.parse(attempt.expiresAt)) throw new Error('The verification attempt expired; preserve it and request a legitimate new attempt.');
  return messages.filter(m => {
    const time = Date.parse(m.sentAt);
    return Number.isFinite(time) && time >= Date.parse(attempt.triggerTime) && time <= now && time <= Date.parse(attempt.expiresAt)
      && addressFromHeader(m.from).includes(attempt.sender.toLowerCase()) && m.to.flatMap(addressFromHeader).includes(attempt.recipient.toLowerCase()) && m.subject.includes(attempt.subjectContains);
  });
}
/** Secret is returned in memory to the authorized test only. Never print this object. */
export async function pollVerification(root: string, attempt: VerificationAttempt, adapter: MailAdapter, options: { timeoutMs?: number; intervalMs?: number; mode?: 'code' | 'link'; linkHost?: string; now?: () => number; wait?: (ms: number) => Promise<void> } = {}) {
  const now = options.now ?? Date.now, wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const timeout = options.timeoutMs ?? 60_000, interval = options.intervalMs ?? 2000;
  if (timeout < 0 || timeout > 120_000 || interval < 10) throw new Error('Use bounded polling.');
  const deadline = now() + timeout;
  if (revision(root, `.local/verification/${attempt.id}-receipt.json`)) throw new Error('This attempt already has a receipt. Confirm its application outcome before requesting another attempt.');
  do {
    const binding = readConnections(root).value.bindings.find(b => b.id === attempt.bindingId);
    if (!binding || digest(JSON.stringify(binding)) !== attempt.bindingDigest) throw new Error('The mailbox binding changed; do not resume verification against a different account.');
    const account = await adapter.account();
    if (account.authentication !== 'connected' || account.mailboxId !== binding.mailboxId || account.address.toLowerCase() !== binding.address.toLowerCase() || account.provider !== binding.provider || account.accountId !== binding.accountId || account.connectionReference !== binding.connectionReference) throw new Error('Mailbox authentication/binding no longer matches.');
    const matches = matchingMessages(await adapter.list(binding.scope), attempt, now());
    if (matches.length > 1) throw new Error('Multiple messages match this attempt; disambiguate rather than using the latest OTP.');
    if (matches.length === 1) {
      const message = await adapter.read(matches[0]!.id);
      if (message.mailboxId !== binding.mailboxId || !matchingMessages([message], attempt, now()).length) throw new Error('The full message differs from the correlated header.');
      let secret: string | undefined;
      if ((options.mode ?? 'code') === 'code') {
        const codes = [...new Set(message.text.match(/\b\d{6}\b/g) ?? [])]; if (codes.length !== 1) throw new Error('No unique supported six-digit code was found; use a task-specific parser.'); secret = codes[0];
      } else {
        requireText(options.linkHost, 'Expected verification-link host');
        const links = [...new Set(message.text.match(/https:\/\/[^\s<>"']+/g) ?? [])].filter(link => { const url = new URL(link); return url.hostname === options.linkHost && !url.username && !url.password; });
        if (links.length !== 1) throw new Error('No unique link matches the expected host.'); secret = links[0];
      }
      const receipt = { attemptId: attempt.id, bindingId: binding.id, messageId: message.id, sender: attempt.sender, receivedAt: message.sentAt, retrievedAt: new Date(now()).toISOString(), received: true, applicationState: 'Not yet verified' };
      save(root, `.local/verification/${attempt.id}-receipt.json`, receipt, null);
      return { secret: secret!, receipt };
    }
    if (now() >= deadline) break; await wait(Math.min(interval, Math.max(0, deadline - now())));
  } while (now() <= deadline);
  throw new Error('No correlated verification message arrived within the allowed interval.');
}
export function confirmApplication(root: string, attemptId: string, outcome: 'verified' | 'failed' | 'blocked', refs: Evidence[], source: string) {
  if (!/^[a-f0-9-]{36}$/.test(attemptId) || !['verified', 'failed', 'blocked'].includes(outcome) || !refs.length) throw new Error('Identify the actual attempt, application outcome and redacted evidence.');
  requireText(source); for (const ref of refs) verifyEvidence(root, ref);
  const receiptPath = `.local/verification/${attemptId}-receipt.json`, current = load<Record<string, unknown> | null>(root, receiptPath, () => null);
  if (!current.value) throw new Error('Retrieve the correlated message before recording the application outcome.');
  save(root, receiptPath, { ...current.value, applicationState: outcome, applicationEvidence: refs, applicationSource: source }, current.revision);
}
