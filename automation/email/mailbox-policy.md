# Global test-mailbox policy

This is the standard email procedure for every adopting project, across onboarding, discovery, testing and retesting. The agent applies it; users do not need to write a project-specific policy. Actual inboxes, access permissions and application accounts remain project-specific.

## One inbox, short distinct application identities

Select an authorized test inbox and confirm that its provider and the application accept plus-addressing. When supported, prepare separate application email identities on that inbox. Keep the **entire email local part** (everything before `@`, including the physical mailbox name and `+`) at **10 ASCII characters or fewer**. For example, `uat+c4m2qx@agentmail.to` has a 10-character local part.

The physical inbox is the email connection's identity. The full tagged address is the application's account identity. A short tag uses a compact profile marker and random characters; its creator, purpose, run, environment and source remain in the private account register. Never replace the physical inbox address with a tag or remove the tag when matching verification emails. Plus-address support is not universal: preserve the source of confirmation and verify actual delivery during the first authorized flow. If the provider/application does not support it, record the limitation and arrange an authorized alternative through the agent.

If the physical mailbox name leaves fewer than four random tag characters plus a profile marker within the limit, stop and choose an authorized mailbox/identity route with enough space. Do not exceed the limit silently. Check new tags against the private register and regenerate on a collision. The application may still report an alias already in use outside that register; preserve that failed attempt and prepare another fresh alias rather than changing a registered account.

## Fresh state and continued state

For fresh account state, the agent uses `email account` in fresh mode to generate a distinct short alias within the local-part limit. Creator/profile, objective, run and purpose details are stored in the private register rather than encoded in the address. This prepares an identity; it does not register an application account. Application registration follows the authorized onboarding or task flow.

The private `.local/test-accounts.json` register retains the full alias, physical inbox/binding, environment, creator/profile, objective, declared starting state, run and source. The starting state is supplied planning context; actual account creation/access must be observed and linked in the task. The helper labels application state unverified. A [shared register template](templates/test-account-register.md) can link redacted task evidence without exposing secrets.

For continuation or retesting, the agent uses reuse mode with the original account reference. It returns the exact original alias and records the new run reference without replacing the original context. This also preserves aliases created before the 10-character policy; do not change an existing account's email to meet the new limit. An absent original, a changed mailbox or a revoked alias route requires reconciliation; never silently create a new account for that retest. Read the saved register after interruption rather than generating a replacement alias.

## Verification belongs to one attempt

Before triggering the application email, record its exact full recipient, expected sender/purpose and trigger time. Retrieve from the selected physical inbox, then match the exact alias, expected sender/subject and current time window. A base-address message or another alias's message cannot satisfy that attempt. Reject stale, future, expired or ambiguous candidates. Verify the full message still matches its listed ID, recipient, mailbox and purpose before using its content.

Never pick an arbitrary latest OTP or link from a shared inbox. Keep codes, passwords, reusable links and tokens in the authorized runtime/credential mechanism, outside shared records. Preserve only redacted correlation receipts and the observed application outcome. Successful email retrieval is not proof of successful application verification.

## Configure once; reuse the standard procedure

The agent handles these steps during [onboarding](../../Onboarding/onboarding-workflow.md), reusing existing decisions and permissions:

1. Inspect fresh provider/account metadata, select the actual physical inbox and establish message-access scope. A request to recheck or a reported deletion requires a live inventory refresh.
2. Establish the provider/application alias support and authorized test-account route. Add the standard recipient policy to the guarded mailbox selection, using the actual source:

   ```json
   {
     "recipientPolicy": {
       "mode": "plusAliases",
       "source": "Reference to the actual alias authorization and provider/application support"
     }
   }
   ```

   This is a field in the selected `binding`, not a replacement for its inventory, identity, scope or environment. Use `email select` with the complete existing binding and current inventory. Old bindings without this field continue to accept only their base address. Changing it invalidates affected verification/attempt evidence; recheck the changed route while retaining history.

3. Prepare a fresh identity with a project-private input file:

   ```json
   {
     "mode": "fresh",
     "id": "creator-signup-run01",
     "bindingId": "selected-test-inbox",
     "creatorProfile": "Creator one",
     "objective": "Signup",
     "startingState": "Fresh unregistered account required",
     "runId": "run01",
     "source": "Actual authorized onboarding/task reference"
   }
   ```

   ```shell
   npm run qa -- email account --input .local/account-input.json
   npm run qa -- email accounts
   ```

4. For a retest, supply the saved account ID and original binding:

   ```json
   {
     "mode": "reuse",
     "id": "creator-signup-run01",
     "bindingId": "selected-test-inbox",
     "runId": "retest01",
     "source": "Actual authorized retest reference"
   }
   ```

5. Pass the returned full alias as `recipient` to `email begin` immediately before the authorized email-triggering action. Keep the physical binding unchanged and follow [verification](README.md#verify-an-application-attempt). The private register retains readable identity and run details; the email alias remains short.

`email policy` displays this procedure's built-in defaults. The agent offers these defaults during onboarding rather than asking users to invent them. They do not grant inbox read access, account creation, sending or cleanup by themselves; use the actual project's permissions. Full-mailbox read permission, when granted, does not relax per-attempt verification matching. The reusable repository contains no selected live inbox, account or credentials.
