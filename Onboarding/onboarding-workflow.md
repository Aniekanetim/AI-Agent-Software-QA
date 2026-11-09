# Guided onboarding procedure

Use this procedure in a project-specific QA root. Preserve the existing working contract and records. Onboarding prepares the agent; Product Discovery learns; QA evaluates assigned work. Their requests, permissions and completion records remain separate.

## 1. Inspect before asking

Read AGENTS.md, shared progress, both product-context indexes, [QA Process Context](../QA%20Process%20Context/README.md), existing onboarding state/settings and applicable records. Identify available source revisions, target URLs, owners, operating limits and actual tool inventory. Reuse information already provided, including answers volunteered before their roadmap stage. An empty template is not project knowledge.

Show the [roadmap](README.md#roadmap) with completed, pending, blocked and deferred items. Explain the immediate missing decision. Use `onboarding roadmap-shown --source <actual-message-reference>` only after showing it.

Register one focused missing decision or a small queue of genuinely distinct decisions. Present only one at a time. Ask in normal language with clear choices and their consequences. Record actual presentation after displaying it. CLI output alone is not a presented question. Never ask a routine “what testing type?” interview: infer the activities from each eventual task and its context.

## 2. Establish the project and context route

Establish the target environment first. Reuse a target already supplied or saved. After the roadmap is shown, `onboarding next` presents the first missing environment question before new tool setup questions. Save its answer in `.local/project.json`. A hosted environment needs its entry URL. A local target needs the information required to reach it. Continue with the project name, responsible people, available sources, test-data boundaries and review responsibilities. Keep authoritative product information in its named canonical source.

Ask how to establish initial context, unless already answered:

| Route | Procedure |
| --- | --- |
| Provide | Read supplied sources, preserve owner/state/revision and ask targeted questions for material gaps. |
| Discover | Create an independent discovery request with learning questions, target, roles, actions and completion limits. Brief and authorize exploration under its own procedure. |
| Combined | Read supplied sources first; create discovery only for identified gaps. |

Record the actual choice/source in `.local/context-settings.json`. Follow the five-domain [context interview](context-interview.md). Do not manufacture intended behavior to finish a checkpoint.

## 3. Prepare the tools and access needed now

Follow [shared tool discovery](../automation/tools/README.md) before setup questions. Identify the actual calling harness/profile and interactive, scheduled or CI context from available metadata. Inspect saved selections, existing installations and native integration/account inventories. Run only missing harmless capability checks. Reuse working setup and clear earlier choices; explain a missing installation, harness restriction, incompatibility or expired connection separately. A new harness requires targeted verification, not a fresh interview.

For [Postman CLI](../automation/postman/README.md), reuse an accessible compatible executable. Local collection checks require no Postman account; cloud resources require the selected account, resource access and reporting scope. Match identity/resource evidence to the current account, region and credential source. After a change, recheck only affected capabilities before deciding whether login is needed; an old account's verification cannot establish readiness. Guide login only when required. Preserve application API authentication separately. Tools can be deferred with dependent-work limits; tasks still determine testing coverage.

Discover existing browser/testing capabilities and establish actual visibility, permitted actions and resource constraints. The agent chooses suitable tools for each task; do not ask for a compulsory preferred browser or resolve a global recommendation. Reuse compatible installations. The bundle includes MCP, CLI, library and Test, but a host MCP connection must be registered and exercised through that host. Record the actual provider and context of a rehearsal. Do not copy authentication between sessions by assumption.

As soon as the target and its browser are known, run the [target access check](../automation/browser/target-access.md). Default to Standard and skip allowlist setup. For a legacy project-owned launcher, reconcile the saved settings with the Standard default. If the existing native connection has old rules and the project has no Strict choice, prepare a separate dedicated launcher. Respect required host policy. When the user opts in to Strict, gather the known app and sign-in origins together, apply the approved rules, and read back the configuration. Verify the public entry route through the active browser. Report a reached sign-in page separately from application access, and verify its destination before using credentials.

For GitHub, inspect the CLI, verify the actual identity and selected repositories, and establish board mapping, PR filters, execution targets and reporting permissions. Guide authentication through the host's interactive sign-in only when the required session is missing or expired. Never print tokens. Defer repository-dependent capabilities for a staging-only project without access.

For email, follow **provider discovery → connect/reconnect → account/mailbox selection → scope → access verification → binding**. Inspect the harness's integration/tool directory when Gmail is not initially exposed. Show accessible account addresses from metadata; do not read email bodies to discover identities. AgentMail creation needs the actual scoped instruction. A mailbox may be connected without being selected, or selected without full-message access. Ask for human-assisted verification when an actual destination cannot be accessed.

Apply the [global mailbox policy](../automation/email/mailbox-policy.md) as the standard account strategy rather than asking the human to write one. Confirm provider/application plus support, configure the actual binding's recipient policy and use the account helper to prepare aliases and their register. Fresh-state work gets a distinct identity/purpose/run alias; continuation/retests reuse the original exact alias. Read access and application registration follow the supplied scope. An empty inbox can verify listing while content access remains pending until a message exists. Recheck current inbox metadata when requested or when a change/deletion is reported.

Establish application access using dedicated accounts, authorized registration, existing sessions or human-assisted sign-in/verification. Explain permitted mutations and cleanup. Record inaccessible roles as coverage gaps and continue independent authorized work. Tool preparation and fixture rehearsals do not authorize product exploration or tests.

## 4. Build and review the foundation

Read both context stores. For a discovery route, execute the authorized request and retain coverage/unknowns in the AI store. For supplied context, establish source authority and review state. Complete five domain entries with owners and source evidence or original questions. Keep application/build identity separate from requirement/design revisions.

Brief the human on the resulting understanding, its basis, observed/inferred facts, missing intent, disagreements and affected work. Capture review confirms only its stated scope; review of accurate observations does not turn them into requirements. Baseline transcription requires explicit maintenance authorization for named documents and actual human sources.

### Establish initial connection knowledge

Read the root [Application Flow Map](../Application%20Flow%20Map/README.md). Reuse supplied diagrams, requirements, technical references and existing discoveries. Record actual owners, map/source revisions, known features/connections and original gaps; a bounded starting inventory is enough. Extend it through authorized discovery when the chosen context route needs it. Do not manufacture hidden dependencies or require full application exploration before useful work.

Brief the human on intended versus observed/inferred connections and remaining unknowns. Human corrections retain their actual source and responsible intent owner. Map capture review does not approve a requirement or testing scope. Keep existing onboarding schemaVersion 1, answers and five product domains; process/map completeness is assessed by the agent and handoff, not inferred from a structural Ready flag.

## 5. Configure operation and reporting

Ask where the project’s QA agent should pick up work. Offer **Use the local task manager** and **Connect a task management app**. For a live board, show Jira, ClickUp, Linear and Asana, describe their verification status, then use the [task source setup and preview](../automation/task-source/README.md) to verify the connection, scope and queue mappings. Present the eligible tickets and proposed board actions before the user saves the choice. Saving activates the selected source. Keep the prior choice while the setup is incomplete and record any work that depends on it. Existing projects without a saved choice use their local folders. Settings → Task source opens the same setup.

Establish on-demand, scheduled, events or combined operation. Reuse already supplied preferences; do not ask for them again. Discuss cadence/timezone, eligible repositories/PRs, evidence retention, reporting channels and accountable reviewers. Settings remain available after onboarding.

A schedule must be configured through the actual host scheduling feature after authorization. In local mode, PR polling/event intake creates or updates linked assignments without executing tests. For a live board, start from its native ticket and follow the live-board scope and build checks. A reviewed reusable regression policy can authorize matching automatic runs; brief every covered action, expected outcome and limit before that policy decision. A new policy is not approved because it was generated or saved. Preserve G3 findings decisions and G5 sign-off/handoff.

## Establish the project's testing foundation

Optional [blocker notifications](../automation/attention/README.md) can be established during operating preferences or later. Reuse known owners/conversation/timezone and ask one missing choice at a time. Explain batch size (initially three action groups), full backlog access, pacing, quiet hours, designated notifier, actual conversation evidence and any urgent exceptions before enabling the reviewed policy. Keep partial preparation disabled when access or choices are missing. This optional feature does not add a mandatory stage or reopen completed onboarding: use Reporting's isolated notification editor, not the general onboarding-response saver for these preferences. A saved policy is not an activated schedule or a completed presentation.

Within the existing operation/handoff stages, inspect [QA Process Context](../QA%20Process%20Context/README.md) and existing equivalent records. Link canonical sources, identify actual QA/technical/data owners and record gaps as original questions. Retain earlier context-route, tool and mailbox answers. Prepare only missing process records as Draft; the human reviews material approach/coverage decisions through the normal gates.

The handoff links the strategy, design guide/charters, RTM/coverage definitions, configuration/data plans and regression inventory that actually exist. State which missing items affect which work. This does not restrict future testing types or authorize execution. Existing schemaVersion 1 onboarding state is preserved; no automatic reset or new mandatory product-domain field is introduced. `onboarding status` verifies existing structural/evidence checks, not the semantic completeness of these process records. The agent must inspect and explain them.

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

## Optional Chrome DevTools preparation

During tools/access preparation, follow [Chrome DevTools/WebMCP](../automation/chrome-devtools/README.md). Reuse available access and prior answers. Save only the missing browser visibility, connection, authorized WebMCP target origins and privacy settings in `.local/chrome-devtools-settings.json`. Use Chrome settings schema 2 for new Standard launches. The onboarding state and question history keep their existing schema. Verify the actual browser connection separately. The next task determines whether WebMCP is useful.

## Board lifecycle readiness

Verify the seven status folders and use [board upgrade](../automation/board/README.md#upgrade-an-existing-copy) for older five-folder copies without resetting onboarding or moving existing tickets. Establish actual decision/review owners and canonical board location/freshness for each runner. Explain that Deferred/Canceled are not executable work, review dates do not authorize resumption, and remote job stopping needs actual runner access/confirmation. Keep existing answers and schedules.
