# Browser capabilities

The pinned dependencies bundle four distinct tools. The host's in-app browser is an additional choice supplied by that host.

| Component | Use | Operational proof |
| --- | --- | --- |
| Playwright CLI | Interactive agent browser commands | Named session launches and completes the rehearsal |
| Playwright MCP | Browser tools exposed through an MCP client | Actual host connection plus exercised browser tools |
| Playwright library | Scripted browser control | Script launches and verifies the fixture |
| Playwright Test | Repeatable suites, assertions and regression | Actual selected suite/result, separate from fixture checks |
| Harness in-app browser | Native host browser interaction | Actual host tools and demonstrated operations |

Choose cli, mcp, inApp or recommend for interaction. A recommendation must compare actual available capabilities, then save the resolved choice. Save visibility and any explicitly accepted fallback. Playwright Test remains available regardless of that preference. Separate sessions do not automatically share site authentication.

## Install and rehearse

```shell
npm ci --ignore-scripts --cache .local/npm-cache
npm run qa -- browser versions
npm run qa -- browser install
npm run qa -- browser check --provider library --headless
npm run qa -- browser check --provider cli --headless
npm run qa -- browser check --provider mcpServer --headless
```

The installer downloads both Chromium engine revisions needed by the pinned stable library and CLI/MCP dependencies into `.local/browsers`. It does not use or alter a personal browser profile. Runtime tools/browser versions can differ; do not assume the library's engine satisfies MCP/CLI. If OS packages are missing, follow the official [Playwright browser installation guidance](https://playwright.dev/docs/browsers) for that host.

The rehearsal serves a random loopback-only synthetic draft, fills a form, uploads a synthetic attachment, saves and reloads/reopens it. It uses no product URL, email, funds or real account. Library checks a second browser context; CLI/MCP check reload recovery. Reports under `.local/browser-reports/` retain provider/version/machine/root/context, visibility and evidence. This is tool verification, not product testing or execution of a user's regression suite.

Omit `--headless` for headed checks. Use `--context scheduled` only from the actual unattended execution context; a flag entered in an interactive session is not proof that a scheduler can operate. A denied/failed probe records denied/unverified operations, and readiness remains incomplete. Resolve the host restriction; do not bypass it.

## Connect MCP to the actual agent host

```shell
npm run qa -- browser mcp-config
```

The output is a client configuration example referencing the installed pinned executable and private browser cache. Register it through the actual host's supported MCP configuration/permissions, retaining existing compatible connections. The generic `mcpServers` shape may need translation for that host. This command does not modify host settings or claim that the tools are attached.

The `mcpServer` rehearsal starts a local stdio MCP client and proves that server/browser path only. After host attachment, exercise its actual tools and retain a **harnessMcp** report. In-app browsing likewise needs an **inApp** report. A library or server report cannot satisfy native-host readiness. Follow the [official MCP integration](https://playwright.dev/docs/getting-started-mcp) and [CLI guide](https://github.com/microsoft/playwright-cli).

## Native host rehearsal

Run `npm run qa -- browser fixture` in an owned terminal. It prints a synthetic loopback URL and attachment path and closes after five minutes. Through the actual selected host tools: navigate, inspect the page, fill Name, attach the file, save and reopen the same URL. Retain redacted tool-call/outcome evidence. Unsupported upload or session recovery stays unsupported; it is not converted into a pass.

Prepare a private BrowserReport matching the [type](tools.ts): schemaVersion 1, provider inApp/harnessMcp, actual executionContext/visibility, real root/platform/arch/Node major, observed host version/date and per-operation status/evidence. Use navigate/interact/inspect as the initial minimum; a task can require upload/recover or further capabilities. Import with `browser import-report --input .local/native-report.json [--context scheduled]`. The agent must actually perform and explain those checks; the importer verifies references and identity, not whether a claimed observation is true.

## Scripted testing

Author task-specific suites with [Playwright Test](https://playwright.dev/docs/intro) under the adopting project's reviewed test location. Give expected behavior an independent accepted source. Preserve failures, tested revisions and result artifacts. A snapshot, host walkthrough or successful capability rehearsal cannot be reported as a passing Playwright regression suite.
