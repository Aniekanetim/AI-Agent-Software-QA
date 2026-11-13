# Post-fix verification and regression

Every product fix follows the Retest workflow. Confirm the original defect on the fixed build and account for the required regression checks before closing the defect. Use the existing QA queues, reviews and test runners.

## Register the fix and review coverage

At Retest pickup, read the developer's response, the original defect and the relevant product context. Observe the actual served build and establish which revision it includes. Record a version 1 intake with `defect: { source, ticketId }`, optional `parent` in the same format, `fixRevision`, `target: { buildId, environment }`, and evidence references for `defectReport`, `developerResponse`, and `targetObservation`. The target observation JSON contains the target fields, fix revision, zoned `observedAt`, and actual `source`. Use `source: "local"` for folder tickets and the live claim's `sourceKey` for native tickets.

```shell
npm run qa -- regression register --input .local/fix-intake-input.json
npm run qa -- regression status --fix <fix-key>
npm run qa -- regression approve-plan --input .local/fix-plan-input.json
```

`register` takes `{ intake, supersedes? }`. Repeated check-ins resume the same fix. Supply the previous fix key as `supersedes` when the fix revision or build changes in the same environment. The prior assessment remains readable and its evidence can be considered for explicit reuse where the actual target and case context still match.

Prepare the version 1 plan with `fix`, the pinned module `library`, `policy` and `impact` references, `coverage` (`targeted` or `full`), a selection `rationale`, and `batches`. Each batch has a stable `id`, `phase` (`confirmation` or `regression`), and `checks` with distinct `checkId`, `conditionId`, and `context` evidence. Context describes the relevant role, configuration, test data and starting state. Include any applicable method or environment constraints.

When the original reproduction is already in the baseline suite, count it once under confirmation. Include separate regression checks for other behavior.

- The reviewed policy JSON identifies the pinned `library`, the `critical` cross-module baseline, and the `full` suite when broader regression is required. Lists contain check and condition pairs.
- The impact JSON identifies the `fix`, `affected` check and condition pairs, and whether `broaderRequired` applies. Use the [change-impact briefing](../../QA%20Process%20Context/Regression%20Management/impact-analysis.md) for sources, dependencies and uncertainty.
- At G4, brief the reviewer on the confirmation and regression batches and record the actual scope and authorization. The JSON includes `gate`, `decision`, `reviewer`, `source`, `packet`, `assignment` (the defect), `target`, `fixPlan`, and `defectReport`. For a live claim, include the existing `claimId` and `ticketRevision`. Pass `{ fix, plan, approval, previousPlan? }` to `approve-plan` with the actual G4 reference.

## Run the checks and retain observations

