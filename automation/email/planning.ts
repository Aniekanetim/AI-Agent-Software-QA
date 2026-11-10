import { requireText, verifyEvidence } from '../shared/store.js';
import { currentHarness, readHarness } from '../tools/runtime.js';
import { readRecord, readinessIssues } from '../tools/registry.js';
import { providerOptions, readConnections, type Account, type Binding, type Inventory } from './email.js';
import { isAddress, recipientAllowed } from './policy.js';

export interface EmailPlanRequest {
  needed: boolean;
  environment?: string;
  recipient?: string;
  operation?: 'headers' | 'message';
  context?: Inventory['executionContext'];
  inventory?: Inventory;
  bindingId?: string;
}

function sameMailbox(account: Account, binding: Binding) {
  return account.provider === binding.provider && account.accountId === binding.accountId &&
    account.mailboxId === binding.mailboxId && account.address.toLowerCase() === binding.address.toLowerCase() &&
    account.connectionReference === binding.connectionReference;
}

export function planEmail(root: string, request: EmailPlanRequest) {
  if (typeof request.needed !== 'boolean') throw new Error('Identify whether the current journey needs email.');
  if (!request.needed) return { state: 'deferred', next: 'Continue onboarding. Revisit email when an assigned check depends on it.' };

  requireText(request.environment, 'Task environment');
  const { inventory, recipient, environment, bindingId } = request;
  const context = request.context ?? readHarness(root)?.executionContext ?? 'interactive';
  const operation = request.operation ?? 'message';
  if (!['interactive', 'scheduled'].includes(context) || !['headers', 'message'].includes(operation)) {
    throw new Error('Choose interactive or scheduled email access and the needed header or message operation.');
  }
  const required = operation === 'headers' ? ['account', 'listMessages'] : ['account', 'listMessages', 'readMessage'];
  let usableInventory = inventory;
  if (inventory) {
    providerOptions(inventory);
    requireText(inventory.harness, 'Observed inventory harness');
    const actual = readHarness(root);
    if (inventory.executionContext !== context || (actual && (actual.executionContext !== context ||
        (inventory.harness !== 'directApi' && inventory.harness !== actual.id)))) usableInventory = undefined;
  }
  const accounts = usableInventory?.accounts.filter(account => isAddress(account.address)) ?? [];
  if (!recipient) return {
    state: 'confirmDestination',
    connected: accounts.filter(account => account.authentication === 'connected'),
    next: 'Establish the verification destination from the project account or authorized journey. Use available account metadata to propose a mailbox.',
  };
  if (!isAddress(recipient)) throw new Error('Supply the actual verification destination address.');

  const saved = readConnections(root).value.bindings.filter(binding =>
    binding.environment === environment && recipientAllowed(binding.address, recipient, binding.recipientPolicy));
  const selected = bindingId ? saved.filter(binding => binding.id === bindingId) : saved;
  if (bindingId && selected.length !== 1) return { state: 'confirmBinding', next: 'The saved binding does not match this environment and destination. Review the project mailbox choice.' };
  if (selected.length > 1) return { state: 'chooseBinding', bindingIds: selected.map(binding => binding.id), next: 'Choose which matching project mailbox binding this task uses.' };
  const binding = selected[0];
  if (binding?.transport === 'human') return { state: 'humanAssisted', bindingId: binding.id, next: 'Use the saved human-assisted route when the authorized verification step begins.' };
  if (!usableInventory) return {
    state: 'discover', required,
    next: 'Inspect the current harness integration directory and connected-account metadata, then check the saved mailbox against those accounts.',
  };
  const matchesTransport = !binding || (binding.transport === 'host' ? usableInventory.harness !== 'directApi' : usableInventory.harness === 'directApi');
  const observed = binding && matchesTransport ? accounts.find(account => sameMailbox(account, binding)) : undefined;
  if (binding && observed?.authentication === 'connected') {
    let issues: string[];
    try {
      const record = readRecord(root, `email:${binding.id}`);
      const checked = binding.verification;
      for (const ref of checked?.evidence ?? []) verifyEvidence(root, ref);
      issues = checked?.context === context && checked.listedAt && (operation !== 'message' || checked.bodyReadAt) &&
        record?.connectionReference === binding.connectionReference && record.account === binding.address
        ? readinessIssues(root, record, required)
        : ['Verify the required operations for this mailbox and harness.'];
    } catch { issues = ['Verify the required operations in the current harness.']; }
    return {
      state: issues.length ? 'verifyAccess' : 'reuseBinding', bindingId: binding.id, required, issues,
      next: issues.length ? 'Reuse the connected mailbox and refresh the required access checks.'
        : 'Use the selected mailbox for the authorized attempt and confirm the resulting application state.',
    };
  }
  const matching = accounts.filter(account => account.address.toLowerCase() === recipient.toLowerCase());
  const connected = matching.filter(account => account.authentication === 'connected');
  if (connected.length) return {
    state: 'selectConnectedMailbox', connected, required,
    next: 'Confirm which matching connected mailbox this project should use, then verify the required access.',
  };
  if (observed?.authentication === 'needsAuthentication' || matching.some(account => account.authentication === 'needsAuthentication')) return {
    state: 'reconnectOrChoose', required,
    next: 'Reconnect the matching account through the harness, or choose another authorized or human-assisted route.',
  };
  return {
    state: 'chooseAccessRoute', required,
    next: 'Review the destination with the task owner and choose an authorized matching mailbox or human-assisted verification.',
  };
}
