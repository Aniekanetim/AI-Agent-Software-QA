# Board check-in prompt

Template: replace `<QA_PROJECT_ROOT>` with the actual QA root before a manual check-in or native scheduling setup. This file is an instruction template, not an active schedule.

```text
Work in <QA_PROJECT_ROOT>.
Read AGENTS.md, unified_project_context.md, Project Context/README.md,
Product Discovery/Project Context/README.md, QA Process Context/README.md,
Application Flow Map/README.md,
QA task management Board/README.md and QA/Quality assurance/qa-workflow.md.
Inspect Ready for QA and Retest under QA task management Board.
Read relevant saved project settings/capability evidence. If GitHub PR polling is
actually configured and authorized, run its intake, deduplicate revisions and then
inspect the board. Determine testing activities from each task/context/risks rather
than asking for a routine testing-category selection. Reuse only an actual matching
reviewed regression policy; preserve all remaining human gates and build checks.
Read the relevant strategy, design/exploration, coverage, configuration/data and
regression records. Consider meaningful positive/negative/edge conditions with
suitable techniques and bounded charters. Track designed versus actually exercised
coverage; labels do not multiply counts. Changed sources/builds need impact review;
retain historical evidence and reuse only applicable approvals.
Read relevant map/source revisions and changed feature/relationship IDs. Trace
candidate prerequisites/consumers and assess transferred behavior, conditions,
freshness and risk. Explain each selected check, exclusions and gaps in the impact
briefing. A missing path is unknown, and a helper result never authorizes testing.
Follow the board's AI check-in procedure and existing human-reviewed workflow.
Consult the relevant context sources and record applicable source/design revisions
and rule/acceptance-criteria IDs, discovery OBS IDs/entry versions and the served
build identity separately. Humans maintain root Project Context; do not edit it.
Use discoveries for setup/investigation, not as automatically accepted requirements.
For a ticket's learning gap, link an explicit discovery request and its separate
authorization/checkpoint. An empty QA board does not start a discovery crawl.
For missing or conflicting information, comment on the existing ticket for the
developer, index its unanswered question in the board README, and wait only on
dependent work. Read actual responses before resuming; retain the conversation
and link responsible-owner clarifications or canonical source updates.
Do not invent requirements, owner decisions, human observations or approvals.
Resume eligible claimed work or select one actionable unclaimed ticket by
priority and age. Respect other owners and work from the recorded checkpoint.
Create each distinct defect as a separate linked Dev Todo ticket; preserve IDs,
history and developer responses through Retest, Rework and Tested-Ok.
Retest the original failure and run relevant authorized regression. A separate
regression gets a new linked Dev Todo ticket; a failed original retest returns
the same bug to Rework after the required review. Preserve the parent blockers.
Apply the workflow's human gates with complete conversational briefings.
At G5, prepare the release-notes/sign-off/handoff packet before review. Record the
actual scoped decision, then deliver the packet/action summary through the
authorized channel and record required receipt. Do not close pending handoff work.
Do not fix product code, act as a developer or publish externally without the
applicable authorization. A folder move, fix claim or silence is not approval.
Avoid duplicate tickets, repeated unchanged execution and repeated unanswered
questions or approval requests. If no ticket is actionable, leave files unchanged
and remain quiet unless periodic reports were explicitly requested. Report meaningful findings, movements or decisions
needed. Update detailed records and shared progress when work materially changes.
Preserve unrelated local work. If version control/publication is configured and
authorized, commit only coherent changes for the actionable ticket; do not invent
a repository, remote, publication permission or completed execution.
```
