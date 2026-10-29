# API functional suite: <interface and target>

**Template — no requests have been executed.**

**Basis:** <contract/rule/criterion and source revision>. **API base URL:** <actual address>. **Target:** <build identity>. **Client:** <Postman or selected runner>. **Access:** <role and credential source; no secret values>.

**Discovery references:** <relevant OBS IDs/versions or None used; observed interfaces do not replace the accepted contract or test basis>.

| TC ID | Scenario | Test case | Preconditions | Steps | Test data | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| <stable ID> | <high-level behavior> | <specific request/business rule> | <starting record/auth state> | 1. Send <METHOD and full URL> using Payload A.<br>2. Read <exact endpoint or returned field>.<br>3. Confirm <business outcome>. | Payload A; <exact parameters/headers> | <status, relevant response and saved-state outcome> |

## Payload A

Replace this block with actual valid, formatted request JSON from the agreed contract. Define every path variable, query parameter, returned identifier and unit needed for reproduction. Identify full endpoints and methods at each step; do not assume the reviewer knows a collection's internal request names.

```json
{
  "replaceWithActualField": "replaceWithActualValue"
}
```

Where Postman reproduction is supplied, link the actual collection/environment and instructions for saving returned IDs. Do not claim a Postman execution unless it occurred. Record actual method/results separately per run and keep browser actions in the UI suite.

## Design and coverage links

Reference the applicable [QA process records](../../../QA%20Process%20Context/README.md) and their revisions. In the canonical matrix, link case IDs to condition/source/risk IDs, relevant positive/negative/edge perspectives, techniques and selection rationale. Link any charter separately. Shared metadata belongs in that reference rather than duplicate step/result columns. Record what was actually exercised in each run; a label is not another test.

## Application-map traceability

Reference applicable [Application Flow Map](../../../Application%20Flow%20Map/README.md) feature/relationship IDs, map revision and impact briefing, or an explicit gap. Keep relationship details in the map and steps/observations here. Record actual conditions/path segments exercised in results; inclusion in a plan or diagram is not execution evidence.

## Method and data preparation

Choose suitable tools for the required behavior/evidence using the [selection policy](../../../automation/tools/task-selection.md). Retain any explicit runner requirement. State required data/starting state and its source; the agent may generate synthetic inputs or establish authorized state using the [data policy](../../../QA%20Process%20Context/Test%20Data%20Management/preparation-policy.md). Verify actual preconditions and preserve exact continuation identities. Keep preparation steps separate from the action under test; list only genuine dependent blockers.
