# Product Discovery

Product Discovery builds practical knowledge of an application through authorized exploration. A discovery request defines what to learn; the [discovery workflow](discovery-workflow.md) defines how to investigate and record it. This pipeline can start during onboarding, after a change, or in response to a specific QA question.

**Package state:** unconfigured. No target, live requests, observations, authorizations or discovery schedule are included.

## Two context stores

| Location | Maintainer | Use |
| --- | --- | --- |
| [Root Project Context](../Project%20Context/README.md) | Human team and responsible owners | Product requirements, rules, acceptance criteria, designs and owner decisions; use the applicable accepted sources as the test basis |
| [Discovery Project Context](Project%20Context/README.md) | AI agent | Evidence-backed observations, journeys, maps, technical findings, inferences and gaps |

Read both indexes and the relevant entries. The discovery agent may maintain its own context within its authorization. It does not edit the human-maintained baseline or promote observed behavior into a requirement. Human-maintained sources still need an owner, state and applicable revision.

## Start or resume discovery

1. Create one uniquely identified request from the [request template](templates/discovery-request.md) in `requests/`. Keep the same file throughout its life; request progress does not use the QA board's status folders.
2. Read the request, applicable context, actual responses and existing authorization. Record ownership, checkpoint, next action and any waiting reason before work. Respect another worker's claim.
3. Explain the proposed journeys/actions, questions, reasons, access/data limits and exact next authorization in the conversation. Reuse an existing applicable authorization; do not request it again for routine work within scope.
4. Follow the discovery workflow. Store knowledge in the AI context and link it from the request. Keep questions, answers, decisions and a concise completion summary on the request.
5. Refresh only relevant knowledge when a source, role or application area changes. Preserve previous observations and distinguish historical evidence from the current state.

Use IDs such as `DISC-001` and a descriptive filename such as `DISC-001-account-onboarding.md`. Select the next unused ID across retained requests. Templates and `.gitkeep` are not live requests. If several requests are ready, resume eligible owned work first, then use the requester's priority and age; seek missing priority only when it affects selection. No automatic polling or priority scheme is created by this package.

The request index below provides navigation, not a second copy of each request. An empty or unchanged waiting queue causes no new execution, repeated unanswered question or empty-run file update.

## Request index

**Live requests: none.** Add actual requests after receiving a discovery objective.

| Request | Objective / related QA ticket | Owner / checkpoint | Next action / waiting on |
| --- | --- | --- | --- |

## Questions and visibility

Keep each question and its responses on the originating request or QA ticket. Give it a stable local Q ID; record checked sources/revisions, the precise gap, affected work, needed answer/owner and next action. Reuse an existing question through links instead of asking it again in another record.

Questions about access go to the environment/contact owner. Questions about intended behavior go to the responsible business, product or design owner, directly or through the team's developer contact. A developer explanation can inform investigation without establishing an accepted policy change.

Index unanswered discovery-origin questions below. QA-origin questions remain in the [QA board's question index](../QA%20task%20management%20Board/README.md#unanswered-developer-questions); link the original question from the discovery request. A file comment or index entry does not send a notification. External messages require their own authorization.

**Unanswered discovery questions: none.**

| Request / question | Original conversation | Needed from | Affected learning | Raised |
| --- | --- | --- | --- | --- |

Retain the original question and actual answer after resolution; remove only its unanswered index entry. Clear only resolved waiting reasons. Continue independent authorized learning while affected work waits.

## Connection to QA

The [five-folder QA board](../QA%20task%20management%20Board/README.md) continues to manage testing assignments and defects. A QA ticket can request targeted discovery with the question, affected check and required output; the resulting discovery request links back to it. On completion, return the knowledge references, both context revisions, target identity and unresolved limits to that ticket.

A suspected problem found while learning is an observation pending QA assessment. Link its evidence to a related assignment or propose a new QA assignment. Do not create a confirmed defect from an inferred expectation or bypass the existing findings/retest gates. Separately authorized testing can establish an actionable defect through the normal workflow.

Discovery completion records learning and coverage. It is neither a test pass, a release sign-off nor an automatic move to Tested-Ok.
