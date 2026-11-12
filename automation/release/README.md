# Module test library and release evidence

Use these helpers from an adopting QA project. Start with a pilot round and compare its assessment with your normal G5 review. Adopt a reporting route once the project can retain and retrieve the evidence the reviewer needs.

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

Prepare the approved scope with the assignment IDs, affected modules, and required conditions and check coverage. Include shared journeys and applicable nonfunctional checks. Use the project risk and requirement sources to review what applies, including documented exclusions and unresolved questions.

| Version 1 round field | Contents |
| --- | --- |
| `schemaVersion`, `id` | `1` and the round ID |
| `library`, `scope`, `changes` | Evidence references for the pinned library, actual reviewed scope, and release change record |
| `target` | Observed `buildId` and `environment` |
| `assignmentIds`, `moduleIds` | Local or native assignment IDs and included module IDs |
| `obligations` | Entries with `id`, `moduleId`, `testTypeId`, `conditionId`, `state`, and `checkIds` |

Use `required`, `excluded`, or `unresolved` for obligation state. An exclusion needs a reason and the actual `decision` evidence. An unresolved obligation needs a reason. Both use an empty check list. Required obligations list the checks that must support that condition in the selected module and test type. A required obligation without checks appears as a gap. The report also flags any in-scope module condition or applicable test type with no scope decision. Record `exceptionAllowed: true` on a required obligation only when the reviewed release criteria allow an owner to accept that gap.

## Retain runs and assess the round

A version 1 run contains `id`, `round` evidence, `target`, `observedAt` with timezone, `targetEvidence`, and `observations`. The target observation JSON records `buildId`, `environment`, `observedAt`, and the actual `source`. Each observation identifies `checkId`, `conditionId`, `outcome`, and `evidence`. Use Pass, Fail, Partial, Blocked, or Not run. Retain a `note` for Partial, Blocked, and Not run. Link actual observations for Pass, Fail, and Partial. Match the tested build and environment to the pinned round.

Use `previousRunId` to link a retest to the earlier run for that check and condition in the same round. A conclusive linked retest can replace the earlier outcome in the current assessment. Both attempts remain visible. For a changed build or scope, pin a new round and link the earlier round and failure from its reviewed scope or change record. Reassess the obligations against the new build.

```shell
npm run qa -- release retain-run --input .local/round-and-run.json
npm run qa -- release runs --input .local/round-reference.json
npm run qa -- release assess --input .local/round-runs.json
npm run qa -- release record-assessment --input .local/round-runs.json
npm run qa -- release verify-assessment --input .local/assessment-reference.json
```

`retain-run` takes `{ round, run }` evidence references. `runs` takes `{ round }` and returns `{ round, runs }`, the input for both assessment commands. Register each run as you record its results. The recorded assessment requires the whole retained set and intact evidence. The report lists out-of-scope modules, ineligible runs, gaps, module and test-type views, and unique executed checks per run across all views. A preview can help investigate an ineligible run. `verify-assessment` takes the returned assessment evidence reference and reconstructs that historical assessment from its pinned inputs. Current G5 uses a fresh assessment after more runs are retained.

Compare the assessment with the existing G5 packet and review the substance of the evidence. The change record supplies release-note content. The assessment supplies coverage and verification claims. The human reviewer supplies the scoped G5 decision. Missing scope decisions, unresolved obligations, and required gaps without an authorized exception block the managed handoff. For eligible exceptions, record each `gapId`, risk `owner`, accepted `reason`, and actual `decision` evidence under G5 Approved with limits.

## Route a reviewed handoff

In **Reporting and evidence preferences**, save `releaseHandoff` with `channel`, `recipient`, and the boolean `acknowledgementRequired`. For `channel: "taskBoard"`, use the selected live board and its native ticket. The task source must permit comments. For `channel: "recorded"`, specify the authorized `destination`, such as the review conversation, and retain an actual delivery observation. Use `release route --ticket-url <native-url>` for a board route or `release route` for a recorded channel.

The G5 record includes the existing gate, decision, reviewer, source, and packet, plus the assessed `target` and `handoff: { assessment, route, exceptions? }`. Copy the actual route returned by the helper. Use a full hashed reference to the decision. Include a delivery or acknowledgement observation where required with `decisionSha256`, `recipient`, `destination`, actual `source`, and `state` of `delivered` or `accepted`, respectively.

- **Live board.** Preview the handoff comment with `purpose: "releaseHandoff"` and the assessment reference. Preview the Tested-Ok move with that assessment too. The G5 decision covers the exact preview digests. Publish the reviewed comment first, or retain actual delivery through the recorded channel. Then provide applicable delivery and acknowledgement references with the move. Reconcile uncertain writes by inspecting the native record before retry. Close the claim with `disposition: "completed"` after the confirmed move. Use `released` with actual disposition evidence when releasing a claim without completing the assignment.
- **Local board.** Use the recorded channel. The G5 decision binds the local `ticketId` and `ticketRevision`. Include `release: { decision, delivery, acknowledgement? }` on the Tested-Ok transition. The transition retains those evidence references in the ticket history.

Projects begin with the existing workflow. Adding the release handoff preference enables these checks for assignment completion. A scoped defect retest can continue to link its parent release without requiring its own release assessment.
