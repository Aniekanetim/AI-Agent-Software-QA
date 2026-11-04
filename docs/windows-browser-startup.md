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

## Compatibility candidate

Chrome for Testing **156.0.8078.80** is being evaluated as a separate, pinned package-fixture baseline with bridge **1.12.0**. It is the same product version that passed the previous installed-Chrome CI comparison. Its first 48 local MCP startup attempts passed. Attempt 49 was interrupted during setup by local `ENOSPC`, before navigation. Duplicate diagnostic downloads exhausted available storage; they were removed with version-specific browser uninstall operations, preserving the working browser and evidence. Resumed startup and full integration verification are pending; do not describe this file as release approval.

The implementation separates this browser from Playwright's independently pinned engine, requires explicit installation, preserves explicit executable overrides and fails clearly when the fixture browser is missing. No startup sleep, navigation retry, removed assertion, disabled origin restriction or global browser preference is introduced.

```shell
npm ci --ignore-scripts
npm run chrome:install
npm run test:chrome
```

`chrome:install` downloads the exact browser into ignored `.local/chrome-for-testing/`. New downloads require at least 2 GiB free; a known empty cached executable is rejected. Complete existing caches are reused. Installation alone remains unverified operation evidence. It does not install system dependencies, change system Chrome, copy authentication or connect a native harness. Linux CI separately prepares browser dependencies; headed Linux execution uses Xvfb.

The local helper run affected by `ENOSPC` recorded 74 passes and 67 failures. It is retained as interrupted environmental evidence, not passing package verification. Rechecks after storage recovery are separate executions.

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
