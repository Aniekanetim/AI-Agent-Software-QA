# QA task management board

This board gives the AI QA agent and developers tickets to work on. Each ticket is a Markdown file; the folder containing it is its current board status. The [QA workflow](../QA/Quality%20assurance/qa-workflow.md) defines how the AI performs the work and obtains human decisions.

[Human-maintained Project Context](../Project%20Context/README.md) locates product sources, owners, states and revisions. Applicable accepted sources establish expectations. [AI-managed discovery context](../Product%20Discovery/Project%20Context/README.md) supplies observations, journeys and setup/investigation knowledge. Read relevant sources in both before acting; discoveries are not automatically requirements.

## Requesting product discovery

This five-folder board continues to manage QA assignments and defects. Learning requests belong in the independent [Product Discovery pipeline](../Product%20Discovery/README.md). When a QA ticket needs exploration, identify the question/affected check and link a targeted discovery request in both directions. Record its required output and separate authorization; keep the QA ticket's current folder and checkpoint. Continue independent authorized checks.

Keep a QA-origin question and responses on its original ticket and question index; the discovery request links that conversation rather than repeating it. Discovery returns knowledge entries, human/discovery revisions, served identity and gaps. It cannot supply an invented requirement, approve tests or move the QA ticket to Tested-Ok. Humans publish baseline changes; agents maintain their own discoveries and operational records.

## Where work belongs

| Folder | Who checks it | Purpose |
| --- | --- | --- |
| Ready for QA | AI QA | Build or feature assignments awaiting testing, review or resolution of linked blockers |
| Dev Todo | Developer | Newly reported defects, including new regressions |
| Tested-Ok | Completed work | Tickets that meet their completion criteria and required QA review |
| Retest | AI QA | Existing bug tickets returned with a developer fix or refutation |
| Rework | Developer | Existing bug tickets whose original failure persists after retesting |

The live board starts empty. Existing project evidence remains separate; it is not automatically new queued work. `.gitkeep` files retain empty folders in Git and are not tickets. Templates below are reference material, not queued work.

Configured [GitHub PR intake](../automation/github/README.md) may create linked Ready for QA assignments. It deduplicates repository/PR/head and preserves revision history and current folder. It does not execute tests or change the five statuses. The agent determines coverage from the ticket/context/risks; onboarding does not impose a testing-category choice. Existing reviewed regression policy applies only to matching scope/revision/target; other work follows the usual gates.

## Create and maintain a ticket

Use a unique ID and a descriptive filename: `QA-001-feature-verification.md` for a testing assignment, or `BUG-001-duplicate-record-on-retry.md` for a bug. Choose the next unused number across all five folders. Preserve the ID and filename through moves. One ticket exists in one folder at a time.

Create assignments in Ready for QA using the build/feature template below. Describe the testing objective and provide the exact target and acceptance criteria. Link the relevant Project Context sources, their Git revision or immutable version and BR/AC IDs; identify an applicable design handoff or the missing reference. Record the served build separately. Testing types can include UI, API, usability, performance, accessibility or security; the agent selects methods through the existing workflow rather than assuming every assignment needs one fixed regression suite.

When the AI finds a defect, it creates a separate ticket in Dev Todo using the bug template. Link the new bug and its parent assignment in both directions. Future bug tickets are the authoritative reports; link their supporting suites and results rather than maintaining duplicate reports elsewhere. Existing reports remain preserved.

Ticket references include stable IDs. When a file moves, keep its ID, contents and dated entries, and update incoming relative navigation links to its new path. Check the destination first; never overwrite another ticket. Record ownership and workflow progress in the ticket. These details do not add board statuses.

## Initial testing and defect reporting

