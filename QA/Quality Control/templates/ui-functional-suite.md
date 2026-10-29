# UI functional suite: <feature and target>

**Template — no test cases have been executed.**

**Basis:** <source/criterion IDs and context/design revision>. **Target:** <build identity and normal browser URL>. **Setup:** <required UI-visible data/account state or separate preparation reference>.

**Discovery references:** <relevant OBS IDs/versions or None used; journeys inform setup, while expected behavior comes from the agreed human test basis>.

| TC ID | Scenario | Test case | Preconditions | Steps | Test data | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| <stable ID> | <high-level behavior> | <specific behavior being checked> | <starting UI/data/account state> | 1. <browser action><br>2. <action><br>3. <observable checkpoint> | <exact relevant values> | <observable outcome and persistence/recovery where relevant> |

Use plain feature names and numbered actions. Do not assume a previously prepared example or shared chat context. Keep Postman imports and API request execution out of UI reproduction steps/preconditions. Link a separate technical setup note when data preparation is required.

Record actual outcomes separately for each run/build using the result template; do not edit expected behavior to match a faulty response.

## Design and coverage links

Reference the applicable [QA process records](../../../QA%20Process%20Context/README.md) and their revisions. In the canonical matrix, link case IDs to condition/source/risk IDs, relevant positive/negative/edge perspectives, techniques and selection rationale. Link any charter separately. Shared metadata belongs in that reference rather than duplicate step/result columns. Record what was actually exercised in each run; a label is not another test.

## Application-map traceability

Reference applicable [Application Flow Map](../../../Application%20Flow%20Map/README.md) feature/relationship IDs, map revision and impact briefing, or an explicit gap. Keep relationship details in the map and steps/observations here. Record actual conditions/path segments exercised in results; inclusion in a plan or diagram is not execution evidence.

## Method and data preparation

Choose suitable tools for the required behavior/evidence using the [selection policy](../../../automation/tools/task-selection.md). Retain any explicit runner requirement. State required data/starting state and its source; the agent may generate synthetic inputs or establish authorized state using the [data policy](../../../QA%20Process%20Context/Test%20Data%20Management/preparation-policy.md). Verify actual preconditions and preserve exact continuation identities. Keep preparation steps separate from the action under test; list only genuine dependent blockers.
