# Company-context assertion and limitation map

This map names the bounded assertions for the original CC-01–CC-44 scenarios. It is not an adopting company's approval, authenticated Slack check or claim of exhaustive path coverage. Actual execution results belong to the tested revision/CI run linked from the PR. An entry naming a test is a coverage reference, not a passing receipt by itself.

Sources: [core tests](../automation/tests/company-context.test.ts) (Core), [provider tests](../automation/tests/slack-provider.test.ts) (Provider), [correction tests](../automation/tests/company-context-correction.test.ts) (Correction), [remaining-gap tests](../automation/tests/company-context-remaining.test.ts) (Remaining), [contracts](../automation/tests/company-context-contracts.test.ts) (Contracts), [real process recovery](../automation/tests/company-context-recovery.test.ts) (Recovery), [connected-board fixtures](../automation/tests/company-context-live.test.ts) (Live fixture) and [combined journey](../automation/tests/company-context-workflow.test.ts) (Journey).

| ID | Concrete package assertions | Boundary or remaining external validation |
| --- | --- | --- |
| CC-01 | Core: status/guards create no configuration; CLI remains unconfigured | No actual host connection is supplied |
| CC-02 | Core: reuse recorded native identity/catalog; Provider: request-bound native imports | Real harness connection discovery/sign-in conversation requires that host |
| CC-03 | Core: workspace/principal mismatch rejected; Contracts: active account cannot be silently replaced | Multi-account chooser presentation remains the harness/agent procedure |
| CC-04 | Correction: terminal reports pending native read; Contracts: revoked relevant read prevents use while independent scope remains usable | Actual expired OAuth/session recovery needs live provider access |
| CC-05 | Core: empty/short first catalog page with continuation remains partial, next page completes | Provider pagination is bounded by reported capabilities |
| CC-06 | Correction: adapter page-two failure and persistent A/B/A cycle; Remaining: native validation failure reports/resumes progress | Invalid evidence is rejected, not repaired by assumption |
| CC-07 | Core: exact completed all-accessible set; explicit follow-new does not join channels | New selection still requires its authorized policy |
| CC-08 | Core: thread denial leaves a gap; other channel completes | Successful history never proves thread permission |
| CC-09 | Core: private join not invented; Provider: lost membership response read back once | No actual company membership changed |
| CC-10 | Contracts: empty readable history has actual coverage but zero learned/analyzed sources | Empty history supplies no intended requirements |
| CC-11 | Journey: Settings channel addition and bounded historical reads | Uses synthetic configured access |
| CC-12 | Core and Recovery: removal during in-flight read, including another process, cannot restore removed scope | No distributed cross-machine guarantee |
| CC-13 | Core: rename keeps IDs; Contracts: archive metadata retained, same-name new ID is not inferred migration | Unverified migration remains an explicit identity question |
| CC-14 | Core: dedicated save preserves onboarding; Contracts: failed stale save can cancel/close; Provider: uncertain completed membership retained | Canceling an edit cannot undo an external action |
| CC-15 | Core: unreadable edit preserves original bytes and allows Close/recovery | User must resolve the actual corrupt record |
| CC-16 | Core: two bounded interruptions; Recovery: real process death before progress/after progress | Process fixtures run only in disposable roots |
| CC-17 | Provider/Correction: Retry-After, persistent catalog cooldown; Contracts: directory cooldown does not block completed channel use | Provider-wide real quotas not load-tested |
| CC-18 | Core: replies on known old roots retrieved beyond channel watermark | Unseen roots outside selected coverage remain unknown |
| CC-19 | Core: edited source invalidates basis, old bytes retained | Polling cannot prove every unseen edit was found |
| CC-20 | Core: absence does not fabricate deletion; explicit observed deletion holds use | Live tombstone/event coverage not supplied |
| CC-21 | Core: older edited response does not overwrite newer version | Unordered conflicting content is held for reconciliation |
| CC-22 | Core: ingestion without interpretation blocks dependent use | Interpretation is an agent activity, separate from read completion |
| CC-23 | Core: reports/proposals/inferences cannot silently become accepted rules | Owner authority must come from actual project policy |
| CC-24 | Core: accepted owner decision cited without rewriting baseline; Journey: existing batch decisions reused | No universal semantic decision extractor is claimed |
| CC-25 | Core: ambiguous claim rejected; Contracts: identical source-linked clarification disposition is idempotent; Journey: dependent hold/independent progress | Actual question delivery/deduplication in a host follows its retained conversation and workflow |
| CC-26 | Core: future release excluded; Contracts: future time/other environment excluded, applicable current replacement rejected; Journey: owner-corrected effective release | No inferred release mapping or invented owner clarification |
| CC-27 | Journey: source change blocks dependent action before invocation; Correction: new boundary cannot reuse old receipt | External source/app actions are not one atomic transaction |
| CC-28 | Contracts: change during actual synthetic checkpoint preserves effect/Partial and independent Pass; Recovery: actual reader ownership | Cannot revoke a completed external effect retroactively |
| CC-29 | Correction: one prepared boundary reuses actual reads; Journey: explicit fixture review/action counters and no routine-case review requests | Synthetic fixture prompt counters are not evidence of a real human signature or every harness UI |
| CC-30 | Core: omitted known source basis rejected; Remaining: source-dependent no-change close cannot omit new boundaries | An approved exclusion is distinct from an omitted source manifest |
| CC-31 | Remaining: local GitHub/remote dispatch pin before invocation; Live fixture: connected aggregate parity; Journey: checkpoint proof retained | Remote admission is not continuous Slack monitoring; actual remote product outcomes remain separate |
| CC-32 | Journey: missing regression blocks; separate regression failure gets Dev Todo/reviewed nonblocking disposition; no-change branch uses no invented fix; Remaining/Live fixture: current no-change closure/recovery | Synthetic acceptance of a residual risk is not real release approval |
| CC-33 | Correction: actual G5 read discovers upstream change despite valid earlier receipt; Journey: included fix and parent current assessment | Existing product-run results remain distinct from source currentness |
| CC-34 | Correction: post-G5 material edit rejects publication preparation; Journey: material replacement holds, actual owner correction/new scoped G5 precede handoff | Future-policy correction in the fixture restores the original current-release criteria; no failed result is edited into Pass |
| CC-35 | Core: original source/understanding evidence readable after changed intent | Purged source content may be unavailable under selected retention policy |
| CC-36 | Contracts: two permitted shared-store consumers retain channel filtering through removal of one consumer | Local shared filesystem only; no cross-machine coordination or universal retention inference |
| CC-37 | Core: stale preview CAS; Recovery: two processes plus actual head/progress and progress/completion crashes; Remaining: wrong request token cannot release reservation | Dead test locks are released only after observing the owned child's exit |
| CC-38 | Provider: lost join response requires readback, only one join | No implied invitation or rollback |
| CC-39 | Core/Provider: known credential patterns rejected/redacted; CLI catalog errors sanitized | Pattern checks are not a universal secret detector |
| CC-40 | Core: hostile Slack command remains source data, shell marker absent | No claim of general prompt-injection immunity |
| CC-41 | Core: only matching observed scheduler metadata accepted | No schedule is activated; real host scheduling needs actual readback |
| CC-42 | Provider: scheduled/different harness cannot inherit access | Actual unattended authorized Slack refresh not exercised |
| CC-43 | Core: removal/purge markers and historical retention; Contracts: revoked read holds only affected use | No provider message deletion or live OAuth revocation performed |
| CC-44 | Core: read-only status; Correction: repeated prepared boundary performs no new reads; Contracts: identical impact record causes no new file/version; Remaining: unchanged remote invocation not repeated | A different actual question/change needs its own recorded assessment; no unseen conversation behavior is claimed |

