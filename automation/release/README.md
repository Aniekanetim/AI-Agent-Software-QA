# Module test library and release evidence

Build, feature, and PR assignments use a current module assessment for G5 sign-off and handoff. Reuse the project's requirements, test cases, and regression inventory. Prepare the affected modules during normal QA work so a project can start with the context it already has. Individual defect retests use their scoped QA disposition and can link to the parent release.

## Maintain the library

Keep one versioned library JSON file with the project's testware. Use the application map's stable module or feature IDs where they apply. Link to existing requirements, suites, and case definitions, including manual checks and exploratory charters. The project names its test types and decides which apply to each module. A check may belong to suites in several modules or test types.

| Version 1 library field | Contents |
| --- | --- |
| `schemaVersion`, `projectId` | `1` and a stable project ID |
| `modules` | Entries with `id`, `name`, `conditionIds`, and `testTypeIds` |
| `testTypes` | Entries with `id` and `name`, such as functional, API, usability, accessibility, or performance |
| `conditions` | Entries with `id`, `description`, and `basis` evidence for the accepted requirement, criterion, or reviewed risk |
| `checks` | Entries with `id`, `name`, `definition` evidence, and `conditionIds` |
| `suites` | Entries with `id`, `moduleId`, `testTypeId`, and `checkIds` |

Git branches let the team review library edits. A round pins a full-file evidence reference to the library. Retain the referenced bytes and linked evidence at stable paths, or use a reproducible checkout or versioned snapshot that resolves those paths. Decide who retains the source records and who can retrieve them for a later review. Keep evidence that contains restricted material in the project's approved storage and reference redacted records in the assessment.

Use `npm run qa -- evidence --path <project-relative-path>` to obtain a reference with `path` and `sha256`. Library, round, run, and assessment references use full files. Individual requirement or check evidence can reference a supported JSON pointer. Place command inputs under ignored `.local/`.

```shell
npm run qa -- release library --input .local/library-reference.json
```

The input is the evidence reference itself. The result shows module, test type, suite, and check. Preserve stable IDs across renames. Add a new revision when intent or check definitions change, with the affected dependencies and retest decisions recorded in the reviewed scope.

## Pin the testing round

At G1, record the expected coverage before observing results. Identify the affected modules, shared journeys, applicable test types, required conditions, and exclusions or open questions. At G2, link the checks and bind the reviewed round to its assignment and exact target. Bring these details into the existing human briefings.

