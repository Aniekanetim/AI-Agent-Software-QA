# Verify cases during an approved batch

At G1, explain how the relevant feature works and identify the accepted requirements that establish the expected outcomes. At G2 or G4, show the cases, starting conditions, permitted actions and verdict criteria together. The reviewer can approve the entire batch in one decision. Routine case and checkpoint checks run under that decision.

## Record the reviewed interpretation and batch

Use JSON records with pinned evidence references of the form `{ path, sha256, pointer? }`. A full-record reference is required for the understanding, batch, decisions and execution receipt. The established product sources remain in Project Context. A workflow interpretation links to them and can also link the applicable Application Flow Map revision.

| Record | Required fields |
| --- | --- |
| Understanding | `schemaVersion: 1`, `assignment: { source, ticketId }`, `sources` and `flows` |
| Source | `id`, `authority` with the accepted source and section, `accepted` pinned snapshot, and `current` reference to the corresponding canonical content at review |
| Flow | `id`, `featureId`, `relationshipIds`, `actor`, `startingState`, `expectedFlow`, `criteria` as source IDs, and `map` / `currentMap` when using mapped relationships |
| Batch | `schemaVersion: 1`, `assignment`, `target: { environment, buildId }`, `understanding` reference and `cases` |
| Case | `id`, `flowId`, `checkId`, `conditionId`, `criteria`, `definition` reference, `dependsOn` case IDs, and ordered `checkpoints` with `id`, `action` and `expected`. The first checkpoint is `precondition` and describes a read-only observation. Include the reviewed `context` reference when a case relies on one. |

Keep immutable snapshots of accepted sources and map entries. The current reference has the same reviewed content hash and identifies where to detect later changes. JSON pointer references can limit invalidation to the applicable section. Use separate flows for independent interpretations. Add prerequisites where one case depends on state or evidence produced by another. Use matching `prerequisiteKeys` when cases share a starting condition across flows. An `invalid` or `needsReview` observation can identify the shared `prerequisite` to hold all dependent cases. Add conditions and checkpoints appropriate to the selected objective, including permitted exploration and where exploration stops.

Both G1 and the execution decision identify the same `assignment` and `understanding`. Retain the existing `gate`, actual `decision`, `reviewer`, `source`, and `packet`. G2 or G4 also links the G1 `scopeReview` and the approved `caseBatch`. A G4 covering confirmation and regression can list the distinct references in `caseBatches`. Use the connected claim's source key for `assignment.source`, or `local` for a local ticket. Preview the evidence with `cases validate` using `{ batch, approval }`.

## Execute and retain checkpoints

For a connected assignment, `task-source begin` creates the case journal using G2 or G4. Select `caseBatch` when the decision covers multiple batches. Keep the existing `fixBatch` selection for a registered retest. For a local assignment, use `cases start` with the local data preflight input and `caseExecution: { id, caseIds?, previous? }`. The local preflight binds the journal to the current ticket generation and verifies reviewed data. Both routes preserve the existing target and lifecycle checks.

1. Use `cases next --input` with `{ id, caseId, target }`, where `target` is the pinned current build observation. Follow the returned approved action only after a `ready` response. The first checkpoint confirms actual starting state before taking a dependent action.
2. Use `cases observe --input` with the execution `id`, `caseId`, returned `checkpoint` ID, actual `source`, and redacted `evidence` references. Set `outcome` to `matched`, `deviation`, `invalid`, `needsReview` or `interrupted`. A `needsReview` observation includes a shared `issue` ID and `detail` describing the observation and owner question.
3. Use `cases status --id` to inspect pending cases and grouped flow reviews. Settle connected runs with `task-source settle`. Use `cases finish --id` for local work. The settled journal is the case evidence reference.

A supported deviation under valid test conditions is **Fail**. A bad starting state blocks the case. A loss of validity after some work gives **Partial**. An uncertain action stays reserved until its actual outcome is observed. Preserve what happened before restarting a case. On resumption, select only unfinished or invalidated work, reverify the starting state, and reference the previous settled receipt. A material change needs the affected gate's revised interpretation and decision. Continue independent cases under their original authorization. Use the existing review procedure for deliberate retries of conclusive cases.

## Use scripted runners and CI

Project-owned scripts can call the same checkpoint commands or use the `runLocalCases` adapter from `automation/data/local.ts`. The adapter calls a project-supplied function with the reserved step and records its observation before advancing. It checks the current local ticket generation before every checkpoint. A UI, API or other harness supplies the actual state checks and assertion evidence.

GitHub regression policies carry `caseAuthorization: { batch, approval }` and pin their case definitions in `suiteEvidence`. The local runner receives `QA_CASE_EXECUTION_ID`, `QA_CASE_TARGET_PATH` and `QA_CASE_TARGET_SHA256`. Wire the command to the checkpoint adapter before approving it. For workflow dispatch, pin the receiver workflow in `dispatch.caseReceiver` and configure it to pass `qa_case_batch` to the receiving regression command as `--case-batch-digest`. The receiver also verifies its current canonical ticket and served target. A remote runner needs a project-supplied way to observe changes or stop at a supported boundary.

For a reviewed Postman invocation, supply `caseCheckpoint: { id, caseId, checkpoint }` and include the approved case definition in its input evidence. For WebMCP, use the same fields with `environment` and include the approved definition in its authorization references. Observe the actual result before advancing the case. A runner that only emits aggregate output can retain it as a run artifact. Use supported stop boundaries and record case results only for observations that have the required detail. No aggregate total, process exit or dispatch acknowledgement establishes a case verdict.

## Carry the evidence through findings and sign-off

At G3, identify the reviewed understanding, affected checks and any observed discrepancy. For a disputed flow, use `flowReviews` to flag the feature and relationship entries for review in the Application Flow Map, link the observation on the existing ticket and group questions for the responsible owner. Preserve the original intended and observed records. Owner-confirmed changes return to the applicable gate.

In a release round, pin `caseBatches` and link each conclusive observation to `caseExecution: { receipt, caseId }`. The receipt must match the target, approved case definition, check and condition, and checkpoint evidence for the outcome. G5 identifies the current `handoff.understandings` references and checks for changed sources or disputed flows. G4 fix plans link each case batch as `{ batchId, batch }` in `caseBatches`. A scoped G5 fix decision identifies the same `understanding`.

Existing results remain readable with their original evidence. For open work, bind the current batch at the next affected execution or sign-off review. An earlier run can supply evidence only where its actual checkpoints and the applicable interpretation can be verified. Keep missing coverage visible.
