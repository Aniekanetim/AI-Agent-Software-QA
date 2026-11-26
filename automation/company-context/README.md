# Company context

Connect the agent to selected company Slack sources so people can make a decision once and the agent can find and cite it during later QA work. Follow the [Slack setup guide](../slack/README.md). Company sources supply knowledge; the [task source](../task-source/README.md) identifies work and the existing QA workflow governs execution and release decisions.

## Onboarding and Settings

Discover existing connections through the actual calling harness and its integration directory. Reuse a valid account/workspace selection. Connect only when necessary. Show the actual channel catalog, its completeness and read limitations. Let the user select individual channels or all currently accessible channels across the company. Following newly accessible channels is a separate recorded choice.

Use **Settings → Company context → Slack** later to change channels, history, directory access, freshness and connection setup. Existing Settings numbers and completed onboarding are preserved. Back, Cancel and Close remain available if this optional integration is unavailable or unreadable. A canceled edit does not undo an already completed Slack membership change.

Initial context establishment is required; Slack itself is optional. Continue with supplied documents or independent discovery when Slack is unavailable. An actual task depends only on the sources it needs.

## Read, understand and apply

Keep granted access, selected channels, project applicability and decision authority distinguishable. A support complaint informs investigation; a proposal describes an option; a clear applicable owner decision can supply an expected behavior. Use actual team ownership and decision practices without asking the user to approve each message. Job title and channel membership alone do not approve a rule.

Retain canonical source links and exact source versions. The agent may publish permitted product-learning summaries in [AI discovery context](../../Product%20Discovery/Project%20Context/README.md). Root [Project Context](../../Project%20Context/README.md) stays human-maintained and may reference the original Slack thread. No second manual transcription is required. Restricted conversation content stays in the private source store. Source version, interpretation revision, reviewed criteria and served application build remain distinct.

Review complete relevant threads. Record decisions, scope/effective timing, authority evidence, proposals and uncertainty separately. `recordClaim` does not infer an owner's authority or authenticate their decision. The actual agent reads and interprets the source; the existing G1/G2/G4 review approves the understanding used for tests.

## Commands and records

All input files are private JSON under `.local/`. These examples describe commands; they do not configure the reusable package.

```shell
npm run qa -- company-context status
npm run qa -- company-context discover
npm run qa -- company-context discover --input .local/observed-slack-connection.json
npm run qa -- company-context preview --input .local/company-selection.json
npm run qa -- company-context apply --input .local/company-apply.json
npm run qa -- company-context refresh --binding company --budget 20
npm run qa -- company-context job --job <actual-job-id>
npm run qa -- company-context resume --job <actual-job-id> --budget 20
npm run qa -- company-context sources --binding company
npm run qa -- company-context claim --input .local/company-claim.json
npm run qa -- company-context analyze --input .local/company-analysis.json
npm run qa -- company-context bind-basis --input .local/company-basis-binding.json
npm run qa -- company-context verify-basis --input .local/company-basis-verification.json
npm run qa -- company-context impact
```

Configuration preview records the exact binding, channel IDs, catalog evidence, historical bounds, thread/directory choices, maximum receipt age and retention source. Apply requires the preview/digest, actual response evidence and response source. Generic Settings JSON replacement cannot save the integration.

During onboarding, queue the focused optional question in its existing tools/understanding stage with the canonical destination `.local/company-context.json`. After the actual answer, use the dedicated preview/apply procedure. Then record the answer in `onboarding reply` with `writes: []`, referencing the already-saved configuration. This retains the shared interview focus and actual response without granting generic JSON replacement. Defer the optional question when setup can wait.

