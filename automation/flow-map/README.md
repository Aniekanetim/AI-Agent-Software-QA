# Read-only map validation and tracing

The [Application Flow Map](../../Application%20Flow%20Map/README.md) keeps the canonical feature inventory and relationship register in Markdown. This optional helper reads a temporary JSON projection; it does not crawl an application, maintain another map, select final tests or run them.

```shell
npm run qa -- flow-map validate --input .local/map-snapshot.json
npm run qa -- flow-map trace --input .local/map-snapshot.json --features FTR-001 --direction both --max-depth 8
```

Start from the [empty snapshot template](../../Application%20Flow%20Map/map-snapshot.template.json). It establishes no application knowledge. Replace values only from actual canonical records. Inputs remain ignored/private, while original map records and sanitized evidence remain in their approved locations. Use `npm run qa -- evidence --path "<project-relative-file>"` for `{path, sha256, pointer?}` evidence references.

## Snapshot contract

| Record | Fields |
| --- | --- |
| Map | `schemaVersion: 1`, `mapId`, `revision`, `targetBuild` (string or `null`), `sourceRecords`, `features`, `relationships`, `testLinks` |
| Source records | Evidence references to canonical inventory/register and applicable sources; required for any populated projection |
| Feature | `id`, `name`, `kind` (`feature`, `component`, `external`), `state` (`active`, `retired`), optional `replacementId`, `references`, `testLinkIds`, `gaps` |
| Test link | Unique `id`, `kind` (`requirement`, `risk`, `condition`, `check`, `charter`), `reference` to the canonical record |
| Relationship | Unique `id`, `from`, `to`, `type`, `state` (`active`, `needsReview`, `retired`), optional `replacementId`, `transfer`, `applicability`, `recovery`, `intended`, `observed`, `inference`, `discrepancy`, `gaps`, `refreshWhen`, `testLinkIds` |
| Relationship types | `navigation`, `prerequisite`, `data`, `state`, `permission`, `request`, `event`, `sharedDependency`; direction is the one declared in the register |
| Intended | `{state: "accepted" / "proposed" / "unknown", references: Evidence[]}`; accepted intent requires an actual source |
| Observed | `{state: "observed" / "notObserved" / "unknown", evidence: Evidence[], environment, build, observedAt}`; environment/build/time are explicit `null` when unknown; non-unknown observations require evidence, environment and a timezone-bearing timestamp |
| Uncertainty | `inference` and `discrepancy` are a supported description or `null`; `gaps` is an array of concrete unknowns; applicability/recovery/refresh conditions are required descriptions, including explicit unknowns |

ID namespaces must not collide. Arrays of IDs/gaps contain unique nonempty strings. Feature/relationship replacements refer to the same record kind; preserve retired entries, prohibit replacement cycles and review active edges into retired features. Runtime cycles are valid and tracing terminates safely.

The helper does not interpret conditions such as role, configuration or timing. It returns them for the agent/reviewer to assess; unknown or apparently mismatching conditions are never silently filtered out. Not-observed relationships remain candidates with uncertainty, not evidence of absence or a confirmed defect.

## Interpret validation and tracing

Validation reports `unconfigured`, `recorded` or `needsReview`. Missing/changed evidence, explicit Needs review, stated discrepancies and observed-build mismatch identify affected records. Undisclosed target identity remains a limitation. Hashes check bytes, not source truth, human identity or an accepted requirement's meaning. For a remote source, reference its local canonical source record retaining the original URL, revision and owner; the helper does not fetch the remote source or establish that it is current.

Trace direction defaults to `both`. It runs separate upstream and downstream walks from each changed feature and never reverses direction mid-path. This avoids claiming every co-producer is affected merely because it shares a consumer. The result includes unique candidate features/relationships/test links and one representative path per feature, changed seed and direction. Other encountered edges, including cycles, remain in the selected relationships; this is not enumeration of every possible execution path.

`--max-depth` defaults to 8, accepts 1–32 and reports truncation. Missing/retired seeds are rejected, not treated as no impact. Limits are 100 seeds, 2,000 features and 10,000 relationships/test links per snapshot. Use explicitly scoped area projections with documented boundary gaps for larger maps. A no-path result does not establish independence.

`recordedCandidates` preserves supplied historical context. `currentCandidates` is `null` when a selected/global source needs review or traversal is truncated. An unrelated stale entry remains visible in the assessment without automatically invalidating an independent selection. Candidate output still needs semantic/risk review and the [impact briefing](../../QA%20Process%20Context/Regression%20Management/impact-analysis.md). Relevant uncertainty may justify broader regression even when structural validation succeeds.

The CLI exits 1 for validation Needs review, relevant trace review/truncation or malformed inputs; otherwise 0 means the requested structural operation completed. **`productVerdict` always remains `Not assessed`.** Input files, onboarding answers, canonical maps and human decisions are never written by these commands. Old/unsupported schemas are rejected for explicit migration. Regenerate a snapshot from actual records after impact review; changing a snapshot does not repair a missing requirement or observed failure.