## Required correction acceptance

The [scoped refresh cases](../automation/tests/company-context-scoped-refresh.test.ts) supplement CC-08, CC-17, CC-29, CC-31 and CC-37: new independent boundary preparation performs actual scoped reads while unrelated work remains pending; provider method cooldowns cannot be evaded by new jobs/reinspection; older broad completion cannot regress newer coverage. Native callers receive the exact scoped job ID.

- RA-01: direct/local and connected source-dependent no-change closure reject absent/stale proof; unchanged scoped G5 plus post-decision read permits completion. Local and native observed moves retain missing-review conditions.
- RA-02: native public CLI returns page-two error/progress and resumes without page-one resubmission. Per-request reservations survive other requests/processes. Read-only unfinished-operation listing changes no selection or observation time.
- RA-03: before invocation, the actual operation references immutable reviewed basis, boundary, selection/connection snapshots, receipt history and completed reads. Renewal, uncertain response and recovery do not rewrite the original proof. No raw Slack content is passed to a workflow.
- Exact crash seam: with an already-prepared boundary, actual head writes before durable progress cannot certify eligibility; replay after committed progress preserves the original completion time.
- Combined journey: explicit synthetic reviews, superseding upstream decision, independent-case progress, confirmation/regression, separate regression bug, no-change branch, material post-G5 hold, owner correction/new scoped review and observed handoff. Counts are asserted in code and must be checked in actual results.
