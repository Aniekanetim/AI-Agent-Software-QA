# AI agent Software QA

A portable workflow for an AI QA agent to join a project, build product understanding and perform assigned QA work with human review. Guided onboarding prepares context, tools and access. Product Discovery learns how an application behaves. QA evaluates assigned work against an agreed test basis, investigates findings and proposes readiness. Humans maintain the product baseline and own scoped decisions; developers fix or refute reported defects.

**Package version:** 1.9.0 — 29 October 2026. **Project state:** unconfigured. **Live tickets/discovery requests:** none. **Product schedules/PR regression:** not activated. Start with [SETUP.md](SETUP.md) and [guided onboarding](Onboarding/README.md).

## Use with your AI agent

Give an agent this prompt from the QA project for the application you want to learn about or test:

```text
Adopt https://github.com/Aniekanetim/AI-Agent-Software-QA as the QA workflow
for my current project. Read the repository README.md, AGENTS.md, SETUP.md
and docs/adopt-from-repository.md, then start Onboarding/onboarding-workflow.md.
Inspect my existing project instructions and preserve its files and evidence.
Create a project-specific QA copy, record the workflow revision used, and populate
context only from actual project sources. Keep the upstream template unconfigured.
Humans maintain root Project Context; the agent maintains discoveries under
Product Discovery/Project Context. Read both, preserving their different authority.
Read Application Flow Map for source-linked connections and impact reasoning.
Read QA Process Context for maintained strategy, design, coverage, data/configuration
and regression records; reuse existing records and identify actual owners.
For a discovery objective, follow Product Discovery/discovery-workflow.md and use
its request template; do not put discovery through the five QA status folders.
Inspect existing setup; show the onboarding roadmap and ask one focused missing
decision at a time. Reuse clear extra answers and preserve progress/settings.
Let me provide context, choose discovery, or combine both. Account for business,
product, technical, design and decisions; preserve source authority and open gaps.
Offer browser/visibility, GitHub and provider/account/mailbox choices. Verify actual
capabilities separately from saved preferences. Each task determines QA coverage;
do not require a testing-category choice during onboarding.
Before exploration/testing, explain the proposed actions, intended learning or pass
criteria, reasons, alternatives, gaps and exact next authorization for my review.
Do not invent requirements, run unapproved exploration/tests or activate scheduling.
```

An agent needs repository-reading and QA-file access plus the capabilities required by its tasks. The procedures are Markdown; optional executable helpers use Node.js 22.12+. Pinned dependencies include Chrome DevTools MCP/CLI, Playwright MCP, CLI, library/Test and Postman CLI, with email adapters and GitHub CLI setup support. [Tool discovery](automation/tools/README.md) verifies and reuses existing installations/connections through the actual selected harness before offering missing setup. [Postman onboarding](automation/postman/README.md) separates local collection execution from authenticated cloud access/reporting. Native host connections and credentials remain project-specific. [Adoption instructions](docs/adopt-from-repository.md) explain URL-based use and limits.

The [global mailbox policy](automation/email/mailbox-policy.md) gives every adopting agent a standard way to manage test identities: purpose/run plus aliases on a supported test inbox, recorded account context, exact identity reuse for retests, and verification matched to the alias and current request. The helpers prepare identities and preserve correlation; actual application registration and provider delivery require project-specific execution.

## Fork, use as a template or clone

