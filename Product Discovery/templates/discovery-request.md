# DISC-`<number>`: `<learning objective>`

**Template — not a live request, authorization or discovery result.** Copy into `Product Discovery/requests/`, use a unique ID/descriptive filename and retain the same file throughout the work.

| Field | Value |
| --- | --- |
| Request ID / revision | `<DISC ID; request revision>` |
| Requester / reviewer / responsible contacts | `<actual people or roles; no assumed ownership>` |
| Created / updated | `<actual ISO date/time with timezone>` |
| Priority and reason | `<requester's ordering and reason, where needed>` |
| Related QA assignment / original question | `<direct links or None; link back from the ticket>` |
| Owner / claimed at | Unassigned |
| Progress / checkpoint | Proposed; authorization not recorded |
| Next action / waiting on | Prepare scope and readiness; `<specific dependency or None>` |
| Workflow source / revision | `<package revision used>` |

## Objective and completion criteria

`<What the requester needs to learn and how the output will be used.>`

| Question / journey | Role and proposed actions | Output / completion criterion | Why selected |
| --- | --- | --- | --- |

`<Alternatives, excluded journeys/roles and required versus optional answers. State whether a completion review or receiver acceptance is required and who supplies it.>`

## Target, access and operating limits

- Browser URL / permitted domains: `<actual values>`.
- Served application identity / verification method: `<actual version, or Unknown with available evidence and observation time>`.
- Relevant API access, if authorized: `<scope or Not included; no assumed full API contract>`.
- Local application source: `<available location, or Not required for hosted discovery>`.
- Roles / nonsecret account and access references: `<values; no passwords, tokens or cookies>`.
- Allowed mutations / account registration / verification / cleanup: `<explicit bounds>`.
- Synthetic data and evidence storage/redaction: `<scope, locations and retention>`.
- Tool readiness / time or resource limits / stop conditions: `<values>`.

## Existing context and gaps

| Source | Exact section / entry IDs | Applicable revision / date / state | Relevance / gap |
| --- | --- | --- | --- |
| Human-maintained context | `<links to actual sources>` | `<version and authority>` | `<facts or missing answers>` |
| AI-managed discoveries | `<links or None>` | `<entry versions and freshness>` | `<reusable knowledge / refresh needed>` |

## Authorization history

No authorization recorded. Retain each dated request/reply and revision. Record the self-contained briefing, actual human response, scope, conditions and exact next permitted work. Reuse applicable authorization; changed boundaries need a revised decision. Approval of exploration does not approve a requirement, test execution or release.

## Exploration and knowledge references

Not started. Append dated actions/observations with executor, role, target identity and evidence. Store substantive knowledge in the AI context and link its OBS IDs here; avoid duplicating the full report.

| Question / journey | Actual coverage | Knowledge / evidence | Remaining gap |
| --- | --- | --- | --- |

## Questions and owner responses

None raised. Check for an existing question before adding one. Preserve actual answers and link owner decisions or published sources.

```text
Q-<number>: <one concrete question>
Raised: <date/time; actor>
Checked: <sources/sections/revisions and existing question references>
Gap/conflict: <what remains unknown or contradictory>
Affected learning / QA check: <specific scope and impact>
Needed from: <responsible owner or developer referral>
Next action: <what waits; independent authorized work that can continue>
Response: <append actual reply/date/actor when received>
Resolution: <decision/source revision, evidence and resumption point>
```

Index unanswered discovery-origin questions in the discovery README. Link a QA-origin question to its existing ticket and board index instead of recreating it.

## Proposed human-context changes

None proposed. For each proposal, record the supporting OBS IDs, proposed clarification/wording, alternatives, consequences and responsible decision owner. Record the actual accept/change/reject response separately from observation review. The human team publishes the baseline update; link its actual revision afterward. Do not mark a proposal published before that occurs.

## Completion and handoff

Not completed. Record answered/required-unanswered questions, role/journey coverage, knowledge references, evidence limits, actual mutations/cleanup and remaining owners/actions. Include human-context revisions, AI-context versions and served application identity separately. Record the actual completion review/receipt only if required and received; otherwise state its real status.

Return the result to the linked QA ticket and identify its next checkpoint. Completion means the authorized learning objective was met, not that the application passed testing or is ready for release.

## Refresh and resumption

`<Relevant change triggers, affected entries, current claim/checkpoint and next action. Preserve history and avoid unchanged repeated exploration or unanswered requests.>`

## Application-map references

Map ID/revision and affected feature/relationship IDs: <actual references or known gap>. Link the root [Application Flow Map](../../Application%20Flow%20Map/README.md), original discoveries and actual source revisions. State which connections were supplied, observed, inferred or not reached. Mapping publication stays within the existing authorized journeys; it does not require a whole-product crawl or authorize QA execution.

## Tools and exploration data

Use [task-based selection](../../automation/tools/task-selection.md) for the learning actions; discovery does not require a project-wide browser choice. Prepare suitable synthetic inputs and authorized accounts/state using [the data policy](../../QA%20Process%20Context/Test%20Data%20Management/preparation-policy.md). Preserve learning authorization, actual starting-state evidence and original identities; escalate only affected missing rules/access/state. Discovery remains independent of QA test verdicts and gates.
