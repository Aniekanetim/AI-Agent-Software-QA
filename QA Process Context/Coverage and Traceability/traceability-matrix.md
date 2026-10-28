# Coverage and requirements traceability: <scope ID>

**Template — no project scope or execution is established.** Copy into a named project register or link an existing canonical matrix. Apply the [coverage definitions](README.md).

| Field | Actual value |
| --- | --- |
| Scope ID / revision / state / owner / maintainer | <values> |
| Assignment / approved plan and review | <references; Pending if undecided> |
| Product-source IDs/revisions / process and design references | <actual references, independently of served build> |
| Coverage unit / denominator / grouping / sampling | <defined items and limits; do not mix incompatible units> |
| Selected run / build / environment / case revisions | <actual identity or No execution; Unknown build when undisclosed> |

## Basis and conditions

| Condition ID | Requirement, criterion, risk or question ID and source revision | Basis state | Coverage item / objective / relevant interface | Included, excluded or not applicable | Reason / owner decision or open question |
| --- | --- | --- | --- | --- | --- |

Basis state distinguishes Accepted expectation, Risk investigation and Unresolved intent. Risks can guide investigation, but a correctness Pass/Fail still needs an applicable evaluation basis. Link an unresolved question on its original ticket rather than manufacture a requirement. Keep excluded/not-applicable items visible; do not remove them to improve percentages.

## Design links

| Case / charter ID and revision | Condition IDs | Positive / negative / edge perspectives | Technique and selection rationale | Canonical case / charter |
| --- | --- | --- | --- | --- |

Use the same stable case ID across labels and interfaces. A charter records actual paths after exploration; do not claim all linked conditions were exercised when only part of the charter ran.

## Execution links and gaps

| Run / actual build and environment | Case / charter ID | Actually exercised condition IDs | Outcome | Canonical result / evidence | Gap / next action and owner |
| --- | --- | --- | --- | --- | --- |

Select a specific run for each summary; do not silently merge old and new builds or erase failed attempts. Derive outcomes from the linked actual results. Keep designed coverage, exercised items, outcome totals and original-versus-retest runs distinct. Mark affected current claims Needs review after a source/build change, preserving the prior claim and its basis.

## Change history

| Date / revision | Trigger and original question or task | Affected IDs | Impact decision / required review or retest | Actual owner response / references |
| --- | --- | --- | --- | --- |
