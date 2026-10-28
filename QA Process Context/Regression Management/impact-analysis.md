# Change-impact briefing: <assignment and revision>

**Template — no impact, testing scope or approval is established.** Prepare this from the actual ticket, [Application Flow Map](../../Application%20Flow%20Map/README.md), product sources and [QA process context](../README.md). Link the completed briefing from the ticket; preserve the existing G1–G5 gates.

| Field | Actual value |
| --- | --- |
| Assignment / changed feature, rule, interface or component | <IDs and change description> |
| Map ID/revision / relevant feature and relationship IDs | <actual sources; gaps if unavailable> |
| Product-source/design/process revisions / observed target build | <separate identities; Unknown if undisclosed> |
| Author / accountable reviewer / checkpoint | <actual values; decision Pending> |

## Explain the candidate impact

| Relevant path and relationship IDs | What could propagate / applicable roles or conditions | Source authority, evidence and freshness | Risk / uncertainty |
| --- | --- | --- | --- |

Check prerequisites, consumers, shared components and relevant indirect dependencies. Explain direction and semantics; reachability alone does not select tests. A helper path is a candidate, not proof. Record missing/stale connections, truncation and no-path results as limits; consider broader regression where warranted.

## Propose concrete checks

| Case / charter and condition IDs | Action and expected outcome | Why selected / affected connection | Method, data and execution bounds |
| --- | --- | --- | --- |

Consider meaningful positive, negative, edge and exploratory checks across the task's quality objectives. Explain unchanged areas and excluded checks with rationale, residual risk and any owner decision required. Keep prepared tests distinct from actually exercised coverage. Link canonical suites/data/configuration rather than duplicate them.

## Human review and corrections

Present the full self-contained briefing in the conversation: changed behavior, each proposed check/pass criterion, rationale, alternatives, uncertainty and exact next authorization. Ask for the actual scoped decision. A map diagram or path list alone is insufficient. Capture accuracy, intended-policy confirmation and execution approval remain separate.

| Date / original question or proposal | Actual response and source | Correction / responsible intent owner | Source/map/test revision and affected next gate |
| --- | --- | --- | --- |

Retain history and unanswered questions; do not relabel an assumption as an accepted requirement. After execution, link actual conditions/paths exercised, results, defects and remaining gaps from the ticket and G5 packet. Product sign-off remains the existing reviewed decision.
