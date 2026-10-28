# Conversation state and recovery

Use these helpers from the adopting QA root after `npm ci` and `npm run check`. The agent owns the conversation: it inspects sources, explains choices and interprets answers. Helpers validate bindings, save progress and report readiness; they cannot prove that a user saw a prompt or supplied an approval.

```shell
npm run qa -- onboarding start
npm run qa -- onboarding status
npm run qa -- onboarding next
npm run qa -- help
```

`start` and `status` are read-only. `next` saves a presentation claim only when it selects a queued question. After actually displaying it, use `onboarding shown --id <id> --source <actual-message-reference>`. If it was not shown, use `not-shown`. Repeated `next` returns wait/verify-presentation rather than repeating the prompt. A user-requested repeat takes `--repeat-source` and retains the existing decision.

## Canonical records

| Private record | Purpose |
| --- | --- |
| `.local/harness.json` | Actual calling harness/profile/version, machine/root and interactive/scheduled/ci context; bound through tools bind |
| `.local/tool-selections.json` | Verified executable selections; use tools commands, not raw conversation writes |
| `.local/postman-settings.json` | Local/cloud mode, selected account/resources, region, credential source and reporting; no secret values |
| `.local/project.json` | Name, `environments` array, `owners` array and actual `source`; references to the applicable project sources |
| `.local/context-settings.json` | `route`: provide/discover/combined, actual `source`, source/request references |
| `.local/tool-policy.json` | Optional sourced agent-selection constraints: schemaVersion 1, selection agent, visibility, allowedTools/null, prohibitedTools, source and evidence; [contract](../tools/task-selection.md) |
| `.local/browser-preferences.json` | Legacy method/fallback history; retain actual visibility and source. No mandatory method selection; explicit constraints remain applicable |
| `.local/github-settings.json` | Selected github.com account, repository rules and actual source |
| `.local/email-connections.json` | Guarded provider/account/mailbox bindings and access observations |
| `.local/operation-preferences.json` | mode: onDemand/scheduled/events/combined; source; actual trigger reference/evidence if events are used |
| `.local/review-settings.json`, `.local/verification-settings.json`, `.local/reporting-settings.json` | Nonsecret project preferences and references to actual permissions/policies |
| `.local/onboarding-state.json` | Stage checks, five-domain coverage, question/answer references and response history |
| `.local/pending-response.json` | Retained pending answer and proposed canonical writes; removed only after recovery completes |
| `.local/settings-menu.json` | Settings navigation and shared interview focus |

Do not put passwords, tokens, message bodies, full OTPs or reusable verification links in these records. `.local/` is ignored; Git-backed roots also require it to be untracked. The helpers fail closed if that Git check cannot run. For a nested QA directory, verify the enclosing repository also ignores private state. Hash/revision checks detect stale edits; they are not signatures, access control or a complete secret scanner.

## Queue and answer a decision

The agent creates a private input JSON file and calls `onboarding queue --input .local/question-input.json`. The input is an array:

```json
[
  {
    "id": "project-name",
    "stage": "project",
    "prompt": "What is this project's name?",
    "path": ".local/project.json",
    "pointer": "/name",
    "required": true
  }
]
```

Only ask if the information is absent. Reuse the same ID for a clarification, never rebind it to another field. Supported stages are project, contextRoute, tools, email, access, understanding, operation and handoff.

After interpreting the complete actual reply, prepare a response and call `onboarding reply --input .local/reply-input.json`. Every clear additional answer must have its own registered binding. The agent merges changes into existing canonical JSON, preserving unrelated fields, and calculates the **current** SHA-256 from actual bytes. `expectedSha256: null` is valid only for a new file.

```json
{
  "id": "unique-actual-response-reference",
  "source": "reference-to-the-actual-human-reply",
  "answers": [
    {
      "id": "project-name",
      "path": ".local/project.json",
      "pointer": "/name",
      "kind": "answer"
    }
  ],
  "writes": [
    {
      "path": ".local/project.json",
      "expectedSha256": null,
      "content": "{\"name\":\"Example project\",\"source\":\"actual-reply-reference\"}",
      "origin": "human"
    }
  ]
}
```

This illustrates one answer, not a completed project record. Later answers supply environments/owners. Already answered decisions require `kind: correction`; an unclear answer uses `clarify` on the same ID. A write cannot masquerade as state, evidence or approval generation: private response destinations are restricted to the canonical preference files above. Email selection uses its dedicated procedure.

