# AI agent Software QA

A portable workflow for an AI QA agent to join a project, build product understanding and perform assigned QA work with human review. Guided onboarding prepares context, tools and access. Product Discovery learns how an application behaves. QA evaluates assigned work against an agreed test basis, investigates findings and proposes readiness. Humans maintain the product baseline and own scoped decisions; developers fix or refute reported defects.

**Package version:** 1.3.0 — 27 October 2026. **Project state:** unconfigured. **Live tickets/discovery requests:** none. **Product schedules/PR regression:** not activated. Start with [SETUP.md](SETUP.md) and [guided onboarding](Onboarding/README.md).

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

An agent needs repository-reading and QA-file access plus the capabilities required by its tasks. The procedures are Markdown; optional executable helpers use Node.js 22+. Pinned dependencies include Playwright MCP, CLI, library/Test and email adapters, with GitHub CLI setup support. Native host connections and credentials remain project-specific. [Adoption instructions](docs/adopt-from-repository.md) explain URL-based use and limits.

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
| [QA task management board](QA%20task%20management%20Board/README.md) | Tickets tell the agent and developers what work is ready and retain its history |
| [QA workflow](QA/Quality%20assurance/qa-workflow.md) | Testing activities, five human review gates and safeguards against blind approval |
| [Release sign-off and handoff](QA/Quality%20assurance/release-signoff.md) | Release notes, completion evidence, scoped human decision and next-owner delivery/receipt controls |
| [Quality Control](QA/Quality%20Control/README.md) | Separate suites, repeatable checks and actual results by target and testing type |
| [Shared progress](unified_project_context.md) | Current checkpoint, decisions, blockers and next action |
| [Automation](automation/README.md) | Browser/email/GitHub helpers, native check-ins and reviewed PR-regression integration |
| [Portability](docs/portability.md) | Adoption on another project or machine without inheriting credentials or stale approvals |

## Discovery and QA

There are two execution procedures, connected through explicit requests and the two context stores. Discovery requests say what to learn; the [discovery procedure](Product%20Discovery/discovery-workflow.md) explains how to explore and document it. QA tickets say what to test; the QA workflow below governs testing and defect handling. Discovery does not use Dev Todo, Retest, Rework or Tested-Ok as learning stages.

The agent reads both context stores. Applicable accepted human sources supply expected behavior; discoveries help navigation, setup and investigation. Observations are not automatically requirements. The agent proposes clarifications, and the responsible human publishes accepted baseline changes. Learning can proceed with missing requirements while any correctness judgment that needs them waits.

For staging-only discovery, supply the URL, authorized roles/actions and writable QA root. A local application checkout is optional. Authentication can use a dedicated account, authorized registration or human-assisted sign-in; credentials and reusable session state stay outside committed context. See the [discovery workflow](Product%20Discovery/discovery-workflow.md#authentication-and-sessions).

For a testing objective, the agent determines relevant activities from the task, requirements, changes and risks. These can include UI/functional, API, usability, performance, accessibility, security or other professional QA work as actual tools/access permit. It asks only for material missing requirements or boundaries. There is no onboarding testing-category restriction, required application framework or fixed case count.

For QA, the agent consults both contexts, selects risks and explains each check/pass criterion. Human review authorizes a bounded scope. The agent executes, investigates and reports. After separately authorized retesting, it verifies the original fix, runs relevant regression and proposes a scoped handoff. Changes return to the affected review point.

The board supplies work; it does not authorize testing. A scheduled check-in also does not authorize product fixes or substitute for human decisions.

QA assignment completion requires a release-notes/sign-off/handoff packet, an actual scoped human decision and a usable next-owner handoff. Test totals or a commit alone cannot close it. Production authorization remains separate; the packet identifies applicable rollout/monitoring/recovery items. Discovery instead completes against its learning criteria and any review/receipt required by its request.

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
