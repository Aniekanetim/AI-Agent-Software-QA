# Native board check-ins

**Package state:** not configured. No schedule ID or target chat is included, and packaging this workflow does not create or change an automation.

This procedure schedules QA-board work only. Product Discovery is an independent request-driven pipeline; no discovery polling is configured. Reading its context during QA does not authorize exploration. Any future discovery schedule needs an explicit separate request, target, cadence and scope; do not repurpose existing project check-ins automatically.

## Activate for a real project

1. Finish [project setup](../SETUP.md) and open the actual QA root in a local agent chat.
2. Copy the [check-in prompt](check-in-prompt.md), replace `<QA_PROJECT_ROOT>` with that project's absolute path and test it manually.
3. Confirm empty-board no-op, ticket ownership/checkpoint handling and informed human-review behavior. A folder's status never authorizes execution.
4. Choose a project-specific schedule name, cadence, timezone and target chat with the human. Hourly is an available workflow choice, not a portable permission or an already active schedule.
5. Use the existing Codex native scheduling feature to return to that project's chat and local checkout. Inspect matching schedules and update an existing one rather than creating a duplicate. Do not write scheduler configuration or raw recurrence directives by hand.
6. Record the actual name, ID, target project/chat, cadence, timezone and confirmed state below. Review the first scheduled outputs and adjust only within the human's instructions.

Use a chat-linked check-in when continuing this workflow in the same conversation. Local-file tasks require the computer and desktop app to remain available. These operating details come from [official OpenAI scheduling guidance](https://learn.chatgpt.com/docs/automations?surface=app); availability depends on the installed app/account configuration. Copying this package does not transfer a schedule, tool connection or chat authority.

## Project scheduling record

| Field | Actual configured value |
| --- | --- |
| Name / automation ID | Not configured |
| QA root / target chat | Not configured |
| Cadence / timezone | Not selected |
| Confirmed state / date | Not configured |
| Manual check-in outcome | Not performed for this project |
| First scheduled run observation | Not observed for this project |

Developer check-ins remain their own routine against Dev Todo/Rework and the unanswered-question index. This package does not create a developer automation or authorize the QA agent to implement fixes.

## Move to another machine

Follow [portability instructions](../docs/portability.md). Verify the new root, target chat and tool access. Do not copy machine-level automation TOML, an old thread ID or credentials to simulate setup. Before arranging replacement ownership, identify any old schedule that could operate on the same project; change or pause it only with the relevant user authorization and record the result.
