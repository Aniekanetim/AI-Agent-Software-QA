# Test-data initiative and genuine blockers

The agent prepares the data needed by the task within existing preparation authority. Missing attached data is not automatically a blocker. Determine whether suitable data can be generated locally, reused or established through an authorized application/sandbox mechanism. Use the [preparation record](data-preparation-record.md) and retain actual sources and outcomes.

## Decide what can be prepared

| Need | Agent action | Boundary |
| --- | --- | --- |
| Synthetic local values, files and fixtures | Generate from the task's conditions, including meaningful valid, invalid and boundary inputs | Do not invent a rule or expected outcome; retain the actual inputs/rules |
| Fresh application records or accounts | Use an authorized UI/API/fixture mechanism, record identities and verify the starting state | Account creation, volume, external effects and roles must fit the actual scope |
| Existing records for continuation or retesting | Reuse the exact original reference/account and establish the necessary state | A new account cannot stand in for a required persisted-state retest |
| Restricted or externally confirmed state | Use an approved sandbox/simulator when it can establish the required condition; otherwise request assistance | A fabricated identifier does not establish settlement, eligibility or another real state |
| Unclear data validity, eligibility or state rules | Ask the responsible owner; continue independent authorized preparation | Exploration can establish observations, not missing intended behavior |

The testing task and standing project policy may already authorize routine preparation. Reuse that authority rather than asking for each name, file or record. Local synthetic input generation within authorized task preparation needs no separate per-value approval. State-changing preparation needs the applicable environment/action/data limits; when absent, prepare the concrete procedure for the existing gate or ask the exact missing question. This framework template itself grants no access or mutation authority.

Choose generators/scripts/tools appropriate to the required conditions and data model. Follow meaningful relationships, totals, permissions and lifecycle prerequisites. Negative inputs are deliberate test conditions, not a reason to repair them into valid values. Performance data needs an agreed workload/distribution; generated personas do not substitute for actual usability participants. Never relax the expected outcome to fit convenient data.

## Prepare, verify and retain

1. Identify condition IDs, required starting state, accepted source, environment/build and relevant upstream dependencies from the application map.
2. Choose generation, creation, reuse or supplied data. Record origin, classification, actual preparation bounds and cleanup/retention scope. A generic policy link must actually cover the proposed operation.
3. Generate local inputs or perform only authorized preparation. Isolate each worker/run; respect account and concurrency limits. For test accounts follow the [mailbox policy](../../automation/email/mailbox-policy.md), fresh aliases and exact identity reuse.
4. Retain relevant actual values or files, generation rules/seeds when useful, record references and timestamps. Seeds alone cannot reproduce a changing application state. Keep credentials, OTPs and reusable links out of shared records.
5. Verify that the required data/role/state actually exists through suitable evidence. An API preparation step can support a UI test, but it does not count as execution of the UI action under test. Direct database seeding or bypassing a transition must be explicitly suitable/authorized for that objective.
6. Link the data revision and verified starting state to readiness and results. Retain failed preparation attempts and original failure evidence; do not regenerate until a failure disappears. A valid, authorized setup action failing against an established expectation may itself warrant investigation as a finding.

Reset/reuse/cleanup follows its own recorded scope. Preserve records needed for reproduction and other workers; never delete them merely because the test ended. Changes reopen only affected preparation; material scope, data access or action changes return to the existing gate.

## Report a specific dependency

Before blocking, assess permitted generation/reuse/preparation options. Do not attempt an unauthorized action to prove it is unavailable. On the existing ticket, record:

| Blocker field | Required detail |
| --- | --- |
| Affected check/condition | Exact IDs and required data/state |
| Evidence and work already done | Sources/revisions checked; permitted attempts or why no attempt was authorized |
| Missing dependency | Why the agent cannot legitimately establish it |
| Requested assistance / owner | Concrete dataset, permission, sandbox operation or rule clarification needed |
| Original question / next action | Ticket-local question ID, waiting checkpoint and resumption condition |
| Independent work | Checks that can still proceed within existing authorization |

Use the existing board clarification index and preserve the conversation. Do not open a product bug merely because data/access is unavailable, repeat unanswered questions or block unrelated checks. Receiving data is not proof of state; verify it before resuming. A changed test basis returns to the affected gate.
