# Release sign-off and handoff

G5 closes a defined QA scope with a reviewable record and a usable handoff. A passing run, closed bug or short confirmation message alone is insufficient. The agent prepares the evidence and recommendation; the human QA reviewer makes the scoped decision. Product, release and operations owners retain their own authority.

## Research basis and distinctions

| Primary guidance reviewed on 22 October 2026 | What informs this workflow |
| --- | --- |
| [ISTQB CTFL v4.0.1, sections 1.4.1 and 5.3.2–5.3.3](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf) | Completion reporting assesses objectives/exit criteria, outcomes, deviations, impediments, unresolved risks and lessons. Reusable testware is retained or handed over, and results are communicated to stakeholders. |
| [Atlassian: Create release notes](https://support.atlassian.com/jira-cloud-administration/docs/create-release-notes/) | Release notes identify the version and relevant work, summarize features/improvements/fixes and communicate changes for the intended audience. |
| [Microsoft: Safe deployment practices](https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/safe-deployments) | Actual deployments need health checks, failure detection, stop/recovery actions and attention to stateful rollback. |
| [Google SRE: Reliable product launches](https://sre.google/sre-book/reliable-product-launches/) | Launch qualification uses contextual questions and actionable follow-up; the checklist needs curation rather than every possible check. |

The required packet and closure controls below are this project's tailored policy. These references do not prescribe our G1–G5 names, a universal sign-off form or a separate file for every section. No formal ISO-conformance claim is made.

Release notes explain what changes for the reader. A test-completion assessment explains what was verified and what remains uncertain. QA sign-off records the decision, evidence, authority and limits. Operational handoff tells a named recipient or responsible role what to do next. Production go/no-go and deployment acceptance remain separate from QA sign-off.

## One canonical packet

Use the [completion/handoff template](templates/completion-handoff.md) for one versioned record, normally `QA/Quality assurance/releases/<run-id>-release-handoff.md`. Link suites, results, defects and readiness records instead of duplicating their full tables. Link this packet from the parent assignment, shared progress and project entry point. An individual bug can link its scoped retest and parent packet; it does not need an entire release report of its own.

| Required section | Minimum useful content |
| --- | --- |
| Identity and purpose | Packet revision/date, intended audience/recipient, target version/build, source/test-basis revisions, environment and intended use |
| Release notes | User-facing change/fix and impact; relevant issue links; known issues/limits; compatibility, configuration or migration needs; actual versus planned availability |
| Test completion | Approved objective/exit criteria, planned versus executed checks, actual outcome totals by testing type, before/after evidence, deviations and harness issues, untested areas and retained regression |
| Risks and exceptions | Open defects/risks, effect/workaround, release-blocking status, actual risk owner/acceptance or Pending; an untested area is not a Pass |
| QA sign-off | Agent recommendation and rationale; human reviewer/date/exact decision or Pending; evidence/method actually supplied; permitted next work, conditions and invalidation triggers |
| Operational handoff | Recipient/owner, concrete next actions and triggers, setup/reproduction links, recovery/escalation, evidence/data retention, applicable deployment/smoke/monitoring/rollback arrangements and delivery/receipt state |

Use Not applicable with a reason where a field does not fit the approved scope. Use Not supplied or Pending for missing information. Do not invent a production rollout, deployment owner, migration check, live monitoring result, receiver acknowledgement or approval to fill the packet.

## G5 procedure

1. **Establish the decision boundary.** Identify the exact target, environment, intended use, exit criteria, reviewer and handoff recipient. Establish whether receiving-owner acceptance is a required completion criterion. QA testing completion, QA sign-off, deployment authorization, rollout success and assessment submission are separate states.
2. **Reconcile evidence.** Account for every planned check and relevant requirement. Verify totals and links, separate valid product failures from harness errors and preserve original failures/retests. Check that defect dispositions and risk decisions match the recorded evidence. Do not rerun unchanged tests merely to assemble paperwork.
3. **Prepare the packet before asking.** Complete release notes, completion assessment, recommendation, known limits and operational instructions. Put each follow-up against an actual owner/role and next trigger. Missing necessary inputs remain visible and pause the affected completion decision.
4. **Brief the reviewer.** In the decision-request message, state the target/use, changes, key evidence/counts, blockers/exceptions, recommendation, exact next authorization and next-owner actions. Give a direct packet link. Ask for one scoped G5 decision; a link or approval button cannot replace this briefing. Give focused confirmation steps where needed without demanding replay of every test.
5. **Record the actual decision.** Preserve reviewer/date/reply, scope/revision/build, accepted conditions and supplied review method. An approval that lacks method details does not establish unreported manual testing. Keep the agent recommendation distinct. Pending/rejected decisions do not become sign-off because files were generated.
6. **Deliver a usable handoff.** Finalize the record after the decision, provide the recipient with the packet and concise action summary through the authorized channel, and record delivery and any actual receipt/acceptance. Prepare external messages but do not send without applicable authorization. A repository link is evidence availability, not proof an external owner received or accepted responsibility.
7. **Close only the eligible work.** Update the parent ticket, linked bug dispositions, readiness and shared progress consistently. Do not move an assignment to Tested-Ok while its required sign-off, handoff delivery or required recipient acceptance is missing. Retain waiting reasons in the current board folder; do not add a new status. Preserve nonblocking follow-ups with their owner/trigger.
8. **Reassess material changes.** A changed target, requirement, configuration or material risk invalidates only the affected sign-off scope. Re-enter the appropriate gate and record a new revision/decision; never silently reuse or rewrite an old approval.

## Decision and handoff limits

Recommend Ready, Ready with known limitations or Not ready with reasons. No known critical blocker may be hidden inside the limitations list. An exception records who actually accepted which risk; an unassigned risk is not accepted by assumption. Production authorization is recorded only from the owner with that authority.

For a live deployment, identify the deployment owner, release window, pre/post-deployment smoke criteria, monitoring/observation ownership, stop thresholds, escalation and a recoverable rollback/forward plan, including state/data compatibility. Mark unverified arrangements accurately. These are scoped readiness inputs, not authorization for the AI to deploy or run additional tests.

For a local demo or test-level handoff, identify local setup and recovery instead. Explain why production rollout, on-call monitoring or database rollback is not applicable. Never suggest a known faulty control build as a production rollback target. Preserve failed/passing evidence before any disposable-data reset.

## Final-message requirement

After an actual decision, the closing message must identify the target and scoped verdict, material changes, actual test evidence, open limits, direct release-handoff link, next owner/actions and delivery/acknowledgement limits. Do not finish with only “updated,” “published,” a commit link or test totals. If sign-off is still pending, give the full review request rather than a completion claim.

This policy strengthens future closure. When documenting an already accepted run, label a later supplement with its true preparation date and original approval source. Do not claim the new packet was available or reviewed earlier, manufacture a signature or require the same approval again unless scope/risk actually changed.
