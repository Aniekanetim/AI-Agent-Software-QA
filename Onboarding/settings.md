# Settings

Say **Open settings** at any point. The agent shows current values and these areas:

1. Project and environments
2. Project context and discovery
3. GitHub repositories and PR triggers
4. Review responsibilities and execution policies
5. Email providers, accounts and mailboxes
6. OTP and verification preferences
7. Browser and visibility
8. Check-in schedule
9. Reporting and evidence preferences
10. API tools and Postman
11. Close settings

Direct requests such as “Use Playwright CLI” or “Check every hour” also work. Reuse the clear instruction, show the affected current value and consequence, and ask only for a genuinely missing decision. A request to change cadence authorizes its relevant scheduler change; retain any existing required concrete briefing and inspect the actual saved schedule afterwards.

Choose **Back** to return to the area list, **Cancel this edit** to discard an uncommitted edit, or **Close settings** to leave settings. Completed saves remain. The agent preserves the interrupted onboarding question and pause state. A pending interrupted save must be recovered before navigation that would lose it.

The agent uses `settings open`, `choose`, `edit`, `present`, `save`, `cancel`, `back` and `close`. Mailbox changes use the guarded email selection procedure rather than raw JSON replacement. After recovering a saved settings answer, `settings present` clears its completed focus without asking it again.

Use [shared discovery](../automation/tools/README.md) to inspect/reuse the selected tool before proposing setup. API tools and Postman controls local/cloud mode, selected resources, credential source and reporting; it does not select a testing category. A harness change reopens affected verification while retaining prior answers.

Preferences describe desired behavior. Capability records describe what actually works. A new browser needs a matching rehearsal and application sign-in; a new mailbox needs identity/content checks; a new schedule needs an actual scheduler result. Preserve unrelated settings and reopen only affected preparation. [Command contract](../automation/onboarding/README.md)
