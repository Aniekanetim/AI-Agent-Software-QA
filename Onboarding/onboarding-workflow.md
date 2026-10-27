# Guided onboarding procedure

Use this procedure in a project-specific QA root. Preserve the existing working contract and records. Onboarding prepares the agent; Product Discovery learns; QA evaluates assigned work. Their requests, permissions and completion records remain separate.

## 1. Inspect before asking

Read AGENTS.md, shared progress, both context indexes, existing onboarding state/settings and applicable records. Identify available source revisions, target URLs, owners, operating limits and actual tool inventory. Reuse information already provided, including answers volunteered before their roadmap stage. An empty template is not project knowledge.

Show the [roadmap](README.md#roadmap) with completed, pending, blocked and deferred items. Explain the immediate missing decision. Use `onboarding roadmap-shown --source <actual-message-reference>` only after showing it.

Register one focused missing decision or a small queue of genuinely distinct decisions. Present only one at a time. Ask in normal language with clear choices and their consequences. Record actual presentation after displaying it. CLI output alone is not a presented question. Never ask a routine “what testing type?” interview: infer the activities from each eventual task and its context.

## 2. Establish the project and context route

Identify the project name, environments, responsible people, source locations if available, test-data boundaries and review responsibilities. Record nonsecret setup references in `.local/project.json`; keep authoritative product information in its named canonical source.

Ask how to establish initial context, unless already answered:

| Route | Procedure |
| --- | --- |
| Provide | Read supplied sources, preserve owner/state/revision and ask targeted questions for material gaps. |
| Discover | Create an independent discovery request with learning questions, target, roles, actions and completion limits. Brief and authorize exploration under its own procedure. |
| Combined | Read supplied sources first; create discovery only for identified gaps. |

Record the actual choice/source in `.local/context-settings.json`. Follow the five-domain [context interview](context-interview.md). Do not manufacture intended behavior to finish a checkpoint.

## 3. Prepare the tools and access needed now

Follow [shared tool discovery](../automation/tools/README.md) before setup questions. Identify the actual calling harness/profile and interactive, scheduled or CI context from available metadata. Inspect saved selections, existing installations and native integration/account inventories. Run only missing harmless capability checks. Reuse working setup and clear earlier choices; explain a missing installation, harness restriction, incompatibility or expired connection separately. A new harness requires targeted verification, not a fresh interview.

For [Postman CLI](../automation/postman/README.md), reuse an accessible compatible executable. Local collection checks require no Postman account; cloud resources require the selected account, resource access and reporting scope. Guide login only when required. Preserve application API authentication separately. Tools can be deferred with dependent-work limits; tasks still determine testing coverage.

When no valid earlier choice exists, present browser choices and visibility before preparing the selected method. Preserve compatible installations. The bundle includes MCP, CLI, library and Test, but a host MCP connection must be registered and exercised through that host. Record the actual provider and context of a rehearsal. Do not copy authentication between sessions by assumption.

For GitHub, inspect the CLI, verify the actual identity and selected repositories, and establish board mapping, PR filters, execution targets and reporting permissions. Guide authentication through the host's interactive sign-in only when the required session is missing or expired. Never print tokens. Defer repository-dependent capabilities for a staging-only project without access.

For email, follow **provider discovery → connect/reconnect → account/mailbox selection → scope → access verification → binding**. Inspect the harness's integration/tool directory when Gmail is not initially exposed. Show accessible account addresses from metadata; do not read email bodies to discover identities. AgentMail creation needs the actual scoped instruction. A mailbox may be connected without being selected, or selected without full-message access. Ask for human-assisted verification when an actual destination cannot be accessed.

Establish application access using dedicated accounts, authorized registration, existing sessions or human-assisted sign-in/verification. Explain permitted mutations and cleanup. Record inaccessible roles as coverage gaps and continue independent authorized work. Tool preparation and fixture rehearsals do not authorize product exploration or tests.

## 4. Build and review the foundation

Read both context stores. For a discovery route, execute the authorized request and retain coverage/unknowns in the AI store. For supplied context, establish source authority and review state. Complete five domain entries with owners and source evidence or original questions. Keep application/build identity separate from requirement/design revisions.

Brief the human on the resulting understanding, its basis, observed/inferred facts, missing intent, disagreements and affected work. Capture review confirms only its stated scope; review of accurate observations does not turn them into requirements. Baseline transcription requires explicit maintenance authorization for named documents and actual human sources.

## 5. Configure operation and reporting

Establish on-demand, scheduled, events or combined operation. Reuse already supplied preferences; do not ask for them again. Discuss cadence/timezone, eligible repositories/PRs, evidence retention, reporting channels and accountable reviewers. Settings remain available after onboarding.

A schedule must be configured through the actual host scheduling feature after authorization. PR polling/event intake creates or updates linked assignments without executing tests. A reviewed reusable regression policy can authorize matching automatic runs; brief every covered action, expected outcome and limit before that policy decision. A new policy is not approved because it was generated or saved. Preserve G3 findings decisions and G5 sign-off/handoff.

## 6. Check readiness and hand over

Record each checkpoint with redacted evidence and date, a blocker, or a reasoned deferral/non-applicability. Project identity, context route, context establishment, operating choice and handoff are mandatory. Optional integrations may be inapplicable; unmet dependent capabilities cannot be called ready.

`onboarding status` revalidates stored evidence, selected integrations and context coverage. It reports incomplete preparation; it does not judge semantic completeness of a PRD or impersonate a reviewer. The agent must inspect actual sources and explain any remaining limits in the handoff.

Prepare the [handoff](templates/onboarding-handoff.md), review it with the human, record the real response and call `onboarding finish` only for its supported scoped state. All domains can be accounted for while some intended behavior remains unknown; list which tasks cannot receive correctness verdicts yet. Explain the first eligible discovery request or QA ticket. Do not seed demonstration tickets or activate a schedule in the reusable master.

## Pause, settings and recovery

- An explicit pause stops interview progression. Clear volunteered answers may still be saved; silence never resumes work.
- Ambiguous replies clarify the existing question; retain its history rather than opening a duplicate interview.
- Optional deferral retains its reason and next action. Required decisions remain pending until answered.
- Settings uses the same conversation focus. Show current values, preserve unrelated fields, and support Back, Cancel this edit and Close settings. Closing does not undo completed saves or resume a paused interview.
- Recover a pending response before new edits. Inspect and explicitly merge newer conflicts. Keep the response ID, original source and already-applied writes. A stale lock requires inspection of the owning process; never delete an active claim automatically.
- On environment, tool, mailbox or source changes, reopen affected checks and revalidate. Recheck actual access at task execution; a past capability check cannot guarantee future authentication.
