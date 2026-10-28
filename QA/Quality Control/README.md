# Quality Control: suites and actual results

Use this area for the checks and evidence produced by an authorized assignment. The [QA workflow](../Quality%20assurance/qa-workflow.md) defines planning and review. The board's bug ticket is the authoritative defect report; link it instead of creating duplicate reports here.

Use applicable accepted [human sources](../../Project%20Context/README.md) for expected behavior and relevant [discoveries](../../Product%20Discovery/Project%20Context/README.md) for navigation/setup/investigation. Record human-source revisions, discovery OBS IDs/versions and served identity separately. Discovery reports stay in their own pipeline; learning coverage is not QC execution evidence or a passing result.

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

Use the project's approved tools. For Playwright, keep page objects, fixtures, assertions and test execution separate; record working directories, installation commands, browser version, viewport, workers and retry policy. For API work, provide actual payloads and a Postman collection or selected runner when agreed. Exported requests are not proof of collection execution. For collection-based work, use the [Postman CLI adapter](../../automation/postman/README.md) after [tool discovery/reuse](../../automation/tools/README.md). Retain actual assertions and distinguish failed checks from access/tool errors; a package capability rehearsal is not a product result.

Preserve the smallest evidence that supports the claim: actual results, relevant records/requests/responses or measurements, source/cause checks and links. Screenshots, recordings, raw logs or JSON reports are included when required by the objective or useful to the finding; this package imposes no universal media deliverable. Redact secrets and unrelated personal data.

Templates are unexecuted reference material. No product suites, automation, test data or historical outcomes are bundled in this reusable package.

## Design and coverage references

Use [QA Process Context](../../QA%20Process%20Context/README.md) for applicable strategy, design, coverage definitions, configuration/data and retained regression. Record source/process/suite revisions separately from the served build. Consider positive, negative and edge perspectives with appropriate techniques; use [exploratory charters](../../QA%20Process%20Context/Test%20Design%20and%20Exploration/exploratory-charter.md) for focused investigation.

Keep case steps and result tables concise. Put shared classifications and condition links in the canonical matrix or a short suite reference section. Count a multiply-labelled case once; retain actual exercised conditions, failed/partial/blocked work and unknowns. Results stay canonical here or in the project's existing equivalent; tickets provide navigation. A structural helper assessment or completed charter alone is not a product pass.

## Integration paths and test evidence

Link [Application Flow Map](../../Application%20Flow%20Map/README.md) IDs/revision and the actual impact briefing where relevant. Keep considered paths separate from conditions/path segments actually exercised. Source-linked relationships inform selection; results still require actual observations and an applicable expectation. Preserve uncovered or stale map areas as limits.
