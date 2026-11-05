# Ticket lifecycle controls

The board folder is the ticket's current status. These helpers preserve identity/history while supporting Deferred/Canceled, recovery and execution eligibility. They verify referenced content, not human identity or the truth of entered prose. The agent must read the actual instruction, authority and scope; metadata never approves testing or product release.

## Seven statuses

QA picks up Ready for QA and Retest. Developers pick up Dev Todo and Rework. Tested-Ok retains completion under the existing gates. Deferred parks work for reconsideration; Canceled ends pursuit of its recorded scope. A lower priority alone keeps work in its working queue. Ordinary dependencies retain their waiting reason.

All seven folders participate in lookup and PR deduplication. Use regular Markdown ticket files with a stable first-heading ID, such as `# QA-001: Verify checkout`. Allocation uses IDs rather than filenames. Duplicate IDs, symbolic-link tickets and incomplete transitions need reconciliation before automatic intake/execution. The reusable board has no live tickets or decisions.

## Upgrade an existing copy

Deliberately adopt the updated workflow files, preserve project overrides, then run from that project's QA root:

```shell
npm ci --ignore-scripts --cache .local/npm-cache
npm run qa -- board upgrade --source actual-upgrade-instruction-reference
npm run qa -- board status
```

Upgrade adds missing folders/empty `.gitkeep` files. It never moves/reclassifies existing tickets, resets onboarding, changes schedules or executes tests. Repeating it preserves files. Update an installed native scheduler prompt through its supported interface when authorized; a repository prompt edit does not update an installed schedule.

