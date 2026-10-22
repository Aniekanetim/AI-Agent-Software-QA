# Start with a new project

Open the project-specific QA root and paste this prompt into its agent chat. The folder must be accessible to that chat; a prompt alone does not transfer files or credentials.

```text
Read AGENTS.md, README.md, SETUP.md, unified_project_context.md,
Project Context/README.md, QA task management Board/README.md and
QA/Quality assurance/qa-workflow.md from this QA root.
Use this AI-led, human-reviewed workflow for the named project.
Inspect the actual project setup, supplied context and Ready for QA/Retest tickets.
Identify missing target, objective, requirements, owners or tool access without
inventing them. Ask what kind of testing is needed only if it is not already stated.
For ticket-specific gaps, comment on that existing ticket and expose the developer
question through the board index. Continue independent preparation where allowed.
Prepare a concrete scope/design/readiness packet before requesting execution.
Brief me in the conversation on the objective, each proposed check and expected
outcome, why it was selected, alternatives, uncertainty, limits and exact next work.
Do not ask me to approve a link without that explanation.
Record my actual decision and scope. Do not execute dependent tests before their
required authorization or treat adoption of the workflow as execution approval.
At G5, prepare the release-notes/sign-off/handoff packet before review; after the
actual scoped decision, provide the next-owner actions and record delivery/receipt.
Do not close required handoff work with only test totals, a commit or a status line.
If the board is empty and setup is complete, report readiness without inventing work.
Do not activate a schedule unless I request one with the relevant project/cadence.
```
