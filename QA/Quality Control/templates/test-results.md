# Test results: <target, testing type and run ID>

**Template — no execution record exists yet.** Replace the fields and record only actual observations.

| Run field | Actual value |
| --- | --- |
| Assignment / suite revision | <ticket link and suite source version> |
| Execution date/time and timezone | <actual values> |
| Executor and method | <AI/tool execution or named human action, accurately distinguished> |
| Target and environment | <served build identity, normal browser or API URL as applicable> |
| Context/design/criterion basis | <applicable versions and IDs> |
| Discovery references | <OBS IDs/entry versions or None used; separate from the human test basis> |
| Test data identity / controls | <isolated data, relevant fixture/fault control> |
| Tool configuration | <actual browser/client/runtime, workers/retries/workload where relevant> |

| TC ID | Scenario | Test case | Preconditions | Steps | Test data | Expected result | Actual result | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <stable ID> | <high-level behavior> | <specific check> | <starting state> | 1. <channel-specific action><br>2. <checkpoint> | <relevant exact inputs or formatted payload reference> | <unchanged applicable expectation> | <what was actually observed, with relevant values/record IDs> | <Not run / Pass / Fail / Blocked / Partial> |

## Findings and limits

Link each observed failure to its bug ticket and supporting evidence. Record harness/setup errors separately when they prevent a valid product verdict. State skipped/unexecuted coverage and why; do not count preparation probes as additional cases. Summarize counts from actual rows only.

## Retest

Retain original failure evidence and append or link a distinct corrected-build run with its identity/date. Show the original failure check, relevant regression and observed outcome. Keep human confirmation and scoped handoff decisions in their review records, separately from agent execution.

## Coverage for this run

Link the canonical [coverage matrix](../../../QA%20Process%20Context/Coverage%20and%20Traceability/traceability-matrix.md), its scope/revision, selected run and actual evidence. Identify condition IDs actually exercised, designed-but-unexecuted work, exclusions and unresolved intent. Record data/configuration and process references separately from build identity. Count unique cases once despite multiple labels; Partial requires the actual subset and reason. A failed case may exercise coverage without meeting its expected outcome. Do not merge different runs/builds into current coverage or convert an undisclosed build into exact-revision verification.

## Application-map traceability

Reference applicable [Application Flow Map](../../../Application%20Flow%20Map/README.md) feature/relationship IDs, map revision and impact briefing, or an explicit gap. Keep relationship details in the map and steps/observations here. Record actual conditions/path segments exercised in results; inclusion in a plan or diagram is not execution evidence.
