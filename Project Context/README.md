# Project Context

This folder holds the product knowledge shared by QA, developers and product owners. The board says what to work on; this folder supplies the test basis; the QA workflow says how to perform and review the work.

**State:** unconfigured template. No product requirements or owners are established by this package. Fill the project fields from actual sources or identify the unanswered question.

## Project identity

| Field | Actual project value |
| --- | --- |
| Project and business goal | Not supplied |
| Context steward / product owner | Not supplied |
| QA reviewer / developer / design owner | Not supplied |
| Applicable release / context revision | Not supplied |
| Application repository or source location | Not supplied |
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

BRD means business requirements document; PRD means product requirements document. Keep feature acceptance criteria in the PRD rather than creating a competing criteria register. Link external authoritative files when available; a template is not a replacement for them.

## Versions and authority

On each ticket/test basis, record exact source sections, rule and acceptance-criteria IDs, the context Git revision or immutable source version, relevant design handoff and the served application build. Documentation revision and application identity are separate. When Git is unavailable, use a dated versioned source snapshot and recorded identity rather than pretending a commit exists.

Keep one canonical source per rule and link it from features, tickets and cases. Source-inspected implementation describes what the application does; it does not establish what it should do. A newer file, developer response or changing Figma link does not silently replace an accepted requirement. Resolve conflicts with the responsible owner and retain the actual decision and applicable revision.

## Missing or conflicting information

Follow the board's [clarification procedure](../QA%20task%20management%20Board/README.md#clarification-comments-and-developer-visibility). Comment on the original ticket with a stable question ID, sources/revisions checked, gap/conflict, affected check and answer/owner needed. Link that comment in the board's developer-question index.

The ticket keeps its current folder. Pause dependent work; independent approved work can continue. Preserve the actual response, link any responsible-owner source update and resume from the affected review checkpoint. Uncertainty is not automatically a product defect or permission to invent an expected result.

## Open source gaps

Before a ticket exists, record missing setup sources here; once a gap affects a ticket, keep the conversation on that ticket and link it here if broadly relevant.

| Gap ID | Missing source or conflict | Affected feature/check | Needed owner | Ticket/question |
| --- | --- | --- | --- | --- |

Initial templates are unsupplied sources, not discovered product defects. Populate this register with actual project gaps rather than copying another project's claims.
