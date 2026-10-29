# WebMCP integration validation

This record concerns the reusable package's synthetic integration checks. It is not a product test report, native harness connection verification or release approval for an adopting application.

## Scope and authorization

The user approved the WebMCP recommendations and implementation plan, including package/helper validation, controlled browser rehearsals and Windows/Linux CI. No real application, personal browser profile or mailbox is used by the fixture. Existing G1–G5 gates still apply to assigned product work.

Version 1.9.0 adds the pinned Chrome DevTools MCP/CLI dependency, registry integration, explicit session configuration, contextual inventories, invocation history, separate application verification and onboarding/workflow guidance. Human requirements, discovery ownership and board statuses retain their existing roles.

## Evidence status

| Check | Actual status |
| --- | --- |
| Dependency installation | Installed 1.12.0 with scripts disabled; npm audit reported zero vulnerabilities at implementation time |
| Local TypeScript check | Passed |
| Local helper suite | Passed all 137 tests: 114 retained checks and 23 Chrome/WebMCP checks; zero failures, cancellations or skips |
| Documentation | All 496 local Markdown targets/anchors resolved in the working root and a relocated copy with spaces in its path |
| Local native browser rehearsal | Blocked: this calling sandbox denies Node child-process creation with `EPERM`; installation was preserved |
| Windows/Linux CI browser rehearsal | Passed both MCP-server and CLI routes, with 14 native checks per route on each operating system; revision and run links below |
| Portable-copy check | Copied 137 tracked files without private state/dependencies/Git metadata; relocated CLI help and document checks passed using the existing build, not a fresh dependency installation |
| Native Chrome DevTools MCP connection in the current harness | Not verified; no native connection is claimed from terminal/CI execution |
| Real-product testing | Not performed |

## Browser checks

`npm run test:chrome` exercises local MCP-server and CLI routes against a synthetic loopback application with native `document.modelContext`. Its assertions cover browser initialization, page identity, imperative and declarative discovery, origin restrictions, an imperative saved record, independent server-state and visible-interface checks, repeated invocation identity, automatic form submission, invalid input, manual form cancellation, changed tool inventories and same-URL document replacement. The fixture installs no polyfill and uses a private path containing spaces.

Unit tests separately cover version/entry-point selection, source/context/configuration freshness, uncertain/interrupted requests, concurrent invocation identity, evidence-backed application verification, redaction, onboarding preservation and owned-daemon handling. A simulated helper test is identified as synthetic; it does not establish real browser behavior.

Each actual browser run prints its provider, browser version, visibility, checks and local evidence root. CI results must be read for the tested revision. An unavailable, skipped or failing run cannot be represented as a passing integration.

## Reproducible CI evidence

The implementation at [219869a42c8ad1b295a4d2ecd6bfb28acc3077c0](https://github.com/Aniekanetim/AI-Agent-Software-QA/commit/219869a42c8ad1b295a4d2ecd6bfb28acc3077c0) passed the [branch run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40869681318) and [pull-request run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40869687111) on 29 October 2026. Each run installed dependencies from the lockfile with scripts disabled and passed TypeScript, all 137 helpers, the existing Postman/Playwright fixtures and the new Chrome fixtures.

| Runner | Local MCP-server route | CLI route |
| --- | --- | --- |
| Windows | 14/14 passed, headless | 14/14 passed, headless |
| Ubuntu 22.04 | 14/14 passed, headless | 14/14 passed, headless |

The Windows fixture reported Node 22.23.4, bridge 1.12.0 and `HeadlessChrome/156.0.0.0` from the pinned Playwright Chromium installation. This establishes that tested combination; the documented Chrome 150+ prerequisite is not a claim that every intervening browser version was exercised.

Development validation exposed response-shape, cancellation-status and daemon-configuration differences. The corrections remain covered by helper tests. An [earlier Windows attempt](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40867933407) also reported an intermittent aborted initial navigation. The fixture now explicitly establishes browser readiness before navigation; later runs above passed without retrying failed actions. The upstream cause of that earlier abort was not established. The adapter preserves explicit tool errors even when the upstream CLI exits zero, so such failures cannot be reported as successful execution.

For a later documentation-only revision, inspect the PR's checks at its actual head before merging. These dated results remain evidence for the identified implementation revision; they are not rewritten as results for an unexecuted revision.

## Operational limits

Headless CI does not establish visible operation, a user's native harness connection, target-application support or production behavior. The fixture's role change tests catalogue invalidation, not real authentication or authorization. Optional debugging tools, feature-version differences and cross-origin WebMCP exposure require task-specific sources and actual verification. Missing connections, disabled inspection and empty catalogues also have helper coverage; those simulations are not additional native-browser runs. Catalogue metadata is not a requirements baseline. Role/account changes must be reobserved even when tool schemas look identical.

The implementation is delivered for review through its pull request; package checks do not replace the human's scoped review or authorize product testing/deployment.
