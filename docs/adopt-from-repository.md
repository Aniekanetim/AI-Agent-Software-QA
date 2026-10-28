# Adopt this repository with an AI agent

Repository: https://github.com/Aniekanetim/AI-Agent-Software-QA

The user can point an agent to this repository or use a fork, template or clone. The agent prepares a project-specific structure; humans maintain accepted context and authorize bounded learning/testing. Reading a URL alone does not create files, establish access or authorize execution.

Apply the bundled [global mailbox policy](../automation/email/mailbox-policy.md) during adoption. It gives the agent standard fresh-account alias preparation, exact identity reuse and verification correlation. Each project supplies its actual inbox, permissions and alias-support sources; no live account or access grant is inherited from this repository.

## 1. Read a consistent workflow version

Read README.md, AGENTS.md and SETUP.md first, then the [QA workflow](../QA/Quality%20assurance/qa-workflow.md), [board](../QA%20task%20management%20Board/README.md), [context index](../Project%20Context/README.md) and [release sign-off procedure](../QA/Quality%20assurance/release-signoff.md). Read the linked templates needed for the selected objective.

Also read [Product Discovery](../Product%20Discovery/README.md) and its [AI context index](../Product%20Discovery/Project%20Context/README.md). For a learning objective use the discovery procedure/request; for testing use the existing QA workflow/board. The two procedures share context through explicit links, not a common defect lifecycle.

When repository access is available, clone/read a checkout and record its Git commit. An agent using web/file retrieval should read the files from one commit rather than mix changing main-branch versions. Record the workflow source URL and revision in the adopting project's shared progress. The package version identifies the workflow edition; it is separate from the application build under test.

An agent that cannot retrieve repository files needs an accessible clone or uploaded files from the user. Do not claim adoption is complete without reading the workflow. Tool/runtime installation and connector access are separate readiness tasks.

## 2. Choose and preserve the project location

For a fresh QA repository, use a fork, GitHub template or clone, then open its root as the working directory. For an existing application, inspect the current instructions and records before integrating. Use an agreed project-specific QA root or merge the workflow's relevant files into the existing root without overwriting them.

Preserve application code, README, working contracts, context, evidence and unrelated local changes. Existing project/user instructions remain authoritative. Resolve a material instruction conflict with the human; do not silently replace policy. If a workflow is nested, add an appropriate pointer to the project's existing agent entry point or explicitly read the nested AGENTS.md; do not assume automatic discovery by every agent.

Keep the source template unconfigured. A project's active tickets, requirements, credentials, results and approvals belong in its own copy. Installing a workflow is not permission to push to its upstream repository or publish private product information.

## 3. Establish context and work

Follow [SETUP.md](../SETUP.md). Identify the learning/testing objective, actual owners, target, source/build identity where exposed, available requirements/designs, roles and access/data limits. Humans maintain root Project Context; agents read it and propose changes, while maintaining their discoveries in `Product Discovery/Project Context/`. Do not fill missing intent from the current application response. Record both stores' relevant versions separately from the served identity.

Run [guided onboarding](../Onboarding/onboarding-workflow.md) before assigned work: inspect existing setup, show the roadmap and ask one focused missing decision at a time. Establish all five context domains through provide/discover/combined routes. Select browser/visibility, actual provider/account/mailbox and optional GitHub repositories. Install the pinned helpers with `npm ci --ignore-scripts --cache .local/npm-cache`; verify actual tool/access capabilities. No testing-category selection is required: each ticket determines coverage. Preserve private progress under ignored `.local/`, actual sources and recoverable saves. [Settings](../Onboarding/settings.md) remain available later.

For learning, create a real discovery request using its template. Explain questions/actions, reasons, expected knowledge, limits and exact next authorization; then explore within recorded scope. A hosted URL needs no local application checkout. Use authorized accounts/registration or human-assisted sign-in, excluding secrets/session state from Git. Record gaps on the originating request or existing linked QA question. Human owners publish accepted baseline changes; discovery completion is not a test pass.

Create a real build/feature ticket in Ready for QA only from the user's testing request. Preserve the five status folders and unique ticket IDs. Do not populate queues with example incidents, previous project results or template files. The board supplies the next work; the workflow determines how it is performed and reviewed.

## 4. Perform the selected procedure

For discovery, follow the independent procedure linked above, maintain the AI context and complete its learning report. Do not require QA test criteria or G5 release sign-off for discovery alone.

For QA, prepare a concrete scope/design/readiness packet. Brief the human on each proposed check/pass criterion, reason, alternatives, uncertainty, limits and exact next authorization. Execute only after the applicable decision; record the actual reply/method.

Use the required tools for UI, API or non-functional work. Report observations separately from inference and human review. Investigate supported causes, report actionable defects, retain original failures, verify authorized corrections and run relevant regression. Keep developer work and product fixes separately authorized.

At G5, prepare release notes, completion/exit-criteria evidence, a scoped sign-off proposal and next-owner/recovery instructions before review. After the actual decision, deliver the handoff through the authorized channel and record actual delivery/required acceptance. Do not close with a commit or status line alone.

## 5. Arrange optional check-ins

Use [manual QA check-ins or native scheduling setup](../automation/README.md) when requested. The five-folder board and QA gates apply independently of the scheduler. Discovery remains explicitly request-driven, with no schedule activated by this package. Do not expand a QA-board check-in into discovery polling or a crawl without separate authorization.

Configured [GitHub PR intake](../automation/github/README.md) can create linked assignments. Matching automatic regression requires an actual reviewed policy for the exact scope; settings do not manufacture permission. Preserve tested-head/build identity, deduplication, findings decisions and final handoff. The inactive CI example requires project-specific configuration; it is not an already running service.

Do not claim background monitoring merely because the repository was cloned. Record the actual project root, owning agent/chat, cadence, timezone and activation state. Recheck local paths, tools, ownership and source/build identity when moving machines; follow [portability instructions](portability.md).

## Adoption is ready when

- The project-specific copy is accessible and its workflow source/revision is recorded.
- Applicable instructions and human-context ownership are preserved; the agent can locate both contexts, discovery requests, board and QA records.
- Actual setup sources are available or their specific gaps are recorded; no requirements/results/approvals are fabricated.
- The agent can prepare the appropriate informed briefing. Discovery, testing, baseline changes and scheduling retain their separate authorization boundaries.

## Existing tools and API readiness

Follow [shared tool discovery](../automation/tools/README.md) before setup questions. Reuse existing tools and connections when actual access through this harness is verified. Moving hosts requires targeted capability checks, preserving earlier answers and historical evidence. [Postman CLI](../automation/postman/README.md) supports local collections without account login; cloud resources require selected identity/access and explicit reporting scope.
