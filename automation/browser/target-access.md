# Verify browser access to a saved environment

When browser work is planned, establish access to the actual target during onboarding. A working connection or local fixture can coexist with an allowlist that blocks staging. An HTTP reachability check, saved rule, and successful browser navigation are distinct observations.

## Onboarding and Settings

1. Establish the target environment before browser setup. Reuse the URL already supplied. Run `npm run qa -- browser-access targets` to see origins derived from saved environments. Choose the actual browser for the planned work. A browser rule change and public navigation each need scoped authority.
2. Inspect the selected connection and run `npm run qa -- browser-access prepare --input .local/browser-access-preparation.json`. Present the resulting next action during setup. `onboarding status` and Settings → browser show the retained assessment. `browser-access status` is read-only. Browser-independent onboarding and tasks keep their own readiness.
3. If an origin is missing, present the exact addition and purpose. Reuse prior authority and ask only for a missing decision. For Codex `qa-webmcp`, use the native setup below to add the rule and verify the saved configuration. For project Chrome, use its own helper. For a managed or unsupported host, give its owner the exact change during onboarding. Resolve a separate login or redirect origin only when needed and explicitly scoped.
4. When a rule is saved but the browser still has the previous configuration, start or reload only the relevant connection through its supported interface. Inspect the actual refreshed scope and prepare the new connection generation. A managed/unknown scope remains unresolved until the host owner establishes it or an authorized bounded browser probe verifies it.
5. Open the saved public entry page in the selected browser within the authorized scope. Enforce the boundary before navigation; use a supported origin guard or an equivalent bounded route. If the browser cannot enforce that boundary, record the limitation. Observe the resulting page and retain redacted evidence. Record the outcome with `npm run qa -- browser-access record --input .local/browser-access-observation.json`. This verifies public page access, separate from sign-in, application behavior and test authorization.

In a browser without an applicable allowlist, skip rule setup and still verify navigation. Reuse fresh proof for the same actual target, browser and connection generation. Refresh only the affected preparation when the environment, browser, harness or settings change. Do not repeat an unchanged failed probe. Earlier answers and historical observations stay intact.

## Private inputs and supported changes

`prepare` takes `{ schemaVersion: 1, target, scope, observedAt, source, evidence }`. The target is `{ environment, tool, connection, generation }`: the saved environment name, selected tool ID, actual connection reference and actual instance/configuration generation. Evidence references an observed connection or preparation, not a fabricated tool result. Use a nonsecret, session-specific reference if a host has no stable identity; do not reuse it across unobserved instances. Use a fresh ISO observation time and retain its actual source. Preparation stores only a normalized origin and a hash of the saved URL, alongside these references. Query strings and fragments do not enter a public probe or its saved result.

| Observed scope | `scope` input | Effect |
| --- | --- | --- |
| Existing project Chrome launcher (`chromeDevtoolsCli` or `chromeDevtoolsMcp`) | `{ "kind": "projectChrome", "activeSettingsHash": null }` or the configuration hash observed in the actual running connection | Compare with saved project Chrome settings. `null` means activation is unverified; never substitute the desired saved hash for the active one. An owned CLI session's retained running configuration is one evidence source. |
| Native or other inspected allowlist | `{ "kind": "observedAllowlist", "activeOrigins": [], "savedOrigins": null }` | Supply actual exact origins. An empty list means none observed in that list, and `null` means unknown. A saved entry missing from the running list requires reload. Use the native setup below for the supported Codex connection. |
| Browser without an applicable allowlist | `{ "kind": "noAllowlist" }` | No rule addition; verify the bounded browser probe. |
| Scope cannot be inspected | `{ "kind": "unknown" }` | Report the limitation and use a bounded probe only if the selected browser can enforce it. |

To apply a rule to existing **project Chrome settings**, use `npm run qa -- browser-access apply --input .local/browser-origin-addition.json`. The input is `{ target, expectedSettingsRevision, approval }`. Copy the revision shown with `missingOrigin` and reference the actual authorization. The helper adds one origin, preserves the other settings and records the proposed change. An already present origin needs no edit. If settings changed, inspect the new diff before retrying.

### Add an authorized origin to Codex qa-webmcp

1. Prepare the actual native connection with `tool: "chromeDevtoolsHost"`, `connection: "qa-webmcp"` and `scope.kind: "observedAllowlist"`. Record the actual active origins, or `null` if the running list is unknown.
2. Run `npm run qa -- browser-access native-plan --input .local/qa-webmcp-target.json` with the `target` object. It reads the local Codex user configuration and returns the exact proposed rule, current revision and whether it is already saved.
3. Run `npm run qa -- browser-access native-apply --input .local/qa-webmcp-addition.json` with `{ target, expectedSettingsRevision, approval }`. A missing rule requires the actual scoped decision. For an already saved rule, this command verifies it without editing the configuration or requiring new authorization. The helper changes only the existing `qa-webmcp` arguments through Codex config, reads them back, and confirms that the previous rules and other user settings were preserved. It records a private receipt.
4. If needed, reload the selected connection using its supported host controls. Prepare the refreshed generation and verify the target in that active browser. When the running scope is unknown, inspect it or perform the authorized bounded probe. A saved rule alone leaves browser access unverified.

The helper supports a local, unshadowed Codex user configuration with one existing `--allowedUrlPattern` argument followed by its rules. It uses the Codex executable on PATH, or the actual native executable specified by absolute path with `--codex-executable`. If the host manages the configuration or the format cannot be verified, hand off the precise rule and location to its owner before dependent work.

`approval` is an evidence reference to a retained actual decision (or its JSON pointer), with this shape:

```json
{
  "schemaVersion": 1,
  "decision": "Approved",
  "environment": "staging",
  "origin": "https://staging.example.test",
  "tool": "chromeDevtoolsHost",
  "connection": "qa-webmcp",
  "actions": ["addOrigin", "navigate"],
  "source": "reference to the actual scoped human instruction"
}
```

This is an example only. Use `addOrigin` for the exact configuration change and `navigate` for the scoped public-page observation; include only the actions actually authorized. A reload can reuse the same decision for the same environment, origin, tool and connection. A different connection or origin needs applicable authority. The helper checks the recorded scope and evidence references; it does not establish that a human gave consent or that a tool call occurred.

`record` takes `{ target, approval, observedAt, evidence, requestedUrl, outcome, finalUrl?, httpStatus?, scopeEnforced? }`. Outcomes are `rendered`, `originDenied`, `networkFailed`, `httpError`, `redirectBlocked` and `scopeUnverified`. For `rendered`, provide actual evidence that the bound browser rendered the public entry on the same origin with scope enforced (`scopeEnforced: true`). When available, use the final page's observed HTTP status. Never use a HEAD request, a blank page, an unapproved redirect or a tool listing as rendered evidence. Enter no secret-bearing URLs or raw session material. Retained receipts store only the final origin and outcome, not the full URLs. The current preparation and immutable receipts live under `.local/browser-access/`; existing onboarding schema and records are untouched.

## Task preparation

For a browser requirement that names a saved environment, include `browserAccess: { environment, connection, generation }` in the task tool plan. The assessor uses the actual selected tool and checks matching target evidence before marking that requirement prepared. Legacy requirements without a target keep their existing behavior; add the binding when planning a new saved-environment browser step. WebMCP work still needs its actual page/role/state inventory and document binding. The new access report neither replaces those checks nor grants execution authority.
