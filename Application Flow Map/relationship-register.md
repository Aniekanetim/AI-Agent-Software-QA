# Relationship register

**Template — no application relationships are established.** This is the canonical connection record. Use the [feature inventory](feature-inventory.md) for identities and [map instructions](README.md) for ownership. Copy the entry shape below for an actual relationship; use descriptive headings and stable REL IDs.

Map ID / revision / maintainer / accountable owners: Not supplied. Source index / actual review / applicable environments: Not supplied.

## Relationship entry template

| Field | Actual value |
| --- | --- |
| Relationship ID / revision / lifecycle | <stable ID; Active, Needs review or Retired> |
| From / to feature IDs and direction | <source to destination; both IDs exist in the inventory> |
| Type | <navigation, prerequisite, data, state, permission, request, event or shared dependency> |
| What passes / why it matters | <data, state, action or dependency; candidate consequence> |
| Roles, prerequisites, configuration and applicable conditions | <sources and limits; Unknown when not established> |
| Failure, timing, retry and recovery | <supported behavior or explicit unknowns> |
| Intended state / authority | <Accepted, Proposed or Unknown; canonical source/section/revision and actual decision> |
| Observed state | <Observed, Not yet observed or Unknown; not a product verdict> |
| Observation evidence and conditions | <original OBS/evidence reference, role, environment, served build/date> |
| Inference / uncertainty | <interpretation and support, or None; no invented confidence percentage> |
| Discrepancy / original question | <specific conflict or gap, affected work and owner; no automatic defect classification> |
| Traceability IDs | <requirement, risk, condition, case or charter IDs from the index below> |
| Refresh trigger / previous version / retirement or replacement | <actual trigger, history and next owner> |

Directions describe the declared relationship: prerequisite/shared component to dependent feature, producer to consumer, caller to callee, or navigation origin to destination. Record callbacks/return flows separately where relevant. Do not assume that all relationship types have the same change-propagation semantics.

Intended and observed states are independent. Not yet observed may mean unvisited or inaccessible, not absent. Even an observed conflict needs the existing QA assessment and human review before becoming a confirmed defect. Original observations stay in discovery context; this register links their evidence. Requirements and acceptance criteria stay in human context.

## Traceability index

| Requirement / risk / condition / case / charter ID | Kind | Canonical record / applicable revision | Linked feature and relationship IDs | Gap or original question |
| --- | --- | --- | --- | --- |

Link [the existing coverage matrix](../QA%20Process%20Context/Coverage%20and%20Traceability/README.md) and actual suites/charters. Do not duplicate steps or outcomes. A map link is considered during selection; actual execution must separately identify the conditions and paths exercised.

## Change and correction history

| Date / revision | Trigger / original ticket or request / actual reply | Affected IDs | Evidence or accepted-source change | Impact, review and refresh action |
| --- | --- | --- | --- | --- |

Retain prior observations and decisions. Changes to names keep IDs; retired connections preserve history and do not silently become a different relationship. Explain missing/stale connections in the impact briefing rather than deleting them to make a scope look complete.