For an explicitly assigned human-baseline transcription, bind the actual named Markdown document, set origin human and include `baselineMaintenance: { source, paths }` identifying the real named-document authorization. Agent observations use the separate discovery context. File-writing authorization cannot be inferred from an observed product response.

## Recover without losing a reply

1. Run `onboarding recover` when `next` reports a pending response. Applied writes are recognized by hash; the response is recorded once.
2. If a destination has a newer edit, inspect the actual file and retained journal. Keep both histories.
3. Prepare `{ writes, source }` in a private reconciliation input. Preserve already-applied/unconflicted writes; merged conflicting writes reference their actual newer hashes. The source identifies the real comparison.
4. Call `onboarding reconcile --input ...`, then `recover`. Do not reset progress or remove the journal to bypass the conflict.

Locks retain process/time ownership. A crash can leave a lock: inspect the owning process and journal before an authorized removal of that exact stale lock. No automatic stale-lock takeover is implemented. Multi-file replies use a recoverable journal, not a filesystem-wide atomic transaction; individual replacements are atomic and revision checked.

## Checkpoints and completion

`onboarding check --input ...` takes `{ stage, check }`. A check contains `status` (pending/verified/blocked/deferred/notApplicable), `evidence` (path/sha256/optional JSON pointer), `reason`, `nextAction` and `checkedAt`. Verified needs actual evidence/time; deferral/non-applicability needs a reason. Use `npm run qa -- evidence --path <actual-file> [--pointer /field]` to calculate references. Do not invent hashes or observations.

`onboarding domains --input ...` takes five entries, one per business/product/technical/design/decisions domain. Each has `domain`, `state` (documented/gap/notApplicable), `sources`, `owner` and, where applicable, `questionReference` or `reason`. Gap means an original owner question, not a fabricated requirement.

`onboarding finish --input ...` takes the evidence reference to the actual scoped Markdown handoff. It requires checkpoints, five-domain accounting, matching configured capabilities and closed settings/pending saves. It cannot judge whether a source is substantively adequate; the agent and reviewer must assess that. Optional integrations can be inapplicable with a reason. Unresolved intent blocks affected testing even if initial onboarding is complete.

For `pause/resume`, supply `--source` for the actual request. `defer` takes `{ id, source }` and only supports optional questions. `clarify` takes `{ id, prompt, source }` and preserves the original decision history.

## Existing projects and another machine

Version 1.2 had no runtime state schema. Inspect its existing documents/approvals and retain them; introduce v1 state only for this onboarding. Do not import another product's or the job-applications project's state. Unsupported/corrupt schemas are preserved and rejected for explicit migration, never reset automatically. Back up project-private data securely if transferring it, exclude credentials, update the root, and reverify machine/context-specific access. Copying a Ready flag, tool report or schedule record does not make it valid on a new machine.

## QA process records in version 1.6

The agent inspects [QA Process Context](../../QA%20Process%20Context/README.md) during the existing operation/handoff stages. Record canonical sources, owners and original gaps in the handoff and linked project records. Runtime schemaVersion 1 and the five product domains are unchanged; preserve earlier answers and revalidate only affected preparation. Structural readiness checks do not assess substantive coverage or approve a strategy.

## Application-map preparation in version 1.7

The agent links [Application Flow Map](../../Application%20Flow%20Map/README.md) during existing context/understanding and handoff stages. State schemaVersion 1 is unchanged; retain answers, private progress and required decisions. Runtime readiness does not judge map semantics/completeness. Record actual owners, map/source references and bounded gaps in the handoff; extend mapping only through supplied sources or authorized discovery.

## Adaptive methods and preparation

Project readiness returns `issues` for general preparation and `capabilityIssues` for configured optional integrations. An unavailable saved browser/Postman connection does not globally block independent work. Existing pending/blocked checks are not automatically marked Verified; refresh their scoped evidence truthfully. Use [task-tool assessment](../tools/task-selection.md) and [data assessment](../data/README.md) before dependent work; neither grants execution approval. Actual provider/session checks and reviewed commands remain binding.

Onboarding schemaVersion 1, replies, settings and recovery are preserved. `onboarding retire-tool-questions --input` can retire exact obsolete unanswered method/fallback questions with a sourced migration decision, preserving history. It cannot erase answers, cancel visibility/whole-document questions or skip an interrupted reply. Inspect existing instructions before classifying an old choice as advisory.
