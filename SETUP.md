# Adopt the workflow for a project

Choose one QA root for each project. All links, discovery records and board folders resolve from that root. Start [guided onboarding](Onboarding/README.md): it prepares context, access and tools; later tasks determine testing coverage. Discovery and QA remain separate procedures connected through explicit requests and two context stores.

When starting from the public repository URL, follow [agent repository adoption](docs/adopt-from-repository.md). Record the workflow source/revision in shared progress, separately from the application target. A fork or template repository can serve directly as the project-specific QA root.

## 1. Place the files

Copy the complete package into a new project-specific directory. You can use that directory as a separate QA project and record the application's location in the environment reference. Alternatively, merge the package into the application's repository root.

When merging, inspect existing AGENTS.md, records and folder names first. Preserve instructions and merge deliberately. Keep one QA board and one index for each context store; preserve the human/agent ownership boundary instead of merging the stores.

In Codex, open the QA root as the primary project directory so its AGENTS.md is discovered. For a local application, provide its folder/setup as needed. For a hosted application, supply its URL and authorized access; an application checkout/start command is optional. [Official project guidance](https://learn.chatgpt.com/docs/projects) explains primary-folder instruction discovery and that conversation sync does not transfer files.

## 2. Supply the actual project context

Onboarding offers **provide context**, **discover context** or **combine both**, reusing any supplied choice. Account for business, product, technical, design and decisions through sourced knowledge, justified non-applicability or original owner questions. Use the [focused context interview](Onboarding/context-interview.md), not a repetitive questionnaire. Initial context establishment is mandatory; complete product knowledge is not assumed.

Humans maintain [root Project Context](Project%20Context/README.md): identity, business goals, owners, requirements/designs, environments and data limits. Keep acceptance criteria with product requirements and use stable rule/criterion IDs. Agents do not populate these files from exploration or edit them during discovery/testing.

Existing authoritative documents can be linked instead of rewritten. Label unavailable, draft, proposed or superseded information accurately. Do not invent a BRD, approved Figma handoff, performance threshold or owner approval to complete a template. Missing information blocks only the checks that depend on it.

The agent maintains [discovery context](Product%20Discovery/Project%20Context/README.md) for observations, interpretations and gaps. Both stores begin unconfigured. Discovery can start with a staging URL and bounded access even when requirements are unavailable; correctness judgments needing those requirements wait for their owner.

Update [shared progress](unified_project_context.md) with actual setup facts/gaps. Propose human-baseline changes on the originating request/ticket. Adoption does not authorize exploration or testing. Record human source revisions, discovery entry versions and served identity separately; use Unknown when the build is undisclosed.

## 3. Verify tools for the chosen objective

Start with [shared discovery and reuse](automation/tools/README.md). Record the actual calling harness from available metadata and inspect existing setup before asking tool questions. Reuse verified compatible tools; resolve only missing access/capabilities. A tool working in a personal terminal or CI does not prove it works through the adopting harness. The [Postman guide](automation/postman/README.md) covers local collections, conditional cloud login, selected resources and reporting.

| Objective | Readiness to establish |
| --- | --- |
| UI/functional | Browser access, application setup, agreed journeys, assertions and isolated data; install Playwright or the selected tool only when needed |
| API | Actual API base URL, method/contract, authentication, payloads and saved-state expectations; Postman or an authorized HTTP runner as appropriate |
| Usability | User goals, tasks and inspection/research method; distinguish expert inspection from sessions with representative users |
| Performance | Agreed workload, environment, metrics, thresholds and stop conditions |
| Accessibility | Named criteria, automated/manual methods and coverage limits |
| Security | Explicit target and permitted actions, test accounts/data and stop conditions |

For discovery, establish browser/network access, authorized journeys/roles/actions, a writable QA root and evidence/data limits. Follow the [authentication/session procedure](Product%20Discovery/discovery-workflow.md#authentication-and-sessions): dedicated accounts, authorized registration or human-assisted sign-in. Credentials/session state stay out of committed records. An unavailable role limits only dependent coverage.

Missing tools are readiness blockers, not product defects. Install Node.js 22+, Git and the pinned helpers with `npm ci --ignore-scripts --cache .local/npm-cache`; run `npm run check` and `npm test`. The package includes browser/email/GitHub adapters and reproducible dependencies. Browser binaries and actual host connections require adopting-machine setup. Restore application dependencies only when local execution requires them.

Choose browser interaction/visibility using the [browser guide](automation/browser/README.md). Discover email providers and explicitly select the actual account/mailbox using the [email guide](automation/email/README.md). Prepare selected GitHub repositories through the [GitHub guide](automation/github/README.md). Verify actual required capabilities; configuration, authentication and a successful task-specific run are distinct states. Store operational metadata under ignored `.local/`; never commit credentials, full OTPs or reusable links.

## 4. Create the appropriate request

For learning, copy the [discovery template](Product%20Discovery/templates/discovery-request.md) into `Product Discovery/requests/`. Identify questions/journeys, reasons, target, roles, permitted mutations/cleanup, completion criteria and reviewer. Follow the independent [discovery procedure](Product%20Discovery/discovery-workflow.md); do not route learning through QA status folders. The agent maintains discoveries within the recorded exploration authorization.

For testing, copy the build/feature template from the [board README](QA%20task%20management%20Board/README.md#build-or-feature-ticket-template) into Ready for QA. Supply a unique ID, descriptive filename, objective, priority, target, criteria/source links, setup and completion criteria. Do not place templates or old incidents in a live queue.

Use the [bootstrap prompt](docs/bootstrap-prompt.md) to route the objective. Before QA execution, explain each check, pass criterion, reason, alternatives and gaps. Before discovery, explain each learning action, intended output, reason and limits. Neither pipeline silently authorizes the other. A QA ticket can link targeted discovery, preserving the original question and checkpoint; discovery can also start without a QA ticket.

## 5. Verify a manual check-in

For QA, use the [check-in prompt](automation/check-in-prompt.md) with the actual root. Verify the five status folders, question index and ownership/checkpoints. An empty board produces a no-op with no file changes and does not trigger discovery. A new ticket produces preparation and an informed briefing, not silent tests.

For discovery, give the agent a real request ID and follow its start/resume procedure. Verify that it reads both contexts, preserves history/scope and writes knowledge only in its own context. Reviewing templates does not demonstrate a live staging walkthrough.

For an existing ticket, use its recorded approvals only when the target, criteria and scope still match. A new machine must recheck access, tools and build identity before execution. Do not duplicate results or infer a new approval from a copied ticket.

## 6. Enable optional scheduling

Follow [automation setup](automation/README.md) for requested QA-board check-ins or PR intake. Select the actual root/chat, cadence/timezone, repositories and reporting permissions; inspect the actual scheduler/trigger result. Reviewed reusable policies can authorize matching regression runs; changed scope returns to the affected gate. This package activates no product automation and does not alter other projects' schedules. Discovery polling needs a separate explicit request.

## Ready to use

Provide the [onboarding handoff](Onboarding/templates/onboarding-handoff.md) with actual context coverage, capabilities, remaining dependencies, review and first eligible work. `onboarding status` revalidates saved references but cannot judge their substantive accuracy. [Settings](Onboarding/settings.md) remain available; preserve answers and reopen only affected checks.

- The agent can read the working contract, shared progress, both context indexes and the applicable procedure without another chat.
- Humans maintain the baseline; the agent maintains discoveries. Missing intent remains an explicit gap.
- The learning/testing objective, applicable target/sources, reviewers and limits are known; necessary gaps are recorded.
- Live requests/tickets are unique and separate from templates; links and checkpoints resolve.
- Execution and completion await their required scoped human decisions.
- For QA G5, use the [release sign-off procedure](QA/Quality%20assurance/release-signoff.md) and [packet template](QA/Quality%20assurance/templates/completion-handoff.md). Discovery has its own learning completion record; neither completion authorizes the other pipeline.
- Any configured schedule points to this project and is recorded accurately.
