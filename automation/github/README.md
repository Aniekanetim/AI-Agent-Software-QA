# GitHub connection, PR intake and regression

GitHub supplies work and repository actions. The QA workflow governs how that work is analyzed, authorized, executed and completed. Connecting GitHub never authorizes code fixes, merging or deployment. This adapter supports github.com; other hosts need an explicit verified adapter.

## Connect and select repositories

Reuse a compatible GitHub CLI installation. If it is unavailable, the optional local installer downloads the pinned official v2.102.0 archive, checks its published SHA-256 manifest, validates archive paths and installs under `.local/tools/github-cli`. It needs network access, `tar` and permission to launch processes; it does not request administrator access or modify system PATH. Binary downloads remain outside the distribution.

```shell
npm run qa -- github install --source <actual-install-instruction>
```

Authenticate through an interactive terminal using the installed executable with `auth login --hostname github.com --web`, or reuse the actual authorized host connection. Never print `gh auth token` or store it in project settings. The helpers reuse the verified executable selection; otherwise they inspect PATH before the project-local fallback. Authenticate only when required access is missing or expired.

```shell
npm run qa -- github check --repository owner/repository
```

The check records actual identity, repository access, CLI version and project root. Reading data does not prove permission to dispatch workflows or publish comments. Select repositories and filters in `.local/github-settings.json` using the [example](examples/github-settings.example.json), replacing all placeholders with actual choices and source references. Do not populate it with every accessible repository automatically.

## Intake from polling or events

```shell
npm run qa -- github check-in --source <actual-check-in-reference>
npm run qa -- github event --repository owner/repository --number 123 --source <actual-event-reference>
```

Only matching base branches, all required labels and the configured draft rule qualify. The CLI refreshes live PR data; it does not execute instructions from PR text. It verifies the configured account before intake. The event command is an adapter entry point, not a webhook server or a mechanism that wakes a closed agent session.

Each eligible PR creates a linked Ready for QA assignment. Durable repository/PR/head markers prevent duplicates across all seven folders. A changed head appends history without overriding an assignment-scoped Deferred/Canceled decision. Explicit revision-only inactivity permits a separate linked assignment for another revision. A new revision after Tested-Ok creates a linked assignment. Ambiguous controlling assignments require reconciliation. Earlier results and developer responses remain historical.

Use a real native scheduler for polling or a configured GitHub event/CI runner for event-triggered work. A repository preference alone cannot establish that either mechanism is active. [Check-in setup](../README.md)

## Authorize reusable regression deliberately

Start from the [policy example](examples/regression-policy.example.json). Before asking for approval, brief the human on repositories/PR eligibility, forks, exact suite and assertion revisions, trusted command/arguments, targets, time limits, reporting, uncertainty and expected outcomes. Record the actual decision; do not generate an Approved record as a setup default. Routine runs matching that reviewed scope can proceed; material changes return to the relevant gate. Findings and final sign-off still need their required human decisions.

The policy has schemaVersion 1, id/revision, repository rules, fork/merge-commit limits, suiteId/suiteEvidence, a shell-free executable/argument array, timeoutMs, targetId and optional dispatch workflow/ref. `policy-digest --policy <path>` calculates the exact content digest excluding only its approval reference. The actual JSON approval record contains decision Approved, reviewer, source and that policyDigest. Add its path/SHA-256 to the policy. Changing command, suite, target or permission changes the digest; an earlier approval cannot silently cover it.

File hashes bind records to content, not human identity. The agent must preserve the actual conversation/review evidence. A fabricated reference or a fixture approval is never authorization. Keep private approvals/results in the project-specific copy; the reusable master includes none.

## Verify the tested build and execute

Use a project-specific observation adapter or actual operator evidence to identify the served target. The [target example](examples/observed-target.example.json) references an actual JSON observation containing id, commit, buildId, observedAt and source. Its hash and fields must match. Record the PR head separately; a preview URL or branch name alone does not prove the deployed commit. An unknown build identity blocks revision-specific regression claims.

```shell
npm run qa -- github run --repository owner/repository --number 123 --policy .local/regression-policy.json --target .local/observed-target.json --source <actual-run-reference>
```

