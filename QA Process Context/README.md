# QA Process Context

This folder holds the project's maintained testing approach, coverage obligations and operational references. Read it when preparing or resuming a QA assignment. The [task board](../QA%20task%20management%20Board/README.md) remains the reporting entry point: tickets link plans, results, defects and completion handoffs.

**Master state: unconfigured.** The files below are guidance and templates, with no project owners, approved strategy, execution or coverage established. In a project copy, name the actual owners and link existing canonical records before creating replacements. Empty folders and completed templates do not establish readiness.

## Locate the right information

| Location | Information and authority |
| --- | --- |
| [Human Project Context](../Project%20Context/README.md) | Applicable requirements, contracts, designs and decisions; check owner, approval state and revision |
| [AI discovery context](../Product%20Discovery/Project%20Context/README.md) | Observations, inferences and gaps; supports learning without establishing intended behavior |
| [Application Flow Map](../Application%20Flow%20Map/README.md) | Source-linked feature identities/connections and candidate impact; intended and observed knowledge retain separate authority |
| QA Process Context | How this project selects, prepares, measures and maintains testing; operational updates within reviewed policy |
| [QA workflow](../QA/Quality%20assurance/qa-workflow.md) | How the agent performs work through the existing G1–G5 human review gates |
| [Quality Control](../QA/Quality%20Control/README.md) | Actual cases, scripts and execution evidence; keep one canonical result record |

## Establish ownership and canonical records

In the adopting project, replace the initial states with names, source links, applicable revisions and the actual review decision. The human QA owner is accountable for the test approach and coverage decisions. The agent maintains operational records within authorized scope. Product, design and technical owners maintain their source facts. An agent may propose changes to those sources, not silently rewrite them.

| Area | Canonical starting point | Accountable role / initial owner | Maintainer and review trigger |
| --- | --- | --- | --- |
| Strategy, plans and risks | [Strategy and planning](Test%20Strategy%20and%20Plans/README.md) | Human QA owner: Not supplied | Agent; human review for material objective, risk or completion-criterion changes |
| Design and exploration | [Design guide](Test%20Design%20and%20Exploration/README.md) | Human QA owner: Not supplied | Agent; review case selection, assertions, charters and execution bounds at G2 |
| Coverage and traceability | [Coverage guide](Coverage%20and%20Traceability/README.md) | Human QA owner: Not supplied | Agent; review changed scope, unresolved intent, exclusions and residual gaps |
| Configuration | [Configuration record](Configuration%20Management/README.md) | Technical owner: Not supplied | Technical owner supplies facts; agent verifies and records actual configuration |
| Test data | [Data plan](Test%20Data%20Management/README.md) | QA/data owner: Not supplied | Agent; owner review for changed access, retention, mutation or cleanup limits |
| Regression | [Regression inventory](Regression%20Management/README.md) | Human QA owner: Not supplied | Agent; review significant selection changes; reuse only applicable execution approval |

Use the existing [assignment-plan template](../QA/Quality%20assurance/templates/test-plan.md), [result template](../QA/Quality%20Control/templates/test-results.md) and [completion packet](../QA/Quality%20assurance/templates/completion-handoff.md). Their instances stay with the assignment's canonical records; this folder links them. Do not maintain another copy of their execution totals.

## Record identity and lifecycle

Each project record identifies its stable ID, revision, owner, maintainer, state (Draft, Reviewed, Needs review or Superseded), actual review reference, applicability, source references and last update. Reviewed describes the supplied decision; a file or hash cannot manufacture it. Preserve previous revisions through Git or dated snapshots. Record workflow edition, product-source revisions, process-record revisions, testware versions and served build identity separately.

Update affected records after a requirement/design/contract change, PR or fix, configuration/dependency change, new risk, data-state change, test execution or accepted clarification. Assess impact first: identify affected conditions, cases, data, configuration and regression. Mark those records Needs review, explain what can still be reused, and return only material changes to the affected gate. A changed source calls for impact review, not an automatic rerun of every test.

Keep historical results and approvals tied to their original basis. A new revision does not upgrade old evidence to current verification. Before resuming, read actual responses and the last checkpoint; do not repeat an unanswered question or unchanged execution.

## Use during a ticket

1. Read the complete ticket, relevant sources in both product-context stores and applicable process records.
2. Identify the objective, changes, risks, coverage items and missing intent. Link an original ticket question for a material gap; wait only on dependent judgments.
3. Prepare the plan, cases/charters, data and configuration. Explain each check, technique, expected outcome, selection rationale, limits and exact next authorization at G1/G2.
4. Execute within approval. Link actual results and evidence; distinguish designed coverage, exercised coverage and outcomes.
5. Update traceability and retained regression. Preserve original failures and separate retests, build/source identities and review decisions.
6. Link achieved coverage, exclusions, gaps and next-owner maintenance actions in the G5 packet and ticket. A Tested-Ok ticket does not establish whole-product coverage.

## Adopt without losing existing work

Inventory existing plans, matrices, data procedures and configuration records. Link useful external or existing files as canonical rather than copying them. Move a record only when necessary, update incoming links and preserve history. Introduce missing records as Draft; do not retrospectively approve a strategy or attach new coverage IDs to historical execution as if they existed then. Existing onboarding answers and runtime schema remain unchanged by this documentation addition. Account for missing process ownership in the onboarding handoff and affected ticket rather than restarting onboarding.

The master ships no live strategy, test data, coverage register, approvals or schedule. Product Discovery remains independent. The six areas are extensible; create additional process records only when actual work requires them.

## Prepare without unnecessary dependencies

Use [task-based tools](../automation/tools/task-selection.md) and [test-data initiative](Test%20Data%20Management/preparation-policy.md). The agent selects methods and prepares data within scope. Preserve explicit requirements and actual state evidence; blocked rules/access/state affect dependent checks only. Missing attached data and unavailable optional tools are not automatic assignment blockers.