1. Read the complete assignment, both context indexes and relevant sources/discoveries. Identify the build, objective, human-source revisions/criteria and discovery versions; resolve necessary gaps through the procedure below. Prepare the QA scope/design/readiness briefing.
2. Execute only the work covered by the recorded human authorization. Keep actual outcomes, inferences and human decisions distinct.
3. Open a new Dev Todo ticket for each distinct defect. Record reproduction, expected/actual behavior, evidence, severity, supported cause or hypothesis, proposed correction and release impact. Link its parent and relevant test case.
4. Keep the parent assignment in Ready for QA while blocking findings or required decisions remain. Record its linked blockers and next action; do not repeatedly run the same tests against an unchanged build.
5. Before closing a parent assignment, follow [G5 release sign-off and handoff](../QA/Quality%20assurance/release-signoff.md). Prepare its packet before review and record the actual scoped decision, next-owner actions and delivery/receipt state afterward. Move it to Tested-Ok only when its criteria, required sign-off, handoff delivery and any required recipient acceptance are met. Keep pending closure work in the current folder with a waiting reason. Explicitly accepted nonblocking limitations remain recorded.

## Developer response, retesting and regression

Developers check the unanswered-question index below as well as Dev Todo and Rework. They append a fix or refutation, its explanation and the applicable build/commit to the existing bug ticket, then move that ticket to Retest. A refutation cites the relevant requirement or decision; QA compares it with the applicable Project Context sources. Missing or conflicting expectations use the clarification procedure, with product/design questions referred to their responsible owner. Moving the ticket does not establish an accepted requirement change or a passing result.

The AI QA reads the developer response, obtains the existing workflow's retest authorization, checks the original failure and runs relevant regression against the identified build.

| Verification outcome | Action |
| --- | --- |
| Original failure persists | Append the failed retest and evidence; move the same bug ticket to Rework after the required findings review |
| Original failure is resolved | Record verification and the required scoped QA decision; move the bug ticket to Tested-Ok |
| Regression discovers a separate defect | Create a new bug ticket in Dev Todo and classify it as Regression where supported |

A regression ticket identifies the affected behavior, reproduction, expected/actual results, new build, originating fix/ticket and previous passing baseline. If a prior pass or causal link is not established, state that uncertainty instead of inventing it. Avoid duplicate tickets for the same existing finding; append new observations to that ticket.

An original bug can reach Tested-Ok while a separate regression remains open. Link the regression to its parent assignment and originating fix. The parent remains in Ready for QA until blocking findings are resolved and its overall readiness decision is accepted. Do not interpret one fixed bug as approval of the entire build.

## AI check-in procedure

1. Read [AGENTS.md](../AGENTS.md), [shared progress](../unified_project_context.md), the [human context index](../Project%20Context/README.md), the [discovery context index](../Product%20Discovery/Project%20Context/README.md), this README and the [QA workflow](../QA/Quality%20assurance/qa-workflow.md).
2. Inspect ticket Markdown files directly inside Ready for QA and Retest. Read their ownership, waiting reason, linked blockers, clarification responses and existing decisions before selecting work. Consult the ticket's applicable source revisions/BR/AC IDs, rather than assuming the latest implementation defines expected behavior.
3. Resume eligible unfinished work owned by this QA chat first. Otherwise choose an unclaimed actionable ticket across both queues by priority P0, P1, P2, P3, then oldest creation time, then ticket ID. If priority or essential input is missing, request that information once and record what is needed.
4. Respect another worker's claim. Before claiming, re-read the ticket and record the owner, claim time, workflow checkpoint and next action. Handle one ticket at a time and verify that its ID is not duplicated elsewhere on the board.
5. Follow the workflow from the recorded checkpoint. Reuse an applicable scoped approval; explain any changed scope before seeking a new decision. For a necessary missing/conflicting source, append and index one clarification on the existing ticket, then wait only on affected work. Board placement is not execution authorization.
6. When a human decision is required, prepare the complete conversational briefing, record the requested gate/build/scope and waiting reason, and stop dependent execution. A later check-in does not treat silence as approval or resend the same unanswered request. Resume when an actual response or relevant change is available.
7. Create or move tickets according to the rules above, preserve all prior entries, refresh links and update the parent assignment's blockers and next action. Record completed checks, observed results and actual decisions.
8. Report meaningful findings, movements or decisions needed. If no ticket is actionable, leave all files unchanged and end the check-in. Do not create empty-run commits or invent work.