[Fork this repository](https://github.com/Aniekanetim/AI-Agent-Software-QA/fork) to maintain your own copy, or select [Use this template](https://github.com/Aniekanetim/AI-Agent-Software-QA/generate) for a fresh project repository. Both start from the workflow files; supply your own project context and test authorization.

```shell
git clone https://github.com/Aniekanetim/AI-Agent-Software-QA.git my-project-qa
cd my-project-qa
npm ci --ignore-scripts --cache .local/npm-cache
npm run qa -- onboarding start
```

Open the clone as your QA project, follow SETUP.md and give your agent the [bootstrap prompt](docs/bootstrap-prompt.md). For an existing application repository, merge deliberately using the setup/adoption instructions; preserve its current working contract and README.

## How the pieces work together

| Component | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Instructions the AI follows in this project |
| [Onboarding and settings](Onboarding/README.md) | Resumable project preparation, context route, integration/mailbox choices and scoped readiness |
| [Human-maintained Project Context](Project%20Context/README.md) | Team-maintained requirements, rules, criteria, designs and decisions, each with its state/owner/revision |
| [Product Discovery](Product%20Discovery/README.md) | Independent requests and procedure for learning from a hosted or locally available application |
| [AI-managed discovery context](Product%20Discovery/Project%20Context/README.md) | Observations, journeys, technical findings, inferences and gaps, with evidence and freshness |
| [Application Flow Map](Application%20Flow%20Map/README.md) | Source-linked features, shared dependencies and candidate change-impact paths with separate intended/observed knowledge |
| [QA Process Context](QA%20Process%20Context/README.md) | Maintained strategy, design/exploration, coverage, configuration, data and regression references with accountable owners |
| [QA task management board](QA%20task%20management%20Board/README.md) | Tickets tell the agent and developers what work is ready and retain its history |
| [QA workflow](QA/Quality%20assurance/qa-workflow.md) | Testing activities, five human review gates and safeguards against blind approval |
| [Release sign-off and handoff](QA/Quality%20assurance/release-signoff.md) | Release notes, completion evidence, scoped human decision and next-owner delivery/receipt controls |
| [Quality Control](QA/Quality%20Control/README.md) | Separate suites, repeatable checks and actual results by target and testing type |
| [Shared progress](unified_project_context.md) | Current checkpoint, decisions, blockers and next action |
| [Tool discovery and reuse](automation/tools/README.md) | Actual harness access, existing executable/connection reuse and targeted capability verification |
| [Chrome DevTools and WebMCP](automation/chrome-devtools/README.md) | Page-tool discovery/execution, explicit MCP/CLI sessions and independently verified outcomes |
| [Postman CLI](automation/postman/README.md) | API collection execution, conditional authentication and assertion/result handling |
| [Automation](automation/README.md) | Browser/API/email/GitHub helpers, native check-ins and reviewed PR-regression integration |
| [Portability](docs/portability.md) | Adoption on another project or machine without inheriting credentials or stale approvals |

## Discovery and QA

There are two execution procedures, connected through explicit requests and the two context stores. Discovery requests say what to learn; the [discovery procedure](Product%20Discovery/discovery-workflow.md) explains how to explore and document it. QA tickets say what to test; the QA workflow below governs testing and defect handling. Discovery does not use Dev Todo, Retest, Rework or Tested-Ok as learning stages.

The agent reads both context stores. Applicable accepted human sources supply expected behavior; discoveries help navigation, setup and investigation. Observations are not automatically requirements. The agent proposes clarifications, and the responsible human publishes accepted baseline changes. Learning can proceed with missing requirements while any correctness judgment that needs them waits.

For staging-only discovery, supply the URL, authorized roles/actions and writable QA root. A local application checkout is optional. Authentication can use a dedicated account, authorized registration or human-assisted sign-in; credentials and reusable session state stay outside committed context. See the [discovery workflow](Product%20Discovery/discovery-workflow.md#authentication-and-sessions).

For a testing objective, the agent determines relevant activities from the task, requirements, changes and risks. These can include UI/functional, API, usability, performance, accessibility, security or other professional QA work as actual tools/access permit. It asks only for material missing requirements or boundaries. There is no onboarding testing-category restriction, required application framework or fixed case count.

For QA, the agent consults both product-context stores and [QA Process Context](QA%20Process%20Context/README.md), selects risks and explains each check/pass criterion. Human review authorizes a bounded scope. The agent executes, investigates and reports. After separately authorized retesting, it verifies the original fix, runs relevant regression and proposes a scoped handoff. Changes return to the affected review point.

The board supplies work; it does not authorize testing. A scheduled check-in also does not authorize product fixes or substitute for human decisions.

QA assignment completion requires a release-notes/sign-off/handoff packet, an actual scoped human decision and a usable next-owner handoff. Test totals or a commit alone cannot close it. Production authorization remains separate; the packet identifies applicable rollout/monitoring/recovery items. Discovery instead completes against its learning criteria and any review/receipt required by its request.

## Maintain testing knowledge and coverage

[QA Process Context](QA%20Process%20Context/README.md) connects project strategy/plans, design/exploration, coverage/RTM, configuration, test data and regression. It supplies project-specific testing knowledge without replacing human requirements or AI discoveries. The agent maintains operational records within reviewed policy; human owners remain accountable for material decisions.

Consider positive, negative and edge cases across relevant interfaces/objectives. Select techniques deliberately and use bounded exploratory charters for additional questions. Labels overlap: one positive boundary case is one case. Track designed and actually exercised conditions separately from Pass/Fail/Partial/Blocked/Not run outcomes. Unknown intent and excluded areas remain visible; complete identified coverage does not promise exhaustive testing.

Tickets remain the shared reporting entry point and link their canonical results and completion packet. The optional [coverage helper](automation/coverage/README.md) checks a read-only snapshot for consistent counts/references; it runs no product tests and grants no approval. New adoption starts unconfigured; existing projects preserve records and adopt only missing process preparation.

## Understand feature connections and change impact

The root [Application Flow Map](Application%20Flow%20Map/README.md) links features, shared components and integrations to intended sources, observed evidence and relevant tests. The agent maintains a bounded inventory and relationship register; diagrams present those records. Human product sources remain the requirement authority, and original observations stay in discovery context.

Ask your agent: **What depends on authentication? Why did you include refunds? Which connections are inferred or stale?** The agent reads the project's records and explains paths, conditions, risks, proposed checks, exclusions and uncertainty through the [impact briefing](QA%20Process%20Context/Regression%20Management/impact-analysis.md). Users can review/correct this reasoning through conversation without maintaining each map entry themselves. Unconfigured projects receive an honest gap explanation, not invented connections.

The optional [map helper](automation/flow-map/README.md) validates a temporary projection and traces upstream/downstream candidates with cycle and depth controls. It does not select final tests, authorize work or establish coverage. Mapping extends through supplied context and authorized discovery; there is no automatic whole-application crawl. Missing paths do not prove independence. Map/source revisions and the served build remain separate.

## WebMCP as an additional capability

The [Chrome DevTools bundle](automation/chrome-devtools/README.md) gives the agent MCP and CLI routes to inspect Chrome and use WebMCP actions exposed by the current application. The agent selects a suitable method per task; onboarding reuses working installations and native connections. Application tool availability depends on the page, role, state and compatible browser. Invocations, independent application verification and QA verdicts remain separate. [Validation evidence and limits](docs/webmcp-validation.md) distinguish helper tests, native browser rehearsals and current-harness access.

## Agent-selected tools and test data

The agent chooses suitable accessible tools for each task or step, explaining significant choices and limits. Onboarding discovers capabilities and establishes constraints/visibility; it does not impose a preferred browser or a fixed tool per testing category. Bundled and other permitted tools can be combined. Explicit task requirements and approved regression commands remain applicable. Read [the selection procedure](automation/tools/task-selection.md).

The agent can generate synthetic inputs and prepare/reuse authorized application state. Missing attached datasets are not automatic blockers. Generated values, prepared records and verified starting states remain distinct; continuation/retests retain the exact identity where required. Genuine missing rules/access/state produce a precise owner question while independent authorized work continues. Read [the data policy](QA%20Process%20Context/Test%20Data%20Management/preparation-policy.md).

Project readiness exposes optional capability gaps separately from blockers. Read-only task-tool/data assessment supports preparation, without choosing tools, mutating the application or authorizing execution. Material changes retain existing human gates; ordinary choices within authorization need no per-call approval. Existing onboarding answers, visibility/explicit constraints, context ownership and five board statuses are preserved.

## Ticket movement

```text
New assignment -> Ready for QA -> Tested-Ok after criteria and review
                         |
                         +-> each new defect -> Dev Todo
                                                 |
                                        developer response
                                                 v
                                               Retest
                                      /                     \
                            original failure remains     verified resolution
                                    Rework                 Tested-Ok
                                      |
                                developer response -> Retest
```

A separate regression creates a new linked Dev Todo ticket. The parent assignment waits on its blocking findings; completing one bug does not approve the entire build. Missing requirements stay as comments on the original ticket, linked in the board's developer-question index.

## Start a new project

1. Make a project-specific copy of this folder and follow SETUP.md. Keep an untouched master for reuse.
2. Give the agent the [bootstrap prompt](docs/bootstrap-prompt.md) and complete guided onboarding: provide, discover or combine context; choose tools, mailboxes and operating preferences. Unavailable requirements remain explicit gaps.
3. For learning, use a [discovery request](Product%20Discovery/templates/discovery-request.md). Testing assignments come from Ready for QA or configured eligible PR intake. A QA ticket can link targeted discovery.
4. Review the applicable discovery or QA briefing before dependent execution. Reusable regression policies need an actual informed decision covering their exact scope.
5. Configure optional check-ins/PR triggers through the actual host after the manual procedure works. [Settings](Onboarding/settings.md) remain available later.

The included context and record files are templates, not project requirements, results or approvals. [Package notes](docs/package-notes.md) explain the source, preserved workflow rules and verification limits.

## License

The workflow files and templates are available under the [MIT license](LICENSE). Linked external standards and documentation remain with their respective publishers.
