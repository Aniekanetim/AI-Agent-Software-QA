# GitHub connection, PR intake and regression

GitHub supplies work and repository actions. The QA workflow governs how that work is analyzed, authorized, executed and completed. Connecting GitHub never authorizes code fixes, merging or deployment. This adapter supports github.com; other hosts need an explicit verified adapter.

## Connect and select repositories

Reuse a compatible GitHub CLI installation. If it is unavailable, the optional local installer downloads the pinned official v2.102.0 archive, checks its published SHA-256 manifest, validates archive paths and installs under `.local/tools/github-cli`. It needs network access, `tar` and permission to launch processes; it does not request administrator access or modify system PATH. Binary downloads remain outside the distribution.

```shell
npm run qa -- github install --source <actual-install-instruction>
```

Authenticate through an interactive terminal using the installed executable with `auth login --hostname github.com --web`, or reuse the actual authorized host connection. Never print `gh auth token` or store it in project settings. The helpers prefer the locally installed executable if present; otherwise they use PATH.

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

Each eligible PR creates a linked Ready for QA assignment. Durable repository/PR/head markers prevent duplicate assignments on repeated events. A changed head appends revision history to an active assignment, preserving developer responses and its current folder. A new revision after completion creates a new linked assignment. Earlier results remain historical. The existing five board statuses and claim/review rules remain unchanged.

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

The run refreshes PR identity and checks the exact policy approval, suite evidence, target observation and account. A permitted merge commit is distinct from the PR head. The deduplication key includes PR head, actual tested commit/build, policy revision, suite evidence and target. A retained completed run is not rerun on unchanged input. A running/uncertain attempt requires inspection, not an automatic retry.

The trusted command receives QA_PR_HEAD, QA_TESTED_COMMIT, QA_BUILD_ID, QA_RUN_KEY and a fresh QA_RESULT_DIR. Configure the suite to write redacted actual results there. Process exit 0/1 is retained but **productVerdict remains Not assessed**: the agent reads actual checks/results, reports defects, routes regression findings and completes G3–G5. Stdout/stderr are not automatically copied because they can contain secrets. Preserve approved result artifacts deliberately.

For a separately approved workflow dispatch, use `github dispatch` with the same arguments. Its workflow must accept qa_run_key, pr_head and tested_commit inputs. A dispatch receipt is not completed CI execution. Match the actual GitHub run/artifacts back to the key and tested revision; inspect uncertain dispatches before retrying. `github comment ... --body <reviewed-report-path>` requires comment permission in the exact policy and prevents duplicate/uncertain publication attempts. Do not publish automatically under localOnly policy.

## PR-triggered CI example

[qa-regression.example.yml](examples/qa-regression.example.yml) is an **inactive adoption template**, outside `.github/workflows`. It requires a reviewed policy, actual bot settings and a project-owned preview-identity adapter. The default-deny variable and missing project-specific files prevent accidental execution. Review/replace the placeholders in your project before enabling it. It runs trusted base-branch QA code, excludes forks and uses read-only permissions; never switch to privileged `pull_request_target` while executing untrusted PR code with secrets.

The portable repo's own [package checks](../../.github/workflows/package-checks.yml) only compile/test these helpers and rehearse a synthetic loopback fixture. They do not monitor another project's PRs, run its product tests or approve its releases.

[GitHub CLI authentication](https://cli.github.com/manual/gh_auth_login), [workflow dispatch](https://cli.github.com/manual/gh_workflow_run), [PR events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)
