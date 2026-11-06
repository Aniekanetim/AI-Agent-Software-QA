# Blocker notification validation

This record covers the optional reminder capability in version 1.11.0. It separates framework tests from actual user notification and product QA. The [operating procedure](../automation/attention/README.md) describes configuration, use and recovery.

## Change and regression scope

The existing seven-status board, lifecycle eligibility, onboarding schema/history, task-driven tool choice, product-context ownership and G1–G5 gates remain in place. Blocker facts are appended to their original tickets; the feature has its own optional preference/delivery stores. It creates no schedule or outbound email integration. The shared action index is derived from canonical records and has a narrowly marked mutable region.

Baseline `1685c72cc26556cb90f49e565fc997722e030d0b` passed all 183 package tests before implementation. Local records remain in ignored `.local/attention-baseline.log`; they are not adopting-project test results.

## Failures found during implementation review

| Original failure | Corrective behavior | Retained check |
| --- | --- | --- |
| Two concurrent callers presented the same reservation twice | A locked transition claims presentation once; an interrupted claim stays unresolved | Concurrent callbacks produce one actual synthetic send |
| A prepared reminder still presented after the recipient acknowledged its items | Preflight repeats current eligibility, including acknowledgement, quiet hours, pacing and summary counts | Acknowledgement after reservation produces zero synthetic sends; quiet hours and changed counts reject stale messages |
| Importing an older acknowledgement after a newer reminder request suppressed the requested reminder | Response selection follows actual response time while retaining import history | The newer reminder becomes due even when an older reply is imported afterwards |

The original failing outputs are preserved locally in `.local/attention-concurrency-red.log`, `.local/attention-sendtime-red.log` and `.local/attention-response-order-red.log`. Passing totals from before these cases were added do not substitute for correction verification.

## Verification coverage

Focused checks cover a 25-task backlog, three-action summaries, genuine shared dependencies, distinct roles/owners, multiple blockers per task, unrouted/external dependencies, read-only paging, source freshness, owner/lifecycle changes, known counts, timezone boundaries, urgent exceptions, acknowledgement/snooze scope, pacing, delivery uncertainty, concurrent presentation, first presentation/later confirmation and malformed optional state.

Compatibility checks preserve completed onboarding bytes and readiness, unrelated reporting/schedule preferences, settings navigation and interrupted edits. Disabled/unconfigured/empty previews remain no-ops. Inactive tasks are excluded from ordinary reminders. Resolution needs prerequisite verification; it does not move a ticket or create execution approval. Narrow index updates reject stale revisions, example markers, mutable evidence and an incomplete lifecycle move. The full suite retains the original onboarding, mailbox, GitHub, board, map, coverage, data and browser-helper checks.

## Initial delivery verification — 6 November 2026

| Check | Actual result |
| --- | --- |
| TypeScript | Passed |
| Initial full package suite | 224 passed: 183 retained checks and 41 attention checks; zero failed, canceled or skipped |
| Focused attention checkpoints | Initial 40 passed; the later response-order regression failed before correction, then passed independently and in the final full suite |
| Markdown targets/anchors | All 557 resolved |
| Actual CLI integration rehearsal | 17 commands passed in an isolated synthetic project path containing spaces; zero real messages sent |
| Reusable master | Board empty; notification preferences absent; no unresolved delivery, live recipient or active schedule created |

That local output is retained in `.local/attention-response-order-full.log`; the earlier 223-test checkpoint, original failures, focused checks and CLI records remain separate. The CLI rehearsal exercised argument parsing, root relocation, proposal/configuration, canonical blocker append, paging/index previews, reservation/claim, an explicitly Not sent outcome and acknowledgement. It did not establish actual user-message access. The later pre-merge findings below were not covered by that green checkpoint.

## Pre-merge regression correction

Review of `25dc1eae4d3a056c1393be4d1602f7d55becd4ab` reproduced two more defects despite its passing CI. Four additional review scenarios produced two passing controls and two failing assertions; a separate 22-case retained regression selection passed. Original results remain in `.local/pr10-regression-review.log` and `.local/pr10-regression-review-results.json`.

| Finding | Original behavior | Correction and retained coverage |
| --- | --- | --- |
| R1: shared settings recovery | With a notification edit active, an unreadable preference file made Show, Back and Close throw. Onboarding continued routing to settings. | Optional question rendering fails safely; navigation can detach the failed edit, preserving its bytes and a private recovery reference. Cases cover all three exits, unchanged setup, an unrelated settings save, restoration, a different pending question and an unavailable optional writer. |
| R2: blocker-state ordering | Importing an 08:02 Open event after an 08:03 verified resolution reopened the blocker. | New stale events are rejected before writes. Existing out-of-order history is read by recorded time without rewriting the ticket. Cases cover resolution, withdrawal, reassignment, idempotent replay and legitimate newer/equal-time changes. |

The corrections retain schemaVersion 1, existing answers, seven board folders, human gates and optional activation. A recovery note records leaving an edit without updating it; it is neither a canceled answer nor a new mandatory question. Equal-time blocker events use append order plus the expected-revision guard. Source truth and actual owner authority still require evidence; timestamps alone do not establish them.

The permanent checks are in [the attention suite](../automation/tests/attention.test.ts). Corrected full-suite results and exact hosted verification belong to the following checkpoint and delivery PR; earlier green runs do not substitute for them.

### Corrected local checkpoint — 6 November 2026

| Check | Actual result |
| --- | --- |
| TypeScript | Passed |
| Full package suite | 236 passed: all 224 earlier cases plus 12 new regression cases; zero failed, canceled or skipped |
| Attention coverage | All 53 attention cases passed within the full suite |
| Original review replay | All four scenarios passed; the two original failing assertions are now green |
| Document targets/anchors | All 560 resolved |
| Current CLI smoke rehearsal | 17 commands passed in a synthetic project path containing spaces; zero real messages sent |

Corrected results are retained separately in `.local/pr10-corrections-full.log` and `.local/pr10-corrections-review-green.log`; the original failures were not overwritten. The recovery checks verify the original unreadable bytes and completed onboarding remain unchanged, unrelated settings still save, and restored questions retain their identities. Blocker checks verify rejected stale writes leave ticket bytes unchanged and historical projection never edits original evidence. No live notifier, ticket, account or schedule was configured. Exact final Windows/Ubuntu CI revisions and logs are recorded in the delivery PR after completion.

Windows/Linux browser and API fixtures remain part of the existing [package CI](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions?query=branch%3Acodex%2Fblocked-task-attention). The delivery PR records exact tested revisions, completed run links and actual outcomes. A queued/in-progress run is not a pass. No local browser reinstall was performed for this feature.

## What these checks do not establish

Synthetic host callbacks exercise the actual reservation/claim/receipt code, but do not establish message access in an adopting user's conversation. CLI output is not a notification. Actual host presentation must be verified for the designated notifier and channel, with real message evidence; it has not been performed as part of this unconfigured package rehearsal.

Local locks coordinate one shared QA root, not arbitrary machines or independent external senders. The sender must honor the claim protocol, use the configured conversation and record actual outcomes. A change after preflight but before the external call is not covered by an atomic transaction with that host. Unknown outcomes require investigation; they never expire into automatic retry. No helper can establish that a supplied source is truthful or a person is authorized merely from its hash.

No live accounts, private project data, adopted-product tests, recipient decisions, real reminders or active schedule are included. Installed schedules are unchanged; their prompts need an actual authorized host update if this optional capability is enabled later.
