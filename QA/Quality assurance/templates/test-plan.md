# Test plan: <assignment ID and objective>

**Template — not an approved plan or execution record.** Replace fields with supplied facts. Link this plan from its board ticket.

| Field | Value |
| --- | --- |
| Assignment / plan revision / author / date | <values> |
| Testing objective and types | <UI, API, usability, performance, accessibility, security or combination> |
| Target build and environment | <exact identity and location> |
| Test basis | <source sections, context/design revisions, rule/criterion IDs> |
| Discovery references | <OBS IDs/entry versions and request, or None used; observations are not requirement authority> |
| Human reviewer and current gate | <reviewer; G1/G2; Pending unless decided> |

## Scope and risk selection

State the user/business risk, in-scope behavior, exclusions, entry/exit criteria, assumptions and missing information. Rank plausible failure areas by impact, likelihood/uncertainty and effort. Explain why these checks were selected and what reasonable alternatives remain uncovered. Use the number of cases the objective needs; do not inherit another assessment's minimum.

## Proposed checks

| Case / check | Action or condition | Observable pass criterion | Why selected / requirement | Method |
| --- | --- | --- | --- | --- |

Link the actual suites for concrete inputs and numbered steps. Distinguish technical preparation from the action being tested. Non-functional work needs named criteria, workload/measurement or inspection method, and limits.

## Readiness and execution bounds

Record tool/script/assertion checks, target identity verification, access, isolated data, working directories/commands, expected duration/resource limits and stop conditions. Identify any rerun policy; do not silently retry a failed observation until green. Tool availability does not prove readiness of the test oracle.

## Review request and record

Present the complete self-contained briefing in the conversation before requesting a decision. State exact allowed next work and exclusions. Record the actual reply, scope/build/plan revision and reviewed evidence in a [review record](review-record.md). Do not pre-fill approval. A material change returns to the affected gate.

## Project process and design basis

Link applicable [QA Process Context](../../../QA%20Process%20Context/README.md) strategy/risk, coverage, data/configuration and regression records with revisions and actual owners. Identify coverage items and denominator before execution. Explain the chosen interface/objective, techniques and relevant positive/negative/edge challenges. Link bounded exploratory charters for additional questions; no perspective or technique quota applies. Missing intent remains an original owner question; proposed checks cannot establish their own expected behavior.
