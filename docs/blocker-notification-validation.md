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

The original failing outputs are preserved locally in `.local/attention-concurrency-red.log` and `.local/attention-sendtime-red.log`. Passing totals from before these cases were added do not substitute for correction verification.

## Verification coverage

Focused checks cover a 25-task backlog, three-action summaries, genuine shared dependencies, distinct roles/owners, multiple blockers per task, unrouted/external dependencies, read-only paging, source freshness, owner/lifecycle changes, known counts, timezone boundaries, urgent exceptions, acknowledgement/snooze scope, pacing, delivery uncertainty, concurrent presentation, first presentation/later confirmation and malformed optional state.

Compatibility checks preserve completed onboarding bytes and readiness, unrelated reporting/schedule preferences, settings navigation and interrupted edits. Disabled/unconfigured/empty previews remain no-ops. Inactive tasks are excluded from ordinary reminders. Resolution needs prerequisite verification; it does not move a ticket or create execution approval. Narrow index updates reject stale revisions, example markers, mutable evidence and an incomplete lifecycle move. The full suite retains the original onboarding, mailbox, GitHub, board, map, coverage, data and browser-helper checks.

## Completed local verification — 6 November 2026

| Check | Actual result |
| --- | --- |
| TypeScript | Passed |
| Final full package suite | 223 passed: 183 retained checks and 40 attention checks; zero failed, canceled or skipped |
| Focused attention checkpoint | All 40 passed; the final full suite includes the subsequent incomplete-board diagnostic guard |
| Markdown targets/anchors | All 557 resolved |
| Actual CLI integration rehearsal | 17 commands passed in an isolated synthetic project path containing spaces; zero real messages sent |
| Reusable master | Board empty; notification preferences absent; no unresolved delivery, live recipient or active schedule created |

The final local output is retained in `.local/attention-full-release.log`; the focused and CLI records remain separate. The CLI rehearsal exercised argument parsing, root relocation, proposal/configuration, canonical blocker append, paging/index previews, reservation/claim, an explicitly Not sent outcome and acknowledgement. It did not establish actual user-message access.

Windows/Linux browser and API fixtures remain part of the existing [package CI](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions?query=branch%3Acodex%2Fblocked-task-attention). The delivery PR records exact tested revisions, completed run links and actual outcomes. A queued/in-progress run is not a pass. No local browser reinstall was performed for this feature.

## What these checks do not establish

Synthetic host callbacks exercise the actual reservation/claim/receipt code, but do not establish message access in an adopting user's conversation. CLI output is not a notification. Actual host presentation must be verified for the designated notifier and channel, with real message evidence; it has not been performed as part of this unconfigured package rehearsal.

Local locks coordinate one shared QA root, not arbitrary machines or independent external senders. The sender must honor the claim protocol, use the configured conversation and record actual outcomes. A change after preflight but before the external call is not covered by an atomic transaction with that host. Unknown outcomes require investigation; they never expire into automatic retry. No helper can establish that a supplied source is truthful or a person is authorized merely from its hash.

No live accounts, private project data, adopted-product tests, recipient decisions, real reminders or active schedule are included. Installed schedules are unchanged; their prompts need an actual authorized host update if this optional capability is enabled later.
