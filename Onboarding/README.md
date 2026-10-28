# Join a project

Onboarding prepares the agent to work on a project. It establishes context, access, tools and working preferences. After onboarding, a QA ticket or a configured GitHub trigger tells the agent what needs attention. The ticket, accepted expectations and risks determine the testing required; onboarding does not restrict the agent to a testing category.

Tell your agent: **“Start onboarding for this project using Onboarding/onboarding-workflow.md.”** The agent reads existing preparation first, presents the roadmap and asks one focused missing decision at a time. You can say **Continue onboarding**, **Pause**, **Open settings**, **Back**, **Cancel this edit** or **Close settings**.

## Prepare the project copy

Use [SETUP.md](../SETUP.md) to choose a project-specific QA root. Install Node.js 22 or later, Git and the pinned package dependencies:

```shell
npm ci --ignore-scripts --cache .local/npm-cache
npm run check
npm test
npm run qa -- onboarding start
```

The commands support the agent's conversation; they do not conduct a standalone chatbot interview. The agent must actually show the roadmap/questions, interpret your complete reply and explain decisions. JSON output is not evidence that a human saw or approved it.

## Roadmap

1. Establish the project, environments and responsible people.
2. Choose **provide context**, **discover context** or **combine both**.
3. Verify existing tools; prepare missing browser, API and GitHub capabilities where applicable.
4. Discover email integrations and select verification mailboxes.
5. Establish application access.
6. Build and review initial project/product understanding.
7. Configure check-ins, PR triggers and reporting.
8. Verify scoped readiness and explain how work begins.

The sequence follows dependencies. A staging-only project does not need an application checkout. A project without GitHub access can still use discovery and the local board. Email can be deferred when no current journey needs it. Every context domain must still have a source, justified non-applicability or a question with an owner.

## Choose and verify integrations

Start with [shared tool discovery](../automation/tools/README.md). The agent inspects existing installations, saved selections and native connections through the actual calling harness. Working setup is reused; only missing choices or capabilities need preparation. Version checks, authenticated identity and successful operations remain separate.

| Area | Choices and next step |
| --- | --- |
| Browser interaction | Harness in-app browser, Playwright CLI, Playwright MCP, or a recommendation based on actual checks. Record visibility/fallback. [Browser guide](../automation/browser/README.md) |
| Scripted suites | Playwright library and Playwright Test are bundled independently of the interaction preference. Other task-specific tools can be added when needed. |
| API tools | Postman CLI is bundled. Reuse a compatible accessible installation; local collections need no Postman login. Cloud work needs selected account/resources and reporting authorization. [Postman guide](../automation/postman/README.md) |
| Email | Google — Gmail / Google Workspace first, other discovered providers, AgentMail, human-assisted verification or later. Select the actual account/mailbox and apply the [global mailbox policy](../automation/email/mailbox-policy.md) for fresh identities, exact reuse and correlated verification. [Email guide](../automation/email/README.md) |
| GitHub | Reuse compatible CLI/access or install the pinned CLI locally, authenticate and select repositories. [GitHub guide](../automation/github/README.md) |
| Check-ins | On demand, scheduled, PR-based or combined. A saved choice does not activate an actual scheduler or workflow. [Automation guide](../automation/README.md) |

Dependencies and adapters are distributed with the package; browsers, host connections and credentials are established on the adopting machine. Neither package installation nor a configuration file proves operational readiness.

## Preserve information and resume

Canonical context stays in the two [context stores](context-interview.md). Private nonsecret preferences, progress, bindings and recovery journals live under ignored `.local/`; credentials and browser authentication state stay outside committed records. Do not commit `.local/` merely to transfer a setup.

The agent saves clear extra answers from a reply instead of asking for them again. A pending response is recovered before another edit. Newer conflicting edits are retained for comparison; they are never silently overwritten. [Persistence contract and command examples](../automation/onboarding/README.md) describe this mechanism.

At completion the agent provides the [onboarding handoff](templates/onboarding-handoff.md): usable capabilities, context coverage, remaining dependencies and the first eligible work. Onboarding completion is not test authorization, a product pass, release approval or schedule activation.

## QA process preparation

During the existing operating-rules and handoff checkpoints, inspect [QA Process Context](../QA%20Process%20Context/README.md). Reuse existing team strategy, traceability, configuration, data and regression sources. Identify actual owners and unresolved preparation without repeating prior questions. Product context still has five domains; this is operational preparation rather than a sixth product domain. A template is not an approved strategy. Readiness for dependent testing requires the relevant basis and resources.