In the G1 record, pin the [release change manifest](../regression/README.md#carry-regression-into-release-sign-off) as `changeManifest`. Preview the reconciliation before briefing the reviewer. Binding rechecks membership, fix intake and coverage for the exact target. G5 rechecks those relationships and requires current test results.

| Version 1 round field | Contents |
| --- | --- |
| `schemaVersion`, `id` | `1` and the round ID |
| `library`, `scope`, `changes` | Evidence references for the pinned library, actual reviewed scope, and release change record |
| `target` | Observed `buildId` and `environment` |
| `assignmentIds`, `moduleIds` | Local or native assignment IDs and included module IDs |
| `obligations` | Entries with `id`, `moduleId`, `testTypeId`, `conditionId`, `state`, and `checkIds` |

Use `required`, `excluded`, or `unresolved` for obligation state. An exclusion needs a reason and the actual `decision` evidence. An unresolved obligation needs a reason. Both use an empty check list. Required obligations list the checks that must support that condition in the selected module and test type. A required obligation without checks appears as a gap. The report also flags any in-scope module condition or applicable test type with no scope decision. Record `exceptionAllowed: true` on a required obligation only when the reviewed release criteria allow an owner to accept that gap.

Use `assignment: { source, ticketId }` in the review records. For the local board, use `source: "local"` and the stable ticket ID. For a live board, use the claim's `sourceKey` and native `ticket.id`. Record the actual human `decision`, `reviewer`, `source`, and full evidence reference to the reviewed `packet` in both gate records.

| Review record | Fields that bind the scope |
| --- | --- |
| G1 | `gate: "G1"`, `assignment`, `library`, `modules`, and `obligations` from the reviewed coverage plan. Each obligation records its ID, module, type, condition, state, exception permission where applicable, and any already mandated `checkIds`. Use the G1 packet as the round's `scope`. |
| G2 | `gate: "G2"`, `assignment`, the exact `round` reference, and `scopeReview` referencing the G1 record. The pinned round includes all approved obligations and checks, including design choices finalized at G2. |

```shell
npm run qa -- release scope --input .local/assignment.json
npm run qa -- release preview-scope --input .local/draft-scope.json
npm run qa -- release bind-scope --input .local/approved-round.json
npm run qa -- release invalidate-scope --input .local/changed-round.json
```

`scope` takes the assignment object and returns the current binding and its revision. `preview-scope` takes `{ assignment, round, changeManifest }` with pinned draft references. `bind-scope` takes `{ assignment, expectedRevision, round, approval }`, where `approval` is the G2 evidence reference and the first `expectedRevision` is `null`. Use one binding per parent assignment. Several assignments can bind to the same round when their reviews cover it. On a material change, `invalidate-scope` takes `{ assignment, expectedRevision, observation }`. The observation JSON records the assignment, affected round reference, actual reason and source. Record the revised binding when its affected gate is approved. An old assessment can still be opened for historical review.

## Retain runs and assess the round

A version 1 run contains `id`, `round` evidence, `target`, `observedAt` with timezone, `targetEvidence`, and `observations`. The target observation JSON records `buildId`, `environment`, `observedAt`, and the actual `source`. Each observation identifies `checkId`, `conditionId`, `outcome`, and `evidence`. Use Pass, Fail, Partial, Blocked, or Not run. Retain a `note` for Partial, Blocked, and Not run. Link actual observations for Pass, Fail, and Partial. Match the tested build and environment to the pinned round.

Retain the original run before recording its retest. Use `previousRunId` to link to the earlier run for that check and condition in the same round. A conclusive linked retest can replace the earlier outcome in the current assessment. Both attempts remain visible. For a changed build or scope, pin a new round and link the earlier round and failure from its reviewed scope or change record. Reassess the obligations against the new build.

```shell
npm run qa -- release retain-run --input .local/round-and-run.json
npm run qa -- release runs --input .local/round-reference.json
npm run qa -- release assess --input .local/round-runs.json
npm run qa -- release record-assessment --input .local/round-runs.json
npm run qa -- release verify-assessment --input .local/assessment-reference.json
```

`retain-run` takes `{ round, run }` evidence references. `runs` takes `{ round }` and returns `{ round, runs }`, the input for both assessment commands. Register each run as you record its results. The recorded assessment requires the whole retained set and intact evidence. The report lists out-of-scope modules, ineligible runs, gaps, module and test-type views, and unique executed checks per run across all views. A preview can help investigate an ineligible run. `verify-assessment` takes the returned assessment evidence reference and reconstructs that historical assessment from its pinned inputs. Current G5 uses a fresh assessment after more runs are retained.

Use the assessment to prepare the G5 packet. The change record supplies release-note content. The current assessment supplies coverage and verification claims. The human reviewer supplies the scoped G5 decision. Missing scope decisions, unresolved obligations, and required gaps without an authorized exception block handoff. A round with zero executed checks cannot support positive QA sign-off. For eligible exceptions, record each `gapId`, risk `owner`, accepted `reason`, and actual `decision` evidence under G5 Approved with limits.

## Route a reviewed handoff

Reuse the authorized route in **Reporting and evidence preferences** when one is saved. A project can supply the recipient, destination, and acknowledgement requirement for a particular release during preparation. For `channel: "taskBoard"`, use the selected live board and native ticket URL. Sending a comment requires write authorization. For `channel: "recorded"`, name the actual authorized destination, such as the review conversation, and retain the delivery observation. Use `release route --ticket-url <native-url>` or `release route` to inspect a saved route. An unconfigured route means delivery details are needed for G5.

The G5 record includes the existing gate, decision, reviewer, source, and packet, plus the assessed `target` and `handoff: { assessment, route, targetObservation, exceptions? }`. The route has `channel`, `destination`, `recipient`, and boolean `acknowledgementRequired`. The pinned target observation JSON records the actual `buildId`, `environment`, zoned `observedAt` on or after the retained run observations, and `source`. Use a full hashed reference to the decision. A delivery or acknowledgement observation records `decisionSha256`, `recipient`, `destination`, actual `source`, and `state` of `delivered` or `accepted`, respectively.

- **Live board.** Preview the handoff comment with `purpose: "releaseHandoff"` and the assessment reference. Preview the Tested-Ok move with the same assessment. Include the fresh `boardInventory` in both proposals and the G5 handoff, and include the returned regression digest in G5. Add `route` to both proposals when there is no saved destination. The G5 decision covers the exact preview digests. Publish the reviewed comment first or retain delivery through the recorded channel. Then provide applicable delivery and acknowledgement references with the move. Reconcile uncertain writes against the actual native record. Close the claim with `disposition: "completed"` after confirmation. Use `released` with actual disposition evidence to release a claim and keep the assignment eligible for future work.
- **Human-managed live board.** Use `task-source observe-completion --input` with `{ id, claimId, decision, source, delivery, acknowledgement? }` after the human has delivered the approved handoff and the native ticket can be read at its single mapped Tested-Ok destination. Then close the claim with the actual disposition. This route also works for read-only board access.
- **Local board.** Use the recorded channel. The G5 decision binds the local `ticketId` and `ticketRevision`. Include `release: { decision, delivery, acknowledgement? }` on the Tested-Ok transition. The transition retains those evidence references in the ticket history.

## Upgrade open assignments

Use these requirements at the next G5 on open parent assignments. Link existing actual G1/G2 review, results and revisions wherever they establish the required scope and target. Review only missing or materially changed scope or evidence. Preserve completed historical records. Recover an interrupted board operation by its original ID. If a prepared local release move lacks valid current evidence and is still unapplied, recovery supersedes it and leaves the assignment in place. If the destination was already written, recovery retains the observed move and flags the ticket for release review. A new G5-backed transition can record verified closure in place after review. Direct folder and provider changes remain observable board events, and the QA workflow verifies their evidence before reporting completion.
