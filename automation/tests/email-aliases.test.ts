import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as mail from '../email/email.js';
import { prepareTestAccount, readTestAccounts } from '../email/accounts.js';
import { recipientAllowed } from '../email/policy.js';
import * as store from '../shared/store.js';

const account: mail.Account = { provider: 'agentmail', accountId: null, mailboxId: 'qa@example.test', address: 'qa@example.test', connectionReference: 'synthetic:agentmail', authentication: 'connected' };
const inventory: mail.Inventory = { schemaVersion: 1, harness: 'Synthetic fixture', executionContext: 'interactive', source: 'Synthetic metadata', providers: [{ id: 'agentmail', name: 'AgentMail', available: true }], accounts: [account] };
const policy = { mode: 'plusAliases' as const, source: 'Synthetic authorization and supported provider/application fixture' };
const binding = (): mail.Binding => ({ ...account, id: 'shared', environment: 'Synthetic staging', transport: 'agentmail', choiceSource: 'Synthetic selected shared test inbox', scope: {}, recipientPolicy: policy });
function fixture(aliases = true) {
  const r = resolve('output/test-fixtures', randomUUID()); mkdirSync(r, { recursive: true });
  const root = realpathSync(r), value = binding(); if (!aliases) delete value.recipientPolicy;
  mail.selectBinding(root, value, inventory);
  return { root, time: 1_800_000_000_000 };
}
function message(time: number, recipient = 'qa+creator-signup-run01@example.test'): mail.Message {
  return { id: 'right', mailboxId: account.mailboxId, sentAt: new Date(time + 100).toISOString(), from: 'Product <service@example.test>', to: [recipient], subject: 'Signup verification', text: 'Synthetic code 246810' };
}
function attempt(root: string, time: number, recipient = 'qa+creator-signup-run01@example.test') { return mail.beginVerification(root, 'shared', recipient, 'service@example.test', 'Signup verification', 'Synthetic authorized request', 30_000, time); }
function adapter(m: mail.Message, listed: mail.Message[] = [m]): mail.MailAdapter { return { account: async () => account, list: async () => listed, read: async () => m }; }

test('base-address verification remains supported and aliases require an explicit policy', () => {
  const { root, time } = fixture(false);
  assert.equal(attempt(root, time, account.address).recipient, account.address);
  assert.throws(() => attempt(root, time), /authorized exact recipient/);
  assert.throws(() => mail.selectBinding(root, { ...binding(), recipientPolicy: { ...policy, source: '' } }, inventory), /source/);
  const current = store.load(root, '.local/email-connections.json', () => ({ bindings: [] as unknown[] }));
  store.save(root, '.local/email-connections.json', { ...current.value, bindings: [{ ...binding(), recipientPolicy: { mode: 'unsupported', source: 'Synthetic corrupt settings' } }] }, current.revision);
  assert.throws(() => mail.readConnections(root), /Unsupported recipient policy/);
});

test('authorized aliases retain the physical mailbox and full exact application recipient', async () => {
  const { root, time } = fixture(), pending = attempt(root, time), m = message(time);
  const result = await mail.pollVerification(root, pending, adapter(m), { timeoutMs: 0, now: () => time + 200 });
  assert.equal(result.secret, '246810');
  assert.equal(result.receipt.mailboxId, account.mailboxId);
  assert.equal(result.receipt.recipient, m.to[0]);
  assert.equal(result.receipt.purpose, m.subject);
  const saved = readFileSync(store.contained(root, `.local/verification/${pending.id}-receipt.json`), 'utf8');
  assert(!saved.includes('246810')); assert(saved.includes('qa+creator-signup-run01@example.test'));
  assert.equal(mail.readConnections(root).value.bindings[0]!.address, account.address);
});

test('alias policies reject other mailboxes, domains, empty/nested tags and unsupported address shapes', () => {
  const { root, time } = fixture();
  for (const recipient of ['other+run01@example.test', 'qa+run01@elsewhere.test', 'qa+@example.test', 'qa+one+two@example.test', 'qa+bad tag@example.test', 'qa+one@example.test.attacker.test']) {
    assert.equal(recipientAllowed(account.address, recipient, policy), false, recipient);
    assert.throws(() => attempt(root, time, recipient), /authorized exact recipient/);
  }
});

