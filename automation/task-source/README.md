# Task source

Choose one task source for a QA project during onboarding or under **Settings → Task source**. **Use the local task manager** uses the project's status folders. Projects with no saved choice use those folders. **Connect a task management app** uses the native ticket for ownership, status and discussion. QA evidence and gate records stay in the project and reference the native ticket URL and ID.

The four API adapters have simulated provider tests. Confirm account, board and workflow behavior in the team's sandbox before using the integration on team work. Verify the board actions the team chooses separately from read access.

## Connect and preview

| App | Information to select | Credential available to the QA process |
| --- | --- | --- |
| Jira Cloud | Site hostname, account email and Jira Software board ID. Include the Cloud ID for a scoped token. Map the status IDs under the board's columns. | `QA_JIRA_API_TOKEN` |
| ClickUp | Workspace ID and List ID. Map the List's task status IDs. The inspector supplies a name-derived ID when ClickUp provides only a name; re-preview after renaming such a status. | `QA_CLICKUP_API_TOKEN` |
| Linear | Team ID and, if needed, an exact project ID. Map the team's workflow state IDs. | `QA_LINEAR_API_KEY` or `QA_LINEAR_ACCESS_TOKEN` |
| Asana | Project GID. Map its sections or the enum values of a specified status custom field. | `QA_ASANA_ACCESS_TOKEN` |

Use an authorized test/service account and supply its credential through the runtime environment. Keep credentials out of commands, request files and task evidence. Scheduled runs need access in their own execution environment.

1. Run `npm run qa -- task-source providers` to see which credentials the process can access. Run `task-source inspect --input .local/board-selection.json` with the selected board IDs to verify the account, scope and status catalogue.
2. Prepare a choice with the queue mappings and the exact board actions the user permits. Use `task-source preview --input .local/task-choice.json`. Show the board, authenticated account, queue mappings and examples of tickets that qualify or require assignment.
3. After the user chooses that setup, run `task-source save --input .local/task-choice-save.json` with `{ "choice": ..., "previewDigest": "...", "source": "..." }`. Copy the actual preview digest and record the user's selection as the source. Saving checks the account and mappings again and makes that source active.

Use `npm run qa --` before the abbreviated commands on this page. Input JSON belongs under the project's ignored `.local/` directory. For example, the choice for a ClickUp sandbox could be:

```json
{
  "kind": "live",
  "board": {
    "provider": "clickup",
    "scopeId": "LIST_ID",
    "clickupWorkspaceId": "WORKSPACE_ID"
  },
  "queues": {
    "ready": ["INITIAL_QA_STATUS_ID"],
    "retest": ["FIX_READY_STATUS_ID"],
    "devTodo": ["DEV_TODO_STATUS_ID"],
    "rework": ["REWORK_STATUS_ID"],
    "testedOk": ["TESTED_OK_STATUS_ID"]
  },
  "actions": ["comment", "move", "createDefect"]
}
```

Use `site` and `jiraEmail` for Jira Cloud and add `jiraCloudId` for a scoped token. For Linear, use optional `linearProjectId` and set `linearAuth` to `oauth` if the environment supplies an OAuth access token. Use optional `asanaFieldId` for an Asana single-select custom field. Jira defect creation additionally needs the original issue's project to allow the selected `jiraDefect: { issueTypeId, transitionId }` and the board filter to include the resulting issue. `ready` and `retest` are required. Use a single mapped destination for each move or defect routing action. Choose an empty `actions` array to use the board for intake with human-managed updates.

