# Quality Control: suites and actual results

Use this area for the checks and evidence produced by an authorized assignment. The [QA workflow](../Quality%20assurance/qa-workflow.md) defines planning and review. The board's bug ticket is the authoritative defect report; link it instead of creating duplicate reports here.

## Organize by target and testing type

Create only the directories needed by real work:

```text
QA/Quality Control/
  <target or build>/
    <testing type>/
      test-suite.md
      test-results.md
      <run-specific automation or collection, when needed>
```

Keep each target's results self-contained. For a before/after investigation, retain failure and corrected-build evidence separately with exact identities and the same applicable expectations. A requirement change needs its source/decision recorded. Do not require two manufactured builds for routine QA.

UI/functional and API suites/results remain separate. UI steps use normal browser addresses and operator actions; their preconditions do not require importing Postman. API steps specify HTTP methods, exact request URLs, headers/body and observable outcomes. Document technical fixture setup separately so the reproduction channel is clear.

## Standard reporting

Use the [UI suite template](templates/ui-functional-suite.md), [API suite template](templates/api-functional-suite.md) and [result template](templates/test-results.md). Scenarios describe the high-level behavior; each case identifies the specific check. Keep preconditions separate, steps numbered, inputs concrete and expected/actual outcomes clear. Use concise tables and formatted request blocks rather than placing long code in table cells.

Assign stable case IDs and link them to requirement IDs and bug tickets. Results record real execution dates, target/data identity, executor, method and actual observations. Not run, Blocked, Fail and harness error are different outcomes. Preserve failed attempts and retests; do not turn an anticipated failure into a Pass because a wrapper recognized it.

For usability, performance, accessibility and security, adapt the case/measurement fields to the agreed objective. Record the criterion, method/workload, actual observation, severity or metric as appropriate, limits and verdict. Do not infer usability research, production capacity or broad security/accessibility coverage from an unrelated tool score.

## Repeatable checks and evidence

Use the project's approved tools. For Playwright, keep page objects, fixtures, assertions and test execution separate; record working directories, installation commands, browser version, viewport, workers and retry policy. For API work, provide actual payloads and a Postman collection or selected runner when agreed. Exported requests are not proof of collection execution.

Preserve the smallest evidence that supports the claim: actual results, relevant records/requests/responses or measurements, source/cause checks and links. Screenshots, recordings, raw logs or JSON reports are included when required by the objective or useful to the finding; this package imposes no universal media deliverable. Redact secrets and unrelated personal data.

Templates are unexecuted reference material. No product suites, automation, test data or historical outcomes are bundled in this reusable package.
