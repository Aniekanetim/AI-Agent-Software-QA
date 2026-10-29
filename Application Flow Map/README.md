# Application Flow Map

Use this application-wide view to understand which features, shared components and external integrations connect, and why a change could affect other behavior. The agent uses it to investigate impact; people use it to inspect and challenge that reasoning. The [task board](../QA%20task%20management%20Board/README.md) remains the reporting entry point.

**Master state: unconfigured.** No application features, relationships, map owners or map-based test coverage are established. Populate a project copy from actual sources and authorized learning. A populated diagram is not proof of completeness, current behavior or passing tests.

## Start here

| Record | Purpose |
| --- | --- |
| [Feature inventory](feature-inventory.md) | Stable feature, shared-component and integration IDs, sources and gaps |
| [Relationship register](relationship-register.md) | Canonical connections, separate intended/observed facts and traceability |
| [Overview](overview.md) | Application-wide diagram derived from the inventory/register |
| [Area views](areas/README.md) | Detailed views when the overview becomes difficult to follow |
| [Impact briefing](../QA%20Process%20Context/Regression%20Management/impact-analysis.md) | How to explain candidate impact and proposed tests before execution |

Feature identity belongs in the inventory; connection facts belong in the register. Diagrams reference their IDs and map revision. Keep requirements, observations and results in their existing canonical locations, linked rather than copied. The optional [read-only helper](../automation/flow-map/README.md) validates a temporary projection and traces candidate paths; its output does not grant execution permission or issue a product verdict.

## Ownership and authority

| Source or role | Responsibility |
| --- | --- |
| [Human Project Context](../Project%20Context/README.md) | Accepted applicable requirements, contracts and owner decisions |
| [AI discovery context](../Product%20Discovery/Project%20Context/README.md) | Original observations, evidence, interpretations and questions |
| Agent map maintainer | Update source-linked inventory/register/views within authorized preparation or discovery; preserve provenance and history |
| Product/technical owners | Resolve intended relationships and maintain their canonical baseline sources |
| Human QA owner | Review impact reasoning, material scope decisions and actual outcomes through the existing gates |

In an adopting copy, record map ID/revision, maintainer, accountable QA/product/technical owners, actual review reference, applicable environments and source index here. **Initial values: Not supplied; no decision recorded.** Review of accurate observation is distinct from confirming intended behavior. The map assembles knowledge; it cannot approve a requirement or replace an owner decision.

## How the agent and user work together

During onboarding, reuse available maps and sources. Establish a bounded inventory, owners and explicit gaps; full application discovery is not a prerequisite for useful work. Existing onboarding answers and five product domains remain intact. Browser exploration cannot establish hidden backend dependencies without supporting evidence.

When a ticket arrives, identify changed feature/rule/interface/component IDs. Check sources and freshness, inspect prerequisites/consumers/indirect dependencies, assess what behavior could propagate and propose relevant checks. Explain the paths, selection rationale, expected outcomes, exclusions, unknowns and exact next authorization. Apply positive, negative, edge and exploratory considerations where meaningful; the task determines relevant testing objectives.

Users can ask their agent: **What depends on authentication? Why are refunds included? Which connections are inferred or stale?** The agent reads the records and gives source-linked answers in the conversation. This is an agent procedure, not a standalone chatbot or installed query service. Users need not edit Markdown for normal interaction.

On a correction, preserve the original statement, actual reply and question reference. A clarification about intent goes to its responsible owner and canonical source. Update observed facts only from actual evidence. Return material test-basis/scope changes to the affected gate, without repeating an unchanged approval request. A candidate path is neither an authorized test nor an exercised integration.

## Maintain and resume

Review affected entries after changes to requirements, interfaces, shared components, configuration, observed behavior or evidence availability. Link the original request/ticket and actual source revisions. Mark affected entries Needs review, retain historical observations/build identity and identify what can still be used. A changed file calls for impact review, not a full automatic crawl or rerun.

Keep stable IDs through display-name changes. Retire obsolete entries with a reason, revision and replacement link where applicable; never reuse their IDs. Preserve prior versions through Git or dated snapshots. Retired nodes/relationships remain historical, not automatically redirected into current paths. Distinguish a valid runtime cycle from an invalid replacement-history cycle.

Unmapped connections and unvisited roles/states are unknown. Missing, conditional or stale relationships may justify broader regression. The agent must reason about transferred data/state and risk; following every reachable arrow does not determine the final scope. Retain selection explanations, map/source revisions and actual coverage on the ticket and G5 packet.

The package activates no mapping crawl, scheduler or application access. Existing projects adopt missing records deliberately; supplied sources, discovery authorization, test approval and release decisions stay separate.

## WebMCP as relationship evidence

[WebMCP discovery](../automation/chrome-devtools/README.md) can supply source-linked observations of exposed actions and their inputs/outputs. Original evidence stays in AI discovery context. Map only relationships supported by observations or other applicable sources, preserving intended authority and observed behavior separately. A tool name is not proof of a backend dependency, accepted rule or passing journey. Retain page/role/state/build, catalogue/source revisions and freshness; changed tools can prompt targeted impact review.