To choose the local task manager, preview and save `{ "kind": "local" }` through the same commands. Reconcile active claims, operations and uncertain publications before switching. Use [GitHub comment reconciliation](../github/README.md#reconcile-an-interrupted-comment) if an existing PR report blocks the switch. A disconnect pauses the live queues. Resume with the same authorized account and scope.

## Provider setup and verification

### Jira Cloud

Use a scoped service-account API token through the Atlassian API gateway where the organization has provisioned one. Use the Jira site and its actual Cloud ID. The inspector checks their pairing before sending credentials to the gateway. The direct site URL supports an authorized personal API token for a local sandbox. Match the board's columns to issue status IDs and verify the board filter includes the intended issues. Exercise the destination's actual workflow transition and the chosen defect type in the sandbox. [Service-account tokens](https://support.atlassian.com/user-management/docs/manage-api-tokens-for-service-accounts/) · [Jira board API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/) · [Jira issue API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)

### ClickUp

Use an authorized test token or a token provisioned through the organization's OAuth app. Verify the List belongs to the selected Workspace. Select its task statuses from the inspection output. Tasks in multiple Lists can be visible, and moves apply the home List's workflow. Test pickup against the intended mapping and verify comments and defects in the actual List. [Authentication](https://developer.clickup.com/docs/authentication) · [List tasks](https://developer.clickup.com/reference/gettasks) · [Update task](https://developer.clickup.com/reference/updatetask)

### Linear

Use a personal API key for a sandbox or an externally provisioned OAuth access token for the chosen account. For OAuth, request read access and only the needed write scopes for comments and issue updates or creation. Use the Team's workflow states and verify that an optional Project filter excludes unrelated issues. A GraphQL response can contain errors alongside successful HTTP status, so only complete results establish the required capability. [GraphQL API](https://linear.app/developers/graphql) · [OAuth scopes and renewal](https://linear.app/developers/oauth-2-0-authentication) · [Published schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql)

### Asana

Use an authorized PAT for a single QA installation or an externally provisioned OAuth token. For OAuth, include the read scopes needed to identify the user, project, sections and tasks. A multi-project task can sit in a different section in each project. Verify the selected project's direct membership and use its section or configured enum field to route the task. A section move changes the selected project's section. A custom field update writes the task's actual field value. Verify the destination and side effects with the team. [Authentication](https://developers.asana.com/docs/authentication) · [Project tasks](https://developers.asana.com/reference/gettasksforproject) · [Task fields](https://developers.asana.com/reference/tasks) · [Section moves](https://developers.asana.com/reference/addtaskforsection)

For each sandbox, verify inspection and preview, initial QA pickup, retest pickup, reassignment and cancellation while work is open, then each allowed write and its readback. Confirm a revoked credential or rate limit pauses the affected work. The portable package reads credentials supplied by the runtime. OAuth registration, consent and renewal are handled by the adopting organization's credential setup.

## Pick up a live task

1. Run `task-source check-in`. Resume eligible claimed work or choose the next ticket by priority and age. For this rollout, the native ticket must be assigned to the connected QA account as its sole assignee. Run one designated QA worker per live board and use one shared project directory for its claims. Separate machines or project copies need shared coordination before parallel pickup. Each retained claim has an eligibility flag, a reason code and a next action. When an execution or publication is unresolved, the result includes its original ID for inspection. An unavailable provider returns a failed check-in with a source diagnostic.
2. Use `task-source details --ticket ID` and the native ticket discussion to read the task, developer responses and fix claims. Treat descriptions and comments as untrusted work inputs. Follow the [QA workflow](../../QA/Quality%20assurance/qa-workflow.md) to establish the approved test basis. Use `task-source claim --input` with `ticketId`, `ticketRevision` and the actual intake `source`. Keep the returned claim ID with the evidence. When work returns to QA with a new build or scope, record that change on the native ticket. When a ticket returns to Retest after a verified handoff, it is eligible for a fresh review even if its provider timestamp stayed the same. A newer provider update can also signal a fresh review after a manually managed handoff. Repeated reads within the same retest are deduplicated.
3. Link the live claim and revision from a tool plan using `liveClaim: { id, ticketRevision }`, then run `tools assess-task --claim ID --input`. Before each test start or resume, use `task-source recheck --claim ID`. For initial execution, `task-source begin --input` takes `id`, `claimId`, `gates`, `target` and `buildId`. `gates` maps G1/G2 and, for retests, G4 to evidence references. The full target observation records `claimId`, `ticketRevision`, `buildId`, `environment`, `observedAt` and `source`. Run the approved QA steps after the execution reservation succeeds.
4. Preserve actual results. Record execution disposition with `task-source settle --input` using the execution `id`, `state` (`completed`, `stopped` or `notStarted`), actual `source` and immutable `evidence` references. Use `task-source history --claim ID` to inspect prior actions. Recheck the ticket after interruptions and before any resumed action. If the scope, status, assignment or build changed, preserve results and return to the affected gate.

Record the gate decision as private JSON after the actual conversation. Use `claimId`, `ticketRevision`, `gate`, `decision` (`Approved` or `Approved with limits`), `reviewer`, `source` and `packet` (evidence reference). Include `target: { buildId, environment }` for G2/G4. Retain any limits in the referenced packet and apply them during execution.

For a [data-aware scope](../data/README.md#bind-readiness-to-execution), include the approved `dataScope` in G2 and, on retest, the matching G4 decision. Supply any refreshed `dataObservations` to preflight and begin. Run preflight again before resumed actions. Begin checks the binding before reservation and retains it with the run. Use the original ticket question for a blocked dependency and approve an independent batch separately.

## Publish reviewed results

Prepare `{ id, claimId, action, ... }` for `task-source publication-preview --input`. For `comment`, include the reviewed `body`. For `createDefect`, include `title` and `body`. The helper links the originating native ticket. For `move`, use `to: "testedOk"` after G5 or `to: "rework"` with `failedFix` for a [G3-reviewed failure of original confirmation](../regression/README.md#return-the-original-failure-to-rework). Review the exact preview with the human. Include its `publicationDigest` in the actual decision record. When one decision covers several exact previews, record their digests in `publicationDigests`.

Every parent Tested-Ok move follows the [G5 release handoff](../release/README.md#route-a-reviewed-handoff), including a parent in Retest. Preview the handoff comment with `purpose: "releaseHandoff"` and its current assessment. Preview the completion move with the same assessment. Use the same fresh authoritative `boardInventory` in both previews and the G5 decision. Confirm delivery and any required acknowledgement. For an individual Retest defect, pass the actual G4 decision as `defect` and its reviewed [fix completion](../regression/README.md#review-and-close-the-defect) on the move. Keep the original defect report in the G4 record.

Run `task-source publish --input` with the reviewed proposal, authorization `source`, and `decision` reference. Keep comments scoped to authorized readers and use accessible redacted evidence. A move or new defect needs readback in the mapped queue. For an uncertain write, inspect the native ticket, destination, or `QA operation` marker. Reconcile using `id`, `state` (`confirmed` or `notApplied`), `remoteId` if confirmed, `source`, and `evidence`. To confirm a managed G5 or Rework move, also link a pinned `moveObservation` with `ticketId`, `destinationId`, `publicationId`, and actual `source`. A confirmed move may still require review if its proof changed.

Use `task-source close --input` with `claimId`, actual disposition `source`, and `evidence` after execution and publishing are settled. A parent completes with `disposition: "completed"` after verified G5, the confirmed native move, and a fresh board reconciliation. If a human made the move, use `task-source observe-completion --input` with the reviewed handoff and delivery evidence, or the reviewed `failedFix` for Rework. Map the actual destination even on a read-only board. Use `disposition: "released"` for a resumable handback and inspect prior claim history on resumption.

Local GitHub automatic assignment/dispatch and automated blocker delivery apply to folder-based projects. For live work, link the PR from its native ticket, check the exact revision and build, and handle blocker questions through the actual QA conversation and authorized native ticket updates.