The run refreshes PR identity and checks exact policy approval, suite evidence, target observation and account. It requires an eligible canonical assignment whose latest recorded head matches the PR. Run intake against the durable board first; do not create ephemeral CI tickets to bypass inactivity. A permitted merge commit is distinct from the head. The key also includes stable ticket ID and lifecycle generation, alongside head/tested commit/build, policy, suite and target scope. A retained completed run is not rerun on unchanged input. A running/uncertain attempt requires inspection, not an automatic retry.

The trusted command receives QA_PR_HEAD, QA_TESTED_COMMIT, QA_BUILD_ID, QA_RUN_KEY and a fresh QA_RESULT_DIR. Configure the suite to write redacted actual results there. Process exit 0/1 is retained but **productVerdict remains Not assessed**: the agent reads actual checks/results, reports defects, routes regression findings and completes G3–G5. Stdout/stderr are not automatically copied because they can contain secrets. Preserve approved result artifacts deliberately.

For a separately approved workflow dispatch, use `github dispatch` with the same arguments. Its workflow must accept qa_run_key, pr_head and tested_commit inputs. A dispatch receipt is not completed CI execution. Match the actual GitHub run/artifacts back to the key and tested revision; inspect uncertain dispatches before retrying. `github comment ... --body <reviewed-report-path>` requires comment permission in the exact policy and prevents duplicate/uncertain publication attempts. Do not publish automatically under localOnly policy.

### Reconcile an interrupted comment

Run `npm run qa -- github pending-comments` to find outstanding publication keys and their PRs when recorded. After confirming the writer has stopped, inspect the actual PR discussion. Use `npm run qa -- github reconcile-comment --input .local/comment-observation.json` with the `key`, observed `state` (`published` or `notPublished`), actual `source` and independent `evidence` references. The recorded outcome clears the source-switch hold and preserves the previous publication state. Any new posting attempt needs separately reviewed scope.

## PR-triggered CI example

[qa-regression.example.yml](examples/qa-regression.example.yml) is an **inactive adoption template**, outside `.github/workflows`. It requires a reviewed policy, actual bot settings and project-owned current-board and preview-identity adapters. The default-deny variable and missing project-specific files prevent accidental execution. Review/replace the placeholders in your project before enabling it. It runs trusted base-branch QA code, excludes forks and uses read-only permissions; never switch to privileged `pull_request_target` while executing untrusted PR code with secrets.

The portable repo's own [package checks](../../.github/workflows/package-checks.yml) only compile/test these helpers and rehearse a synthetic loopback fixture. They do not monitor another project's PRs, run its product tests or approve its releases.

