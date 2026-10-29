# Reuse on another project or machine

## A different project

Make a fresh project-specific copy. Humans supply available baseline sources/owners; the agent records the learning/testing objective, access and setup gaps. Start with empty QA queues and discovery requests, no observations/outcomes/approvals from another product. Keep reusable policy separate from project data.

You can start from the [public workflow repository](https://github.com/Aniekanetim/AI-Agent-Software-QA), fork it or use its template option. For an agent receiving only the URL, follow [repository adoption](adopt-from-repository.md) and record the chosen workflow revision.

Preserve a destination project's existing instructions and records when merging. This package adds a testing workflow; it does not automatically override another project's working contract, change its application or authorize remote publication.

## The same project on another machine

Transfer project-specific QA files, both context stores, discovery requests, tickets, test sources and relevant sanitized evidence. Preserve IDs, source/entry versions, conversations, decisions, results and links. Keep human-baseline and AI-knowledge ownership separate. Shared records must describe the resumption checkpoint without the former machine's chat.

If using Git, confirm the intended branch/revision and include needed uncommitted files explicitly. Otherwise make a complete folder copy and retain a dated versioned snapshot. Do not assume a conversation sync also transfers local files; [official project guidance](https://learn.chatgpt.com/docs/projects) treats these separately.

On the destination:

1. Open the actual QA root as the primary project directory and read its AGENTS.md.
2. Record actual machine-specific paths in agent-maintained setup/progress; ask the human owner to update the canonical environment reference if needed. Recheck links/source availability. Hosted-only discovery needs a URL, not an application checkout.
3. Reconnect required tools/accounts. Install local application dependencies only when required. Establish sign-in securely; do not transfer cookies, tokens or browser storage state as context. Exclusion rules do not untrack previously committed secrets.
4. Verify human sources/design revisions, relevant discovery entry versions/freshness, served identity, data isolation and tools. An undisclosed build remains Unknown; copied observations/results are not fresh execution.
5. Read the active request/ticket, actual decisions and latest responses. Reuse applicable authorization; changed scope/criteria/risk returns to the relevant discovery review or QA gate. Retain claims and unanswered questions rather than restarting them.
6. Perform a manual board check-in. Review pending claims/owners so two workers do not process the same ticket.
7. Configure native scheduling for the correct local project/chat only when requested. Coordinate any existing schedule rather than assuming file transfer moved or disabled it.

The distribution includes workflow instructions/templates, TypeScript helpers and a pinned dependency lockfile. It excludes installed node_modules, downloaded browser/CLI binaries, private state, machine-level scheduler configuration, connector authentication, employer evidence and chat history. On a new machine use `npm ci --ignore-scripts --cache .local/npm-cache`, then reverify the selected tools/access in that execution context. Native MCP/in-app connections and GitHub/email authentication require actual setup there.

Private `.local/` state is not transferred by a Git clone. Back it up only through an appropriate secure project transfer if needed; exclude tokens, browser session state and reusable verification links. Preserve canonical human/AI context separately. Existing machine/root capability records fail revalidation after relocation. Unsupported state schemas are preserved for explicit migration, not reset. [Onboarding state/recovery](../automation/onboarding/README.md)

Discovery requests resume independently of the QA board. No discovery schedule is transferred or activated. Flag affected discoveries for refresh when their source/application conditions change; never automatically rewrite the human baseline from observations.

## Maintain the master

Keep the master unconfigured. When a process improvement is accepted, update its workflow/templates with the reason and version, then deliberately adopt the change in active projects. Do not silently rewrite an ongoing run's test basis or historical outcome.

## Existing tools and API readiness

Follow [shared tool discovery](../automation/tools/README.md) before setup questions. Reuse existing tools and connections when actual access through this harness is verified. Moving hosts requires targeted capability checks, preserving earlier answers and historical evidence. [Postman CLI](../automation/postman/README.md) supports local collections without account login; cloud resources require selected identity/access and explicit reporting scope.

## Transfer QA process knowledge

Transfer the applicable [QA Process Context](../QA%20Process%20Context/README.md) records, their revision history and linked canonical matrices/plans/data/configuration/regression references. Preserve actual ownership, decisions, gaps and historical run identities. Reverify affected environment/access references after relocation. Do not copy another project's strategy, outcomes or approval as live defaults. Existing onboarding schema is unchanged; unsupported runtime state still requires explicit migration rather than reset. Temporary coverage snapshots may be regenerated from the transferred canonical records; copied hashes do not establish fresh execution.

## Transfer application connections

Include [Application Flow Map](../Application%20Flow%20Map/README.md), area views, source links, correction/retirement history and impact briefings when transferring the same project. Preserve map IDs/revisions separately from served build identity and actual approvals. Recheck affected sources and environment applicability after relocation; regenerate temporary helper projections from canonical records. A different project starts with empty map templates, not another product's connections. No scheduler or application access transfers with the diagram.

## Adaptive task preparation

Follow [task-based tool selection](../automation/tools/task-selection.md) and the [data preparation policy](../QA%20Process%20Context/Test%20Data%20Management/preparation-policy.md). The agent chooses suitable accessible methods per task, generates routine local inputs and establishes authorized state. Preserve explicit constraints, exact retest identities, old answers and failed attempts. Optional capability gaps do not block unrelated work. State precise missing dependencies and continue independent authorized checks. Preserve existing human gates; copied readiness is not current task readiness.

## Chrome DevTools on another machine

Install the pinned dependency with scripts disabled on Node 22.12+, then follow [Chrome DevTools discovery](../automation/chrome-devtools/README.md). Reuse compatible existing executables/connections, preserve earlier answers and reverify only machine/harness/session-dependent capabilities. Do not transfer browser profiles, cookies or daemon state as project knowledge. Preserve sanitized invocation/evidence history through an appropriate secure transfer; copied inventories/readiness remain historical until refreshed. Native-host access and target-application tool support require their own actual observations.
