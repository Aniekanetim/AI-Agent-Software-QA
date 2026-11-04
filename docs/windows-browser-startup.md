# Windows browser startup investigation

## What failed

The package's headed Windows Chrome DevTools MCP fixture intermittently aborted its first loopback navigation with `net::ERR_ABORTED`. The owned page remained `about:blank`, and the HTTP fixture received zero requests. The exact-page assertion correctly failed before the later WebMCP checks could run. This was package-integration evidence, not an application defect or a failure of every Windows tool.

The original fixture selected Playwright's Chrome for Testing 156.0.8078.4 for bridge 1.12.0. Failed and passing CI executions remain in the [validation history](webmcp-validation.md). The separately configured native harness connection and installed-Google-Chrome comparisons have their own evidence.

## Investigation and limits

At source revision `9a2fa7668d5257c0fdb7a9a59706a090a77858c8`, the unmodified local MCP startup sequence failed 1 of 12 fresh headed launches. A smaller HTTP-server/Puppeteer/embedded-DevTools reproduction also failed without the QA framework or MCP transport.

| Controlled check | Observed result | Conclusion |
| --- | --- | --- |
| Complete, focused startup-document barrier | 29 passed; 1 failed | Rejected as a correction |
| Puppeteer's matching Chrome for Testing 156.0.8078.47 | 29 passed; 1 failed | Matching its default browser alone did not correct the failure |
| Minimal reproduction with/without origin rules, alternating order | With rules: 20 passed; without rules: 19 passed, 1 failed | Origin rules are not necessary for the failure; retain the restrictions |
| Embedded DevTools models enabled/disabled, alternating order | 20 passed in each arm | Inconclusive; this comparison did not reproduce a failure |
| MCP startup with Chrome network logging | 40 passed | No failed network trace was captured; these passes do not establish a correction |

The supported failure boundary is the browser/embedded-driver stack below the QA framework. The precise internal Chromium cancellation cause has not been established. Timing, instrumentation and available resources can affect reproduction; no specific Chromium change is claimed as the cause or fix.

## Verified package-fixture baseline — 5 November 2026

The package's CI startup issue is resolved for the explicitly tested combination of Chrome for Testing **156.0.8078.80** and bridge **1.12.0**. The correction is an independently selected, pinned and verified browser baseline. Borrowing Playwright's engine, or assuming Puppeteer's default download would suffice, did not establish compatibility for this headed Windows path. This does not claim a repair to the older browser's internal cancellation behavior.

Its first 48 local MCP startup attempts passed. Attempt 49 was interrupted during setup by local `ENOSPC`, before navigation. Duplicate diagnostic downloads exhausted available storage; they were removed with version-specific browser uninstall operations, preserving the working browser and evidence. After recovery, 12 additional independent startup attempts passed: **60 successful navigations across the two runs**, with the setup interruption retained separately. Complete local MCP/CLI routes also passed all 26 assertions each.

The implementation separates this browser from Playwright's independently pinned engine, requires explicit installation, preserves explicit executable overrides and fails clearly when the fixture browser is missing. No startup sleep, navigation retry, removed assertion, disabled origin restriction or global browser preference is introduced.

```shell
npm ci --ignore-scripts
npm run chrome:install
npm run test:chrome
```

`chrome:install` downloads the exact browser into ignored `.local/chrome-for-testing/`. New downloads require at least 2 GiB free; a known empty cached executable is rejected. Complete existing caches are reused. Installation alone remains unverified operation evidence. It does not install system dependencies, change system Chrome, copy authentication or connect a native harness. Linux CI separately prepares browser dependencies; headed Linux execution uses Xvfb.

The local helper run affected by `ENOSPC` recorded 74 passes and 67 failures. It is retained as interrupted environmental evidence, not passing package verification. The separate recheck after storage recovery passed **all 141 helpers** and checked **509 Markdown targets/anchors** at that checkpoint.

The completed delivery-documentation check resolved **514 local Markdown targets/anchors**; it is separate from browser execution.

At implementation [f3cc14daaabea20b397e3f97b2d5809a638920c8](https://github.com/Aniekanetim/AI-Agent-Software-QA/commit/f3cc14daaabea20b397e3f97b2d5809a638920c8), both the [branch CI run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/41930817058) and [PR CI run](https://github.com/Aniekanetim/AI-Agent-Software-QA/actions/runs/41930825894) passed on Windows and Ubuntu. They retained TypeScript, the full helper suite and the existing Postman/Playwright fixtures, plus:

| Browser execution in each CI run | Independent repetitions per MCP/CLI route | Assertions per execution |
| --- | --- | --- |
| Windows, pinned Chrome 80, headless | 1 | 26/26 passed |
| Windows, pinned Chrome 80, headed | 3 | 26/26 passed |
| Ubuntu 22.04, pinned Chrome 80, headless | 1 | 26/26 passed |
| Ubuntu 22.04, pinned Chrome 80, headed under Xvfb | 2 | 26/26 passed |
| Windows, separately installed Google Chrome 156.0.8078.80, headed | 1 | 26/26 passed |

The original failures remain evidence about the older combinations. These results establish the tested package baseline, not universal compatibility with all Chrome builds, a native-harness connection or product release approval. Delivery is through [PR 8](https://github.com/Aniekanetim/AI-Agent-Software-QA/pull/8); merging remains a separate review decision.

## Reproduce independently

The retained [minimal reproducer](../automation/chrome-devtools/diagnose-startup.ts) uses one HTTP response, the pinned bridge's actual browser/DevTools stack and one navigation per fresh browser. It omits MCP transport and QA orchestration. A clean result is one observation, not proof that an intermittent failure cannot recur.

For example, in PowerShell on Windows:

```powershell
$env:QA_CHROME_EXECUTABLE = 'ABSOLUTE-PATH-TO-THE-BROWSER-UNDER-INVESTIGATION'
$env:QA_CHROME_STARTUP_RUNS = '30'
npm run diagnose:chrome-startup
```

The path must identify the actual binary. An override never downloads or substitutes a different browser. Without the override, the reproducer uses the package-fixture baseline. Each result records the actual browser version, executable, request count, page state and error. Any failed attempt makes the command fail; attempts are independent fresh browser sessions, with no retried navigation. Only owned browsers and synthetic servers are closed.

Full integration verification still uses all 26 assertions per MCP/CLI route. `QA_CHROME_HEADED=1` selects headed integration execution; `QA_CHROME_REPEATS` (1–10) repeats complete independent fixtures and stops on failure. These package results do not establish product correctness or native-harness access.
