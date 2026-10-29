# Tools, intake and check-ins

Start with [shared discovery/reuse](tools/README.md): verify existing tools through the actual calling harness before offering installation or sign-in. [Postman CLI](postman/README.md) adds collection-based API execution with conditional cloud authentication. The master remains unconfigured.

The runtime helpers support [guided onboarding](../Onboarding/README.md), [browser capabilities](browser/README.md), [email/mailbox verification](email/README.md) and [GitHub intake/regression](github/README.md). Install with `npm ci --ignore-scripts --cache .local/npm-cache`; `npm run qa -- help` lists commands. The agent's actual conversation and human decisions remain essential. Installed tooling, saved preferences and verified access are distinct states.

The [global mailbox policy](email/mailbox-policy.md) and `email account` fresh/reuse helper provide shared-inbox account isolation across tasks. The physical mailbox remains the connection identity; verification preserves the full application alias. Identity preparation is recorded separately from actual account creation and application outcomes.

Choose on-demand, scheduled, event-driven or combined operation during onboarding or settings. Each task determines testing coverage. The five-folder board and G1–G5 remain the work/execution model; discovery remains independent. Matching reviewed regression policy can authorize automatic runs, but neither intake nor a scheduler invents test authority.

## Native board check-ins

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

## GitHub triggers and readiness records

After a repository/PR policy is selected, a native check-in can run `github check-in` and then inspect the existing board; this polls eligible PRs and deduplicates them. A GitHub event can invoke `github event` through a configured runner. CLI availability alone cannot wake the agent. The [inactive CI example](github/examples/qa-regression.example.yml) needs explicit project adoption, trusted QA code, actual target identity and reviewed authorization before enabling.

Store the desired mode/source in `.local/operation-preferences.json`. For scheduled operation, record the actual scheduler id/state/root/source/evidence in `.local/schedule-record.json` after inspecting the real scheduler result. For events, retain triggerReference and triggerEvidence. These are evidence-backed records, not a scheduler implementation. A saved cadence or a dispatched workflow is not proof of completed execution. Verify unattended browser/email capabilities in the actual scheduled context and record first-run observations.

Stay quiet when monitored state is unchanged or nonactionable unless periodic updates were explicitly requested. Report meaningful progress, failures or human decisions needed. No adopting-project schedule, discovery poller or PR-regression trigger is activated in this master; its own package CI only tests helpers and a synthetic fixture.

## Coverage and process records

[QA Process Context](../QA%20Process%20Context/README.md) supplies task-relevant testing preparation and maintenance. The optional [coverage assessor](coverage/README.md) reads a private snapshot of canonical records, checks IDs/references/counts and exposes stale claims. It creates no report or product verdict and performs no tests. Board prompts and configured GitHub work retain the same authorizations and gates.

## Application-map helpers

[Map validation/tracing](flow-map/README.md) reads a temporary projection of the canonical [Application Flow Map](../Application%20Flow%20Map/README.md). It checks IDs/references and traces bounded candidate paths, preserving uncertainty, cycles and historical evidence. The agent reviews semantics and briefs the human before testing. No crawl, map-writing service, test runner or scheduler is activated.

## Task-specific capabilities and data

The [tool selection procedure](tools/task-selection.md) and [data preparation assessor](data/README.md) support agent decisions inside existing authorization. Onboarding records optional capability gaps separately; assigned work still needs its selected operations, data/state and actual access checked. Neither helper launches tests, generates product data or changes schedules.

## Chrome DevTools and WebMCP

The [Chrome DevTools adapters](chrome-devtools/README.md) support local MCP-server, CLI and evidence-backed native-host routes. `chrome check` discovers/reuses setup without launching a browser; `chrome mcp-config` emits configuration without connecting it. Explicit scoped sessions, page inventories, invocation history and independent outcome confirmation support authorized work. The agent chooses the route per task. No tool, product connection, profile or schedule becomes mandatory or active through packaging.