Ownership, waiting reason and workflow checkpoint describe ongoing work inside a folder. They do not replace the folder's board status. The QA agent does not implement product fixes unless separately authorized; it does not act as the developer merely because Dev Todo contains tickets.

## Clarification comments and developer visibility

If a ticket cannot be answered from its linked sources and [Project Context](../Project%20Context/README.md), leave a dated comment on that existing ticket for the developer. Give each question a stable ticket-local ID, such as Q-001. Link the exact source section/revision checked, the gap or conflict, the affected check and the answer or responsible owner needed. Use this structure:

```text
Q-<number>: <short question title>
Raised: <date/time with timezone; actor>
Question: <one concrete question>
Checked: <source link, section/BR/AC ID and Git/design revision>
Gap/conflict: <missing, inaccessible or inconsistent information>
Affected check: <case/criterion and why it cannot be judged>
Needed from developer: <answer, source or referral to its responsible owner>
Next action: <dependent work waiting for the reply>
```

Record the waiting reason and next action in the ticket's fields. Keep it in its current folder; a clarification is neither a new status nor automatically a product defect. Independent work may continue only within its existing authorization. A later check-in reads the original question and any responses; it does not repeat an unanswered request.

### Unanswered developer questions

**Current state: none.** Keep this summary accurate when adding or resolving entries. When raising a question, add a row here linking directly to the original ticket comment. Developers check this index during their routine board visit, including questions on Ready for QA or Retest tickets. A local comment does not send a notification. This index exposes the conversation without duplicating it or requiring another status folder.

| Ticket / question ID | Original comment | Needed from | Affected work | Raised |
| --- | --- | --- | --- | --- |

Append the actual answer, retaining the conversation. Resolve intent with the responsible owner, who maintains/publishes any canonical change. The agent links the actual decision/source revision without editing root Project Context. Record the answer and resumption checkpoint. Remove the index row only when resolved; clear only its waiting reason. Changed criteria may require revised cases and approval. Refresh question links if the ticket moves.

## Build or feature ticket template

Copy this into a new file in Ready for QA and replace the placeholders. Do not record an approval or result before it occurs.

````markdown
# QA-<number>: <build or feature to test>

| Field | Value |
| --- | --- |
| Ticket ID | QA-<number> |
| Type | Build / Feature |
| Created | <ISO date/time with timezone; creator> |
| Updated | <ISO date/time with timezone> |
| Priority | <P0–P3 and business reason> |
| Owner / claimed at | Unassigned |
| Workflow checkpoint | Intake; scope/design not yet approved |
| Next action | Review the testing request |
| Waiting on | None |

## Feature and testing objective
<What is changing, who uses it and what needs verification.>

## Acceptance criteria and test basis
1. <Observable business requirement.>
2. <Observable business requirement.>
<Links to supplied requirements/designs; unresolved questions or assumptions.>
- Context sources and revision: <exact links and Git commit or immutable source version>
- Discovery knowledge and versions: <relevant OBS IDs/entry revisions, linked request, or None used; not the requirement authority>
- Business rules / acceptance criteria: <BR and AC IDs, or ticket-specific criteria>
- Design reference: <applicable handoff/version, not applicable, or missing>

## Target and setup
- Build/commit: <exact revision>
- Environment: <local or other authorized target>
- Browser URL: <normal web address, if applicable>
- API base URL: <API address, if applicable>
- Setup, access and synthetic test data: <exact instructions or direct supporting links>

## Testing scope and completion criteria
- Testing objective/types: <requested coverage>
- In scope / out of scope: <boundaries>
- Completion criteria: <required outcomes, evidence and human decision>

