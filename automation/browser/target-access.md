# Verify browser access to a saved environment

Establish access to the target during onboarding. **Standard** is the default for a dedicated QA browser. It lets redirects and page resources load while the agent stays within the authorized task. **Strict** is a recorded project choice. Legacy rules describe a connection's configuration, which can differ from the project's choice.

## Onboarding and Settings

1. Establish the target environment before browser setup. Reuse the URL already supplied. Run `npm run qa -- browser-access targets` to see origins derived from saved environments. Choose the actual browser for the planned work. A browser rule change and public navigation each need scoped authority.
2. Inspect the selected connection and run `npm run qa -- browser-access prepare --input .local/browser-access-preparation.json`. Present the resulting next action during setup. `onboarding status` and Settings → browser show the retained assessment. `browser-access status` is read-only. Browser-independent onboarding and tasks keep their own readiness.
3. In Standard, skip allowlist setup. In Strict, gather the target and known sign-in and dependency origins in the same setup conversation. Present the exact changes and reuse prior authority. Apply the scoped rules using the matching helper, or hand them to the owner of a managed host.
4. When a rule is saved but the browser still has the previous configuration, start or reload only the relevant connection through its supported interface. Inspect the actual refreshed scope and prepare the new connection generation. A managed/unknown scope remains unresolved until the host owner establishes it or an authorized bounded browser probe verifies it.
5. Open the authorized entry URL through the selected browser. In Strict, confirm network rules are active before the probe. A redirect to a rendered sign-in page is a separate outcome. Verify the identity provider before using credentials. Retain redacted evidence and record the outcome with `npm run qa -- browser-access record --input .local/browser-access-observation.json`.

In a browser without an applicable allowlist, skip rule setup and still verify navigation. Reuse fresh proof for the same actual target, browser and connection generation. Refresh only the affected preparation when the environment, browser, harness or settings change. Do not repeat an unchanged failed probe. Earlier answers and historical observations stay intact.

## Private inputs and supported changes

`prepare` takes `{ schemaVersion: 1, target, scope, observedAt, source, evidence }`. The target is `{ environment, tool, connection, generation }`: the saved environment name, selected tool ID, actual connection reference and actual instance/configuration generation. Evidence references an observed connection or preparation, not a fabricated tool result. Use a nonsecret, session-specific reference if a host has no stable identity; do not reuse it across unobserved instances. Use a fresh ISO observation time and retain its actual source. Preparation stores only a normalized origin and a hash of the saved URL, alongside these references. Query strings and fragments do not enter a public probe or its saved result.

| Observed scope | `scope` input | Effect |
| --- | --- | --- |
| Existing project Chrome launcher (`chromeDevtoolsCli` or `chromeDevtoolsMcp`) | `{ "kind": "projectChrome", "activeSettingsHash": null }` or the configuration hash observed in the actual running connection | Compare with saved project Chrome settings. `null` means activation is unverified; never substitute the desired saved hash for the active one. An owned CLI session's retained running configuration is one evidence source. |
| Native or other inspected allowlist | `{ "kind": "observedAllowlist", "activeOrigins": [], "savedOrigins": null }` | Supply actual exact origins. An empty list means none observed in that list, and `null` means unknown. A saved entry missing from the running list requires reload. Use the native setup below for the supported Codex connection. |
| Browser using Standard networking | `{ "kind": "noAllowlist" }` | Skip rule setup and probe the authorized entry URL. |
| Scope cannot be inspected | `{ "kind": "unknown" }` | Report the limitation and use a bounded probe only if the selected browser can enforce it. |

To apply a rule to existing **project Chrome settings**, use `npm run qa -- browser-access apply --input .local/browser-origin-addition.json`. The input is `{ target, expectedSettingsRevision, approval }`. Copy the revision shown with `missingOrigin` and reference the actual authorization. The helper adds one origin, preserves the other settings and records the proposed change. An already present origin needs no edit. If settings changed, inspect the new diff before retrying.

### Prepare the dedicated Standard launcher

When target preparation reports `needsStandardSetup`, run `npm run qa -- browser-access ensure-standard --input .local/standard-browser.json` with `{ environment, tool, executablePath?, visibility?, source, evidence }`. Use `chromeDevtoolsCli` or `chromeDevtoolsMcp` for `tool`. For a fresh launcher, select an existing compatible Chrome executable and reuse the user's visibility preference. The command scopes WebMCP actions to the saved target and creates an isolated launch.

For a legacy project-owned launch, the command backs up the old settings and saves Standard with the previous network rules available for Strict. An existing Standard setup is reused. A saved explicit Strict choice is retained. For a shared or attached connection, the helper backs up its project selection and creates a dedicated launcher without editing the host configuration. Respect any required host restrictions. Launch or reload the dedicated connection and verify actual operation.

### Add an authorized origin to Codex qa-webmcp

1. Prepare the actual native connection with `tool: "chromeDevtoolsHost"`, `connection: "qa-webmcp"` and the observed network mode.
2. Run `npm run qa -- browser-access native-plan --input .local/qa-webmcp-target.json` with the `target` object. For Standard, skip allowlist setup. With existing native rules and no project Strict choice, use the dedicated Standard launcher. With a recorded Strict choice, the helper reports the exact rule and saved revision.
3. In Strict, use `npm run qa -- browser-access native-apply --input .local/qa-webmcp-addition.json` with `{ target, expectedSettingsRevision, approval }`. To record a new Strict choice, include `enableStrict: true` and an `enableStrict` approval. This records the choice even when the first rule is already present. Subsequent exact additions use `addOrigin`. The helper verifies the saved configuration and records a private receipt.
4. If needed, reload the selected connection using its supported host controls. Prepare the refreshed generation and verify the target in that active browser. When the running scope is unknown, inspect it or perform the authorized bounded probe. A saved rule alone leaves browser access unverified.

The native helper supports a local, unshadowed Codex user configuration. It uses the Codex executable on PATH or an absolute path provided with `--codex-executable`. Managed and unsupported settings follow the host owner's procedure.

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

Use `addOrigin` for an addition in Strict, `enableStrict` for the opt-in and initial exact rule, and `navigate` for the public entry probe. Record only the actions the human authorized. Reuse scoped authorization after a reload of the same connection.

`record` takes `{ target, approval, observedAt, evidence, requestedUrl, outcome, finalUrl?, httpStatus?, scopeEnforced? }`. Use `rendered` when the browser rendered the target origin. Use `signInReached` when evidence shows the entry route reached and rendered an HTTPS sign-in page on a different origin. That result leaves application access pending. Failure outcomes include `originDenied`, `networkFailed`, `httpError`, `redirectBlocked` and `scopeUnverified`. For Strict navigation report the verified active scope with `scopeEnforced: true`. Use the final document's observed HTTP status when available. Retain redacted references and the final origin under `.local/browser-access/`.

## Task preparation

For a browser requirement that names a saved environment, include `browserAccess: { environment, connection, generation }` in the task tool plan. The assessor uses the actual selected tool and checks matching target evidence before marking that requirement prepared. Legacy requirements without a target keep their existing behavior; add the binding when planning a new saved-environment browser step. WebMCP work still needs its actual page/role/state inventory and document binding. The new access report neither replaces those checks nor grants execution authority.
