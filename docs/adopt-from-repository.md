# Adopt this repository with an AI agent

Repository: https://github.com/Aniekanetim/AI-Agent-Software-QA

The user can point an agent to this repository or work from a fork, template repository or clone. The agent reads the workflow and installs a project-specific document structure; the user supplies the product context and approves bounded testing. Reading a URL alone does not create local files, install tools or authorize execution.

## 1. Read a consistent workflow version

Read README.md, AGENTS.md and SETUP.md first, then the [QA workflow](../QA/Quality%20assurance/qa-workflow.md), [board](../QA%20task%20management%20Board/README.md), [context index](../Project%20Context/README.md) and [release sign-off procedure](../QA/Quality%20assurance/release-signoff.md). Read the linked templates needed for the selected objective.

When repository access is available, clone/read a checkout and record its Git commit. An agent using web/file retrieval should read the files from one commit rather than mix changing main-branch versions. Record the workflow source URL and revision in the adopting project's shared progress. The package version identifies the workflow edition; it is separate from the application build under test.

An agent that cannot retrieve repository files needs an accessible clone or uploaded files from the user. Do not claim adoption is complete without reading the workflow. Tool/runtime installation and connector access are separate readiness tasks.

## 2. Choose and preserve the project location

For a fresh QA repository, use a fork, GitHub template or clone, then open its root as the working directory. For an existing application, inspect the current instructions and records before integrating. Use an agreed project-specific QA root or merge the workflow's relevant files into the existing root without overwriting them.

Preserve application code, README, working contracts, context, evidence and unrelated local changes. Existing project/user instructions remain authoritative. Resolve a material instruction conflict with the human; do not silently replace policy. If a workflow is nested, add an appropriate pointer to the project's existing agent entry point or explicitly read the nested AGENTS.md; do not assume automatic discovery by every agent.

Keep the source template unconfigured. A project's active tickets, requirements, credentials, results and approvals belong in its own copy. Installing a workflow is not permission to push to its upstream repository or publish private product information.

## 3. Establish context and work

Follow [SETUP.md](../SETUP.md). Identify actual project owners, target/environment, source/build identity, business rules, feature acceptance criteria, design revisions, access, data limits and requested testing objective. Link supplied authoritative sources; identify gaps and use ticket comments for missing or conflicting answers.

Create a real build/feature ticket in Ready for QA only from the user's testing request. Preserve the five status folders and unique ticket IDs. Do not populate queues with example incidents, previous project results or template files. The board supplies the next work; the workflow determines how it is performed and reviewed.

## 4. Perform the reviewed workflow

Prepare a concrete scope/design/readiness packet. Brief the human on the objective, each proposed check/pass criterion, selection rationale, alternatives, uncertainty, limits and exact next authorization. Execute only after the applicable decision; record the actual reply and review method.

Use the required tools for UI, API or non-functional work. Report observations separately from inference and human review. Investigate supported causes, report actionable defects, retain original failures, verify authorized corrections and run relevant regression. Keep developer work and product fixes separately authorized.

At G5, prepare release notes, completion/exit-criteria evidence, a scoped sign-off proposal and next-owner/recovery instructions before review. After the actual decision, deliver the handoff through the authorized channel and record actual delivery/required acceptance. Do not close with a commit or status line alone.

## 5. Arrange optional check-ins

Use [manual check-ins or the documented native scheduling setup](../automation/README.md) when requested. The five-folder board and human gates apply independently of the scheduler. Other capable agents can follow the same check-in prompt through a human-initiated run or their separately authorized scheduling mechanism.

Do not claim background monitoring merely because the repository was cloned. Record the actual project root, owning agent/chat, cadence, timezone and activation state. Recheck local paths, tools, ownership and source/build identity when moving machines; follow [portability instructions](portability.md).

## Adoption is ready when

- The project-specific copy is accessible and its workflow source/revision is recorded.
- Applicable project instructions are preserved and the agent can locate its context, board and QA records.
- Actual setup sources are available or their specific gaps are recorded; no requirements/results/approvals are fabricated.
- The agent can prepare the first informed review briefing. Testing and scheduling retain their separate authorization boundaries.
