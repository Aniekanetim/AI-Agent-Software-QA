# Test design and exploration

Select tests from the task, accepted sources, risks and changes. Explain why the selected checks provide useful evidence and what they omit. This guide applies across testing objectives; it does not set a fixed case count or require all techniques for every ticket.

## Describe each dimension accurately

| Dimension | Examples |
| --- | --- |
| Target or interface | UI, API, service, component, device |
| Quality objective | Functionality, accessibility, performance, usability, security, reliability or another applicable objective |
| Scenario perspective | Positive, negative, edge; labels may overlap |
| Design technique | Equivalence partitioning, boundary-value analysis, decision tables, state transitions, combinatorial design, structural analysis where available, error guessing, exploration or another suitable method |
| Execution method | Scripted, exploratory, automated or human interaction, accurately attributed |

Positive checks exercise valid inputs and permitted actions. Negative checks investigate invalid inputs, forbidden actions and unexpected conditions; correct rejection or recovery is a passing outcome. Edge cases cover limits, rare states, timing and unusual combinations. Boundary-value analysis covers ordered limits; other edge cases require other methods.

**Illustration only:** for an integer field allowing 1–100, 50 is positive, 100 is positive and a boundary, and 101 is negative and a boundary. One case remains one case despite multiple labels.

## Consider meaningful challenges

For relevant conditions, consider valid alternatives, invalid/missing inputs, role/state restrictions, boundaries, retries, interruptions, concurrent actions, time changes and dependency failures. Select those that address the objective and actual risk; explain an omitted perspective when material. Do not add destructive, load or security actions beyond approved limits to satisfy a label.

Creative thinking improves both scripted design and exploration. Use domain knowledge, past failures, unusual sequences and combinations to develop focused questions. Do not measure creativity by a percentage. Use the [charter template](exploratory-charter.md) for bounded investigation and record actual paths, observations and gaps. Exploration may use formal techniques; a scripted case can originate from exploration.

## Prepare the G2 review

Link each case to its conditions, source or risk, pass criterion, technique and selection rationale. Keep the standard [UI](../../QA/Quality%20Control/templates/ui-functional-suite.md) and [API](../../QA/Quality%20Control/templates/api-functional-suite.md) tables concise: put shared metadata in a case-reference section or linked matrix rather than duplicate steps or widen every result table.

Charters with missing intent may support authorized observation. They cannot establish an invented pass criterion. Product-discovery requests remain in their own pipeline; a QA exploratory session addresses a testing question under QA authorization.

Review after new failures, changed contracts, new user journeys or ineffective checks. Retain useful checks in the [regression inventory](../Regression%20Management/README.md) once expectations and repeatable conditions are established.

## Reference basis

[ISTQB CTFL sections 4.2–4.4](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf) describe systematic and experience-based design. [OpenSSF](https://glossary.openssf.org/negative-testing/) explains negative checks, including prohibited security actions. These references guide technique choice; they do not mandate our folder structure or establish project-specific acceptance criteria.
