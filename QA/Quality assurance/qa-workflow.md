# AI-led QA workflow with human review


## Purpose and responsibilities

**Ticket intake:** the [QA task management board](../../QA%20task%20management%20Board/README.md) supplies work through five folder statuses at the repository root. The AI QA checks Ready for QA and Retest; developers check Dev Todo and Rework. Build/feature assignments and the separate bug/regression tickets they produce retain their own IDs and records. Tested-Ok contains tickets whose criteria and required human decisions are satisfied. The board selects work; this workflow governs its execution and review.

**Test basis:** start with [Project Context](../../Project%20Context/README.md), then the ticket's applicable business rules, feature acceptance criteria, design reference and technical/setup sources. Record source revisions and BR/AC IDs separately from the target build. The index identifies owners, document states and missing information. For necessary gaps or conflicts, follow the board's [clarification procedure](../../QA%20task%20management%20Board/README.md#clarification-comments-and-developer-visibility): comment on the existing ticket, expose the question to the developer and pause affected checks. Do not infer requirements from the faulty implementation or replace a required human decision with a developer answer.

**Discovery connection:** also read relevant [AI-managed discoveries](../../Product%20Discovery/Project%20Context/README.md). They support navigation, preparation and investigation; they do not replace accepted expectations. Record their OBS IDs/entry versions separately from human source/design revisions and served build identity. If a question needs application exploration, link a targeted [discovery request](../../Product%20Discovery/README.md) from the QA ticket, preserving the original question and both checkpoints. Missing intended policy needs its responsible owner. Discovery has its own procedure and authorization; its completion is not a test pass or execution approval.

**Context ownership:** humans maintain root Project Context. During QA/discovery, agents update their own discoveries, operational records and shared progress, and propose human-baseline changes on the originating ticket/request. They do not edit the baseline to match a result or fill a missing requirement. Capture review and owner confirmation of intended behavior are distinct decisions. Human sources still need an applicable accepted state/revision.

Apply these same activities and gates from each ticket's recorded checkpoint. Initial testing creates separate linked Dev Todo bug tickets. Developer fixes/refutations return the existing ticket to Retest; a failed original retest goes to Rework, a successful reviewed retest to Tested-Ok, and a newly observed regression gets its own Dev Todo ticket. Keep the parent assignment's blockers and overall completion decision current. Awaiting review or an unchanged dependency does not authorize another run. The [board instructions](../../QA%20task%20management%20Board/README.md#ai-check-in-procedure) define claiming, selection, waiting and check-in reporting; the [setup guide](../../SETUP.md) explains project adoption.

The agent performs the testing work. The QA engineer directs priorities, checks the reasoning and evidence, and approves the scoped decisions. Human verification can include inspecting requests, records, scripts and assertions; it does not require manually repeating every agent action. Record the review actually performed.

Testing checks product quality. Quality assurance also improves the process that produces those checks, including requirement review, execution controls and lessons learned. Both are needed here.

| Responsibility | AI agent | QA engineer |
| --- | --- | --- |
| Establish the test basis | Read requirements, identify risks and conflicts, propose measurable criteria | Confirm the objective, expected behavior and priorities |
| Prepare and execute | Design checks; prepare scripts, data and environment; operate tools and retain observations | Review coverage, assertions, readiness and execution limits |
| Investigate and report | Reproduce anomalies, distinguish causes from hypotheses, propose a correction and supply focused human confirmation instructions | Confirm the reported defect/cause, review classification and correction, then return observations and a decision |
| Complete the work | Evaluate criteria, record residual risk and propose a handoff | Accept or reject the scoped QA recommendation |

Engineering owns product-code corrections unless implementation is separately delegated. The agent's readiness recommendation and the human QA decision are separate records. A local QA decision does not authorize a production release by an organization.

## Testing activities beneath the review gates

This process is tailored from [the process references](standards-and-rationale.md). ISTQB describes seven testing activity groups. Our G1–G5 gates are the project's review policy, not prescribed standard stage names or a formal ISO-conformance claim.

| Activity | Work and reviewable output | Review point |
| --- | --- | --- |
| Test planning | Objective, testing types, approach, limits, entry/exit criteria and responsibilities | G1; refine as needed |
| Test analysis | Source requirements, prioritized risks, uncertainties and test conditions | G1 |
| Test design | Cases or exploration tasks, inputs, expected results and coverage links | G2 |
| Test implementation | Prepared scripts, test data, environment, build identity and readiness checks | G2 |
| Test execution | Observed outcomes, reproducible anomalies and retained evidence; correction confirmation and regression when approved | G3; G4 for retest |
| Test monitoring and control | Progress, coverage, blockers, changed risks and corrective decisions | Continuous across all activities |
| Test completion | Criteria assessment, unresolved defects, handoff, reusable checks and an improvement action | G5 |

Activities can overlap and repeat. For example, a failed readiness check returns to preparation, and a new requirement can require analysis and design changes. **Test implementation means preparing tests and their environment; it does not mean implementing the product fix.**

For email-backed test accounts, apply the [global mailbox policy](../../automation/email/mailbox-policy.md). Prepare and record a distinct purpose/run alias for fresh-state checks where supported; reuse the original exact alias when retesting the same account. The helper's declared starting state and identity preparation are separate from the application's observed state. Verification must match the full alias, expected sender/purpose and trigger time in the selected physical inbox.

## Start with the testing request

Read the task, relevant sources in both product-context stores, applicable [QA process records](../../QA%20Process%20Context/README.md), changes and risks. Determine the relevant testing activities and explain the proposed coverage. Ask only about material missing requirements, limits or decisions; do not require the human to select a testing category. [Onboarding](../../Onboarding/README.md) prepares the project, while this task determines the work.

Then identify the product flow, source requirements, target build/environment, data, risks, measurable criteria and operating limits. Consult the context index and record the applicable source revisions. Resolve contradictions before judging behavior; if a necessary answer is missing, record a ticket clarification and waiting checkpoint. Continue independent work only within the existing authorization. Derive expected results from the agreed requirements, independently of the application's current response. After a clarification, preserve the answer/source update and return to the affected gate if scope or criteria changed.

The workflow supports functional and non-functional objectives. API and browser are interaction channels; either can support different quality objectives.

| Selected objective / channel | Suitable execution and evidence | Criteria to agree |
| --- | --- | --- |
| API functional | Requests, responses and saved-state checks | Exact method/endpoint, payload, contract and business outcome |
| UI functional | Browser actions, visible results and corroborating records | User journey, business rule, persistence and recovery |
| Usability | Representative tasks and observed friction | User goal and severity; expert inspection is distinct from research with actual users |
| Performance | Repeatable workload and measured behavior | Environment, workload, metrics and thresholds; local results do not establish production capacity |
| Accessibility | Automated checks plus relevant manual interaction | Named criteria, method and coverage limits; a tool score is insufficient |
| Security | Authorized checks against the agreed target | Threat/risk focus, permitted actions, data boundaries and stop conditions |

A cycle can combine or change testing types. Preserve its current progress and evidence, revise the affected method/criteria, and return to the affected review point. Supporting a type does not mean executing it automatically.

Configured GitHub intake can supply a linked PR assignment. A reusable regression policy may carry an already reviewed G1/G2 execution scope: read its exact approved content, suite revisions, target, command and limits; verify current eligibility/build and reuse that authorization only while it still matches. Its initial briefing must explain every covered action/pass criterion and rationale. Do not request the same unchanged approval on every run, weaken expectations or infer approval from a configuration file. Material changes return to the affected gate. Actual findings, G3 confirmation and G5 sign-off/handoff remain separate required decisions. [GitHub controls](../../automation/github/README.md)

## Project review gates

| Gate | Concrete packet prepared by the agent | Human decision and next authorized work |
| --- | --- | --- |
| G1 — Scope and analysis | Objective, sources, risks, uncertainties, coverage intent and completion criteria | Approve or revise the test basis and scope |
| G2 — Design and readiness | Cases, expected outcomes, scripts/assertions, data, build/environment checks and execution bounds | Approve bounded execution, or request preparation changes |
| G3 — Findings confirmation | Actual outcomes, evidence, defect reproduction instructions, cause-check steps, severity/priority/status rationale, proposed correction and gaps | QA performs the focused confirmation, then approves, rejects, requests changes/investigation or reports blocked confirmation; fixed execution remains separate |
| G4 — Fix and retest | Identified correction/build, original failure, confirmation checks and adjacent regression | Authorize retest; product-code changes require their own authorization |
| G5 — Completion and handoff | Versioned packet: release notes, completion/exit-criteria evidence, defect/risk disposition, scoped sign-off proposal and next-owner/recovery instructions | Approve, approve with stated limits, request changes or reject; then record the actual decision and deliver the handoff. Production authority remains separate |

G1 and G2 can be reviewed together when the complete packet is available. Before asking for a decision, brief the QA engineer in the conversation on the objective, each proposed check and its expected outcome, why those checks were selected over alternatives, gaps and the exact next work. Link the details as supporting material; do not substitute a link or approval button for the briefing. The QA engineer can challenge, replace or expand the checks before authorizing execution. Approval identifies the packet revision, build, allowed work, reviewer and date. Silence is not approval. Within an approved scope, the agent performs routine preparation, execution, investigation and documentation autonomously.

## Informed approval at every gate

An approval request must enable a decision, rather than merely ask for one. Before presenting it, the agent must:

1. Brief the QA engineer in the conversation on the business objective and exact work or finding being reviewed. Identify its packet revision, build and current state; explain unfamiliar terms.
2. Explain the proposed decision and its basis: why this scope or response was chosen, the expected outcome, alternatives, supporting evidence, assumptions and unresolved gaps. At G1/G2, cover each proposed case and selection rationale. At G3, explain failures, impact, evidence and confidence in the cause. At G4, explain the correction and how the retest can disprove it. At G5, explain completion criteria, residual risk and the proposed handoff.
3. State exactly what approval authorizes next and what remains outside it. Supply direct supporting links, but keep the briefing understandable without opening them.
4. Give the QA engineer room to challenge or revise the proposal. If the briefing is missing or a material question is unresolved, complete or correct it before requesting a decision. Do not infer approval from silence, a question or a request for explanation.
5. Record the actual reply, reviewer/date, packet revision, briefing/evidence reviewed, conditions and authorized next work. An approval after a case briefing is not a claim that the reviewer manually read every script or repeated the tests.

This safeguard applies to all testing types and all five gates. A scope change or materially different proposal requires a revised briefing at the affected gate; routine actions within an already approved scope do not need new approval.

### Required approval format and pre-send check

To make human review informed, every decision request must contain the following in the conversation:

| Required part | What the reviewer must be able to understand |
| --- | --- |
| One decision | The specific finding, plan, action or handoff being accepted or authorized, with its revision/build and current state |
| Itemized review | Each claim or action, its evidence or expected outcome, and why it belongs in this decision. For test execution, list every case with plain-language action, pass criterion and selection rationale |
| Recommendation and alternatives | What the agent recommends, why, what would justify changing it, and any meaningful uncertainty, gap or limit |
| Consequence of approval | The exact next permitted work and the decisions that remain unapproved |
| Evidence access | Direct supporting links, while keeping the decision understandable without opening them |
| Findings confirmation at G3 | Concrete steps for the human to confirm the defect, check the cause/evidence, assess severity/priority/status and review the proposed correction before returning a decision |

Deliver the complete briefing in the final response containing the decision request. Progress commentary, earlier messages and linked documents may be collapsed or unseen; they cannot carry essential approval context. Do not send a separate approval prompt before that self-contained briefing. Before sending a request, verify that every part is present. If the reviewer would need prior conversation context, unexplained case IDs, the phrase “the same eight cases,” or a repository search to discover what is being approved, the briefing is incomplete: correct it before requesting a decision.

Do not combine acceptance of findings with authorization to execute the next stage in one approval option. Present G3 findings for a decision first; after acceptance, present the G4 execution proposal with its own case/action/expected-result/rationale table and request its separate decision. A preview of G4 is not an execution request. G1/G2 can still form one decision on a fully briefed bounded plan.

If the reviewer identifies a missing briefing, record Changes requested for that review. Withdraw the inadequate approval request, supply the missing explanation and wait for an actual decision; do not treat the objection as acceptance. Record only the scope the human explicitly approves.

### G3: human confirmation before a findings decision

At this stage, ask the QA engineer to **confirm the reported finding and return a decision**, rather than only accept the agent's conclusion. The agent prepares the work; the human performs a focused check appropriate to the claim.

For every reported defect, supply the target build/environment, fresh-data preconditions, exact inputs, numbered reproduction steps, expected/actual checkpoints and evidence to retain. Separate technical fixture preparation from the user actions or API requests that demonstrate the defect. Include a cause check using source, logs or a discriminating control; distinguish support for a cause from a proven fix.

Explain severity (impact), priority (urgency) and status (defect state) separately. Identify the project's proposed labels and rationale, and allow the human to change each independently. For the proposed correction, explain which causal dependency must change and which existing behavior must remain. Source/approach review at G3 is not a fixed-build execution or proof of correction.

Ask the QA engineer to return concise notes on: what was reproduced and observed, evidence/build, cause checks and remaining uncertainty, classification assessment, corrective-approach assessment and decision. Allow **Approve**, **Approve with changes**, **Reject**, **Request further investigation**, or **Unable to confirm / Blocked**, with the affected claim and reason. These outcomes need not accept or reject every claim together.

Do not require replaying the entire AI suite. If a step cannot be completed, retain that limitation and request the specific assistance needed; do not turn inability to confirm into a product failure. Record the actual human checks separately from agent execution. If an approval omits confirmation details, do not invent them or mark the finding human-verified; obtain the missing observations/method before recording completed confirmation.

Keep the human confirmation and agent execution as separate records. A different human result does not erase the original failure; investigate build, data or procedure differences and retain both observations. Human confirmation remains Pending until the QA engineer returns the relevant confirmation. A brief approval records a decision only; it does not establish unreported reproduction steps or verification observations. Do not run fixed tests, close the defect, approve release or start another dependent gate while the human is reviewing. Keep G4 execution authorization separate.

## Monitoring, change control and records

During execution, report planned versus completed checks, Pass/Fail/Blocked outcomes, requirement coverage, anomalies and any changed risk. Record unexpected harness or environment errors separately; an error that prevents valid observation is not evidence of a product failure.

Suspend the affected checks if the build differs, data are invalid, the harness cannot test the intended rule, or an action exceeds the approved scope. Preserve the attempt and explain its impact. Repair within the approved preparation scope; obtain a revised decision when requirements, scope, method or risk materially change. Resume only when prerequisites are restored. Record any rerun separately; do not silently retry until green.

Keep these statuses distinct:

- **Work:** not_started, in_progress, blocked, redo, done or canceled.
- **Test outcome:** Not run, Pass, Fail, Partial or Blocked, with evidence. Record an execution error separately when a valid verdict cannot be reached.
- **Human review:** Pending, Approved, Changes requested or Rejected, with actual review method and decision.
- **Defect:** Open until its correction and verification support an accepted disposition; report approval alone does not close it.

Connect requirements, discovery entries, cases, observations, defects and retests by ID/version and build. Update detailed records, [shared progress](../../unified_project_context.md) and affected agent-managed discoveries after material changes; update ignored continuity only if used. Propose any required baseline change to its human owner. Shared records must stand alone. A completed execution can contain failures, and an approved handoff can retain explicit open risks.


## QA process context at the existing gates

Read [QA Process Context](../../QA%20Process%20Context/README.md) before preparing/resuming a ticket. Preserve human product sources and separate AI discovery knowledge. Link existing process records as canonical; create missing operational records as Draft within authorized preparation.

| Gate | Process and coverage evidence to bring into the existing briefing |
| --- | --- |
| G1 | Applicable strategy/risk register, source and condition IDs, measurable coverage items, scope/exclusions and unknowns |
| G2 | Case/charter revisions, technique and positive/negative/edge considerations, selection rationale, pass criteria, data/configuration and exact execution bounds |
| G3 | Actual exercised items and evidence, original failures, Partial/Blocked/Not run work and residual gaps |
| G4 | Original failure, affected dependencies/conditions, selected regression and actual build; retain prior results separately |
| G5 | Achieved coverage against agreed scope, unresolved intent, exclusions, residual risk, retained regression and named maintenance actions |

The [design guide](../../QA%20Process%20Context/Test%20Design%20and%20Exploration/README.md) separates targets, quality objectives, scenario perspectives and techniques. Select relevant challenges without a case quota. Creative thinking supports both scripts and bounded exploratory charters; QA exploration uses this workflow, while Product Discovery retains its independent learning procedure.

Use the [coverage definitions](../../QA%20Process%20Context/Coverage%20and%20Traceability/README.md): designed is not exercised, a failure can exercise a condition, overlapping labels do not multiply counts, and sampling/unknown inventory limit claims. Scope/source/build changes trigger impact review of affected records. The optional snapshot helper checks structure/counts, not accepted intent, actual behavior or human decisions. Preserve historical evidence; reuse applicable approvals and return only material changes to the affected gate.

## Application-map impact reasoning

Read [Application Flow Map](../../Application%20Flow%20Map/README.md) during ticket preparation/resumption. Identify changed feature/relationship IDs, map/source revisions and served identity separately. Assess prerequisites, consumers, shared components and relevant indirect paths by transferred behavior, conditions and risk. Missing or stale paths are unknown; consider broader regression rather than infer independence.

Use the [impact briefing](../../QA%20Process%20Context/Regression%20Management/impact-analysis.md) at G1/G2: explain each proposed check/pass criterion, connection rationale, exclusions, unknowns and exact authorization. The helper returns candidates; it does not choose final scope or bypass review. At G3/G4/G5 distinguish paths considered, actual conditions/paths exercised and residual gaps. A diagram or structurally valid map does not establish tested behavior. Preserve actual human corrections, source authority and original historical results.

## Reusable records

Use the templates for a [test plan](templates/test-plan.md), [human review record](templates/review-record.md) and [release notes/sign-off/handoff packet](templates/completion-handoff.md). The [QC guide](../Quality%20Control/README.md) explains build/channel separation, repeatable checks and result records. Templates are unexecuted reference material. Select the necessary records for the approved objective; do not impose a fixed case count or an unrelated testing framework.

## Release sign-off and operational handoff

Follow the [release sign-off procedure](release-signoff.md). Prepare the packet before G5 review; it must identify changes, intended use/target, actual coverage and exit criteria, open risks, the proposed decision and who does what next. After the actual decision, finalize its reply/scope/limits and deliver a self-contained action handoff through the authorized channel. Record actual delivery/receipt; publication does not prove another owner received or accepted it. Do not mark a parent assignment complete while a required closure item is pending. An individual bug links its scoped disposition and parent packet without claiming full release approval.

The final response must include the target/verdict, changes, evidence, remaining limits, direct packet link and next-owner actions. A commit link or test totals alone cannot close the workflow. Local-only work marks production rollout/rollback/monitoring Not applicable with reasons. A later material change returns to the affected gate; a documentation supplement does not erase or invent the original decision.