## Linked bugs
None reported yet. Add each bug's ID, current file link and blocking impact.

## Work and decisions
Append dated entries with actor, build, workflow gate, action/observation,
evidence or suite/result links, actual human reply and next action.
Record pending review requests and their scope so check-ins can resume.

## Comments and clarifications
None yet. Append dated questions/responses with ticket-local Q IDs,
checked sources/revisions, affected checks, needed owner and next action.
Index unanswered developer questions in the board README.

## Completion
Not completed. Link the versioned release-notes/sign-off/handoff packet.
Record coverage, defect dispositions, remaining limits, actual scoped QA
decision, next owner/actions, delivery and any required recipient acceptance.
Do not infer release approval from a passing bug retest or a commit.
````

## Bug ticket template

Create a new file in Dev Todo for a newly observed defect. Keep API reproduction specific to methods, full request URLs, headers and payloads; keep UI reproduction specific to browser URLs and user actions. Distinguish technical test-data preparation from the actions that demonstrate the bug.

````markdown
# BUG-<number>: <observable failure and triggering action>

| Field | Value |
| --- | --- |
| Ticket ID | BUG-<number> |
| Type | Bug |
| Classification | New defect / Regression / Regression suspected |
| Parent assignment | <QA ID and current file link> |
| Related fix/ticket | <ID, commit and link where applicable> |
| Reported | <ISO date/time with timezone; reporter> |
| Updated | <ISO date/time with timezone> |
| Severity | <impact and rationale> |
| Priority | <P0–P3 and urgency rationale> |
| Owner / claimed at | Unassigned |
| Workflow checkpoint | Findings; record actual review state |
| Next action | Developer review after the required QA decision |
| Waiting on | <specific input/decision or None> |

## Bug description
<What fails, affected user/business flow and impact.>

## Test case that verified the bug
<Case ID, channel, suite/result link and execution date.>

## Preconditions and affected build
<Exact build/environment, required record state and any controlled failure.>

## Test data
<Exact reproducible synthetic inputs; format request JSON/code in fenced blocks.>

## Steps to reproduce
1. <Specific action or HTTP method plus full URL.>
2. <Specific action/request using the test data.>
3. <Where to observe the failure.>

## Expected result
<Observable result from the acceptance criterion or business rule.>
- Context source/revision and BR/AC IDs: <exact rule/criterion references>
- Discovery references: <relevant OBS IDs/versions and originating request, or None used; distinguish observations from expected behavior>
- Applicable design handoff/version: <reference, not applicable, or missing>

## Actual result
<What was observed, with amounts/states/IDs when relevant.>

## Evidence
<Observed result/request/response references, build, date and actual method.>

## Root cause and proposed correction
<Supported cause, or clearly labeled hypothesis and remaining investigation.>
<Actionable correction and the behavior that must remain unchanged.>

## Release impact and regression basis
<Blocking impact; checks that should prevent recurrence. For regression,
identify the prior pass/baseline, new failure and originating fix.
State missing baseline/causal evidence explicitly where necessary.>

## Developer responses
None yet. Append each dated response with actor, Fixed or Refuted,
explanation, applicable build/commit and supporting information.
Retain earlier responses when returning through Rework.

## Comments and clarifications
None yet. Append dated questions/responses with ticket-local Q IDs,
checked sources/revisions, affected checks, needed owner and next action.
Index unanswered developer questions in the board README.

## Retest and relevant regression
Not run. Append each attempt with build/date/executor, the authorized
original-failure check, selected regression, expected/actual results,
evidence, new bug IDs and required human decisions.

## Completion
Not completed. Record the actual scoped disposition and human decision.
````



## Scheduling

Follow [native scheduling setup](../automation/README.md) and use the [check-in prompt](../automation/check-in-prompt.md). No schedule is active merely because this folder was copied. A manual empty-board check leaves files unchanged; it does not demonstrate a product test or future unattended behavior.
