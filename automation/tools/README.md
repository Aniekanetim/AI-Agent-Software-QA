# Discover, verify and reuse tools

Onboarding starts by inspecting the tools the agent can use through its actual harness. A working installation should be reused. The agent chooses suitable tools per task using [the selection policy](task-selection.md). Ask the user only for missing constraints or access; do not repeat installation, sign-in or mailbox selection simply because onboarding started again.

## Establish the calling environment

The agent inspects the actual host/runtime and records its identity with `tools bind`. This is an agent-owned preparation step, not another interview when the information is already available.

Create a private input file with the actual values, then run:

```shell
npm run qa -- tools bind --input .local/harness-input.json
```

```json
{
  "id": "actual-harness-name",
  "version": "actual-version-or-host-managed-revision",
  "profile": "actual-project-profile",
  "executionContext": "interactive",
  "source": "reference-to-the-actual-host-inspection"
}
```

`executionContext` is interactive, scheduled or ci. The helper adds the current root, platform, architecture and Node major version. A saved identity does not prove access. The agent must call the tool through that environment and retain its actual evidence. A script cannot universally enumerate every harness's private integrations; when native discovery is unavailable, mark it unverified and explain the missing host capability.

## Discover before setup

```shell
npm run qa -- tools scan --source actual-inspection-reference
npm run qa -- tools scan --tool postman --source actual-inspection-reference
npm run qa -- tools status --tool postman --requires version,collectionRun,localCollectionRun
```

Native tool IDs are `playwrightCli`, `playwrightMcp`, `playwrightLibrary`, `playwrightTest`, `github` and `postman`. Scan checks versions without installing anything, signing in or running product tests. Version compatibility is preliminary; operation-specific checks establish readiness.

For Postman, `tools status --tool postman --requires identity` or a selected `collection:<id>` / `environment:<id>` also checks the current account, region and credential binding. A version-only status remains an installation check and does not establish cloud readiness.

The resolver preserves an existing selection, otherwise searches PATH and standard npm package locations before using bundled dependencies or the project-local GitHub CLI. Library/Test retain the suite's project dependencies. Existing installations are not upgraded, removed or replaced automatically. A selected executable that fails remains selected until the relevant choice is explicitly changed.

For an explicit path, use `tools select --input .local/tool-choice.json`:

```json
{
  "tool": "postman",
  "executable": "absolute-path-to-the-actual-postman-executable",
  "prefix": [],
  "source": "actual-selection-reference"
}
```

Node entry points use the absolute Node executable and an absolute entry-point path in `prefix`. Shell commands and arbitrary shell-shim text are not evaluated. Standard npm shims are resolved to package entry points. If a nonstandard shim cannot be resolved, select its native executable/Node entry explicitly rather than reinstalling the tool.

## Interpret the result

| Result | Next action |
| --- | --- |
| Required operations verified in this harness | Reuse; skip setup questions already answered. |
| Found, but harness invocation denied | Explain the access restriction. Preserve the installation; use an authorized execution environment. |
| Version or command incompatible | Explain the exact gap and offer a compatible selection/setup. |
| Authentication missing or expired | Reconnect only the affected service/account. |
| Account connected, resource access missing | Check selected identity and permissions; do not reinstall. |
| No suitable installation | Offer the pinned bundle or the documented platform procedure. |
| Optional capability deferred | Explain which work depends on it; continue independent preparation. |

## Native harness connections

Use the actual harness integration directory and account metadata for in-app browsing, connected MCP and email. Tool names appearing in a configuration file are not connection evidence. Browser and email procedures publish their successful operation evidence to this registry. Other actual native observations can use `tools import-host --input` with a ToolRecord-shaped input, excluding schemaVersion/harness/checkedAt. Allowed host IDs are `inAppBrowser`, `harnessMcp` and `email:<binding-id>`.

Each verified operation needs a nonempty evidence array with existing project-relative evidence hashes. Supply the actual connection reference, source, version, access/authentication state and operation outcomes. An imported record remains the agent's accountable observation; the helper cannot prove that entered prose describes a real tool call. Preserve the native call reference and redact sensitive content.

## Revalidation and existing projects

Selections are private under `.local/tool-selections.json`; reports are retained per tool and harness under `.local/tools/`. The executable/entry-point stamps, harness profile/version, root and execution context must match. Reports older than 24 hours require an affected capability refresh; execution also checks live access. A version scan preserves separately verified operations, but does not refresh their original evidence.

Switching harnesses, moving machines or changing executables requires targeted verification. Old records and onboarding replies remain intact. Existing browser reports without harness identity are retained as historical evidence and need one targeted check before reuse. No full onboarding restart is required. A CI pass proves that runner's fixture execution, not the user's interactive harness or application access.

See [Postman](../postman/README.md), [browsers](../browser/README.md), [email](../email/README.md) and [GitHub](../github/README.md) for operation-specific checks.

## Task selection and additional tools

Use [task-based selection](task-selection.md) to explain significant decisions and assess only selected operations. `tools assess-task --input` is read-only; it does not choose, run or approve work. Native executable selection is an installation binding for that tool, not a compulsory tool for the project. Named `custom:<name>` host/terminal capability reports allow other accessible tools with actual evidence; they add no automatic installer or generic executor. Project onboarding reports optional capability gaps separately from its blockers. A task still needs its own tool/data/access checks and authorization.
