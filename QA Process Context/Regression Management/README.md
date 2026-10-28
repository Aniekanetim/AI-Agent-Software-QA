# Regression management

Retain checks that protect important behavior and use changes, dependencies, prior defects and current risks to select relevant regression. Read the original failure and developer response before retesting. The [board](../../QA%20task%20management%20Board/README.md) remains authoritative for defect status and history.

**Template — no retained suite, prior pass or execution approval exists.** Apply [the common lifecycle rules](../README.md).

| Inventory field | Actual value |
| --- | --- |
| Inventory ID / revision / state / accountable owner / maintainer | Not supplied / Draft |
| Applicable strategy / product-source revisions / scope | Not supplied |
| Actual review reference / last update | Pending |

| Check / charter ID and version | Protected condition / risk and source revision | Originating defect or learning | Dependencies / selection trigger | Canonical suite / data / configuration | Latest actual run / build / outcome | Owner / review reference |
| --- | --- | --- | --- | --- | --- | --- |

Keep passing baselines, original failures and retests as distinct linked records. A new build requires checking which coverage remains applicable. A previous passing check does not verify a later build. If a prior pass or causal relationship is missing, state that uncertainty rather than classify a finding as a confirmed regression.

For a fix, select the original failure plus relevant adjacent/affected behavior. A separate regression gets a new linked Dev Todo ticket; a failed original retest keeps the original ticket and goes to Rework under the existing review rules. Retirement of a check needs a reason and owner decision; preserve its history.

An exploratory finding may become a scripted regression when the expected behavior and reproducible conditions are established. Preserve the originating charter and actual evidence. Automation is a method, not a prerequisite for retaining a useful check.

For PR-based execution, follow the [GitHub regression policy](../../automation/github/README.md). The inventory recommends selection; it does not expand a reviewed command/suite/target policy. Material changes return to the relevant gate. Changes to requirements or risks can invalidate assumptions without proving every historical result false; record the impact assessment and select affected retests.

## Use mapped dependencies

For a change, consult [Application Flow Map](../../Application%20Flow%20Map/README.md) and prepare the [impact briefing](impact-analysis.md). Link map revision, changed feature/relationship IDs, affected condition/case references and selection rationale. Trace relevant prerequisites/consumers without assuming every reachable feature needs all tests. Source freshness, roles/configuration, unknowns and shared risks can require broader regression. Retain the same approval boundaries and actual original-versus-retest evidence.
