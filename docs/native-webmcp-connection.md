# Connect WebMCP to the current agent harness

Use this procedure when a task needs native WebMCP tools and the current harness cannot use them. First inspect the existing connection: a compatible, working connection needs no replacement. Installing this repository's dependency does not change a server already registered in an agent host.

## Identify the connection actually in use

Record the harness/server name, configured command and arguments, installed server version, exposed tool names and the result of a bounded harmless check. Read only the relevant configuration entry; do not copy unrelated credentials or browser data into evidence.

An installed package, an MCP handshake, a listed tool and a completed browser operation establish different things. In particular:

| Check | What it establishes |
| --- | --- |
| Direct server `initialize` and `tools/list` | The selected process speaks MCP and advertises capabilities |
| Server registered and restarted in the current harness | The host is configured to load that process; confirm its actual tool catalogue |
| Native page-list/navigation call | That harness connection can reach the selected browser |
| Native WebMCP listing | Application tools observed in that page and session |
| Authorized invocation and independent state check | The requested application outcome, separately from the QA verdict |

A terminal preflight is not a native-host pass. A missing WebMCP tool does not prove that the target application exposes no tools.

## Prepare a separate, scoped connection when needed

1. Reuse the project's selected compatible executable and [Chrome settings](../automation/chrome-devtools/README.md#configure-only-missing-preparation). For the bundled route, use the exact pinned package rather than downloading a moving `latest` release. Check the actual Node and browser versions.
2. Generate the actual command, arguments and environment with `npm run qa -- chrome mcp-config`. Launch/project settings produce a local-server example; native-host mode refers to an existing connection and cannot generate a replacement launcher.
3. Choose an unused server name, such as `qa-webmcp`, and retain other configured connections. Use an absolute Node executable and pinned JavaScript entry point on Windows. This avoids dependence on a host's interpretation of an `npx` shell wrapper.
4. Preserve the generated workspace limits, visibility, dedicated profile and privacy settings. New dedicated launches use Standard networking. Strict includes the selected network rules. The bridge's WebMCP category and the browser's `WebMCP` feature are separate requirements.
5. Register through the host's supported MCP setup, then refresh/restart that connection. Configuration output alone does not perform registration. Do not edit protected host files through another tool or change security settings to bypass a restriction.

For this bridge release, Chrome's [configuration reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/chrome-devtools-mcp-v1.12.0/docs/configuration.md) documents Chrome 150+, `--categoryExperimentalWebmcp=true` and `--chromeArg=--enable-features=WebMCP`. `--autoConnect` instead depends on an already-running browser with remote debugging enabled; it is not equivalent to an isolated launch.

In Codex, use the installed app's MCP settings or the [documented CLI procedure](https://learn.chatgpt.com/docs/extend/mcp?surface=cli): `codex mcp add <name> --env KEY=VALUE -- <command> <arguments>`. The user-observed desktop interface in this audit exposes Settings → Plugins → MCPs and no individual Restart button. When no reload control is available, fully quit and reopen the app, then return to the same chat and verify its refreshed tools. Do not ask the user to find a button that their version does not expose. Preserve argument boundaries, especially Windows paths with spaces. Global and trusted project configuration have different loading scopes; a file in a child checkout is not proof that a parent-folder chat loaded it.

If the agent cannot change host configuration or reload the connection through an exposed supported tool, it prepares the concrete entry and asks the user for that final setup action. It should explain the actual restriction and avoid restarting onboarding or requesting unrelated access. Keep machine-specific entries and live fixture origins in ignored local records.

## Verify through the actual harness

After restart, inspect the refreshed harness catalogue for `list_webmcp_tools` and `execute_webmcp_tool`. If they are still absent, compare the loaded server/version/category and any tool filters; do not infer a fix from saved configuration. Preserve startup errors and the exact timeout rather than repeatedly making the same unanswered probe.

Check actual tool approvals separately from server access. A read-only page-list call can succeed while navigation or execution is refused with `MCP tool call requires approval, but approval policy is never`. That response establishes a host-policy block, not a server or application failure. Preserve it; do not reroute the refused action through another tool. The user can select a suitable available mode through the permissions control below the composer, as described in [OpenAI's permission guidance](https://learn.chatgpt.com/docs/permission-modes). Ask for approval or Approve for me can surface/review required approvals while retaining workspace boundaries. Record the effective sandbox and tool behavior together: in the completed rehearsal the user instead selected Full Access, after which the same native call succeeded even though the approval policy remained never. Full Access is not a package prerequisite. The agent must not weaken policy or claim that a user setting has taken effect until an actual call establishes it.

Use an authorized isolated fixture or target. Establish the exact page, actual browser/visibility, role/account state and current inventory. Invoke one selected in-scope action, then independently inspect its persisted result and relevant visible state. Keep tool discovery, invocation outcome, application verification and QA verdict separate. Do not retry an uncertain mutation before investigating its outcome.

If the browser cannot launch, inspect the actual error. Chrome's [troubleshooting guide](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/chrome-devtools-mcp-v1.12.0/docs/troubleshooting.md#operating-system-sandboxes) describes a supported alternative: the user starts a dedicated debuggable browser and the server connects to its explicit loopback `--browserUrl`. Any such browser needs its own authorized profile and WebMCP feature setting. This is a user-managed setup alternative, not permission for an agent to evade denied process creation or disable Chrome's sandbox. Verify the resulting session separately.

Finally, import only actual native-call evidence using the [native harness evidence procedure](../automation/chrome-devtools/README.md#native-harness-evidence). Retain earlier failed attempts. A working new connection does not explain an older connection's timeout or close unrelated browser reliability issues.
