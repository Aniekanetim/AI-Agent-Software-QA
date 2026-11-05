# Board lifecycle validation

Version 1.10.0 adds Deferred/Canceled and their execution controls. This record concerns synthetic package fixtures, not a product test run, live task disposition, human sign-off or schedule activation. [The lifecycle guide](../automation/board/README.md) describes behavior, migration and operating limits.

## Verification scope

| Area | Required observation |
| --- | --- |
| Upgrade | Five-folder copies gain only missing queues; repeated upgrade preserves existing files/setup |
| Identity and transitions | Same ticket/history survives moves and reactivation; stable IDs drive allocation across all seven queues |
| Recovery and ownership | Matching interrupted moves recover without duplicates; only explicit mutable navigation is edited; immutable evidence and human context are preserved; older unsafe pending journals are held |
| Intake | Repeated/changed PR events retain assignment-scoped inactivity; revision-only scope allows a separate linked assignment |
| Eligibility | Inactive/approval-waiting continuations cannot reach local execution or CI dispatch; reporting has separate permission checks |
| Active operations | Cancellation requests reach supported runners; actual process/remote state remains separately observed before resumption |
| Deferred review | Date/trigger matches produce review candidates; actual acknowledgement prevents repeated unchanged briefings without reactivation |
| Risk and coverage | Parent cancellation retains linked failures/risks and uncovered conditions; inactivity is never a test Pass |
| Legacy history | Completed results/dispatches are bound and reused without rerunning; original failed/unknown results stay intact; new attempts need their separate actual decision |
| Formatting isolation | Ordinary EOF examples permit unrelated work; actual malformed lifecycle records retain diagnostics and block affected work |
| Documentation and CLI | Active instructions use seven statuses; the reusable board stays empty; help/status/templates and links remain usable |

## Actual local checkpoints

TypeScript passed during implementation. The first full helper checkpoint passed all 158 tests; the expanded focused board run then passed 20 cases, including a real isolated Node child receiving cancellation. Its process was separately observed stopped while the operation remained conservatively unresolved until an explicit observation record. Subsequent reconciliation/ownership checks extend that scope; their final results belong to the final helper/CI records rather than the earlier checkpoint.

The expanded full local suite passed all 168 tests with zero failures, cancellations or skips, including 23 board lifecycle cases and the retained 145 checks. All 540 local Markdown targets/anchors resolved. TypeScript passed and CLI help/status were exercised; the actual reusable board returned zero tickets. Later review preserves these checks, including UTF-8 BOM ticket IDs and unchanged test expectations. Exact final revision/CI links belong to the accompanying pull request; no hosted success is inferred from older WebMCP runs. Original attempts remain in ignored local logs.

## Pre-merge regression correction

Review at 46770ad reproduced three defects beyond the original passing suite. Four new tests all failed there: a move rewrote its immutable Markdown decision snapshot; another invalidated an unrelated assignment's approved Markdown suite; completed legacy reconciliation executed unchanged work twice; and an ordinary EOF example blocked unrelated intake. Those failures supersede the earlier broad readiness statement without changing the historical results above.

The corrections replace broad incoming-link writes with proposals, permit only explicitly authorized mutable board-index blocks, and stop older pending broad-repair journals before writes. Completed legacy executions are referenced through immutable observation history and reused with their original exit codes/outcomes. A retry decision is separate from observation, and local/remote outcomes are reconciled separately. Actual malformed lifecycle records retain per-ticket diagnostics; ordinary examples do not establish lifecycle metadata or hide an appended decision.

The expanded corrective focused checkpoint passed all 36 lifecycle cases. The first corrected full helper checkpoint passed 181 tests; the next passed 182 after cross-channel uncertainty and missing-result preservation checks. Final reviewed source passed all 183 tests, including 38 lifecycle cases and the retained 145 checks, with zero failures, cancellations or skips. TypeScript and CLI help/status passed; the reusable board remained empty. The final source and exact hosted outcomes are recorded in the accompanying PR. Tests use isolated synthetic records/callbacks, plus the retained direct-child cancellation fixture; these are not product execution or human sign-off. Original failing and corrective logs remain separate in ignored local evidence.

## Boundaries

The module checks record integrity and scope, not the truth of an entered owner decision or stop observation. The agent must use actual human/policy authority and evidence. A folder move, AbortError, process exit or dispatch receipt is not a QA verdict or universal process-tree cancellation. Another machine's Git snapshot is not a live board connection; remote freshness/stop delivery requires an adopting-project adapter and actual authorized runner access.

The shared lock/journal coordinates the supplied helpers, not arbitrary external file editors. Unknown partial writes or concurrent edits are preserved for reconciliation. Root Project Context link changes are returned to the owner. Existing schedules and onboarding answers are preserved; the master has no live tickets, decisions or task execution. Product Discovery remains independent and G1–G5 retain their existing purpose.
