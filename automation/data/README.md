# Read-only test-data preparation assessment

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
