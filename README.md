# AI agent Software QA

A portable workflow for AI-led software testing with human QA review. The agent analyzes requirements, prepares and executes approved checks, investigates findings and proposes readiness. The human QA engineer reviews the reasoning and evidence and owns the scoped decisions. Developers fix or refute reported defects.

**Package version:** 1.1.0 — 22 October 2026. **Project state:** unconfigured. **Live tickets:** none. **Schedule:** not configured for this package. Start with [SETUP.md](SETUP.md).

## Use with your AI agent

Give an agent this prompt from the project you want to test:

```text
Adopt https://github.com/Aniekanetim/AI-Agent-Software-QA as the QA workflow
for my current project. Read the repository README.md, AGENTS.md, SETUP.md
and docs/adopt-from-repository.md, then follow their linked workflow and templates.
Inspect my existing project instructions and preserve its files and evidence.
Create a project-specific QA copy, record the workflow revision used, and populate
context only from actual project sources. Keep the upstream template unconfigured.
Ask for the testing objective or essential missing context only when not supplied.
Before test execution, explain each proposed check, expected result and reason,
alternatives, gaps and exact next authorization for my review.
Do not invent requirements, run unapproved tests or activate scheduling by adoption.
```

An agent needs repository-reading and project-file access, plus the tools for the agreed tests. The workflow is Markdown and does not require a specific model or testing framework. [Agent adoption instructions](docs/adopt-from-repository.md) explain URL-based adoption, existing-project integration and capability limits.

## Fork, use as a template or clone

[Fork this repository](https://github.com/Aniekanetim/AI-Agent-Software-QA/fork) to maintain your own copy, or select [Use this template](https://github.com/Aniekanetim/AI-Agent-Software-QA/generate) for a fresh project repository. Both start from the workflow files; supply your own project context and test authorization.

```shell
git clone https://github.com/Aniekanetim/AI-Agent-Software-QA.git my-project-qa
cd my-project-qa
```

Open the clone as your QA project, follow SETUP.md and give your agent the [bootstrap prompt](docs/bootstrap-prompt.md). For an existing application repository, merge deliberately using the setup/adoption instructions; preserve its current working contract and README.

## How the pieces work together

| Component | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Instructions the AI follows in this project |
| [Project Context](Project%20Context/README.md) | Business needs, product requirements, acceptance criteria, design, interfaces and environment references |
| [QA task management board](QA%20task%20management%20Board/README.md) | Tickets tell the agent and developers what work is ready and retain its history |
| [QA workflow](QA/Quality%20assurance/qa-workflow.md) | Testing activities, five human review gates and safeguards against blind approval |
| [Release sign-off and handoff](QA/Quality%20assurance/release-signoff.md) | Release notes, completion evidence, scoped human decision and next-owner delivery/receipt controls |
| [Quality Control](QA/Quality%20Control/README.md) | Separate suites, repeatable checks and actual results by target and testing type |
| [Shared progress](unified_project_context.md) | Current checkpoint, decisions, blockers and next action |
| [Automation](automation/README.md) | Manual or native scheduled board check-ins |
| [Portability](docs/portability.md) | Adoption on another project or machine without inheriting credentials or stale approvals |

## One adaptive workflow

Start with the testing objective. If it is missing, the agent asks what kind of testing is needed. The same workflow supports UI/functional, API, usability, performance, accessibility and security work. The selected objective determines the tools, test cases, measurable criteria and limits. This package requires no particular application framework or fixed number of cases.

The agent consults Project Context, selects risks and explains each proposed check and its expected outcome. Human review authorizes a bounded scope. The agent then executes, investigates and reports observations. After a separately authorized retest, it confirms the original fix, runs relevant regression and proposes a scoped handoff. Changes return to the affected review point.

The board supplies work; it does not authorize testing. A scheduled check-in also does not authorize product fixes or substitute for human decisions.

Completion requires a prepared release-notes/sign-off/handoff packet, an actual scoped human decision and a usable handoff to the next owner. Test totals or a commit link alone cannot close the assignment. Production authorization remains separate; the packet identifies which rollout/monitoring/recovery items apply to the approved scope.

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
2. Supply actual project context, target locations, owners and testing limits.
3. Create a build/feature ticket in Ready for QA using the board template.
4. Give the agent the [bootstrap prompt](docs/bootstrap-prompt.md). Review its scope and readiness briefing before execution.
5. Configure optional check-ins only after the manual procedure works.

The included context and record files are templates, not project requirements, results or approvals. [Package notes](docs/package-notes.md) explain the source, preserved workflow rules and verification limits.

## License

The workflow files and templates are available under the [MIT license](LICENSE). Linked external standards and documentation remain with their respective publishers.
