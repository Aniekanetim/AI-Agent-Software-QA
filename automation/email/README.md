# Email, mailbox selection and verification

Email setup selects the actual mailbox used by an authorized application account and environment. A provider being available does not establish authentication, selection or access to message content.

Apply the [global test-mailbox policy](mailbox-policy.md) across projects. When provider/application support is established, the agent prepares purpose/run aliases on a selected test inbox, records their context and reuses exact original aliases for retests. Users select their inbox/access; they do not need to author this procedure. `email policy`, `email account --input ...` and `email accounts` expose the reusable policy and private account register. Preparing an identity does not create an application account.

## Discover, then select

1. Inspect the host's supported integration/plugin/tool directory and nonsecret connected-account metadata. Search there for Gmail when it is not initially exposed. Do not conclude “Gmail unavailable” merely from the initial tool list.
2. Present **Google — Gmail / Google Workspace**, other discovered providers, **AgentMail**, **Human-assisted verification** and **Set up later**. Show accessible account addresses from profile metadata; do not open email bodies to discover identities.
3. Reuse an actual selected account or ask which account/inbox this project should use. Refresh inventory when asked to recheck or when an inbox deletion/change is reported; preserve obsolete snapshots as history. Multiple accounts require explicit bindings. For Gmail, the selected account is its mailbox. Optional query/label filters narrow retrieval, not OAuth authorization.
4. Establish permitted message scope and verify the required access. Metadata-only permission does not establish OTP/link access. Keep unavailable or deferred capability visible.

The host agent builds an Inventory from actual metadata using the [types](email.ts). `email options --input .local/inventory.json` presents its choice model. An Inventory has schemaVersion 1, harness, executionContext, actual source, providers and accounts. Account fields are provider, accountId, mailboxId, address, connectionReference and authentication (connected/needsAuthentication/denied/unverified). Native connectors use HostMailAdapter callbacks; the package does not invent a universal connector API or authenticate a host account merely by loading JSON.

## Direct adapters

AgentMail uses the included REST adapter. The user supplies their own authorized `AGENTMAIL_API_KEY` through a secure runtime environment. Gmail can use a host connection or the optional direct Gmail REST adapter with an authorized `GMAIL_ACCESS_TOKEN`. The direct adapter consumes an existing token; it is not an OAuth consent server or refresh-token vault. Connect/reconnect through the actual host/provider authentication flow. Do not paste secrets into conversation logs or committed setup records.

```shell
npm run qa -- email discover --provider gmailApi --source <actual-access-instruction>
npm run qa -- email discover --provider agentmail --source <actual-access-instruction>
```

These retrieve profile/inbox metadata only and write a private inventory snapshot; they do not select a mailbox. Host inventories can contain multiple connected accounts and providers. Refresh/merge actual metadata when switching transports; retain earlier selections instead of assuming all adapters share authentication.

For authorized AgentMail inbox creation, call `email create-inbox --input .local/create-inbox.json` with the actual `{ source, purpose }`. Refresh metadata and explicitly select the intended inbox afterwards. Neither creation nor discovery sends or deletes mail. The AgentMail adapter currently supports dedicated-inbox retrieval; it rejects query/label restrictions it does not implement.

Call `email select --input .local/mailbox-selection.json` with `{ inventory, binding }`. Binding extends an observed Account with id, environment, transport (host/gmailApi/agentmail/human), choiceSource and scope (`query`, `labels`). Where the standard alias route is authorized/supported, include `recipientPolicy: { mode: "plusAliases", source: "actual authorization/support reference" }`. All physical mailbox identifying fields must match actual metadata. Selection changes clear affected access verification. Human-assisted selection records the real destination address and its limit, without pretending an automatic connection exists.

`email verify --input ...` takes `{ bindingId, evidence, messageId? }`. Supply actual scoped-access evidence and an explicitly permitted message ID for the content check. The direct adapter verifies identity and listing, then reads that selected message if provided. No ID means body access remains unverified. It returns capability metadata, never a message body. HostMailAdapter performs the corresponding actual host calls in the agent's session.

## Verify an application attempt

Before triggering the application email, call `email begin --input ...` with bindingId, exact recipient, sender, subjectContains, actual source and optional durationMs. The recipient must be the selected base address or an authorized plus alias of that same mailbox. The attempt preserves the full alias separately from physical inbox identity; another mailbox/domain is rejected. Bindings without an alias policy retain base-address-only behavior. The attempt records its trigger time and expires within the configured bounded lifetime.

The authorized test uses `pollVerification` from [email.ts](email.ts), supplying the selected MailAdapter. It checks mailbox identity, current binding, recipient, sender, subject and time window. Stale/ambiguous messages are rejected. The default parser accepts a unique six-digit code; link mode requires a unique HTTPS link on the configured host. Other formats need a reviewed task-specific parser. HTML-only bodies are supported; snippets do not substitute for body access.

The code/link is returned **in memory** to the authorized application interaction. Do not print the returned object, pass secrets in shell arguments or save them as evidence. A private redacted receipt stores correlation metadata and “application state not yet verified.” Reusing that attempt after a receipt is blocked. Inspect the actual application outcome before legitimately triggering another attempt.

After entering the code/following the link, observe the resulting application state and use `email outcome --input ...` with attemptId, outcome (verified/failed/blocked), evidence and actual source. Retrieval alone does not establish successful login or expected notification behavior. Retain redacted evidence; screenshot and trace capture must exclude full OTPs, reusable links, tokens and unrelated personal mail.

Outbound messages, changing email addresses, cleanup and deletion require their own task scope. No mail cleanup is enabled by onboarding. [Gmail profile](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [AgentMail documentation](https://docs.agentmail.to/introduction)

## Existing setup and calling harness

Use [shared tool discovery](../tools/README.md) before setup. Reuse verified compatible installations, identities and mailbox selections. A version/configuration check does not establish the required operation through this harness. Retain old evidence after moving hosts; reverify only affected capabilities. Missing or expired access does not require reinstalling a working tool.
