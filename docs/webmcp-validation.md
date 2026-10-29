# WebMCP integration validation

This record concerns the reusable package's synthetic integration checks. It is not a product test report, native harness connection verification or release approval for an adopting application.

## Scope and authorization

The user approved the WebMCP recommendations and implementation plan, including package/helper validation, controlled browser rehearsals and Windows/Linux CI. No real application, personal browser profile or mailbox is used by the fixture. Existing G1–G5 gates still apply to assigned product work.

Version 1.9.0 adds the pinned Chrome DevTools MCP/CLI dependency, registry integration, explicit session configuration, contextual inventories, invocation history, separate application verification and onboarding/workflow guidance. Human requirements, discovery ownership and board statuses retain their existing roles.

## Evidence status

| Check | Actual status |
| --- | --- |
| Dependency installation | Installed 1.12.0 with scripts disabled; npm audit reported zero vulnerabilities at implementation time |
| Local TypeScript check | Passed |
| Local helper suite | Initial run passed 131 tests; final count is recorded with the final validation revision |
| Local native browser rehearsal | Blocked: this calling sandbox denies Node child-process creation with `EPERM`; installation was preserved |
| Windows/Linux CI browser rehearsal | Pending the implementation branch's actual CI results |
| Native Chrome DevTools MCP connection in the current harness | Not verified; no native connection is claimed from terminal/CI execution |
| Real-product testing | Not performed |

## Browser checks

`npm run test:chrome` exercises local MCP-server and CLI routes against a synthetic loopback application with native `document.modelContext`. Its assertions cover page identity, imperative and declarative discovery, origin restrictions, an imperative saved record, independent server-state and visible-interface checks, repeated invocation identity, automatic form submission, invalid input, manual form cancellation, changed tool inventories and same-URL document replacement. The fixture installs no polyfill.

Unit tests separately cover version/entry-point selection, source/context/configuration freshness, uncertain/interrupted requests, concurrent invocation identity, evidence-backed application verification, redaction, onboarding preservation and owned-daemon handling. A simulated helper test is identified as synthetic; it does not establish real browser behavior.

Each actual browser run prints its provider, browser version, visibility, checks and local evidence root. CI results must be read for the tested revision. An unavailable, skipped or failing run cannot be represented as a passing integration.

## Operational limits

Headless CI does not establish visible operation, a user's native harness connection, target-application support or production behavior. Optional debugging tools, feature-version differences and cross-origin WebMCP exposure require task-specific sources and actual verification. Catalogue metadata is not a requirements baseline. Role/account changes must be reobserved even when tool schemas look identical.

The implementation is delivered for review through its pull request; package checks do not replace the human's scoped review or authorize product testing/deployment.
