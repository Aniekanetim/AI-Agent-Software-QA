# Coverage and traceability

Coverage means how much of a defined set of items was actually exercised. First identify the agreed scope, its sources and its coverage items. A requirement with one happy-path case is not automatically fully covered. Planned cases, execution outcomes and product readiness are separate measures.

Use the [matrix template](traceability-matrix.md) as the canonical project register, or link the team's existing equivalent. Keep rules in [human context](../../Project%20Context/README.md), actual results in their existing records and defects on the board. Link by stable ID and revision rather than copy their content.

## Define coverage for the objective

| Objective or interface | Candidate coverage items; tailor to the task |
| --- | --- |
| UI/functionality | Rules, journeys, decisions, roles, states and boundary conditions |
| API | Operations, contract conditions, permissions, invalid inputs, failure responses and interactions |
| Accessibility | Applicable criteria across the defined pages/components/states and complete journeys; record sampling and automated/manual methods |
| Performance | Critical transactions, workloads, duration, conditions and agreed targets; exercise a workload before claiming its coverage |
| Usability | Target users, tasks, evaluation questions and method; expert inspection is distinct from representative-user research |
| Security | Applicable threats, controls, roles and attack surfaces within explicit testing limits |

Extend this list when work requires it. Positive, negative and edge perspectives can apply across these areas. Record selected techniques and exploratory questions. One case can have multiple labels; count its execution once. A group-specific view may overlap another view: do not add overlapping totals or average unrelated percentages.

## Separate design, exercise and outcome

- **Included items:** the current agreed denominator, identified by stable condition ID. List exclusions and non-applicability separately with reasons, owner and decision reference. Unknown applicability remains a gap.
- **Designed items:** included items addressed by at least one case/charter. This measures preparation, not execution.
- **Exercised items:** distinct included IDs actually investigated in the specified run, supported by observations. A failed check can exercise a condition; a blocked or unexecuted check cannot be counted merely because it was planned.
- **Outcomes:** unique cases with Pass, Fail, Partial, Blocked or Not run. Partial retains exactly which conditions were exercised. A session completion is not automatically Pass.
- **Freshness:** record scope, source, testware, data/configuration and served identities. Changed references need impact review; old results remain historical. An undisclosed build cannot support exact-revision verification.

If useful, calculate exercised coverage as distinct included items exercised / distinct included items. A zero denominator is Not applicable or undefined, not 100%. Missing requirements and unknown inventory limit the claim even when identified items are all exercised. No percentage guarantees absence of defects or exhaustive testing.

## Optional read-only consistency helper

Prepare a temporary snapshot from the canonical matrix and linked results using [the JSON template](coverage-snapshot.template.json). Store it under ignored `.local/` and run:

```shell
npm run qa -- coverage assess --input .local/coverage-snapshot.json
```

List `sourceRecords` as actual local evidence references to the canonical matrix, applicable sources and result records; use `npm run qa -- evidence --path "<project-relative-file>"` to calculate them. Preserve source IDs/revisions and gaps in the matrix. Snapshot fields are described by the example's empty structure and [the helper guide](../../automation/coverage/README.md). The helper checks IDs, links within the snapshot, evidence references, scoped counts and changed scope/build. It does not read a document's meaning, authenticate an approval or verify application behavior. Regenerate a snapshot only from actual records and review differences; do not edit it to make results pass.

The snapshot is an input projection, not a second maintained RTM. The helper writes no report or shared state, runs no product tests and always leaves the product verdict Not assessed. `needsReview` prevents its historical counts from being presented as current coverage. Default package fixtures never create a live matrix or outcomes.

For accessibility evaluation, consult [W3C's scope and sampling guidance](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/). General traceability, metrics and configuration principles are described in [ISTQB CTFL](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf). Our measurements still require a project-specific, reviewed basis.

## Map links and actual exercise

Link [Application Flow Map](../../Application%20Flow%20Map/README.md) feature/relationship IDs and revision to relevant conditions/cases/charters. A path considered during impact analysis is not yet exercised coverage. Actual runs identify the conditions/path segments investigated and supporting evidence. Missing map areas stay explicit gaps. Keep canonical matrix/results and map facts in their own locations; never count one multiply-labelled or multiply-linked case several times.
