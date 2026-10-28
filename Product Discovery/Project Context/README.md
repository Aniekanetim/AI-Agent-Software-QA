# AI-managed product knowledge

This context contains what the agent has learned from authorized discovery. It helps later work navigate the product, prepare data and interpret observations. The [human-maintained baseline](../../Project%20Context/README.md) remains the source of applicable accepted product expectations. No product knowledge is supplied in this reusable template.

## Domain index

| Domain | Knowledge to retain |
| --- | --- |
| [Business](business/README.md) | Observed user roles, operational flows, apparent goals and policy questions |
| [Product](product/README.md) | Feature maps, journeys, states, permissions and candidate expectations |
| [Design](design/README.md) | Implemented screen/interaction inventory and links to relevant supplied designs |
| [Technical](technical/README.md) | Observed routes/interfaces, data meanings, available version information and access/setup observations |
| [Decisions](decisions/README.md) | Supplied decision statements, inferred rationale, discrepancies and unresolved owner questions |

Create only files needed by actual learning. Use descriptive names and stable OBS IDs; choose the next unused OBS number across all five domains and retain it through moves. Search existing entries before adding a claim. Update the relevant domain index when adding/moving knowledge files; link cross-cutting entries rather than copying them. Keep complete PRDs, BRDs, accepted AC IDs and owner decisions in the human context or its linked canonical sources.

## Knowledge-entry format

Use this format for each substantive claim, or a coherent group with identical evidence conditions. Independent claims need distinguishable IDs/conditions. A domain file may contain several entries.

```markdown
## OBS-<number>: <specific subject>

- Evidence type: Observed / Supplied information / Inferred.
- Statement: <what was seen or supplied; separate interpretation explicitly>.
- Origin: <discovery request and applicable scope authorization>.
- Conditions: <browser URL or interface; role; actions/input; actual date/time>.
- Application identity: <served version and method, or Unknown with available evidence>.
- Evidence: <sanitized relevant reference; limits on what it establishes>.
- Human baseline: <source/section, BR/AC IDs, revision and source state, or Not supplied>.
- Interpretation / alternatives: <inference, evidence supporting it and remaining uncertainty>.
- Review: <Not reviewed, Reviewed for capture accuracy, or actual owner-intent decision link; who/date/method>.
- Freshness: Current for recorded conditions / Needs refresh / Historical; <reason>.
- Gaps / questions: <originating request/ticket and stable Q links, or None known in scope>.
- Entry version / updated: <actual revision/date; retain prior evidence>.
- Refresh triggers / related entries: <relevant feature, role, source or build changes>.
```

An OBS ID is not a requirement or acceptance-criterion ID. Observed describes evidence, not correctness; Current describes applicability to recorded conditions, not approval. Human review for capture accuracy is separate from a responsible owner's decision on intended behavior. Do not claim an owner decision, available build identity or reviewed state without evidence.

## Ownership, promotion and conflicts

The agent may create/update this context within its authorized scope. It does not edit the root `Project Context/`. Propose requirement changes on the originating request with evidence, alternatives and an identified responsible owner. The human team publishes accepted baseline changes; link their actual source/revision afterward. No automatic synchronization or promotion runs between the two stores.

If observation conflicts with an accepted rule, retain both references and return the discrepancy to QA for assessment. If intent is missing, mark it unknown or proposed and seek the owner; do not turn the current response into an expected result. Missing hidden architecture or decision rationale is a knowledge gap, not permission to invent it.

## Reuse and refresh

QA reads the relevant human sources and these entries before using discoveries for setup or investigation. Record human-context revisions, discovery entry/file versions and the served application identity separately, even when both context stores share one Git commit. Unsaved observations need a dated snapshot/reference rather than a claim that they are already in a commit.

When a linked source or relevant application area changes, flag affected entries for refresh, preserve historical observations and follow the [discovery workflow](../discovery-workflow.md#7-refresh-or-resume-without-losing-history). A consumer must not silently treat old evidence as current. Retain narrow coverage honestly: exploring one role or journey does not establish whole-product knowledge.

## References used during testing

The separate [QA Process Context](../../QA%20Process%20Context/README.md) supplies strategy, design/coverage, configuration, data and regression knowledge. Discoveries can identify candidate conditions or setup facts, but cannot become accepted expectations merely by appearing in an RTM. Maintain observations here and link them from relevant testing records; human owners resolve intended-behavior questions.
