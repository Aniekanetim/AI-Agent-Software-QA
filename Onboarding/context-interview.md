# Establish initial project and product understanding

Choose provide, discover or combined once; reuse an existing answer. Then inspect available sources before asking focused questions. The following prompts identify missing knowledge; they are not a form that every user must complete line by line.

| Domain | Establish | Focused question when missing | Canonical location |
| --- | --- | --- | --- |
| Business | Users, problem, outcomes, operating rules and consequences of failure | Which outcome matters most, and who owns the rule governing it? | Root business documents or linked owner source |
| Product | Roles, features, journeys, eligibility, states, recovery and acceptance criteria | For this journey, what makes a result acceptable and where is that decision recorded? | Root product requirements and criteria |
| Technical | Environments, build identity, interfaces, authentication, dependencies and data meanings | Which environment and role can we access, and how can its deployed version be identified? | Root technical reference |
| Design | Applicable design version, interactions and important states | Which design reference applies to this environment, or who can confirm the intended interaction? | Root design reference |
| Decisions | Decision, owner, rationale, date and scope | Who decided this exception, and which release or role does it apply to? | Root decisions or linked decision source |

Human-maintained does not mean accepted or current. Preserve each source's owner, draft/accepted state, revision and applicability. A link to an inaccessible document is a known dependency, not proof that its content was read.

The agent may transcribe a human's answer into a **named** main-context document only under actual maintenance authorization, with source and approval state. The response helper checks named-document authorization; it cannot verify a human's identity or the truth of an entered reference. The agent's working contract and the actual review record remain essential.

Exploration goes through [Product Discovery](../Product%20Discovery/discovery-workflow.md). Observations, inferred explanations and gaps go in [the AI context](../Product%20Discovery/Project%20Context/README.md), including [decision observations](../Product%20Discovery/Project%20Context/decisions/README.md). Do not label inferred behavior as an approved PRD, BRD, architecture or decision.

For every domain, retain one of: supported knowledge with source evidence; justified non-applicability and owner; or a concrete original question with its owner and affected work. Record conflicts and ask the responsible owner; do not settle intended policy by copying what the application does. Link actual updates back to the original question/request/ticket and refresh only affected discoveries.

Onboarding establishes a bounded foundation. Later tasks can reveal new areas. Read accepted context for expectations and AI context for practical learning before each task; refresh stale discoveries without automatically rewriting the baseline.