Obtain canonical thread/message links for decision briefings. API-backed agents can run `company-context source-link --input ...` with `bindingId`, `sourceId` and the actual source reference. Native agents retain the actual provider link via `import-link`, including the matching operation evidence. `sources` then includes verified URLs. Missing link access is a disclosed navigation gap; never invent a permalink. [Slack permalink retrieval](https://docs.slack.dev/reference/methods/chat.getPermalink/)

Settings uses `settings edit`, `present`, `company-shown` and `save-company`. Retain the real prompt/reply references. `company-context recover --operation <preview-digest>` resumes its original configuration journal. Never reset malformed settings to clear an error.

After repairing an unreadable optional edit, reopen Company context and use `settings recover-company --id <original-question-id>` to reattach its original record without replacing another question. Configuration recovery marks its original answered edit from the retained journal, so a saved answer is not asked again.

The private store contains connections, source objects, version heads, refresh jobs, knowledge/analysis, scoped QA bindings and receipts. Timestamps identifying Slack messages remain exact strings. Snapshots are immutable evidence; current source heads establish known changes. Pure unconfigured status creates no records or network work.

## Refresh and interruptions

Channel discovery retains each successful catalog page before asking for the next. An error returns `progress` evidence and the original operation ID. Inspect it with `company-context catalog-job --operation <id>` and resume `channels` using that retained evidence as `--previous`. Persistent cursor history detects loops across bounded resumptions. Cooldowns survive retries. If a reader was interrupted, investigate its actual process and use `recover-catalog --operation <id> --source <investigation>`; a live reader cannot be stolen. Native `import-host-catalog` accepts `previous` so earlier pages need not be resubmitted. Partial catalogs remain partial and cannot authorize all-accessible selection.

Refresh reads bounded pages with a fixed history cutoff and preserves cursors, thread queues and incomplete coverage. `--budget` bounds logical page reads; identity verification is additional. A short/empty page with a cursor is incomplete. An available cursor is not a completed read. Native host calls must be performed through the actual host and imported with exact request/output evidence; the terminal cannot invoke a hidden native connector.

Keep retrieval coverage and analysis coverage separate. `sources` displays sanitized source records to the authorized agent; `analyze` identifies exact inspected revisions and rationale. It does not grant test authority. A newly retrieved relevant statement needs interpretation before dependent work continues.

Known message/thread roots are rechecked, including replies to old discussions. Older edits cannot silently replace newer content. Ambiguous ordering requires actual reread evidence through `reconcile-source`. Absence from a partial window is not deletion. Polling cannot guarantee discovery of every unseen historical edit outside its coverage. Show historical bounds, thread gaps and actual verification times. This release provides manual/polling refresh, not an active Slack event service.

Cooldowns are recorded with the refresh job. Resolve recorded access gaps, then use `resume --retry-failures`; do not repeat an unchanged denied request during every check-in. `recover-refresh --job ... --source ...` requires investigation of the original reader. A live in-flight reader cannot be replaced solely because time elapsed.

## Reviewed execution and G5

Version 1.16.1 ties freshness to completed relevant history/thread page chains and actual read-generation IDs. A recent message observation cannot renew evidence while required replies remain unread. Pending unrelated sources do not block eligible independent cases. A prior complete receipt can serve its existing work cycle until expiry or a known invalidation; it cannot certify a newly prepared boundary.

An execution/resume gets one stable boundary ID, actual target and source-basis revision. Its source reads must follow that boundary. Reuse its receipt between checkpoints rather than asking for case-by-case approval or rereading before every click. A materially changed expectation returns affected work to the existing review gate; unchanged reads reuse the approval.

Before G5, run `company-context prepare-release --input .local/prepare-release.json` with `assignment` and exact `assessment` evidence. This prepares the parent and included fixes' applicable sources. Before a later publication/closure, use the same command with `action`, actual action `id` and recorded G5 `decision` evidence. The synchronous handoff/closure guards reject missing or stale evidence; they never perform network requests inside board locks. For a local close, the action ID is the reviewed ticket revision. For connected actions it is the exact inventory-recheck action/ID.

For scoped fix review use `company-context prepare-fix --input ...` with `fix`; for its later close add `close` containing the actual scoped G5 review evidence. This preserves the required original confirmation and regression checks. No-change dispositions retain their owner-clarification path and do not claim a tested product fix.

For direct/native case actions use `company-context prepare-boundary --input ...` with `assignment`, optional scoped `criteria` and `boundary: { purpose: "execution", id, target: { buildId, environment } }`. The ID must match the case session or concrete execution operation. Native setup prepares a job and reports the real host read needed; perform/import its actual pages, analyze relevant changes, then retry preparation. An old capture cannot be relabeled as a new-boundary read. Source-bound case evidence still requires the reviewed starting state, checkpoints and actual outcome.

Completed evidence remains historical. Open legacy work without the new completion proof obtains a fresh actual read; this does not reset onboarding or automatically require a new human approval. Source policy, connection, target and current interpretation still have to match.

For a configured project, record the selected sources considered for each assignment. A `Basis` names exact selection digests, decision dependencies and reasoned channel exclusions. Add its evidence reference as `companyContext` on the feature understanding. Its criterion source must cite the actual decision/retained source evidence. `bind-basis` reuses the actual G1/G2/G4 approval of that understanding; it is not an extra approval gate.

Before dependent work, reread actual sources and run `verify-basis` to retain freshness receipts. The default example uses 15 minutes; configure actual project limits. Execution checks exact source versions, analysis, supersession, selection and receipt validity. API-backed entry points can refresh an expired basis outside execution locks. Native-backed work asks the agent to use the existing host access, then resumes within the same approval when expectations are unchanged.

Case checkpoints, Postman/WebMCP admission, local/connected work, GitHub execution and scoped fix/release completion share these checks. A changed dependent criterion holds that case; independent approved cases continue. Refreshing source content does not change acceptance criteria silently. Material changes return to the affected existing review gate.

Record `effectiveScope` with explicit environment/release/start time for future decisions and the corresponding target on the source basis. A superseding decision applies according to those recorded conditions. Missing applicability is assessed conservatively; do not invent a release or effective date.

When source edits leave the exact reviewed statement, authority, applicability and effective timing unchanged, retain an agent comparison through `company-context equivalent --input ...`, naming the basis, binding, old/current claims, rationale and evidence. The helper rejects changed expectations. It then permits renewed source evidence without another routine approval. `impact` records alone do not override stale evidence.

G5 and handoff/closure recheck current source validity alongside module/test-type coverage and required fix regression. Historical records remain readable using their original versions. Dispatch-time checks cannot guarantee continuous remote monitoring; retain the runner's actual limits and reconcile any learned changes before a current release claim.

## No-change dispositions and execution provenance

A source-dependent defect refutation needs current scoped G5 evidence too. Retain a private packet with `assignment`, `ticketRevision`, `defectReport`, `ownerDecision`, reviewed `understanding` and actual `targetObservation`. The owner decision records `noProductChange`; this does not create a product fix. Run `company-context prepare-disposition --input ...` with `{ "packet": <Evidence> }` before the existing G5 review. Its actual decision pins that same packet and fields, G5 Approved, reviewer and source. Before closure prepare `{ "packet": <Evidence>, "close": <actual-G5-Evidence> }`. The close boundary obtains a post-decision read. Unchanged repeated preparation reuses proof and the actual decision. Missing target/scope on an open legacy disposition needs the specific clarification; completed history is not rewritten.

For a connected board, include `action: { "purpose": "publish" | "reconcile" | "observe" | "close", "id": <actual-action-id>, "decision": <actual-native-G5-Evidence> }` with `close`. The native G5 record identifies the same scoped disposition in `fixReview` and the actual target. Use the publication/observation ID for that operation and the claim ID for final claim closure. Each action obtains its own post-decision source proof; publication proof cannot silently authorize later closure. `prepare-fix` accepts the same action structure for registered product fixes. Local ticket closure retains its reviewed ticket-revision identity by default.

GitHub local runs, remote dispatch, connected aggregate execution and case checkpoints retain `companyAdmission` evidence under private immutable storage before the action. It identifies the actual assignment/operation/target, reviewed basis, boundary, connection/selection snapshots, receipt history and completed reads. Later receipt renewal cannot replace the original proof. Remote results associate through the existing `qa_run_key`; this does not add undeclared workflow inputs or claim continuous remote Slack monitoring. Old operations without such evidence remain historical with missing provenance, never backfilled from a new read.

For a partial native catalog failure, inspect the returned `operationId`/`progress`, correct only the failed page and resume with that progress as `previous`. `company-context catalog-jobs --connection <id>` finds unfinished operations even before channel selection. `catalog-job --operation <id>` inspects the current snapshot; `recover-catalog` requires the actual stopped-reader investigation. Inspecting does not fetch, update freshness or change selections. Another live reader's reservation must be retained.

## Retention, sharing and another machine

Credentials, OTPs, full raw provider errors and unrestricted company exports do not belong in committed records. Source text receives targeted secret redaction, which cannot promise to identify every possible secret. Outbound posting is separately authorized; reading Slack grants no message-sending permission.

The selected private-cache policy controls removed local sources. With `keepHistorical: true`, preserve evidence and show lost refresh coverage. With `false`, removal purges managed private source/claim content when another active selection does not need it, retaining a purge marker and explicit historical-verification limitation. This does not delete the original Slack messages, user-supplied tool captures or published documents; their owners apply their retention policies.

A shared local context root requires named-root authorization, a source policy and the same permitted source identity. Content reads remain filtered to the consuming binding's selected channels. Automatic purge requires project-local storage; shared retention changes use the shared owner's procedure. Shared filesystem locks do not establish cross-machine coordination. On another machine, reconnect and verify the actual account, scope and harness access. Do not copy tokens or treat an old receipt as new-machine readiness.

## Scheduling

Establish the cadence/timezone/root/chat and actual source-reading scope, then configure the actual host scheduler. Record its observed result with `company-context schedule --input ...`. This records scheduler evidence; it does not activate a schedule. Company-source refresh is distinct from board pickup and Product Discovery. An explicit combined check-in may do both. Verify scheduled-harness Slack access and the first real refresh before claiming unattended readiness.

See [validation and limitations](../../docs/company-context-validation.md). The reusable package includes no live workspace, source binding or active refresh schedule.
