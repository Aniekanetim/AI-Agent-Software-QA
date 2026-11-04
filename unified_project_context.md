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

Implementation validation passed 137 helper tests, 496 document links/anchors and both Chrome fixture routes on Windows/Ubuntu CI, including paths with spaces. Native host access and real-product testing remain unverified. Delivery is through [PR 7](https://github.com/Aniekanetim/AI-Agent-Software-QA/pull/7); a passing package run is not human release approval or a completed project onboarding.

Version 1.9.1 adds [focused validation follow-up](docs/webmcp-validation.md#remaining-validation-recheck) for headed operation, native filesystem boundaries and hostile tool content. Its helper suite passed 138 tests and document checks resolved 498 targets/anchors. Windows/Ubuntu CI passed 26 checks per MCP/CLI route in both headed and headless modes; Linux headed execution used Xvfb. The development harness selects a separate older MCP installation; repository setup does not replace that native connection. Its WebMCP access remains unverified and local executable invocation is denied. Retain that actual unresolved status separately from the successful CI fixture evidence.

Later Windows-headed repeats failed initial navigation before the WebMCP checks, including with the owned startup tab. Earlier passes do not close that reliability issue. Preserve the linked failed runs and strict page-identity assertion; the candidate validation PR stays in draft pending investigation. Native-harness access also remains unresolved. Do not present all remaining validation as completed.

The installed-Google-Chrome comparison passed 26/26 headed checks per MCP/CLI route in both CI runs at b83570e; the original Chromium combinations passed too. Product version was 156.0.8078.48. This demonstrates headed capability without explaining the earlier intermittent failure. The resumed local child probe again returned `EPERM`; native MCP configuration remained 0.21.0 with no exposed WebMCP operations. Keep [PR 8](https://github.com/Aniekanetim/AI-Agent-Software-QA/pull/8) and its actual limitations distinct from the already merged PR 7.

On 30 October, a direct pinned-server STDIO preflight completed `initialize` at 1.12.0 and advertised both WebMCP tools. This is protocol evidence, not current-harness browser access. An isolated machine-specific native entry and registration helper were prepared privately; the user was asked to register/restart that separate connection because host configuration is outside the writable scope. Preserve the pending action and the [native setup procedure](docs/native-webmcp-connection.md). Latest CI at f99707b again had a Windows Chromium-headed startup failure alongside a passing installed-Chrome comparison; the reliability issue remains open.

The user then registered `qa-webmcp`; the successful log and read-only CLI lookup confirmed its saved enabled configuration. The user's interface had no individual Restart button, so setup guidance now directs a full app restart when no reload control is available.

On 4 November, after the user restarted Codex, this chat exposed the native `qa-webmcp` tools. Native page listing successfully reached its isolated blank browser; blank-page WebMCP listing returned an empty catalogue. The synthetic fixture was restored on its previously authorized port after app restart, with empty starting state and private provenance. Native navigation was refused with `MCP tool call requires approval, but approval policy is never`. The user was asked to select an interactive permission mode; continue with that affected call after the setting actually changes, then discover/execute/independently verify the synthetic action. Do not rerun registration or describe the pending outcome checks as passed. The Windows CI startup reliability issue remains unresolved.

The user subsequently confirmed authorization; one affected-call retry still returned the same host-policy refusal. Scope approval is already granted. Wait for the actual interactive host mode rather than repeating the approval request or unchanged execution; no agent-side security/policy edit is authorized by the runtime.
