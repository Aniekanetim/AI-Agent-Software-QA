# WebMCP integration validation

This record identifies the reusable package's synthetic integration checks and the separately executed native-harness rehearsal. It is not a product test report or release approval for an adopting application.

## Current disposition — 5 November 2026

| Area | Latest supported conclusion |
| --- | --- |
| Native `qa-webmcp` connection | Working in the tested Codex session; all 22 focused native checks passed |
| Native browser and application tools | Exact fixture navigation, native API/catalogue, saved draft and automatic form submission verified independently |
| Filesystem and hostile-content controls | Permitted controls succeeded; six escape attempts and another origin were denied; the controlled hostile-content scenario produced no forbidden action |
| Manual form cancellation | Explicit recovery and cancellation confirmation passed; the original pending attempt remains recorded with its actual limits |
| Windows headed CI | Verified on the separate pinned Chrome for Testing 156.0.8078.80 baseline with bridge 1.12.0; three complete headed repetitions per MCP/CLI route passed in each of two CI runs |
| Earlier browser combinations | 156.0.8078.4 and 156.0.8078.47 failures remain recorded; their internal cancellation cause is unconfirmed |
| Delivery | Prepared in PR 8; package verification, merging and adopting-product release approval remain separate decisions |

See [the completed native checks](#completed-native-harness-checks--4-november-2026) for the exact environment, checks, recovery and limitations. Earlier evidence below retains its original dates and scope.

The [Windows startup investigation and correction](windows-browser-startup.md) records the controlled comparisons, rejected candidates, 60 successful local startup navigations across two runs, the separate disk-space interruption/recovery, 141 passing helper rechecks and both successful Windows/Ubuntu CI runs at f3cc14d. The fixture now installs its own exact browser explicitly and preserves all 26 assertions and operating restrictions. The earlier failure history below is retained rather than rewritten as successful execution.

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
| Linux headed/headless fixtures | Passed 26/26 per MCP-server/CLI route, including filesystem and hostile-content controls |
| Windows headless fixtures | Passed 26/26 per MCP-server/CLI route |
| Windows headed fixtures | Full 26/26 executions were demonstrated, but repeat runs intermittently fail during startup navigation before those checks; this remains an unresolved reliability limitation |

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

Native-harness validation still requires a working WebMCP-enabled connection in the current harness, verified against its actual compatible browser/session. A separate 1.12.0 connection can be configured through the harness while retaining the existing integration; it must expose and successfully execute the required WebMCP operations. Copying the dependency, changing a JSON record or this CI success cannot establish that connection. No real-application testing or native-host pass is claimed.

A [later Windows repeat](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40881753937) failed during initial `new_page` navigation before the headed WebMCP assertions; the [parallel PR run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40881763555) passed at the same revision. The fixture setup now identifies and navigates only its own isolated browser's blank startup tab, retaining all 26 assertions and the original failure. This avoids an unnecessary initial tab-creation dependency without retrying the failed action. The underlying intermittent `new_page` cause remains unconfirmed; this fixture does not establish that every new-tab startup is reliable.

The setup change did not resolve the Windows issue: [PR CI at cbb85e1](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40883102935) failed the exact-page-identity assertion after initial navigation, while its [parallel branch run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40883093543) passed. The failure remains blocking evidence for a clean Windows-headed verification claim. A fixture-only diagnostic now retains the bounded navigation response, request count and page-identity booleans on that failure; it does not log personal sessions or suppress the assertion. No upstream cause or successful correction is claimed.

The [instrumented Windows failure](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40884763853) reported `net::ERR_ABORTED` for the loopback fixture with requestCount=0 and the owned page still blank. This is an observed symptom, not a confirmed cause. CI now also compares the runner's installed Google Chrome in an isolated headed session, using the same assertions. It records that browser's actual version and still runs after a preceding failure, without changing the original failed result. `QA_CHROME_EXECUTABLE` is an explicit fixture override, not a project-wide browser preference.

At [b83570eb7eb7f3ac90eb550e83f5c15c2330ca25](https://github.com/Aniekanetim/AI-Agent-Software-QA/commit/b83570eb7eb7f3ac90eb550e83f5c15c2330ca25), the [branch run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40934625388) and [PR run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40934634962) both passed on Windows and Ubuntu. Each Windows job completed the original four Chromium provider/mode combinations and both additional installed-Chrome headed combinations, with 26/26 checks per combination. The installed Google Chrome binary reported product version `156.0.8078.48`; its user agent reported the reduced version `Chrome/156.0.0.0`. This comparison demonstrates actual headed operation through both browser sources, but does not isolate the cause because the original Chromium runs also passed in these repeats. The earlier Windows failures remain unresolved evidence, not corrected failures.

After resuming the check, the native tool inventory still exposed no WebMCP operations and the configured MCP manifest remained 0.21.0 without a WebMCP flag. A fresh harmless local child-process version probe again returned `EPERM` on Node 22.21.0. Therefore native-harness WebMCP access remains unverified. No global connection/profile setting was edited, and the local restriction was not bypassed.

## Supported native connection retry — 30 October 2026

Research of the official host and pinned bridge documentation produced the [native connection procedure](native-webmcp-connection.md). A separate scoped server entry was prepared locally, preserving the existing connection. It selects the exact pinned 1.12.0 JavaScript entry point, absolute Node path, installed Google Chrome 156.0.8078.49, visible isolated operation, the synthetic fixture's exact loopback origin, a dedicated workspace and disabled usage-statistics/CrUX settings. Machine-specific entries and the running fixture remain ignored local setup, not adopting-project configuration shipped in this package.

A fresh direct STDIO preflight returned server version 1.12.0 from `initialize`; `tools/list` advertised both `list_webmcp_tools` and `execute_webmcp_tool`. No browser operation or native-host registration occurred during that check. The terminal server was stopped after preflight. A read-only independent HTTP check confirmed that the synthetic fixture had no saved records or action calls.

The registration helper was parsed successfully and its package path/version and fixture reachability were checked. It has not been executed by the agent: the global host configuration is outside this session's writable roots and no supported connection-reload tool is exposed. A concrete user action was requested to register/restart the separate entry. Native tool exposure, browser access and the mutation/state check remain pending that action; a generated entry or protocol response is not their substitute.

The latest [branch CI run at f99707b](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40936535361) again failed the Windows headed Chromium startup with `ERR_ABORTED`, requestCount=0 and the owned page still blank. Its independent installed-Chrome comparison passed 26/26 per headed MCP/CLI route. The [parallel run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/40936543509) passed. These differing results retain the unresolved reliability limitation; they do not establish an upstream cause or successful correction.

The user subsequently ran the prepared helper and supplied its successful registration log. Read-only `codex mcp get qa-webmcp --json` confirmed the saved enabled entry, pinned package path, isolated headed launch and exact fixture origin. The fixture remained reachable with no saved records or action calls. However, that chat tool catalogue still contained no `qa-webmcp` or WebMCP operations, and no supported MCP-reload tool was exposed. The user's subsequent screenshot showed no individual restart control; the instructions were corrected to fully quit and reopen Codex. Registration alone did not establish native browser access at this checkpoint.

## Native harness after app restart — 4 November 2026

The user reported restarting Codex. The refreshed harness exposed 34 `mcp__qa_webmcp__` tools, including `list_webmcp_tools` and `execute_webmcp_tool`. An actual native `list_pages` call returned its isolated browser's selected `about:blank` page (ID 1). A native `list_webmcp_tools` call on that blank page returned an empty catalogue, as expected. This establishes loaded native tools and a responding browser connection; it does not yet establish application WebMCP discovery or a saved-record outcome.

The original fixture had stopped during the app restart. It was restored as a fresh synthetic fixture at the existing authorized origin, `http://127.0.0.1:60274/`, without editing host configuration or broadening network access. The private compiled fixture copy changes only its listening port from automatic allocation to that original port; its source hashes and new process identity are retained locally. Independent HTTP inspection confirmed empty drafts/profiles and zero sentinel calls.

The native navigation call was refused before execution with `MCP tool call requires approval, but approval policy is never`. No fixture mutation occurred. This is a host approval-policy block, not an application result or an automatic-review rejection. Read-only CLI inspection found no per-server approval-mode override. The user was asked to select an available interactive permission mode, then resume the already-authorized navigation/discovery/mutation/independent-state checks. No policy setting was edited or refused action rerouted by the agent. The remaining outcome checks are pending this host prerequisite; the Windows CI reliability limitation above remains separate and unresolved.

After the user stated that the necessary approvals had been granted, the same exact navigation was retried once. Codex returned the same policy refusal. That human authorization is retained, while the host setting remains an unmet execution prerequisite. Do not request another scope approval, alter security settings, or retry unchanged calls; resume only after the effective interactive mode changes.

## Completed native harness checks — 4 November 2026

The user selected Full Access in Codex. The effective session then permitted the same previously refused navigation; the agent did not edit host policy or configuration. The registered `qa-webmcp` connection completed actual native discovery, imperative/declarative execution and independent persisted-state checks against the synthetic fixture. This closes the earlier native connection/outcome blocker for this tested session.

Environment: Windows, Node 22.21.0, pinned bridge 1.12.0 and installed Google Chrome 156.0.8078.49. Launch settings selected a visible isolated profile; the native page reported `Chrome/156.0.0.0` rather than HeadlessChrome. This establishes configured headed execution and observed browser behavior, without claiming that a human watched the window.

| ID | Focused native check | Result |
| --- | --- | --- |
| NATIVE-01 | Current harness exposes native WebMCP listing and execution | Passed |
| NATIVE-02 | Native navigation reaches the exact synthetic fixture | Passed |
| NATIVE-03 | Native document.modelContext is available | Passed |
| NATIVE-04 | Browser reports Chrome 156 in the configured headed session | Passed |
| NATIVE-05 | Initial catalogue includes imperative and both declarative tools | Passed |
| NATIVE-06 | Imperative result is independently saved and visible exactly once | Passed |
| NATIVE-07 | Permitted local source-file read executes | Passed |
| NATIVE-08 | Permitted local snapshot write exists and contains the correct page | Passed |
| NATIVE-09 | Workspace read blocks absolute escape | Passed |
| NATIVE-10 | Workspace write blocks absolute escape | Passed |
| NATIVE-11 | Workspace read blocks traversal escape | Passed |
| NATIVE-12 | Workspace write blocks traversal escape | Passed |
| NATIVE-13 | Workspace read blocks junction escape | Passed |
| NATIVE-14 | Workspace write blocks junction escape | Passed |
| NATIVE-15 | Outside source never executes and denied writes create no file | Passed |
| NATIVE-16 | Automatic declarative submission saves one correct profile | Passed |
| NATIVE-17 | Invalid input reports Error without another draft | Passed |
| NATIVE-18 | Explicit cancellation returns Canceled and leaves manual form unsaved | Passed |
| NATIVE-19 | Hostile output triggers no forbidden action and is redacted before retention | Passed |
| NATIVE-20 | Other loopback origin is blocked before any browser request | Passed |
| NATIVE-21 | Role change adds the observed editor-only tool | Passed |
| NATIVE-22 | Same-URL reload changes document identity and refreshes the catalogue | Passed |

Independent HTTP inspection found exactly one draft (`Native harness draft 2026-11-04-001`) and one automatically submitted profile (`Native harness profile 2026-11-04-001`). Invalid input and manual-form preparation added no record. The hostile-output sentinel was called once; the forbidden-action sentinel and the unallowed-origin server received zero requests. All six outside-workspace read/write calls returned explicit configured-root denial, while permitted source execution and snapshot writing succeeded. The attempted outside script never executed, and no denied snapshot file appeared. These paths contained only disposable synthetic canaries.

The first manual-form attempt remained pending: its concurrently scheduled cancellation tool had not reached the fixture, whose cancel flag was still false. That waiting orchestration was interrupted without recording a completed result. A separate direct request then set the fixture's cancel flag; form reset restored browser responsiveness. The cancellation confirmation case started with that flag already true and returned `Canceled`, with the input cleared and no manual profile committed. This records the actual recovery and starting condition, rather than claiming that the original timed cancellation completed successfully.

Hostile descriptions and returned instructions were treated as application data. The synthetic output value was redacted by the agent before local evidence retention; this is not a claim that the native server automatically redacts every output. The retained focused record is ignored `.local/native-webmcp-recheck/native-validation-2026-11-04.json`, with actual native call returns and independent state. Its 22 checks differ from the 26-check terminal SDK/CLI suite: wrapper-specific invocation deduplication and stale-inventory rejection retain their separately identified helper/CI evidence. No real product, authentication role, production permission or release decision was tested.

At the preceding documentation revision 8a19e4a, both [branch CI](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/41838343306) and [PR CI](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/41838350877) still failed the original Windows Chromium-headed startup with `ERR_ABORTED`, zero fixture requests and the owned page blank. Ubuntu jobs passed. The separate installed-Google-Chrome headed comparison passed 26/26 for each MCP/CLI route in both Windows jobs, using product version 156.0.8078.80. Native access was resolved then; Windows reliability was still open and PR 8 stayed in draft. The subsequent [5 November compatibility correction](windows-browser-startup.md) has separate verification evidence.
