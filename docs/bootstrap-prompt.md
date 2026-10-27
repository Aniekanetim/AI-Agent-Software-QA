# Start with a new project

Open the project-specific QA root and paste this prompt into its agent chat. The folder must be accessible to that chat; a prompt alone does not transfer files or credentials.

```text
Read AGENTS.md, README.md, SETUP.md, unified_project_context.md,
Project Context/README.md, Product Discovery/README.md,
Product Discovery/Project Context/README.md, QA task management Board/README.md and
QA/Quality assurance/qa-workflow.md from this QA root.
Use this AI-led, human-reviewed workflow for the named project.
Start Onboarding/onboarding-workflow.md. Inspect preparation, present its roadmap,
ask one focused missing decision at a time, save clear extra answers and preserve
pause/resume/settings/recovery. Let me provide context, choose discovery or combine
both; account for all five domains without inventing knowledge. Offer the bundled
browser methods/visibility, GitHub and provider/account/mailbox choices. Verify
actual access separately from saved preferences. Keep private state ignored.
Inspect actual setup and the supplied learning/testing objective. Read relevant
sources in both contexts. Humans maintain root Project Context; the agent maintains
Product Discovery/Project Context. Do not edit the human baseline during execution.
For learning, use Product Discovery/discovery-workflow.md and a discovery request;
explain actions, reasons, intended learning and access/data limits before execution.
Hosted discovery needs no application checkout. Establish authorized access and
keep credentials/session state out of committed records. Separate observations
from inference; missing intent is not a confirmed product failure.
For a testing objective only, inspect Ready for QA/Retest and follow QA below.
Identify missing target, objective, requirements, owners or tool access without
inventing them. Each task determines the relevant testing activities from its
requirements, changes and risks; do not require a testing-category selection.
Discovery-only requests retain learning criteria rather than product test verdicts.
For ticket-specific gaps, comment on that existing ticket and expose the developer
question through the board index. Discovery-origin questions stay on their request
and discovery index. Link existing conversations instead of repeating them. Propose
human-baseline changes to the responsible owner. Continue independent authorized work.
For QA execution, prepare a concrete scope/design/readiness packet first.
Brief me in the conversation on the objective, each proposed check and expected
outcome, why it was selected, alternatives, uncertainty, limits and exact next work.
Do not ask me to approve a link without that explanation.
Record my actual decision and scope. Do not execute dependent tests before their
required authorization or treat adoption of the workflow as execution approval.
For QA G5, prepare the release-notes/sign-off/handoff packet before review; after the
actual scoped decision, provide the next-owner actions and record delivery/receipt.
Do not close required handoff work with only test totals, a commit or a status line.
Keep human source revisions, discovery entry versions and served build identity
separate; record Unknown when the target does not expose its version.
An empty QA board does not start discovery. Resume only explicit eligible work;
otherwise report readiness without inventing work or changing files.
Do not activate a schedule unless I request one with the relevant project/cadence.
Configured PR intake creates linked work without authorizing tests. Reuse only an
actual matching reviewed regression policy; material changes return to the gate.
Preserve actual findings review and sign-off. Never copy approvals from the master.
```

## Existing tools and API readiness

Follow [shared tool discovery](../automation/tools/README.md) before setup questions. Reuse existing tools and connections when actual access through this harness is verified. Moving hosts requires targeted capability checks, preserving earlier answers and historical evidence. [Postman CLI](../automation/postman/README.md) supports local collections without account login; cloud resources require selected identity/access and explicit reporting scope.
