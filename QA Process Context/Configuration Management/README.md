# Configuration management for testing

Identify the configuration that makes a test reproducible. Link the canonical [environment/build reference](../../Project%20Context/technical/environments-and-builds.md); technical owners maintain that baseline. Record actual observations in assignment records. Keep credentials, cookies, tokens and authentication state outside shared records.

**Template — no project configuration is verified.** Create a named record when work requires it and apply [the ownership/lifecycle rules](../README.md).

| Field | Actual value |
| --- | --- |
| Configuration ID / revision / state / owner / maintainer | Not supplied / Draft |
| Assignment / environment / observation time | Not supplied |
| Expected target / source revision / actual served build | Not supplied; use Unknown when undisclosed |
| Product-source and design references / process revisions | Not supplied; separate from build identity |
| Test suite / assertion / fixture versions | Not supplied |
| Actual harness / browser / client / tool versions | Not supplied |
| Feature flags / dependencies / stubs / workload settings | Not supplied; record only nonsecret values |
| Data-plan and isolated dataset references | Not supplied |
| Verification evidence / actual review / operating limits | Not supplied / Pending |

Link setup and execution commands, access role references and recovery instructions. Record deviations and which checks they affect. A tool version or PR head alone does not identify the deployed application. A staging-only project may have no source checkout; preserve its URL, observation time and available identity evidence.

After a configuration/dependency change or machine transfer, compare the relevant baseline and verify affected capabilities. Preserve earlier results at their original configuration. Ask the responsible owner about conflicting facts; do not rewrite the baseline from an assumption. Select relevant retests through the [regression guide](../Regression%20Management/README.md), retaining any required authorization.

## Chrome DevTools execution references

For [Chrome DevTools/WebMCP](../../automation/chrome-devtools/README.md), retain actual dependency/browser versions, visibility, route (terminal MCP SDK, CLI or native harness), connection/profile identity, origin/category/privacy settings and task/source revision. Keep sensitive session material private. Catalogue and role/state evidence have their own freshness; a copied version report or saved preference does not establish current access. Record harness restrictions and missing browser operations as preparation gaps, not product defects.
