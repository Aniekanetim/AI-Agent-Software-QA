# Release notes, QA sign-off and handoff: <release / run>

**Template — no execution, approval, deployment or delivery is recorded.** Follow [the sign-off procedure](../release-signoff.md). Prepare this packet before G5 review and retain its revision/actual decision afterward.

## 1. Identity and intended use

| Field | Actual fact |
| --- | --- |
| Packet revision / preparation date | <revision and date/timezone> |
| Assignment / release / run | <IDs and links> |
| Audience / handoff recipient | <named person or responsible role; acceptance required or not> |
| Target version / served build / source revision | <exact identities> |
| Test basis / design revision / criterion IDs | <actual applicable sources> |
| Discovery references / versions | <relevant OBS IDs/versions or None used; learning coverage is not test execution> |
| Environment / intended use | <local, staging, production; scope and limits> |
| Availability | <planned or actual; do not equate QA completion with deployment> |

## 2. Release notes

Explain the user-visible changes/fixes, their effect and relevant issue links. Identify known issues and limitations, compatibility/configuration changes, migration needs and required user/operator actions. If this verifies an existing reference implementation, state that rather than claiming new code was implemented.

## 3. Test-completion assessment

| Approved criterion / scope | Observed evidence and result | Met, not met or blocked |
| --- | --- | --- |

| Testing type / target | Planned | Executed | Pass | Fail | Blocked / not run | Evidence |
| --- | --- | --- | --- | --- | --- | --- |

Link the applicable [coverage matrix](../../../QA%20Process%20Context/Coverage%20and%20Traceability/README.md) and process/data/configuration revisions. Separate designed items, actually exercised conditions and case outcomes. Explain sampling, unresolved intent and exclusions; keep overlapping labels out of additive totals. Record actual executor/date, methods/configuration, original-versus-retest results, deviations, setup/harness issues, untested areas and retained regression links. Derive counts from actual result rows. A recognized expected-failure signature remains a failed product test.

## 4. Defects, risks and exceptions

| Defect / risk | Effect and workaround/limit | Blocking? | Owner and actual acceptance / Pending | Follow-up trigger |
| --- | --- | --- | --- | --- |

Link authoritative bug tickets and results. Do not invent accepted risk, historical observations or a passing result for an excluded area.

## 5. QA sign-off

| Decision field | Actual record |
| --- | --- |
| Agent recommendation / rationale | <Ready / Ready with known limitations / Not ready, and why> |
| Human QA reviewer / date / exact reply | Pending until actually supplied |
| Scope / packet revision / target covered | <specific identities and intended use> |
| Review method and evidence actually supplied | <actual method, or Not supplied> |
| Conditions and permitted next work | <what the decision authorizes> |
| Production release authority / decision | <separate owner/actual decision, Pending or Not applicable with reason> |
| Invalidation triggers | <changed build, requirement, configuration or material risk> |

An approval after a briefing does not prove unreported manual execution. Preserve the original decision and its date; a later supplement must not be represented as having been reviewed earlier.

## 6. Operational handoff

| Next action / trigger | Responsible recipient or role | Instructions / evidence | Required receipt or acceptance / current state |
| --- | --- | --- | --- |

Provide exact setup/execution locations, safe recovery and escalation actions, records to preserve, cleanup boundaries and remaining follow-up. State who does what next; do not end at “see results.”

For a deployment, record deployment owner/window, post-deployment smoke criteria, health/monitoring and observation ownership, stop thresholds, escalation and rollback/forward instructions with state/data considerations. Record whether each was prepared or actually verified. For a local/test-level handoff, mark production-only items Not applicable with the local rationale and give local recovery instead.

## 7. Delivery and closure

| Closure field | Actual state |
| --- | --- |
| Packet / concise handoff delivered to whom, when and how | Not delivered until supplied through an authorized channel |
| Recipient response / acceptance if required | Not recorded; do not infer it from publication |
| Ticket/readiness/shared-progress updates | <links and actual states> |
| Outstanding actions / owners / triggers | <links or None within the accepted scope> |
| Evidence/testware retention and improvement action | <locations and concrete learning> |

Keep the assignment in its current folder while required sign-off/delivery/receipt is pending. External sending, deployment and new testing each need applicable authorization. The final conversational handoff must state the verdict, target, evidence, limits, packet link and next-owner actions.

## Map-based selection and maintenance

Link [Application Flow Map](../../../Application%20Flow%20Map/README.md) revision/IDs and the actual impact assessment. Distinguish considered connections from conditions/path segments exercised; record unmapped, conditional or stale areas and any broader-regression decision. Identify next-owner refresh actions and retain historical map/source/build identities. A mapped edge or diagram is not test evidence.

## Tool/data handoff

Link the actual task method choices and [data preparation record](../../../QA%20Process%20Context/Test%20Data%20Management/data-preparation-record.md). State what ran, prepared versus verified state, retained identities, failed attempts, unresolved dependencies and next-owner reuse/retention/cleanup actions. A tool preference, generated input or capability/preparation assessment is not release evidence by itself.
