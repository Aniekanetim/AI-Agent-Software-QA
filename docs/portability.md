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

The portable folder contains workflow instructions and templates. It does not contain runtime installations, browser binaries, machine-level scheduler configuration, connector authentication, employer evidence or chat history.

Discovery requests resume independently of the QA board. No discovery schedule is transferred or activated. Flag affected discoveries for refresh when their source/application conditions change; never automatically rewrite the human baseline from observations.

## Maintain the master

Keep the master unconfigured. When a process improvement is accepted, update its workflow/templates with the reason and version, then deliberately adopt the change in active projects. Do not silently rewrite an ongoing run's test basis or historical outcome.