Inspect existing running/uncertain operations before automatic work. Old unbound GitHub executions remain intact and require [legacy reconciliation](../github/README.md#legacy-execution-reconciliation) before a new bound attempt. Unchanged policy approvals remain content-bound; upgrade generates no approvals.

## Record a decision and move

```shell
npm run qa -- board status --ticket QA-001
npm run qa -- board transition --input .local/actual-transition.json
```

Prepare the private input using [the transition example](examples/transition.example.json), replacing all placeholders. Supply the actual ID, current ticket hash, destination, decision actor/source/reason, evidence, checkpoint, next owner/action and partial-work/data handoff. Keep decision evidence in an immutable record/snapshot rather than hashing the ticket being changed. A direct human instruction is already a decision; do not request it twice. Otherwise the agent proposes the change unless an applicable standing policy authorizes it.

Assignment scope applies until reactivation. Revision-only scope names a full commit SHA; another revision may receive a separate linked assignment under existing authorization rules. The original stays inactive. PR changes never silently override assignment-scoped inactivity.

Deferred requires a review owner, date or trigger, and resume conditions. Use an ISO date/time with timezone. Reactivate the same QA assignment into Ready for QA, or a defect into Retest/Dev Todo/Rework according to the next action. Recheck affected source/build/data and approvals; preserve prior failures. Inactivity cannot jump straight to Tested-Ok. Unresolved operations require actual observation and settlement first.

Each move appends a visible, formatted `qa-lifecycle` JSON block with provenance/scope and the previous checkpoint/owner/waiting information. Its ID is the lifecycle generation, not a second current-status field. A folder/history mismatch or malformed lifecycle blocks that ticket and related PR work; status retains its diagnostic while unrelated valid assignments can proceed. Ordinary code fences, including examples extending to EOF, are not lifecycle decisions. Close an unfinished ordinary example before appending a lifecycle entry; the helper refuses to hide a new decision inside it. Repeated operation IDs retain the original transition instead of moving again. Returned destinations describe that recorded event; use status for the current location.

## Recovery and links

Moves use a shared board lock, expected revisions, an exclusive destination write and an ignored recovery journal. An interrupted move may leave both copies; its pending journal blocks new automatic selection/starts until resolved. Already running independent operations ignore another ticket's move; a transition affecting their own ticket requests a stop. Never overwrite a destination or delete an unknown copy to force success.

```shell
npm run qa -- board recover --id original-operation-id
```

Recovery completes matching source/destination and explicitly authorized navigation steps idempotently. Concurrent edits or unknown partial writes stop recovery without overwriting them. Preserve the journal/current edits, prepare a reviewed navigation merge, and retain the reconciliation source before repairing the original journal. Do not restore older content or reset history. Arbitrary external filesystem writers are not coordinated by this lock.

Current outgoing navigation in the moved ticket is rebased; fenced examples and lifecycle JSON are preserved. Other incoming changes are returned as `linkUpdates` proposals, with human-baseline changes in `ownerUpdates`. The helper never rewrites arbitrary Markdown decision snapshots, approved suites or historical results. Preserve their bytes/hashes even if an old link names the ticket's former location; resolve the stable ID with `board status --ticket ID`. Do not replace evidence hashes merely to make checks pass.

Only the board index supports opt-in automatic incoming navigation maintenance. Its `<!-- qa-navigation:start -->` / `<!-- qa-navigation:end -->` markers must appear once as standalone prose outside code examples. Add `navigation: [{ "path": "QA task management Board/README.md", "expectedRevision": "actual-current-file-hash", "source": "actual-mutable-index-maintenance-authorization" }]` to a transition only when that maintenance is authorized. The helper edits links inside this block, preserves all other sections and checks revisions during recovery. This index is a mutable navigation record, not an immutable approval/result snapshot; store those separately. A file used as the transition's decision evidence cannot also be selected for navigation editing. Without opt-in, all incoming edits remain proposals.

New journals use schemaVersion 2 and retain the narrow navigation scope. Completed version-1 journals remain historical. A pending version-1 journal is stopped before any recovery write because its broad patches may include evidence. Preserve an immutable copy/hash and inspect the source, destination and every proposed patch. Under an actual maintenance decision, reconcile its ticket content and replace broad patches with proposals; retain the original journal and decision reference as history before producing a reviewed version-2 recovery record. Never change a version number alone to bypass review, overwrite concurrent edits or recalculate evidence hashes to conceal a change. Until reconciliation is complete, retain the pending hold and its required owner action.

## Deferred reviews

```shell
npm run qa -- board reviews
npm run qa -- board reviews --at 2026-11-06T09:00:00+01:00 --trigger actual-reviewed-trigger
```

The read-only result identifies matching Deferred items and whether their current-generation briefing was reported. Read original responses first, brief the owner once, then use `board acknowledge-review --input` with `ticketId`, `generation` and the actual message/source reference. Do not acknowledge an unseen briefing. A date/trigger/notice never reactivates work. Rescheduling or resumption needs an actual new decision; unchanged reported reviews do not justify repeated unanswered requests.

## Execution and actual stop observations

```shell
npm run qa -- board assert-executable --ticket QA-001 --generation actual-recorded-generation
npm run qa -- board operations --ticket QA-001
```

Recheck before starts/dispatches and after waits/replies. A lifecycle change invalidates old continuations even if the ticket later returns to the same folder. Capability assessment notices inactive board tasks but supplies no testing authority.

Local GitHub regression watches its bound canonical ticket every 100 ms and requests cancellation through AbortSignal after loss of eligibility. The default Node runner supports the request. An abort/timeout remains uncertain; it does not prove an entire process tree or external effects stopped. An adapter may ignore the signal and finish afterward; retain that actual outcome and inspect partial results. This is a preflight/polling guard, not an atomic interceptor for every tool.

CI dispatch checks eligibility before sending. A receipt is not the remote job's outcome, so its operation remains unresolved. Deliver supported authorized cancellation to an identified job where possible; otherwise retain the needed owner action. The bundle invents neither a remote run ID nor a successful stop.

After actual observation, `board settle-operation --input` accepts `id`, `source`, `terminalState` (`completed`, `stopped` or `notStarted`) and nonempty evidence references. It retains an observation and releases the operational hold. Never manufacture termination or interpret settlement as a test pass. Inactive-task reporting still follows its existing channel permissions.

Local watching sees only files accessible to that runner. Another machine's move or a stale Git checkout is not a live control channel. CI needs a project-owned current-board adapter plus updates or actual CI cancellation/observation. Unknown current state blocks dependent starts; a snapshot does not prove continued eligibility.

Operational holds/notices are private to that QA root. Share actual pending-run/stop/handoff facts through canonical tickets or the project's verified adapter; an empty local operation list does not prove another runner stopped. Without Node helpers, follow the same decision/history/ownership rules with available filesystem tools and inspect actual runners. State which transaction/watch protections were not exercised; do not claim helper execution or bypass an unresolved execution dependency.

## Coverage and risk

Canceled/Deferred are work dispositions, not Pass, fixed behavior, exercised coverage or risk acceptance. Preserve partial/untested conditions and independent parent/child decisions. Link stop/cleanup handoffs from the existing board; no reporting database or release approval is created.
