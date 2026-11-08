# Board check-in prompt

Template: replace `<QA_PROJECT_ROOT>` with the actual QA root before a manual check-in or native scheduling setup. This file is an instruction template, not an active schedule.

```text
Work in <QA_PROJECT_ROOT>.
Read AGENTS.md, unified_project_context.md, Project Context/README.md,
Product Discovery/Project Context/README.md, QA Process Context/README.md,
Application Flow Map/README.md,
QA task management Board/README.md and QA/Quality assurance/qa-workflow.md.
Run npm run qa -- task-source check-in from the actual QA root. If local, follow
QA task management Board/README.md and inspect Ready for QA and Retest. Read all
seven local status folders for IDs and deduplication. If live, follow
automation/task-source/README.md and work from the native tickets, claims and
queue mappings. Pause that pickup if live access fails. Apply the remaining
folder-specific operations in this template only to local mode. In live mode use
native tickets, linked evidence and the live publication controls for QA handoffs.

Deferred/Canceled work, including claimed or approval-waiting items, is not executable. Recheck canonical
status/generation before starts/dispatches and after waits. Inspect due Deferred
reviews and prior notices; brief once and acknowledge only the actual message.
Dates, new PR commits and late replies do not override an inactive decision.
Preserve actual scope, history, partial results and independent linked bugs.
Preserve hashed evidence during ticket moves; review incoming link proposals and
edit only authorized mutable navigation. Reconcile older prepared broad-repair
journals before recovery writes. Ordinary Markdown examples do not block unrelated
assignments; actual malformed lifecycle decisions still block affected work.
Reuse observed completed legacy results without rerunning. A terminal observation
does not authorize a retry; keep the separate actual decision and policy scope.
For in-flight work request supported safe stops and verify actual process/workflow
state; folder moves/abort errors/dispatch receipts do not prove termination.
Reactivation needs an actual decision, appropriate queue and affected prerequisite
checks. Current remote-board access or actual CI cancellation is project-specific.
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
In local mode, if blocker notifications are actually configured, read automation/attention/README.md.
Retain supported blocker facts and original question references on existing tickets.
Use actual recorded times; stale imports cannot replace newer blocker states.
Preserve original history and source evidence instead of restamping old updates.
Route only a real remaining human action to its actual owner; do not guess ownership.
For the verified designated notifier/conversation, assess current due actions under
recipient pacing and quiet hours. Show a known count and initially up to three real
action groups, with full-list/paging access. Reserve and atomically claim one actual
presentation, call the selected host once, and retain its actual observation.
CLI previews/reservations are not messages. Never expire an unknown send into a retry.
Acknowledgements/snoozes cover only explicit current items; they do not approve,
resolve, move or resume work. Selected decisions retain full informed gate briefings.
Maintain only an authorized mutable attention index on material changes; preserve
immutable evidence and other settings. Disabled/unconfigured reminders are no-ops.
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
and remain quiet unless a configured, actually due reminder or explicitly requested
periodic report applies. Report meaningful findings, movements or decisions needed.
Update detailed records and shared progress when work materially changes.
Preserve unrelated local work. If version control/publication is configured and
authorized, commit only coherent changes for the actionable ticket; do not invent
a repository, remote, publication permission or completed execution.
```

## Adaptive task preparation

Follow [task-based tool selection](../automation/tools/task-selection.md) and the [data preparation policy](../QA%20Process%20Context/Test%20Data%20Management/preparation-policy.md). The agent chooses suitable accessible methods per task, generates routine local inputs and establishes authorized state. Preserve explicit constraints, exact retest identities, old answers and failed attempts. Optional capability gaps do not block unrelated work. State precise missing dependencies and continue independent authorized checks. Preserve existing human gates; copied readiness is not current task readiness.

## Lifecycle eligibility and reviews

Before resuming a claim, starting an action, dispatching CI or continuing after a reply, reread the canonical folder and lifecycle generation. Deferred/Canceled work is not executable; a lower priority alone does not remove active work. Inspect all seven folders for IDs/deduplication, and use [the board helper](board/README.md) for transitions/recovery. Do not restart an inactive ticket because a PR changed or a review date passed.

Preserve immutable evidence when moving tickets; review incoming link proposals and edit only authorized mutable navigation. Reconcile older prepared broad-repair journals before recovery writes. Keep malformed lifecycle diagnostics local to affected work; ordinary report examples do not disable independent assignments. Reuse completed legacy results/dispatches after actual reconciliation without rerunning; observation alone does not authorize a retry.

Inspect due Deferred reviews, provide one actual owner briefing, then acknowledge that briefing reference. Read prior notices and responses before asking again. Continue existing stop/cleanup follow-up without treating it as resumed testing. Preserve unknown outcomes and require actual terminal observations before reactivation. A manual file move does not cancel an already running external job. Existing schedules are not activated or rewritten by this package upgrade.

## Optional blocker notifications

Use [the attention procedure](attention/README.md) only after actual recipient/access/preferences are established. Existing hourly check-ins do not imply hourly notifications. This template does not update installed schedules; review and change their actual prompts through the host interface only when authorized. Deferred reviews and cancellation/handoff obligations retain their separate procedures.
