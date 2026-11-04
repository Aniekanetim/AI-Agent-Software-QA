# Shared project progress

**Project:** not configured. **Current checkpoint:** setup. **QA/discovery execution:** not started. **Human project decisions:** none recorded. **Schedules:** not configured for this project.

## Purpose and ownership

Record the supplied product goal, learning/testing objective and actual owner/reviewer/contact roles. The [root context](Project%20Context/README.md) is human-maintained; the [discovery context](Product%20Discovery/Project%20Context/README.md) is agent-maintained. Link their sources without duplicating requirements or inferring owner agreement. Operational progress here may be maintained by the agent.

## Current work

No live QA assignment or discovery request exists. [The QA board](QA%20task%20management%20Board/README.md) supplies testing work; [discovery requests](Product%20Discovery/README.md) supply learning work. Record the active ID/link, owner, pipeline checkpoint, human source revisions, discovery entry versions, served identity, next action and waiting reason when work materially changes. Keep pipeline authorizations distinct.

## Decisions and evidence

None recorded. Link dated decisions/reviews and execution records when they actually exist. Distinguish AI execution, human review method, decision and authorized next work. Copying this package does not transfer any other project's approvals, results or readiness.

## Blockers and next action

Complete [guided onboarding](Onboarding/README.md) through [SETUP.md](SETUP.md). Establish initial context through provide/discover/combined, actual tools/access/mailbox choices and operating preferences. No adopting-project preparation has occurred in this master. Version 1.5.0 adds the [global mailbox policy](automation/email/mailbox-policy.md), authorized plus-alias verification and private fresh/reuse test-account preparation. It retains [tool discovery/reuse](automation/tools/README.md) and [Postman CLI](automation/postman/README.md), with identity/resource verification bound to the selected account, region and credential source. Changed settings require targeted verification before reuse or sign-in guidance. Package validation is recorded in [package notes](docs/package-notes.md), separately from product outcomes. Tasks later determine testing coverage. Keep questions on their original onboarding decision, discovery request or QA ticket; cross-link rather than repeat them. Missing intent blocks dependent judgments, not independent authorized observation.

## Continuity after interruption or transfer

Read the complete active request/ticket, actual responses/decisions and linked evidence before resuming. Confirm both contexts' relevant versions, served identity and current-machine access; undisclosed build identity remains Unknown. Respect claims, preserve observations and restart only affected work with a stated reason. Optional assistant notes never replace shared records.

## QA process preparation

Version 1.6.0 introduces [QA Process Context](QA%20Process%20Context/README.md). The master still has no configured owners, strategy, live matrix or execution. In an adopting project, link actual canonical records, owners, applicable revisions, affected gaps and the active ticket checkpoint. Preserve the separate authority of human product sources and AI discoveries. Changes to scope/source/build require impact review of relevant records, not fabricated current coverage or restarted onboarding.

## Application connection knowledge

Version 1.7.0 adds [Application Flow Map](Application%20Flow%20Map/README.md) and source-linked impact analysis. This master has no configured inventory, relationships or mapping access. In a project copy, record actual map/source revisions, relevant feature/relationship IDs, original gaps and the active ticket/request checkpoint. Read intended authority and observed evidence separately. Considered connections and candidate tests are not actual exercised coverage or approved scope.

## Adaptive methods and data preparation

Version 1.8.0 introduces agent tool selection per task and explicit test-data initiative. Onboarding preserves schemaVersion 1/answers and reports optional capability gaps separately; task checks still require actual selected operations, access, data/state and authorization. This master has no sourced tool restrictions, data-preparation authority, live inputs or verified application states. Adopting projects retain actual constraints, identity history, failed attempts and original owner questions.

## WebMCP package capability

Version 1.9.0 adds [Chrome DevTools MCP/CLI and WebMCP support](automation/chrome-devtools/README.md). The package remains unconfigured: no product connection, browser profile, live catalogue or WebMCP task authorization is supplied. Existing adopting-project onboarding remains schemaVersion 1 and is preserved. [Validation](docs/webmcp-validation.md) records actual helper/browser results separately from native-harness and real-product access. In an adopting project, retain exact source/build/context/connection references and uncertain invocation history before resuming work.

Version 1.9.0 validation passed 137 helper tests, 496 document links/anchors and both Chrome fixture routes on Windows/Ubuntu CI, including paths with spaces. That implementation was delivered through [PR 7](https://github.com/Aniekanetim/AI-Agent-Software-QA/pull/7). Its original native-access gap is resolved for the separately identified session below; no real-product test or adopting-project release approval is implied.

Version 1.9.1 adds [focused validation follow-up](docs/webmcp-validation.md#remaining-validation-recheck) for headed operation, native filesystem boundaries and hostile tool content. Its earlier helper suite passed 138 tests and document validation resolved 498 targets/anchors. Full 26-check executions per terminal MCP/CLI route were demonstrated on Windows/Ubuntu in both modes, with Linux headed runs under Xvfb. Subsequent Windows startup failures remained open at that checkpoint; the correction and retained history follow below.

Current native checkpoint, 4 November: the user registered the separate pinned `qa-webmcp` server, restarted Codex and selected Full Access. All 22 [focused native checks](docs/webmcp-validation.md#completed-native-harness-checks--4-november-2026) passed through actual `mcp__qa_webmcp__` calls using Node 22.21.0, bridge 1.12.0 and installed Google Chrome 156.0.8078.49. This resolves the native connection/navigation/outcome blocker for that tested session. The agent did not change host security settings or the original older connection. The master stays unconfigured for an adopting product.

Native evidence includes independently persisted and visible draft state, automatic form submission, invalid-input rejection, six filesystem escape denials with positive controls, a blocked extra origin, controlled hostile-output handling, changed role/tool catalogues and same-URL document replacement. The first manual-form attempt remained pending until an explicit cancel reached the fixture; its interrupted orchestration is preserved. A cancellation confirmation starting with the cancel flag set returned Canceled and committed no manual profile. Wrapper-specific deduplication/staleness claims retain separate helper/CI evidence.

At the earlier 8a19e4a checkpoint, both branch/PR runs still failed the original Windows Chromium-headed initial navigation with ERR_ABORTED and zero fixture requests. Ubuntu and the separate installed-Chrome 156.0.8078.80 comparisons passed. Those results did not establish a correction and remain in the history.

Current package checkpoint, 5 November: [the startup correction](docs/windows-browser-startup.md) pins an independent Chrome for Testing 156.0.8078.80 fixture with bridge 1.12.0. At implementation f3cc14d, both linked branch/PR CI runs passed Windows and Ubuntu, including all 26 checks per route, three headed Windows repetitions per MCP/CLI route and two under Linux Xvfb. Local startup verification passed 48 attempts, encountered a separately retained ENOSPC setup interruption, then passed 12 fresh attempts after recovery. The recovered helper run passed all 141 tests. Installation now checks download space and empty cached executables; explicit browser selections and adopting-project tool choices remain unchanged. The older browser's precise internal cancellation cause is unconfirmed; the shipped CI baseline has scoped compatibility evidence. [PR 8](https://github.com/Aniekanetim/AI-Agent-Software-QA/pull/8) carries the reviewable delivery; no adopting-product sign-off or merge approval is invented.

The [native setup procedure](docs/native-webmcp-connection.md) preserves existing installations, separate scoped connection settings, desktop versions without an individual Restart button and effective tool-approval checks. It does not require Full Access. Machine-specific entries and actual-call evidence stay in ignored local records. The user no longer needs to repeat setup or scope approval for this completed native validation.
