# Package notes

**Version:** 1.3.0. **Created:** 22 October 2026. **Updated:** 27 October 2026. **State:** reusable workflow package; no configured product, live discovery or QA execution history.

## Version 1.3.0: guided onboarding and task-driven integrations

Added resumable [onboarding](../Onboarding/README.md), a focused five-domain context interview, shared settings navigation, revision-checked response persistence/recovery and scoped readiness/handoff. The agent reuses supplied information; tasks determine QA coverage rather than an onboarding category menu. The five-folder board, independent Product Discovery, human baseline and AI knowledge store remain separate.

The pinned Node.js toolchain includes Playwright library/Test 1.64.1, CLI 0.1.22 and MCP 0.0.83, MCP SDK 1.32.2 and HTML email parsing. Browser setup handles the different engine revisions required by those components. Native MCP/in-app connection readiness is separate from a local server rehearsal. The optional GitHub CLI installer pins official v2.102.0 assets and validates their published archive checksums. No installed binaries or credentials are distributed.

Email setup explicitly discovers providers/accounts, presents Gmail/Workspace first, selects an actual mailbox/environment and verifies listing versus full-message access. AgentMail REST, optional direct Gmail token transport and a host-connector bridge support correlated OTP/link retrieval, redacted receipts and separate application-outcome evidence. Host OAuth connections and direct token refresh remain with the actual provider/host; the package is not a credential vault. Sending and cleanup are not enabled by onboarding.

GitHub intake creates deduplicated linked assignments. Regression policy approval binds exact scope/content; PR head, actual served commit/build, suite evidence and run key stay distinct. Running/uncertain executions, dispatches and comments are retained rather than blindly repeated. A process exit is not a product verdict. An inactive adoption example supports reviewed PR-based CI; the portable repo's own CI only tests helpers and a synthetic loopback fixture.

Operational state stays ignored under `.local/`. A v1.2 copy has no runtime schema to migrate: inspect/preserve its documents and introduce onboarding deliberately. Unknown/corrupt runtime schemas are preserved for explicit migration. Moving machines requires installation and fresh access/context checks; it does not transfer authentication, schedule activation or approval scope.

## Version 1.3.0 validation and limits

Implementation validation uses synthetic isolated fixtures and mocked mail/GitHub responses; those records are ignored and are not live tasks, user approvals or product results. Type checking and all 22 helper tests pass locally and after `npm ci` in a fresh copy whose path contains spaces. All 201 relative Markdown links/anchors resolve across 47 documents, including after relocation. Five QA status folders and both empty live queues are preserved. Git excludes private state/session/environment paths while intended shared evidence remains visible. Tests cover focused prompts/extra answers, pause/resume, interrupted-save recovery and conflict merging, baseline ownership, settings, evidence readiness, multiple Gmail accounts, metadata-only access failure, HTML messages, pagination, stale/ambiguous/expired verification attempts, changed bindings, PR deduplication/revisions, exact policy/build checks and uncertain-run recovery. The official Windows/macOS archive layouts were inspected; platform layout/checksum selection is covered by helper tests, separately from an actual installed executable launch.

Local browser installation was attempted but this managed execution environment denied child-process creation (`EPERM`). Consequently no successful local browser launch, CLI/MCP browser rehearsal, native host connection, downloaded GitHub CLI launch or unattended session is claimed. `npm run test:browsers` is provided for actual synthetic rehearsals in a permitted host. The package CI runs those separately from helper tests; inspect its actual run for results. No live Gmail/AgentMail inbox, application login, product test, PR regression, outgoing message or new product schedule was exercised during implementation.

Hash/reference checks cannot prove a human's identity, substantive requirement completeness or truth of an entered observation. Working-contract compliance and actual review/evidence remain necessary. Pattern checks are limited and do not replace evidence redaction. The source payroll projects and their existing automation remain separate from this package.

## Source and purpose

This package generalizes the AI-led, human-reviewed workflow developed in MustPayroll-AI-QA at source revision `f956bf9b3f2795b610254bbf4ece8ff0c9098575`. It retains the process and safeguards, not that project's payroll requirements, application code, controlled defects, test records, personal approval history or active automation.

The reusable core consists of the working contract, seven iterative testing activities, G1–G5 human review, informed decision briefings, focused findings confirmation, five-status ticket board, developer fix/refutation loop, original-failure retest and separate regression tickets, canonical project context, clarification visibility and native check-in instructions.

## What remains project-specific

Actual business rules, acceptance criteria, visual baseline, build/source identity, tools, accounts, data, measurable quality targets, test cases, observed results and reviewer decisions come from the adopting project. Before/after targets are used when the investigation needs them; two synthetic builds and eight cases are not universal workflow requirements.

Schedules belong to their configured app/project/chat. This export does not create, move or disable one. The source project and its existing hourly check-in remain separate.

## Version 1.2.0: independent discovery and context ownership

Added a request-driven Product Discovery procedure for onboarding, targeted learning and refresh, including hosted-only access, authentication/session handling, evidence-backed knowledge entries, clarification, completion and resumption. No browser agent/runtime is bundled: the adopting agent needs actual tools and authorized target access.

