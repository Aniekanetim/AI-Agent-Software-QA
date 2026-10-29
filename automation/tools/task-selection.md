# Choose tools for the work

The agent chooses suitable tools for each task or task step. Start with the required operations, evidence and repeatability, then inspect what actually works through the current harness. The bundle is a set of available integrations, not a prescribed tool for each testing category. Several tools may serve one task; other accessible, permitted tools may also be used.

## Make and explain the selection

1. Read the task, accepted sources, applicable map/process records and existing authorization. Identify the behavior to observe, assertions, evidence, required operations and execution context.
2. Inspect existing capabilities and actual access. Reuse working installations and sessions; run only missing relevant harmless checks. A tool listed in a configuration is not proof of operation.
3. Choose the method that fits coverage, interaction, inspection, repeatability, evidence, cost/resource limits and actual constraints. Explain significant alternatives and limitations. No numerical score or testing-type lookup chooses the method.
4. Record the selection on the ticket/plan. Check its required capabilities and application access before dependent work. Use the tool-specific guide when that tool is chosen.
5. Retain the actual tool/version/context, actions and evidence with results. A harness walkthrough is reported as that method; it cannot establish that an unrun Playwright or Postman suite passed.

An in-app browser may fit a visible journey. Playwright Test may fit a repeatable suite. A compatible collection runner may be required to verify a named collection. These are examples, not defaults. A tool that cannot observe the required behavior is not an equivalent substitute. An unavailable tool blocks only checks that actually depend on it; the agent can propose/use another suitable method within existing authorization.

## Constraints, history and review

Onboarding establishes accessible capabilities and operating limits rather than asking for a compulsory preferred browser. Preserve explicit user/task requirements, visibility, permitted environments, actions and reporting scope. The optional private `.local/tool-policy.json` records actual constraints:

| Field | Meaning |
| --- | --- |
| `schemaVersion: 1`, `selection: "agent"` | Agent judgment governs per-task selection |
| `source`, `evidence` | Actual constraint instruction and local evidence references |
| `visibility` | `headed`, `headless` or `any`, as actually established |
| `allowedTools` | Named allowed IDs, or `null` when no tool whitelist was specified |
| `prohibitedTools` | Explicit restrictions; an empty array adds none |

Absence of this optional record does not authorize arbitrary actions or erase other instructions. Existing `.local/browser-preferences.json` remains history: its method/fallback is not a compulsory task default, while its visibility/source is retained unless a later sourced policy supersedes it. If an earlier instruction's force is unclear, resolve that specific ambiguity; never silently override an explicit requirement.

Normal selections, data preparation and equivalent tool changes proceed within existing authorization. Material changes to coverage, expected outcomes, mutations, limits or required evidence return to the affected gate. Do not request permission for every tool call or generated value. An exact approved regression command/policy still binds its own runs; changing it requires the applicable reviewed revision.

## Read-only task assessment

```shell
npm run qa -- tools assess-task --input .local/task-tools.json
```

The agent supplies its decision; the helper does not choose a fallback or execute it. The private input has:

| Record | Required fields |
| --- | --- |
| Plan | `schemaVersion: 1`, `id`, `revision`, `task: Evidence`, `objective`, `executionContext` (`interactive`, `scheduled`, `ci`), `requirements`, `selections` |
| Requirement | Unique `id`, `browser` boolean, nonempty `operations`, `requiredTool` ID or `null`, nonempty `basis: Evidence[]` |
| Selection | `requirementId`, `tool`, `rationale`, `limitations: string[]`; one per requirement |

Use [evidence references](../onboarding/README.md) to local canonical records retaining original source/revision. Operation names match actual capability reports; declaring an operation does not prove that it satisfies the business test. Supported IDs include the bundled tools, `inAppBrowser`, `harnessMcp`, `email:<binding-id>` and `custom:<name>`.

Custom tools can use `tools import-host` with an actual host/terminal operation reference and verified capability evidence. This is an accountable observation, not a generic command executor or automatic discovery/install adapter. Custom executable/version changes require actual host verification; the package cannot universally inspect them. Bundled executable records still use their real probe. Do not relabel a bundled tool as custom to evade its identity/resource checks.

The assessment checks the selected operations against current harness/context, evidence, constraints and applicable browser reports. Selected Postman operations retain account/region/resource binding checks. Native browser visibility is checked where required; other browser tools can supply actual `visibility:headed` or `visibility:headless` operation evidence through their host capability record. No unselected integration becomes a task dependency merely because it was configured.

`capabilitiesVerified` means the selected capability evidence passed these checks; `needsPreparation` identifies affected requirements/global source issues and exits 1. Neither status establishes application access, authorization, test success or release readiness. Live session/provider bindings and semantic suitability still need the agent's task-specific checks. The command writes nothing; `productVerdict` stays `Not assessed`.

## Adopt without restarting onboarding

Keep schemaVersion 1, prior replies, settings, evidence and installed tool selections. New tool-policy edits use existing settings/response recovery. Onboarding readiness now reports optional `capabilityIssues` separately from project blockers. Complete/refresh only the affected preparation with truthful evidence; do not turn an old blocked check into Verified automatically.

For an exact obsolete unanswered `/method` or `/fallback` question:

```shell
npm run qa -- onboarding retire-tool-questions --input .local/obsolete-tool-questions.json
```

Input: `{ "ids": ["actual-question-id"], "source": "actual-migration-decision-reference" }`. Inspect the question first. Retirement preserves its prompts/history and appends the decision; repeated retirement is a no-op. Answered choices, visibility questions and whole-document questions cannot be retired by this command. Recover an interrupted reply first. Close an existing settings edit normally if needed. No new tool answer or approval is invented.