[GitHub CLI authentication](https://cli.github.com/manual/gh_auth_login), [workflow dispatch](https://cli.github.com/manual/gh_workflow_run), [PR events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)

## Existing setup and calling harness

Use [shared tool discovery](../tools/README.md) before setup. Reuse verified compatible installations, identities and mailbox selections. A version/configuration check does not establish the required operation through this harness. Retain old evidence after moving hosts; reverify only affected capabilities. Missing or expired access does not require reinstalling a working tool.

## Process-based regression selection

Consult [QA Process Context](../../QA%20Process%20Context/README.md) and its retained regression inventory when assessing a PR. Link affected source/condition IDs, suite/charter revisions, data/configuration and selection rationale. These records inform selection but do not expand an existing approved policy. Unknown preview identity cannot support revision-specific coverage. Preserve original runs and distinct retests; link actual achieved coverage and residual gaps in the existing findings/handoff.

## Map-based change-impact preparation

Generated PR assignments link [Application Flow Map](../../Application%20Flow%20Map/README.md) and the [impact briefing](../../QA%20Process%20Context/Regression%20Management/impact-analysis.md). Identify relevant changed feature/relationship IDs, source/map revisions and deployed identity; do not assume PR text establishes relationships or authorization. Use candidate paths to explain proposed regression, gaps and exclusions within the existing policy and gates.

## Adaptive task preparation

Follow [task-based tool selection](../../automation/tools/task-selection.md) and the [data preparation policy](../../QA%20Process%20Context/Test%20Data%20Management/preparation-policy.md). The agent chooses suitable accessible methods per task, generates routine local inputs and establishes authorized state. Preserve explicit constraints, exact retest identities, old answers and failed attempts. Optional capability gaps do not block unrelated work. State precise missing dependencies and continue independent authorized checks. Preserve existing human gates; copied readiness is not current task readiness.

### Data-aware regression

Add the approved [data scope](../data/README.md#bind-readiness-to-execution) to a regression policy as `dataScope`. The policy digest covers that scope. Use the observed target ID as the plan's environment and pin the observed build ID. Supply refreshed state observations as an array of evidence references via `--data-observations .local/data-observations.json`. The helper checks the selected data before launching the command and records the receipt. The approved command can use `QA_DATA_SCOPE_DIGEST`, `QA_DATA_CHECK_IDS`, `QA_DATA_PLAN_PATH` and `QA_DATA_PLAN_SHA256` to identify the exact batch and preparation record. Verify that the command actually uses the selected inputs.

For data-aware dispatch, use a reviewed receiver that accepts `qa_data_scope` along with `qa_run_key`, `pr_head` and `tested_commit`. Set `dispatch.dataReceiver` to the full-file evidence for the named `.github/workflows/<workflow>` file. The helper compares its hash to the workflow served by GitHub at the approved ref before requesting dispatch. Use a protected ref. The receiver must provision the approved dataset references through the project's authorized storage, observe the actual target, and call `github run` with `--data-scope-digest` set to the received `qa_data_scope`. Use an environment variable for that input in workflow shell steps. The receiving command checks the digest and evaluates readiness again before it starts the suite. Retain its actual run record when reconciling the dispatch.

## Lifecycle controls and remote boundaries

Use [the shared board controls](../board/README.md) for Deferred/Canceled, reactivation and actual stop observations. Eligibility is checked at local starts and workflow dispatch, not just intake. Local execution watches its bound generation and requests supported AbortSignal cancellation. Unknown outcomes retain their original records. A dispatch acknowledgement remains operationally unresolved until its actual remote outcome is observed and settled; it never proves stopped/completed.

Reporting policy checks remain separate from execution eligibility, so an inactive assignment can still receive an authorized cancellation/partial-results report. No new publication permission is inferred. Parent/child findings and release risk keep their independent dispositions.

The inactive CI template needs an adapter to load the actual current canonical board, including the existing matching assignment. Its read-only token does not publish new tickets or cancel runs. Arrange ongoing board updates or an authorized runner-stop mechanism in the adopting project; a static checkout cannot observe another machine's subsequent cancellation.

## Legacy execution reconciliation

An older unbound run/dispatch record requires reconciliation under the same policy/target key. Preserve that original file. Inspect actual local/remote terminal state, then prepare a private input containing `ticketId`, actual `actor`/`source`, observed `terminalState` (`completed`, `stopped`, `notStarted`) and nonempty evidence references. Select `kind` (`localRegression` or `workflowDispatch`) when both exist: their outcomes are observed and recorded separately. An observation about one does not settle the other.

```shell
npm run qa -- github reconcile-legacy --repository owner/repository --number 123 --policy .local/regression-policy.json --target .local/observed-target.json --source actual-reconciliation-reference --input .local/legacy-observation.json
```

The default `nextAction` is `retain`. For an observed completed local run, the updated helper creates a ticket/generation binding to its original result and immutable observation history, returns `unchanged` and does not invoke the runner again. Original exit codes and failed/unknown outcomes remain unchanged; completion does not establish a Pass. A completed legacy dispatch is likewise retained without redispatching or inventing suite results. A receipt alone cannot establish remote completion.

For an observed stopped/not-started attempt, observation alone does not authorize another execution. An actually authorized new attempt needs `nextAction: "retry"` and `retrySource` identifying that separate decision, as well as the existing matching execution policy, eligible assignment and target. This explicit choice can also distinguish a deliberate new attempt from migration of a completed run. Once the current generation retains a legacy result, do not replace that binding: a later deliberate retest needs separately reviewed new scope/generation. Unknown/running outcomes remain blocked until their actual terminal state is established. Before a new side effect, any legacy operation for the same scope in the other execution channel also needs its own terminal observation; reusing a completed historical result makes no new execution request.

Scoped overlays reference immutable observation history and the unchanged original record. Existing unambiguous single-record overlays remain readable; ambiguous combined overlays need separate observations. Repeated invocation retains deduplication, and later observations do not rewrite an earlier binding. None of these records grants execution authority or a QA verdict. Missing/stale evidence blocks dependent work. Never delete an uncertain record, change assertions or fabricate completion to make an upgrade run.