Execute confirmation against the actual fixed target. For live execution use the existing `task-source preflight` and `begin` inputs with `fixBatch: { fix, batchId }`. The two phases can use one matching G4 decision. If confirmation fails, retain the evidence and [review the return to Rework](#return-the-original-failure-to-rework). If confirmation passes, continue the approved regression batches. `regression status`, local `board status`, and live `task-source check-in` show pending evidence.

Use the applicable approved manual, scripted, or CI runner. A project can capture the results in a scoped [release run](../release/README.md#retain-runs-and-assess-the-round), with a separate round for standalone fix work or the parent round when it already includes the checks. Each reusable observation includes its actual `context` evidence. Register the source once with `release retain-run`, then use:

```shell
npm run qa -- regression retain-results --input .local/fix-results-input.json
```

The input is `{ fix, plan, batchId, round, run }`, with pinned references for the plan, source round and retained run. Match the observed build, environment, library check definition, condition basis and test context. Several fixes can link the same observed CI result. The fix assessment reads matching attempts from each linked round, so a later compatible failure can reopen review. Revised plans reuse compatible linked evidence. Reconcile uncertain execution before retry. For a deliberate rerun, record the batch's `retryReason` in a renewed G4 plan and link the resulting observation to the earlier attempt with `previousRunId`.

## Return the original failure to Rework

Review the actual failure of the original reproduction on the current fix and target. Record G3 with `gate: "G3"`, `decision`, `reviewer`, `source`, `packet`, the defect `assignment`, its `ticketRevision`, the observed `target`, and `rework: { fix, assessmentDigest }` from the failed assessment. A passing confirmation with pending regression stays in Retest. If deferred, resume it in Retest. Open a separate Dev Todo ticket for a distinct regression.

- Every local move to Rework, including reactivation, uses `rework: { fix, review }`, with the G3 reference for the current ticket revision. Reuse the recorded failure if it still applies.
- Native Rework preview and publication take `failedFix` with the fix key. Include the `claimId` and exact `publicationDigest` in G3 for a tool-managed move. Use `failedFix` with `task-source observe-completion` when a human moves the ticket.
- For interrupted moves, reconcile the observed destination and retained review. A move already applied can be recorded with a review-required flag when its evidence is stale. Review the current evidence before treating the handoff as complete.

## Review and close the defect

After confirmation passes and the regression outcomes are accounted for, prepare the scoped G5 decision. Include `gate: "G5"`, `decision`, `reviewer`, `source`, `packet`, `fix`, `ticketRevision`, `assessmentDigest` from `regression status`, the reobserved `targetObservation`, and `findings`. For each regression failure, record its check and condition IDs, the separate `ticket`, reviewed `impact` (`blocking` or `nonblocking`), and `evidence`. The evidence JSON identifies the originating `fix`, separate `ticket`, observed `destination: "Dev Todo"`, and actual `source`. Keep the original fix outcome and the parent release decision distinct.

```shell
npm run qa -- regression record-review --input .local/fix-review-input.json
```

`record-review` takes `{ fix, review }` and requires the current G4 plan with confirmation and regression case batches. Historical review records remain readable. Reuse matching checkpoint evidence for an updated open plan and run any missing checks. A local Tested-Ok move includes `defect: { fix }`. A live preview and move use the existing G4 `defect` reference and `completion: { fix }`. The publication's G5 decision links the recorded scoped decision as `fixReview`. For a human-managed board, use the same `defect` and `completion` with `task-source observe-completion` after readback. The actual move and QA verification have separate evidence.

For a refutation that genuinely requires no product change, retain the requirements owner's decision and reviewed QA disposition. The local move uses `defect: { refutation }`; the native move uses `completion: { refutation }` and binds the same reference as `fixReview`. The pinned refutation includes G5 Approved, assignment, ticket revision, reviewer, source, original defect report, and `ownerDecision`. The pinned owner decision identifies the assignment, `decision: "noProductChange"`, and actual source.

## Carry regression into release sign-off

At G1, pin the independent `changeManifest` from the actual release change record. Its JSON contains `assignment`, `target`, the round's `changes` reference, `fixes` as defect/fix-revision pairs, `policy`, `coverage`, and `affected` check and condition pairs. Run `release preview-scope --input` with `{ assignment, round, changeManifest }` to reconcile the draft scope against the board and fix ledger before briefing the reviewer. Binding repeats the check. Included fixes need an observed intake for that build. Their test outcomes can still be pending. Include critical and affected checks in the parent round for feature and PR assignments too.

- Keep the local defect's stable parent ID in its `Parent assignment` row. On a connected board, use `Parent assignment: <native ticket ID or URL>` in the child description. Defects created by the helper already record an `Originating QA ticket` link. If a regression is found while retesting another defect, link its parent assignment explicitly when it affects that release.
- Resolve a linked defect for the exact release target. Include its fix and regression evidence when deployed in that build. For a reviewed exclusion, add a pinned reference to `exclusions`. The record includes `assignment`, `defect`, `target`, `reason`, `reviewer`, `source`, and supporting `evidence`.
- Connected-board views can filter out tickets. Include `boardInventory` in the manifest, even when the authoritative inventory is empty. The pinned record includes `assignment`, `target`, all `linkedTicketIds` for the assignment (including linked defects outside the release build), zoned `observedAt`, responsible `owner`, actual `source`, and `evidence` from a source that covers tickets outside the selected board view. Use a verified unfiltered provider export or a complete record confirmed by the responsible owner.
- For an inventory entry whose ticket or parent link is hidden, add its pinned readback to the inventory's `boardReadbacks`. Each readback includes `assignment`, `defect`, `target`, observed ticket `revision`, `linked`, actual `source`, and `evidence`. At G5 include zoned `observedAt` between the G5 target observation and the refreshed inventory. If the complete inventory or an applicable readback is unavailable, keep the affected gate open.

Link previously blocking regression tickets to their included verified fix or add `findingDispositions` evidence to the manifest. Each disposition records the `ticket`, release `target`, actual `owner` and `source`, `evidence` of the review, and the `decision` (`resolved` or `acceptedNonblocking`). An accepted nonblocking disposition is a release limit.

Use `regression release --input` with the assignment object to prepare the current evidence for G5. For a connected board, add `boardInventory` with a fresh authoritative inventory and any required readbacks. Its observation must be later than the scope inventory and at or after the G5 target observation. If the linked IDs changed, review the affected scope again. The helper verifies each included fix on the exact target and reports unresolved blocking findings.

Record the returned digest as `handoff.regressionDigest` for every parent release, including a local release with no linked fixes. The digest binds the current G1/G2 scope, exact change manifest and reconciliation. If that evidence changes, renew the affected G5 review. For connected boards, also set `handoff.boardInventory` to the reference used for the reviewed reconciliation and publication previews. A connected-board action needs a separate [current inventory recheck](../release/README.md#recheck-a-connected-board-at-publication-and-closure). Review accepted nonblocking findings under Approved with limits. Release notes link to actual results and any limits.

## Upgrade open work

Apply this procedure to open fixes and releases at their next review. Reuse traceable prior outcomes and inspect interrupted work before retry. Older prepared Rework or G5 moves with missing or stale proof need reconciliation. Preserve completed historical tickets and approvals. Update the current check-in instructions through the existing adoption process so agents can surface the new checkpoints. Product-specific scope and approvals belong to each project.
