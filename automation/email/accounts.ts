import { randomInt } from 'node:crypto';
import { load, save, withLock, requireText } from '../shared/store.js';
import { readConnections } from './email.js';
import { isAddress, MAX_ALIAS_LOCAL_PART_LENGTH, recipientAllowed, validateRecipientPolicy } from './policy.js';

export interface TestAccount {
  id: string; bindingId: string; mailboxId: string; mailboxAddress: string; environment: string; address: string;
  creatorProfile: string; objective: string; startingState: string; runId: string; preparedAt: string;
  applicationState: 'notVerified'; source: string;
  uses: { runId: string; source: string; mode: 'fresh' | 'reuse'; recordedAt: string }[];
}
export type AccountRequest = { mode: 'fresh'; id: string; bindingId: string; creatorProfile: string; objective: string; startingState: string; runId: string; source: string }
  | { mode: 'reuse'; id: string; bindingId: string; runId: string; source: string };
interface Register { schemaVersion: 1; accounts: TestAccount[] }
const path = '.local/test-accounts.json';
const MIN_RANDOM_SUFFIX_LENGTH = 4;
const MAX_ALIAS_ATTEMPTS = 10;
export function readTestAccounts(root: string) {
  const current = load<Register>(root, path, () => ({ schemaVersion: 1, accounts: [] }));
  if (current.value.schemaVersion !== 1 || !Array.isArray(current.value.accounts)) throw new Error('Invalid test-account register; preserve and reconcile it.');
  return current;
}
const slug = (value: string, limit: number) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, limit).replace(/-$/g, '');

/** Generate a compact fresh alias; purpose, run and source stay in the private register. */
export function generateShortAlias(mailboxAddress: string, creatorProfile: string, existingAddresses: readonly string[] = [], randomSuffix: (length: number) => string = length => randomInt(36 ** length).toString(36).padStart(length, '0')): string {
  const [local, domain] = mailboxAddress.split('@');
  if (!local || !domain || !isAddress(mailboxAddress)) throw new Error('Use the selected, valid physical mailbox address.');
  const suffixLength = MAX_ALIAS_LOCAL_PART_LENGTH - local.length - 1 - 1;
  if (suffixLength < MIN_RANDOM_SUFFIX_LENGTH) throw new Error(`The selected mailbox leaves too little room for a unique alias within ${MAX_ALIAS_LOCAL_PART_LENGTH} local-part characters.`);
  const profileCode = slug(creatorProfile, 1);
  if (!profileCode) throw new Error('Supply a creator/profile name with at least one letter or number.');
  const existing = new Set(existingAddresses.map(value => value.toLowerCase()));
  for (let attempt = 0; attempt < MAX_ALIAS_ATTEMPTS; attempt++) {
    const suffix = randomSuffix(suffixLength);
    if (!new RegExp(`^[a-z0-9]{${suffixLength}}$`).test(suffix)) throw new Error('Alias suffix generator returned an invalid value.');
    const candidate = `${local}+${profileCode}${suffix}@${domain}`;
    if (candidate.split('@')[0]!.length > MAX_ALIAS_LOCAL_PART_LENGTH) throw new Error('Generated alias exceeds the local-part limit.');
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error('Could not prepare a distinct short alias after several attempts; preserve existing identities and reconcile the mailbox register.');
}

/** Prepares an identity only. Registration and observed application state belong to the authorized task. */
export function prepareTestAccount(root: string, input: AccountRequest): TestAccount {
  requireText(input.id); requireText(input.bindingId); requireText(input.runId); requireText(input.source);
  if (!['fresh', 'reuse'].includes(input.mode)) throw new Error('Choose fresh state or reuse an existing recorded identity.');
  const binding = readConnections(root).value.bindings.find(b => b.id === input.bindingId);
  if (!binding) throw new Error('Select the actual physical mailbox first.');
  validateRecipientPolicy(binding.address, binding.recipientPolicy);
  return withLock(root, 'test-accounts', () => {
    const current = readTestAccounts(root), old = current.value.accounts.find(a => a.id === input.id);
    if (input.mode === 'reuse') {
      if (!old) throw new Error('The original account is not recorded; do not silently create a fresh identity for a retest.');
      if (old.bindingId !== binding.id || old.mailboxId !== binding.mailboxId || old.mailboxAddress !== binding.address || old.environment !== binding.environment || !recipientAllowed(binding.address, old.address, binding.recipientPolicy)) throw new Error('Original mailbox or alias policy changed; reconcile the account before reuse.');
      if (!old.uses.some(use => use.runId === input.runId && use.source === input.source && use.mode === 'reuse')) old.uses.push({ runId: input.runId, source: input.source, mode: 'reuse', recordedAt: new Date().toISOString() });
      save(root, path, current.value, current.revision); return old;
    }
    if (old) throw new Error('This account reference already exists. Reuse it or supply a new reference for genuinely fresh state.');
    if (!binding.recipientPolicy) throw new Error('Establish provider/application plus support and configure the standard recipient policy first.');
    for (const value of [input.creatorProfile, input.objective, input.startingState]) requireText(value);
    const address = generateShortAlias(binding.address, input.creatorProfile, current.value.accounts.map(a => a.address));
    if (!recipientAllowed(binding.address, address, binding.recipientPolicy)) throw new Error('Could not prepare a distinct authorized alias; preserve existing identities.');
    const preparedAt = new Date().toISOString();
    const account: TestAccount = { id: input.id, bindingId: binding.id, mailboxId: binding.mailboxId, mailboxAddress: binding.address, environment: binding.environment, address,
      creatorProfile: input.creatorProfile, objective: input.objective, startingState: input.startingState, runId: input.runId, preparedAt,
      applicationState: 'notVerified', source: input.source, uses: [{ runId: input.runId, source: input.source, mode: 'fresh', recordedAt: preparedAt }] };
    current.value.accounts.push(account); save(root, path, current.value, current.revision); return account;
  });
}
