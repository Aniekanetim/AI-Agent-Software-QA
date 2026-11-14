# Read-only test-data preparation assessment

Use [guided intake](intake.md) to inspect supplied files and register reviewed project datasets before preparing the data record.

The agent follows the [data preparation policy](../../QA%20Process%20Context/Test%20Data%20Management/preparation-policy.md), chooses suitable generation/preparation tools, performs authorized work and retains its canonical [record](../../QA%20Process%20Context/Test%20Data%20Management/data-preparation-record.md). This optional helper inspects a private projection of that record. It generates no values and changes no application state.

```shell
npm run qa -- data assess --input .local/data-preparation.json
```

## Record contract

| Object | Fields |
| --- | --- |
| Plan | `schemaVersion: 1`, `id`, `revision`, `task: Evidence`, `environment`, `build` string or `null`, nonempty `items` |
| Item | Unique `id`, nonempty `conditionIds`, `requiredState`, `kind`, `approach`, `classification`, `basis`, `authorization`, `preparation`, `stateVerification`, `identity`, `controls`, `blocker` |
| Kind / approach / classification | `localInput`, `applicationState`, `externalState` / `generate`, `create`, `reuse`, `supplied` / `synthetic`, `explicitlyPermitted` |
| Basis / authorization | Evidence arrays to actual state/input rules and applicable preparation authority. A local synthetic `generate` item can use existing task-preparation authority without a separate grant; other data access/state changes require their actual source |
| Preparation | `status`: `planned`, `prepared` or `blocked`; `method`; `dataReference` and `generationRules` (strings or `null`); `evidence: Evidence[]` |
| State verification | `status`: `notVerified` or `verified`; `dataReference`, `environment`, `build` (strings or `null`); `evidence: Evidence[]` |
| Identity | `mode`: `fresh`, `reuse` or `none`; `originalReference` string or `null` |
| Controls | Nonempty `isolation`, `concurrency`, `retention`, `cleanup` descriptions; state actual unknowns/limits |
| Blocker | `null`, or nonempty `reason`, `attempts`, `needed`, `owner`, `questionReference` for a blocked item |

Evidence uses `{path, sha256, pointer?}` from the existing evidence command and canonical local records. Remote sources are represented by their sourced local reference. Keep actual account secrets and sensitive values out of this projection and shared documents; record nonsecret/private dataset references instead. The helper rejects known secret patterns/fields, which does not replace redaction review.

## Interpret the assessment

`canPrepare` identifies supported planned preparation within the supplied scope; it is not a newly issued permission. `inputsPrepared` means local input references/evidence exist. Application/external state needs its separate matching observation before `stateVerified`. Unknown rule, permission, missing preparation/state evidence, stale sources and a specific blocked dependency remain visible per item. Another item's valid preparation remains visible when one item is blocked.

Continuation/reuse requires the exact original data reference. A claimed verified state must match prepared identity, environment/build and actual evidence. Undisclosed build identity remains a limitation. Records can preserve historical evidence; regenerate/review the projection after relevant changes instead of rewriting earlier results.

`preparedForReview` means all represented items meet these structural preparation checks; it is not execution approval or proof of state truth. Other outcomes exit 1 with affected items and next actions. The agent/reviewer must assess source meaning, permission scope, fidelity, current application state and data sufficiency. This helper cannot prove that a reference represents an actual human grant or that a declared local input has no external effect.

No product test, account creation, fixture seeding, cleanup, schedule or sign-off is run. Input bytes and prior records remain unchanged; `productVerdict` stays `Not assessed`. Unsupported schemas are preserved for explicit migration.

## Bind readiness to execution

Use the [dataset index](../../QA%20Process%20Context/Test%20Data%20Management/datasets/README.md) for supplied files. For a catalogue-backed item, set `dataset: { index, id, revision }`, where `index` is a full-file evidence reference to the selected index snapshot. The execution check verifies the selected entry's classification, allowed environment and declared file hashes. Use preparation evidence for the actual input and its applicability. For external datasets, retain the versioned storage reference and evidence of the authorized input actually prepared.

At G2, include a `dataScope` in the actual reviewed decision for each runnable batch of checks. At G4, the G2 and G4 decisions must carry the same scope for the retest batch. Link an immutable task/scope snapshot from the preparation plan. Capture the approved checks, conditions, and all data items in the plan that serve those conditions. For example:

```json
{
  "schemaVersion": 1,
  "mode": "required",
  "checks": [{ "id": "CONFIRM-REFUND", "conditionIds": ["COND-SETTLED"], "dataItemIds": ["DATA-1"] }],
  "plan": { "path": ".local/refund-plan.json", "sha256": "<actual full-file hash>" },
  "maxStateAgeMs": 900000
}
```

Use `mode: "none"` with the approved checks and empty `dataItemIds` for a data-independent batch. Omit `plan` and `maxStateAgeMs` in that mode. When some checks are blocked, use the existing ticket question and run only a separately approved independent batch. Existing records without `dataScope` remain readable under their original workflow.

For application and external state, the verified entry needs `observedAt` and `recheckAfter` with timezones. Choose a reviewed `maxStateAgeMs` that fits how quickly the state can change. Refresh immediately when relevant activity could have changed the state. An updated observation for the same identity and scope can use a separate hashed JSON record with `planSha256`, `itemId` and a complete `verification` object. Pass its reference in `dataObservations`. A change to the reviewed identity, source, target or check scope needs updated evidence and review.

- **Local board.** Run `npm run qa -- data preflight --input .local/data-preflight.json` before starting or resuming the reviewed checks. Supply `ticketId`, current `generation`, full `target` evidence, `gates: { G2, G4? }` and any `dataObservations`. The target record names `ticketId`, `generation`, `environment`, `buildId`, `observedAt` and `source`. Each private decision names the same ticket/generation, `gate`, actual `decision`, `reviewer`, `source`, `packet` evidence, `target: { environment, buildId }` and `dataScope`. Save or link the receipt with the run results.
- **Live board.** Pass observation references to [preflight and begin](../task-source/README.md#pick-up-a-live-task). Recheck before resumed work. The run journal retains the approved scope and checked data evidence.
- **GitHub regression.** Use [the reviewed policy and receiver contract](../github/README.md#data-aware-regression) when enabling data-aware runs or dispatch.

Use the receipt to report the inputs used and the starting state checked. The receipt records the structural and freshness checks on the supplied evidence. Keep the actual tool outcomes, QA verdict and owner decisions in their existing records.

A reviewed data scope names the check and condition of each selected case. This applies to explicit no-data decisions and reviewed subset execution as well as to full batches. Recheck the bound target and state evidence before running or resuming the affected checkpoint.
