import { requireText } from '../shared/store.js';

/** Shared procedure, not a grant of mailbox access or proof of alias delivery. */
export const mailboxPolicy = {
  id: 'shared-test-mailbox-v1',
  preferredAccountStrategy: 'Use purpose/run plus aliases on a selected test inbox when the provider and application support them.',
  freshState: 'Prepare a distinct full alias for a fresh application account.',
  continuation: 'Reuse the exact recorded alias for continuation and retesting.',
  accountFields: ['address', 'creatorProfile', 'objective', 'startingState', 'runId', 'environment'],
  verification: 'Match the exact full recipient, expected sender/purpose and time anchored before the request. Reject stale or ambiguous matches; never choose arbitrary latest content.',
  secrets: 'Keep passwords, OTPs, reusable links and tokens outside shared records.',
} as const;

export interface RecipientPolicy { mode: 'plusAliases'; source: string }
export const isAddress = (value: string) => typeof value === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

export function validateRecipientPolicy(address: string, policy?: RecipientPolicy): void {
  if (policy === undefined) return;
  if (!policy || policy.mode !== 'plusAliases') throw new Error('Unsupported recipient policy; preserve and correct the saved selection.');
  requireText(policy.source, 'Actual alias authorization/support source');
  if (!isAddress(address) || address.split('@')[0]!.includes('+')) throw new Error('Plus aliases require the actual untagged physical mailbox.');
}

export function recipientAllowed(address: string, recipient: string, policy?: RecipientPolicy): boolean {
  validateRecipientPolicy(address, policy);
  if (!isAddress(address) || !isAddress(recipient)) return false;
  if (address.toLowerCase() === recipient.toLowerCase()) return true;
  if (!policy) return false;
  const [local, domain] = address.toLowerCase().split('@');
  const [candidate, candidateDomain] = recipient.toLowerCase().split('@');
  if (domain !== candidateDomain || !candidate!.startsWith(local + '+') || candidate!.length > 64 || recipient.length > 254) return false;
  // Preserve the tag; do not normalize another account into the base address.
  return /^[a-z0-9][a-z0-9-]*$/.test(candidate!.slice(local!.length + 1));
}