test('concurrent aliases and unrelated sender/purpose/time cannot satisfy the selected attempt', async () => {
  const { root, time } = fixture(), pending = attempt(root, time), m = message(time);
  const others = [
    { ...m, id: 'other-alias', to: ['qa+creator-signup-run02@example.test'] },
    { ...m, id: 'base-address', to: [account.address] },
    { ...m, id: 'old', sentAt: new Date(time - 1).toISOString() },
    { ...m, id: 'future', sentAt: new Date(time + 300).toISOString() },
    { ...m, id: 'wrong-purpose', subject: 'Password reset' },
    { ...m, id: 'wrong-sender', from: 'other@example.test' },
  ];
  assert.deepEqual(mail.matchingMessages([...others, m], pending, time + 200).map(value => value.id), ['right']);
  const reads: string[] = [];
  const fake = { ...adapter(m, [...others, m]), read: async (id: string) => { reads.push(id); return m; } };
  assert.equal((await mail.pollVerification(root, pending, fake, { timeoutMs: 0, now: () => time + 200 })).secret, '246810');
  assert.deepEqual(reads, ['right']);
});

test('ambiguous alias messages and a different full-message identity are rejected', async () => {
  const { root, time } = fixture(), pending = attempt(root, time), m = message(time);
  await assert.rejects(mail.pollVerification(root, pending, adapter(m, [m, { ...m, id: 'second' }]), { timeoutMs: 0, now: () => time + 200 }), /Multiple/);
  await assert.rejects(mail.pollVerification(root, pending, adapter({ ...m, id: 'different' }, [m]), { timeoutMs: 0, now: () => time + 200 }), /differs/);
  await assert.rejects(mail.pollVerification(root, pending, adapter({ ...m, to: ['qa+other-run01@example.test'] }, [m]), { timeoutMs: 0, now: () => time + 200 }), /differs/);
});

test('alias routing cannot replace physical mailbox identity or survive policy revocation', async () => {
  const { root, time } = fixture(), pending = attempt(root, time), m = message(time);
  await assert.rejects(mail.pollVerification(root, pending, { ...adapter(m), account: async () => ({ ...account, address: pending.recipient }) }, { timeoutMs: 0, now: () => time + 200 }), /no longer matches/);
  const changed = binding(); delete changed.recipientPolicy; mail.selectBinding(root, changed, inventory);
  await assert.rejects(mail.pollVerification(root, pending, adapter(m), { timeoutMs: 0, now: () => time + 200 }), /binding changed/);
});

test('account preparation records identity/purpose/run/state and exact reuse without creating application accounts', () => {
  const { root } = fixture();
  const input = { mode: 'fresh' as const, id: 'signup-one', bindingId: 'shared', creatorProfile: 'Creator one', objective: 'Signup', startingState: 'Fresh unregistered account required', runId: 'run01', source: 'Synthetic task authorization' };
  const first = prepareTestAccount(root, input);
  assert.match(first.address, /^qa\+creator-one-signup-run01-[a-f0-9]{8}@example\.test$/);
  assert.equal(first.creatorProfile, input.creatorProfile); assert.equal(first.startingState, input.startingState);
  assert.equal(first.applicationState, 'notVerified'); assert.equal(first.environment, 'Synthetic staging');
  assert.throws(() => prepareTestAccount(root, input), /already exists/);
  const reused = prepareTestAccount(root, { mode: 'reuse', id: first.id, bindingId: 'shared', runId: 'retest01', source: 'Synthetic retest' });
  assert.equal(reused.address, first.address); assert.equal(reused.startingState, first.startingState); assert.equal(reused.uses.length, 2);
  const second = prepareTestAccount(root, { ...input, id: 'signup-two' }); assert.notEqual(second.address, first.address);
  assert.equal(readTestAccounts(root).value.accounts.length, 2);
});

test('account preparation rejects missing originals, unsupported aliases, revoked routes and secret fields', () => {
  const { root } = fixture(false);
  assert.throws(() => prepareTestAccount(root, { mode: 'reuse', id: 'missing', bindingId: 'shared', runId: 'r1', source: 'Synthetic retest' }), /not recorded/);
  const input = { mode: 'fresh' as const, id: 'fresh', bindingId: 'shared', creatorProfile: 'Fixture', objective: 'Signup', startingState: 'Fresh', runId: 'run01', source: 'Synthetic authorization' };
  assert.throws(() => prepareTestAccount(root, input), /configure the standard/);
  mail.selectBinding(root, binding(), inventory); const first = prepareTestAccount(root, input);
  assert.throws(() => store.save(root, '.local/forbidden-account.json', { ...first, password: 'synthetic' }, null), /secret/);
  const changed = binding(); delete changed.recipientPolicy; mail.selectBinding(root, changed, inventory);
  assert.throws(() => prepareTestAccount(root, { mode: 'reuse', id: first.id, bindingId: 'shared', runId: 'retest', source: 'Synthetic retest' }), /policy changed/);
});
