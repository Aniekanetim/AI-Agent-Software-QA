# Read-only coverage assessment

The [QA coverage guide](../../QA%20Process%20Context/Coverage%20and%20Traceability/README.md) defines the measurements. Canonical records remain the project's matrix, cases/charters and actual results linked from board tickets. This optional helper checks a temporary JSON projection; it does not introduce another maintained reporting location.

```shell
npm run qa -- coverage assess --input .local/coverage-snapshot.json
```

Start from [the empty template](../../QA%20Process%20Context/Coverage%20and%20Traceability/coverage-snapshot.template.json). It represents planning with no project coverage. Never copy a synthetic execution or approval into it. Each snapshot selects one scope revision and one run; keep other attempts in their original records.

| Field | Required content |
| --- | --- |
| `schemaVersion` | `1`; unsupported versions are rejected without rewriting files |
| `scopeId`, `scopeRevision`, `targetBuild` | Actual scope/revision and build string; `null` build means undisclosed |
| `sourceRecords` | Evidence references `{path, sha256, pointer?}` to canonical matrix, applicable sources and result records; execution requires references |
| `conditions` | Unique `{id, group, basisId, basisState, definition, applicability, reason?}` entries |
| Condition states | `basisState`: `accepted`, `risk` or `unresolved`; `applicability`: `included`, `excluded` or `notApplicable`; exclusions/non-applicability require a reason and decision reference |
| `checks` | Unique `{id, conditionIds, interface, objectives, perspectives, techniques, rationale}` entries; arrays contain unique strings, linked conditions must be included |
| `perspectives` | Zero or more of `positive`, `negative`, `edge`; techniques and charter IDs describe exploration/creative design |
| `execution` | `null` for planning, or `{runId, observedAt, scopeRevision, targetBuild, results}`; time includes timezone |
| Result | `{checkId, outcome, exercisedConditionIds, evidence, note?}` for one actual observation per check in the selected run |
| Outcome | `Pass`, `Fail`, `Partial`, `Blocked`, `Not run`; absent results are Not run |

Use a stable condition ID once per scope. Give each condition one explicitly defined measurement group. A case may protect several groups, objectives or perspectives; its execution count remains one. Incompatible group percentages must not become an overall quality score. A passing check exercises all its linked conditions; partial work records only the actual subset. Failures still exercise conditions. Blocked/unexecuted checks exercise none. Partial, Blocked and Not run require an explanation. Pass/Fail with unresolved intent is rejected; retain authorized observations as Partial while asking the owner.

The output separates `recordedCounts` from `currentCoverage`. Changed source/evidence hashes or scope/build mismatch produce `needsReview` and `currentCoverage: null`, preserving historical counts for investigation. An undisclosed build is labelled and cannot establish exact-revision verification. An empty denominator returns `null` percent. A failure is not converted to a pass: product verdict is always `Not assessed` because the agent/reviewer must evaluate the actual evidence and criteria.

The helper does not parse the semantics of Markdown rows, prove a requirement accepted, identify a human reviewer, execute tests or ensure supplied snapshots faithfully transcribe the canonical records. Inspect the source links and projection before relying on counts. File hashes establish referenced bytes, not truth. CLI input must be ignored/private, contains no secrets and is not saved or repaired by this command. It creates no report, ticket or schedule.
