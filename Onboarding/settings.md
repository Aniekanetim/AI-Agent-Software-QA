# Settings

Say **Open settings** at any point. The agent shows current values and these areas:

1. Project and environments
2. Project context and discovery
3. GitHub repositories and PR triggers
4. Review responsibilities and execution policies
5. Email providers, accounts and mailboxes
6. OTP and verification preferences
7. Tool constraints and browser visibility
8. Check-in schedule
9. Reporting and evidence preferences
10. API tools and Postman
11. Close settings

Direct requests such as “Keep browser sessions visible,” “Use Postman for this collection” or “Check every hour” also work. Distinguish a task-specific instruction from a project constraint; ask only when its scope is materially unclear. Reuse the clear instruction, show the affected current value and consequence, and ask only for a genuinely missing decision. A request to change cadence authorizes its relevant scheduler change; retain any existing required concrete briefing and inspect the actual saved schedule afterwards.

Choose **Back** to return to the area list, **Cancel this edit** to discard an uncommitted edit, or **Close settings** to leave settings. Completed saves remain. The agent preserves the interrupted onboarding question and pause state. A pending interrupted save must be recovered before navigation that would lose it.

The agent uses `settings open`, `choose`, `edit`, `present`, `save`, `cancel`, `back` and `close`. Mailbox changes use the guarded email selection procedure rather than raw JSON replacement. After recovering a saved settings answer, `settings present` clears its completed focus without asking it again.

The [global mailbox policy](../automation/email/mailbox-policy.md) supplies the standard fresh-account/retest behavior. Show the selected physical inbox, alias-support source, read scope and saved account references when editing email preferences. Apply recipient-policy changes through guarded selection, retain original account aliases and recheck affected attempts. A changed inbox is not permission to redirect an existing account's verification email.

Use [shared discovery](../automation/tools/README.md) to inspect/reuse the selected tool before proposing setup. API tools and Postman controls local/cloud mode, selected resources, credential source and reporting; it does not select a testing category. Changing the Postman account, region or credential source requires a matching identity/resource check. Adding a resource reopens its access check. Recheck before asking for sign-in; changed settings alone do not prove authentication is missing. A harness change reopens affected verification while retaining prior answers.

Preferences describe desired behavior. Capability records describe what actually works. A new browser needs a matching rehearsal and application sign-in; a new mailbox needs identity/content checks; a new schedule needs an actual scheduler result. Preserve unrelated settings and reopen only affected preparation. [Command contract](../automation/onboarding/README.md)

## Process-record changes

Use the existing review-responsibilities/execution-policies setting for proposed changes to the testing approach. Link canonical [QA process records](../QA%20Process%20Context/README.md) and their applicable revisions; do not store competing strategies in settings. Preserve unrelated preferences. A settings save is not approval of changed tests or evidence that affected coverage was rerun.

## Map-related changes

Use existing project/context and review-policy settings for actual source or responsibility changes. Link canonical [map records](../Application%20Flow%20Map/README.md); do not maintain another graph in settings. Reopen affected preparation only. A saved preference or accepted observation capture is not test execution approval.

## Agent tool choice and data initiative

Use [task selection](../automation/tools/task-selection.md) to set actual constraints in `.local/tool-policy.json`; never require a preferred tool as an onboarding condition. Historical browser settings/replies remain available. Changing an optional tool does not invalidate unrelated task capabilities. Project readiness lists capability gaps separately; it is not permission to run an unverified task.

Maintain preparation limits and responsibilities in the canonical [data policy/plan](../QA%20Process%20Context/Test%20Data%20Management/README.md), referenced from existing review/project settings rather than another copy. The agent generates routine synthetic inputs and establishes authorized state; clarify only material missing limits, intent or dependencies. Preserve actual scope, identity reuse, retention and cleanup decisions.
