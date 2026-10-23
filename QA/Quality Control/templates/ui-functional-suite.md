# UI functional suite: <feature and target>

**Template — no test cases have been executed.**

**Basis:** <source/criterion IDs and context/design revision>. **Target:** <build identity and normal browser URL>. **Setup:** <required UI-visible data/account state or separate preparation reference>.

**Discovery references:** <relevant OBS IDs/versions or None used; journeys inform setup, while expected behavior comes from the agreed human test basis>.

| TC ID | Scenario | Test case | Preconditions | Steps | Test data | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| <stable ID> | <high-level behavior> | <specific behavior being checked> | <starting UI/data/account state> | 1. <browser action><br>2. <action><br>3. <observable checkpoint> | <exact relevant values> | <observable outcome and persistence/recovery where relevant> |

Use plain feature names and numbered actions. Do not assume a previously prepared example or shared chat context. Keep Postman imports and API request execution out of UI reproduction steps/preconditions. Link a separate technical setup note when data preparation is required.

Record actual outcomes separately for each run/build using the result template; do not edit expected behavior to match a faulty response.
