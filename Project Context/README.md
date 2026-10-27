# Project Context

This is the human-maintained product baseline. Business, product, design and technical owners maintain their requirements, contracts and decisions here or in linked canonical sources. Applicable accepted sources supply the QA test basis. A human-maintained file can still be draft, missing or superseded; check its owner, state and revision before use.

The agent's observations and inferences belong in the separate [discovery context](../Product%20Discovery/Project%20Context/README.md). Read relevant sources in both stores. The agent may use discovery knowledge for navigation/setup/investigation but cannot treat the current application response as intended behavior.

[Guided onboarding](../Onboarding/context-interview.md) accounts for business, product, technical, design and decisions using provided sources, authorized discovery or both. An explicitly authorized agent may transcribe an actual human answer into a named baseline document as a separate maintenance action, preserving source/owner/state. Onboarding or exploration alone does not grant that authority or approve the content.

**State:** unconfigured, human-maintained template. No product requirements or owners are established by this package. Human owners populate the baseline from actual sources; agents record missing answers on the originating request/ticket rather than completing these files from inference.

## Project identity

| Field | Actual project value |
| --- | --- |
| Project and business goal | Not supplied |
| Context steward / product owner | Not supplied |
| QA reviewer / developer / design owner | Not supplied |
| Applicable release / context revision | Not supplied |
| Application repository or source location | Not supplied; optional for hosted discovery |
| Authorized environments and limits | Not supplied; complete the environment reference |

## Sources and responsibilities

| Source | Question it answers | Responsible role | Initial state |
| --- | --- | --- | --- |
| [BRD](business/BRD.md) | Why the product exists, who needs it and what defines business success | Product owner / business analyst | Template; no supplied business baseline |
| [Business rules](business/business-rules.md) | Eligibility, calculations, boundaries, identity, permissions and recovery policy | Business/product owner | Template; no rules supplied |
| [PRD](product/PRD.md) | Feature behavior and observable acceptance criteria | Product owner with QA/development input | Template; no supplied product baseline |
| [Design reference](design/design-reference.md) | Journeys, Figma frames/states, applicable version and access | Design/product owner | Template; no approved design supplied |
| [System/API reference](technical/system-and-api-reference.md) | Components, interfaces, data meanings and dependencies | Developer / technical owner | Template; no system/API contract supplied |
| [Environments and builds](technical/environments-and-builds.md) | Paths, tools, exact targets, setup, identity and data limits | Developer with QA setup verification | Template; no target supplied |
| [Decisions](decisions/README.md) | Clarifications or changes, their owners, reasons and applicable revisions | Responsible decision owner | No decisions recorded |

BRD means business requirements document; PRD means product requirements document. Human owners keep feature acceptance criteria with product requirements and link external authoritative files when available. A template is not a replacement for them. The agent's domain observations are not competing BRDs, PRDs or specifications.

## Ownership and proposed changes

During discovery or QA, the agent must not edit files in this folder. It may propose a requirement/clarification on the originating request or ticket, with evidence, alternatives, affected rules and an identified decision owner. The responsible human accepts, changes or rejects the proposal and publishes any baseline update; the agent then links the actual decision and source revision from its own records. A specific human instruction to edit a named baseline document is separate maintenance authorization, not an automatic part of testing or discovery.

Review of an observation's accuracy does not establish approval of the observed behavior. No automatic synchronization or promotion runs between the two context stores. Agent-maintained tickets, evidence, shared progress and discovery knowledge remain distinct from this human-maintained baseline.

## Versions and authority

On each request/ticket/test basis, record human source sections/BR/AC IDs and revisions, applicable discovery OBS IDs and entry versions, relevant design handoff and the served application build separately. Both stores may share a Git commit; their source references and authority remain distinct. When Git is unavailable, use dated versioned snapshots rather than pretending a commit exists. Mark an undisclosed application build Unknown with its observation time and available evidence.

Keep one canonical source per rule and link it from features, tickets and cases. Source-inspected implementation describes what the application does; it does not establish what it should do. A newer file, developer response or changing Figma link does not silently replace an accepted requirement. Resolve conflicts with the responsible owner and retain the actual decision and applicable revision.

## Missing or conflicting information

For a QA-origin gap, follow the board's [clarification procedure](../QA%20task%20management%20Board/README.md#clarification-comments-and-developer-visibility). For a discovery-origin gap, follow the [discovery question procedure](../Product%20Discovery/README.md#questions-and-visibility). Keep one original conversation with stable question IDs, checked sources/revisions, gap/conflict, affected work and answer/owner needed. Cross-link related work rather than duplicating questions.

The ticket keeps its current folder. Pause dependent work; independent approved work can continue. Preserve the actual response, link any responsible-owner source update and resume from the affected review checkpoint. Uncertainty is not automatically a product defect or permission to invent an expected result.

## Open source gaps

Human owners may maintain this baseline gap register. Agents record missing setup sources in shared progress or a real discovery request; ticket-specific conversations stay on the originating ticket. Humans can link broader gaps here without duplicating the discussion.

| Gap ID | Missing source or conflict | Affected feature/check | Needed owner | Ticket/question |
| --- | --- | --- | --- | --- |

Initial templates are unsupplied sources, not discovered product defects. Human owners populate this register with actual gaps. Conflicting observations are retained in the discovery records and assessed through QA; missing intent is not automatically a defect.
