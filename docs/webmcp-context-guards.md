# WebMCP origin and document guards

These package corrections address two failures reproduced during the 5 November 2026 review against Chrome's WebMCP guidance. They concern the reusable integration, not a defect or release verdict for an adopting application.

## What failed and what changed

| Finding | Reproduction before correction | Cause | Corrected behavior |
| --- | --- | --- | --- |
| Exact-origin settings accepted patterns | Configure `https://*.example.com` or `https://*`; both passed validation and became browser URL patterns | The WHATWG URL parser accepts these host strings; comparing its normalized origin with the input did not establish an exact hostname | Reject wildcard and URL-pattern host syntax before producing configuration; retain exact HTTPS and loopback HTTP origins |
| Iframe navigation retained a usable old inventory | Capture an iframe tool, navigate only that iframe to version 2 with the same tool name/schema, then execute the original inventory; a version-2 record was saved | The inventory bound the parent document's time origin, while the bridge omitted tool frame identities | Bind the complete inspectable same-origin document tree and compare it before execution; reject changed iframe documents even when the catalogue matches |

The original review at `777c5378ecda30cae788107d80a0b10094333b7c` reproduced both failures using synthetic local data. Its ignored `.local/webmcp-guidance-review-results.json` retains the accepted patterns, unchanged parent document, changed child document and unexpected version-2 write. Later verification is separate evidence, not a rewrite of that failure.

## Document identity and execution limits

The [inspection function](../automation/chrome-devtools/document-context.ts) collects frame positions, full URLs and document time origins, with limits of 64 documents and 16 nested frame levels. The helper hashes URLs in memory and persists a document-tree hash; it does not add authentication query strings or fragments to inventories. It relists tools, then inspects documents close to execution.

Same-URL iframe reloads, navigation, addition, removal and reordering invalidate affected inventories. Duplicate names remain rejected. A fresh supported inventory permits a new action within the existing task authorization; refresh is not permission to repeat a previous uncertain mutation.

Opaque/cross-origin frames, incomplete inspection and disabled JavaScript inspection cannot establish a complete binding. Their inventories support observation, while task readiness and helper execution reject dependent actions. Historical schemaVersion 1 records remain readable; records without the new binding require a fresh actual observation. Native-host imports accept the actual inspection's `documents` array and retain original call evidence.

The pinned bridge still supplies names rather than atomic tool/frame handles. The new binding is a conservative preflight check. It does not prevent every concurrent change after inspection, prove the same authenticated principal, or provide helper execution across opaque/cross-origin frames. Continue independent outcome verification, refresh role/account evidence after session changes, and select another suitable method where needed.

## Focused verification

| Layer | Checks and evidence |
| --- | --- |
| Helper regression | Pattern rejection with exact-origin positive controls; malformed/missing document bindings; iframe navigation/reload/addition/removal; opaque/disabled inspection; native-host refresh; discovery versus execution readiness |
| MCP-server and CLI browser routes | Retain the original 26 assertions and add fresh iframe execution, navigation with unchanged schemas, zero stale writes, refreshed version-2 execution, same-URL reload rejection and opaque-frame rejection |
| Native browser API interoperability | Cross-origin registration without/with delegated `tools` permission; visibility with/without explicit exposure and requested origin; independently persisted exposed-tool execution; imperative `AbortSignal` reaching its handler and preventing a delayed commit |

Each complete browser route now has 37 assertions. Cross-origin interoperability uses the native page API through browser evaluation; it does not claim that the stricter execution helper supports opaque frames. The imperative cancellation check exercises native `executeTool` cancellation, not a new MCP/CLI cancellation command. Existing declarative cancellation and uncertain-transport handling remain separate.

The fixture uses two owned loopback origins and disposable synthetic state. Browser evidence records actual provider, executable, visibility, timestamp and saved state. Completed checks and a failed assertion, if any, are retained in ignored `.local/progress.json` under each rehearsal root. No product accounts, personal profiles or release decisions are supplied.

Local and hosted results are recorded in [integration validation](webmcp-validation.md). CI retains Windows and Ubuntu, headless/headed modes, the pinned browser and existing repeat counts. Its job budget is 25 minutes to accommodate the additional browser/protocol checks without dropping assertions or retrying failed actions.

## Reproduce the package checks

```shell
npm run check
npm test
npm run test:chrome
```

For visible local browser checks in PowerShell:

```powershell
$env:QA_CHROME_HEADED = '1'
npm run test:chrome
```

Use the existing explicitly installed fixture browser; [browser setup](windows-browser-startup.md) documents the pinned version. These checks do not establish access through the current agent harness or test an adopting product.

## Source basis

Chrome recommends restricting interaction to task-relevant origins and treating tool content as untrusted. Its imperative API distinguishes tool origins and owning windows and documents cross-origin permissions/exposure and cancellation. These sources informed the fixes and additional interoperability checks:

- [Agent security guidance](https://developer.chrome.com/docs/agents/security)
- [Imperative API, frame access and cancellation](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Declarative forms and cancellation](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
- [Pinned Chrome DevTools bridge configuration](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/chrome-devtools-mcp-v1.12.0/docs/configuration.md)