Root Project Context is human-maintained. The agent maintains a separate `Product Discovery/Project Context/` with business, product, design and technical observations. Sources, inference, capture review, owner-intent decisions, freshness and limits remain distinguishable. Agents propose baseline changes; responsible humans publish them. There is no automatic promotion/synchronization.

QA reads both stores and can link an explicit discovery request without changing the five board statuses or bypassing G1–G5. Entry points, templates and QA check-in instructions now distinguish human source revisions, discovery entry versions and served identity. Browser session-state exclusions were added; existing tracked secrets would still need separate remediation. No real target, account, request, knowledge claim or discovery schedule was added.

## Version 1.1.0: release closure improvement

Added the researched release sign-off procedure and expanded completion/handoff template. The corresponding source workflow was published at revision `1d6d410111a6106c1d3366ea4c8f649b18058495`. G5 now requires release notes, completion/exit-criteria evidence, risks, a scoped decision and operational owner/action instructions before review, followed by truthful decision/delivery/receipt records. Parent closure waits on required sign-off and handoff items. Production go/no-go remains separate; local-only production fields require a Not applicable rationale.

AGENTS, the workflow, board completion template, setup, review record and bootstrap/check-in prompts carry this safeguard. No previous project's run results or approvals were copied into the master. The existing five-status board and human gates remain unchanged.

## Version 1.0.0 validation

Verified on 22 October 2026:

- All 69 local Markdown links/anchors resolved across 28 Markdown files, including the optional local continuity note.
- Copying the package to a different directory containing spaces preserved all 69 links; no source-project machine path was required.
- The board contains exactly five status folders and zero live tickets. Inline ticket templates and QA record templates remain outside the queues.
- Content checks retained all seven testing activities, five human gates, six supported testing objectives, informed approval, focused human confirmation, actionable cause/fix reporting, regression routing, clarification visibility and no-op/approval boundaries.
- Source-project tracked files remained unchanged. The package contains no source-project runtime endpoints, product rules, execution outcomes or human approval records. The only named source-project reference is the provenance above.

These are package, content and relocation checks. They do not establish product-test passes, actual human approvals or future unattended behavior. No new schedule was activated and the source project's existing schedule was not changed. Tool access, project criteria, machine paths and any requested scheduling still require project-specific setup.

## Version 1.1.0 validation

All 79 local links/anchors resolved across 29 Markdown files, including after copying to a different path with spaces. The generic release procedure and template match the source project's workflow copies. The live board remains empty with five status folders. Source-project application, automation, context and recorded test evidence were preserved; no product checks or new schedule activation occurred. Six closure-condition walkthroughs passed, assessing the written controls rather than actual future agent or deployment behavior.

## Public repository distribution

Distribution repository: https://github.com/Aniekanetim/AI-Agent-Software-QA

The public edition initially shipped as version 1.1.0 with an agent adoption prompt, adoption guide, fork/template/clone entry points and MIT license. It has its own Git history. Project rules, actual execution evidence, private assistant notes and machine-level scheduler configuration are excluded. The current version is identified above; project templates remain unconfigured.

Publication preflight validated 91 local links/anchors across 29 Markdown files intended for Git, with no broken references or credential-pattern findings. The five live status folders remain empty. Earlier validation counts above describe their respective local-package snapshots, including the optional ignored continuity note.

## Version 1.2.0 validation

Validated on 23 October 2026: all 145 relative Markdown links/anchors resolve across 37 Markdown files, including in a relocated copy whose path contains spaces. All eight human-baseline template files survive relocation with identical hashes. The QA board still has exactly five status folders and zero live tickets; discovery requests are also empty. Six authentication/environment-file exclusion checks and four evidence-visibility checks passed. No credential-pattern findings were detected in the distributed Markdown; this is a limited pattern scan, not a guarantee that future evidence contains no secrets.

The following eight written-procedure scenarios were reviewed for consistency:

| Scenario | Documented response checked |
| --- | --- |
| Hosted application without source or requirements | Authorize bounded learning using URL/access; record missing intent without blocking unrelated observation or inventing test expectations |
| Authentication expires or a role is unavailable | Request appropriate access, retain the gap and continue only independent authorized journeys; do not bypass access or store session secrets in context |
| Observed behavior conflicts with an accepted rule | Preserve both references and return for QA assessment; do not rewrite the human baseline |
| QA needs targeted product learning | Link an explicit discovery request, original question and separate authorization/checkpoints; return versioned outputs without automatically passing the QA ticket |
| A relevant requirement/application area changes | Flag affected entries for refresh, preserve prior evidence and avoid automatic synchronization or full recrawls |
| Work resumes after interruption or transfer | Read claims, checkpoints, actual approvals and responses; recheck access/versions without repeating unanswered requests |
| A discovery suggests a requirement change | Keep the proposal separate from capture review; the responsible human decides/publishes and the agent links the actual revision |
| No actionable QA ticket or discovery request exists | Do not fabricate work, trigger a crawl, change files or activate a schedule |

These checks assess package structure and the written procedures. No staging URL was supplied, so no browser walkthrough, sign-in, account creation, product tests or actual owner confirmation was performed. Ownership controls are agent instructions, not filesystem access enforcement. Existing MustPayroll repositories, evidence and the configured source-project check-in were not changed. No discovery schedule was activated.
