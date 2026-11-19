# Company-context verification

This feature adds source access and freshness to the existing human-reviewed QA workflow. It does not supply product requirements, establish an adopting company's decision owners or activate a Slack connection/schedule in the reusable package.

The implementation uses native-host callbacks or the Slack Web API. Source versions, interpreted decisions, applicable criteria, reviewed batches, results and current release eligibility are retained separately. An unchanged local source file alone cannot prove that Slack has not changed.

## Package verification

The tests use temporary QA roots, synthetic companies/messages, actual local persistence/CLI entry points, deterministic adapters and mocked API responses. They do not read a company workspace or fabricate authenticated Slack verification.

| Evidence area | Executable checks |
| --- | --- |
| Connection/channel selection, pagination, source revisions, interruption, Settings and private-cache handling | `automation/tests/company-context.test.ts` |
| API identity, HTTP-200 errors, 429, native request/output bindings, directory/membership and harness changes | `automation/tests/slack-provider.test.ts` |
| Changed criteria before action, independent batch progress, current release handoff and scoped fix review | `automation/tests/company-context-workflow.test.ts` |
| Existing onboarding, data, board, execution, regression, coverage, release and browser integrations | Existing package and tool-specific suites |

Run `npm run check`, `npm test`, `npm run test:postman`, `npm run test:browsers` and `npm run test:chrome`. The existing package CI covers Windows and Ubuntu. Link actual results for the tested revision from the implementation PR; this guide itself is not a passing execution receipt.

## Authorized live check

For a real project, discover/reuse its actual connection, identify the workspace, choose authorized channels and verify history/thread/directory capabilities separately. Perform a bounded historical read and a Settings channel addition/removal. Retain real operation references, coverage, analysis, source applicability and the exact tested package revision.

Do not post company messages just to manufacture validation evidence. Existing clear decisions may be inspected under selected read access. A company decision, its semantic interpretation, human QA review and actual product test execution are distinct records.

## Explicit limits

- No live company Slack access or production outcome is established by synthetic tests.
- Polling and direct rereads do not prove that every unseen historical edit/deletion has been captured. Display actual bounds and known gaps.
- Slack and application actions cannot be one atomic transaction. Record source cutoffs, permitted checkpoint boundaries and in-flight outcomes.
- Native tools differ in channel/thread/history support. Terminal callbacks cannot create a missing harness integration.
- Remote runner admission does not establish continuous access to company decisions during execution. Reconcile relevant changes before current G5.
- Shared local storage requires explicit access/retention authorization. Local locks do not establish distributed cross-machine coordination.
- Private cache removal can make historical content evidence unavailable. It does not purge source Slack messages or owner-maintained publications.

See the [operating procedure](../automation/company-context/README.md) for configuration, source refresh, source equivalence and release behavior.
