# Adopt the workflow for a project

Choose one QA root for each project. All relative links, board folders and records in this package are resolved from that root. The workflow itself uses plain Markdown; execution tools depend on the selected testing objective.

When starting from the public repository URL, follow [agent repository adoption](docs/adopt-from-repository.md). Record the workflow source/revision in shared progress, separately from the application target. A fork or template repository can serve directly as the project-specific QA root.

## 1. Place the files

Copy the complete package into a new project-specific directory. You can use that directory as a separate QA project and record the application's location in the environment reference. Alternatively, merge the package into the application's repository root.

When merging, inspect existing AGENTS.md, QA records and folder names first. Preserve applicable instructions and merge deliberately; do not overwrite another project's working contract or evidence. Keep exactly one authoritative board and context index for that project.

In Codex, open the chosen QA root as the primary local project directory so its AGENTS.md is discovered. If the application is elsewhere, attach its folder or otherwise provide access and record its path. [Official project guidance](https://learn.chatgpt.com/docs/projects) explains primary-folder instruction discovery and that conversation sync does not transfer local project files.

## 2. Supply the actual project context

Complete [Project Context/README.md](Project%20Context/README.md) and its relevant sources. Record project identity, business goal, owners, applicable requirements/design revisions, target environment, build identity, setup commands and test-data limits. Keep acceptance criteria with product requirements; use stable rule and criterion IDs.

Existing authoritative documents can be linked instead of rewritten. Label unavailable, draft, proposed or superseded information accurately. Do not invent a BRD, approved Figma handoff, performance threshold or owner approval to complete a template. Missing information blocks only the checks that depend on it.

Update [shared progress](unified_project_context.md) with the actual setup checkpoint. Remove or replace template fields only with supplied facts. Adoption does not approve a test scope.

## 3. Verify tools for the chosen objective

| Objective | Readiness to establish |
| --- | --- |
| UI/functional | Browser access, application setup, agreed journeys, assertions and isolated data; install Playwright or the selected tool only when needed |
| API | Actual API base URL, method/contract, authentication, payloads and saved-state expectations; Postman or an authorized HTTP runner as appropriate |
| Usability | User goals, tasks and inspection/research method; distinguish expert inspection from sessions with representative users |
| Performance | Agreed workload, environment, metrics, thresholds and stop conditions |
| Accessibility | Named criteria, automated/manual methods and coverage limits |
| Security | Explicit target and permitted actions, test accounts/data and stop conditions |

Record missing tools as readiness blockers. A tool not being installed is not a product defect. Restore project dependencies from their own manifests; this portable workflow does not bundle runtimes, browser binaries or connectors.

## 4. Create the first assignment

Copy the build/feature template from the [board README](QA%20task%20management%20Board/README.md#build-or-feature-ticket-template) into Ready for QA. Give it a unique ID, descriptive filename, objective, priority, target revision, acceptance criteria, source links, setup and completion criteria. Do not place template files or old completed incidents in a live queue.

Paste the [bootstrap prompt](docs/bootstrap-prompt.md) into the project's agent chat. The agent reads the sources and prepares the scope/design/readiness briefing. The human sees what each check does, what a pass means, why it was selected, alternatives and gaps, then approves or revises the bounded proposal. No dependent execution precedes that decision.

## 5. Verify a manual check-in

Use the [check-in prompt](automation/check-in-prompt.md), replacing its root placeholder. Verify the five board folders, developer-question index, ownership and checkpoint handling. An empty board produces a brief no-op with no file changes. A new ticket produces preparation and an informed review request; it must not silently start tests.

For an existing ticket, use its recorded approvals only when the target, criteria and scope still match. A new machine must recheck access, tools and build identity before execution. Do not duplicate results or infer a new approval from a copied ticket.

## 6. Enable optional scheduling

Follow [automation setup](automation/README.md). Select the actual project root, chat, cadence and timezone; confirm the saved schedule and review the first runs. This package has no active automation and does not alter schedules belonging to other projects.

## Ready to use

- The agent can read the working contract, shared progress, board, context and workflow without relying on another chat.
- The requested testing type, target, applicable sources, reviewers and limits are known; necessary gaps are recorded.
- Live tickets are unique and separate from templates; their links and current statuses resolve.
- Execution and completion await their required scoped human decisions.
- At G5, use the [release sign-off procedure](QA/Quality%20assurance/release-signoff.md) and [packet template](QA/Quality%20assurance/templates/completion-handoff.md). Prepare release notes/evidence/owner actions before asking, then record the actual decision and handoff delivery/required receipt before eligible closure.
- Any configured schedule points to this project and is recorded accurately.
