# WebMCP integration validation

This record concerns the reusable package's synthetic integration checks. It is not a product test report, native harness connection verification or release approval for an adopting application.

## Scope and authorization

The user approved the WebMCP recommendations and implementation plan, including package/helper validation, controlled browser rehearsals and Windows/Linux CI. No real application, personal browser profile or mailbox is used by the fixture. Existing G1–G5 gates still apply to assigned product work.

Version 1.9.0 adds the pinned Chrome DevTools MCP/CLI dependency, registry integration, explicit session configuration, contextual inventories, invocation history, separate application verification and onboarding/workflow guidance. Human requirements, discovery ownership and board statuses retain their existing roles.

## Version 1.9.0 evidence

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

## Remaining validation recheck

This follow-up concerns version 1.9.1 and the user's explicit request to recheck headed operation, filesystem/adversarial boundaries and current-harness WebMCP access. Earlier 1.9.0 results above retain their original scope and revisions.

| Area | Current evidence |
| --- | --- |
| Current-harness integration | Read-only inspection found a separately configured Chrome DevTools MCP installation whose manifest is 0.21.0, selected with `--autoConnect`; it is not the repository's pinned 1.12.0 server |
| Native tool access | No `list_webmcp_tools` or `execute_webmcp_tool` was exposed; a basic page-list probe returned no result within the bounded 25-second check, so no native pass is claimed |
| Local headed rehearsal | Pinned-package probe recorded available=true, accessible=false and diagnostic=denied; browser launch did not occur and the installation was preserved |
| Automated helpers | All 138 tests passed locally; the new source-file CLI check is synthetic helper evidence, not browser execution |
| Headed CI and boundary fixtures | Passed all 26 checks per provider/mode on Windows and Ubuntu, including the actual positive/negative filesystem controls and hostile-content sentinels below |

The native configuration was inspected without copying credentials or personal browsing data into the repository. No global MCP setting, personal profile, connection timeout or server permission was changed. [Official MCP configuration guidance](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) explains the independent configured server and tool-access settings; a repository dependency cannot replace that connection automatically.

The new filesystem fixtures use disposable sibling files within the overall package output folder, while the browser bridge's workspace is restricted to its individual fixture root. Positive read/write controls establish that the operations work. Negative controls cover absolute outside paths, relative traversal and symlink/junction targets. Hostile metadata/output checks require the forbidden-action sentinel to remain untouched and retain separate invocation/application/QA states. Their scope is controlled adapter validation, not a general claim of prompt-injection immunity.

Implementation [c74414527a761057afb9f334c5d8ea51b7f32755](https://github.com/Aniekanetim/AI-Agent-Software-QA/commit/c74414527a761057afb9f334c5d8ea51b7f32755) passed the [branch run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40880020285) and [PR run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40880046277) on 29 October 2026. Both runners passed dependency installation, TypeScript, all 138 helpers and retained Postman/Playwright fixtures as well as these additional native checks:

| Runner and actual mode | MCP-server route | CLI route |
| --- | --- | --- |
| Windows, headless | 26/26 passed | 26/26 passed |
| Windows, headed | 26/26 passed | 26/26 passed |
| Ubuntu 22.04, headless | 26/26 passed | 26/26 passed |
| Ubuntu 22.04, headed under Xvfb | 26/26 passed | 26/26 passed |

Headless runs reported `HeadlessChrome/156.0.0.0`; headed runs reported `Chrome/156.0.0.0`, with explicit headed launch configuration. The virtual-display/CI evidence does not establish that a local user watched the browser. Local document validation resolved 498 links/anchors. The corrected local probe message was also reproduced: invocation denied, installation retained, no browser launched.

The remaining dependency is a working WebMCP-enabled native connection in the current harness, verified against its actual compatible browser/session. A separate 1.12.0 connection can be configured through the harness while retaining the existing integration; it must expose and successfully execute the required WebMCP operations. Copying the dependency, changing a JSON record or this CI success cannot establish that connection. No real-application testing or native-host pass is claimed.

A [later Windows repeat](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40881753937) failed during initial `new_page` navigation before the headed WebMCP assertions; the [parallel PR run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40881763555) passed at the same revision. The fixture setup now identifies and navigates only its own isolated browser's blank startup tab, retaining all 26 assertions and the original failure. This avoids an unnecessary initial tab-creation dependency without retrying the failed action. The underlying intermittent `new_page` cause remains unconfirmed; this fixture does not establish that every new-tab startup is reliable.
