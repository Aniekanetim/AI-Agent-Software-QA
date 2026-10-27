# Postman CLI for API work

Use Postman CLI when a QA ticket calls for collection-based API checks. Onboarding prepares access and verifies the tool; the ticket, context and human-reviewed scope still determine the tests and execution authorization.

## Reuse an existing installation

Follow [shared tool discovery](../tools/README.md) first. The resolver checks existing selections and available installations before the pinned Postman CLI 1.79.0 dependency. The bundle is restored with the normal framework command:

```shell
npm ci --ignore-scripts --cache .local/npm-cache
npm run qa -- postman check --source actual-capability-check-reference
```

The adapter invokes the package's native platform binary. Its postinstall hook is unnecessary and stays disabled; it must not edit global agent instructions. Installing the framework dependencies is separate from asking the adopting user to reinstall or reconnect an already working tool. An installation found in a personal terminal still needs verification through the selected harness.

Current supported binary packages cover Windows x64, Linux x64/arm64 and macOS x64/arm64. The package CI verifies Windows x64 and Linux x64. Other supported distributions/architectures require their own actual check. Unsupported platforms receive a readiness gap, not an invented successful installation.

## Choose local or cloud access

| Operation | Preparation |
| --- | --- |
| Local collection/environment/data files | No Postman account required. Run in an isolated local profile. |
| Postman Cloud collection or environment | Select the account/resources, verify identity and authorize cloud access/reporting. |
| Authentication to the API under test | Supply the project's authorized test credentials separately. Postman account login does not authenticate the target API. |

Local is the default if no Postman settings exist. Selecting API tools and Postman in [settings](../../Onboarding/settings.md) saves `.local/postman-settings.json`. Example cloud configuration, with actual project values substituted:

```json
{
  "schemaVersion": 1,
  "mode": "cloud",
  "reporting": "cloudAllowed",
  "region": "us",
  "credential": "session",
  "accountId": "selected-account-id",
  "collections": ["selected-collection-id"],
  "environments": ["selected-environment-id"],
  "source": "actual-account-resource-and-reporting-choice"
}
```

Local settings use mode `local`, reporting `localOnly`, and empty resource arrays. API keys belong in the harness/CI secret facility as `POSTMAN_API_KEY`, never these settings. The `credential` choice is session or environment. Session mode deliberately excludes an overriding environment key; environment mode requires a nonempty key. This avoids a stale environment key masquerading as an expired session. Region and actual resource access still need verification.

```shell
npm run qa -- postman check --source actual-access-check-reference
npm run qa -- postman login-instructions
```

The latter returns the selected executable and browser-login arguments only when needed. The agent guides the user through interactive login, then checks again. It never automatically registers accounts, creates guest workspaces or logs out an existing session. CI uses authorized secret references. Current identity verification uses `whoami --json`; an older CLI without this capability needs a documented compatible check before cloud execution. Unrecognized identity responses remain unverified. A Postman desktop/MCP connection does not establish CLI authentication.

Resource selection and identity are distinct: a collection run may still fail for insufficient collection/environment permissions. Preserve that as an execution/access error. Do not infer access to every selected resource merely from a valid account identity.

## Execute an authorized collection

Prepare the collection and its assertions against the agreed contract. Capture full-file evidence for each local collection, environment and data file after review, using `evidence --path`. Bind those hashes to the actual scoped execution authorization. Create the request privately:

```json
{
  "id": "API-RUN-001",
  "source": "QA-ticket-and-reviewed-test-design-reference",
  "authorizationReference": "actual-execution-approval-reference",
  "collection": {
    "kind": "file",
    "reference": "QA/api/approved.collection.json",
    "format": "v2.1"
  },
  "approvedInputs": [
    {
      "path": "QA/api/approved.collection.json",
      "sha256": "replace-with-actual-full-file-sha256"
    }
  ],
  "target": {
    "environment": "staging",
    "baseUrl": "https://staging.example.test",
    "build": "actual-build-identity-or-Unknown",
    "source": "actual-target-observation-reference"
  },
  "workingDirectory": ".",
  "timeoutMs": 60000
}
```

```shell
npm run qa -- postman run --input .local/api-run-request.json
```

Optional fields are `environment` (kind/reference), `dataFile` and `cloudReportingAuthorization`. Cloud resources must be selected in settings and need the latter actual authorization reference. A URL/build label alone does not prove the collection uses that target: review requests, scripts, variable resolution and test data before authorization, and retain separate served-build evidence. Collections execute code and requests; only execute reviewed inputs within the ticket's scope.

Changed local inputs invalidate their approved evidence. Each execution ID retains its original request, executable version, harness, target references, input evidence, exit code and assertion/request counts. Repeating a completed ID returns its stored historical result; it does not claim a new execution. An unfinished/uncertain ID blocks automatic repetition and requires investigation and explicit authorization for a new ID.

## Results and reporting

The adapter distinguishes passed assertions, failed assertions, execution errors and incomplete evidence. Zero exit status without a supported assertion summary is not a pass. JSON v2.1 HTTP collections support the structured result path. v3 YAML and other protocol/reporter combinations are not silently converted: if a structured summary is unavailable, the result stays incomplete and needs separately reviewed evidence/another supported adapter.

Local runs remove Postman credentials from the child environment, use a separate private home/profile and execute an unlinked v2.1 copy. They preserve the approved source and the user's session. The requested working directory preserves relative test-file resolution. Cloud runs require explicit reporting scope because results can upload automatically. Disabling API Catalog events does not by itself disable cloud run-result uploads.

Raw reports can contain secrets and request/response bodies. They are private temporary material under `.local/postman/work/`, deleted after normal completion; only nonsecret counts and execution metadata are retained. After a process interruption, inspect that ignored directory for residual temporary material before sharing evidence. Redact any additional manually retained evidence. No tool pattern checker guarantees complete secret detection.

## Verify the integration

```shell
npm run check
npm test
npm run test:postman
```

The last command starts a synthetic loopback API and confirms one passing collection and one intentional assertion failure. It requires no Postman account and does not execute product tests. Native CLI startup can be denied by the host/organization; retain the restriction and use an authorized runner without weakening policy.

Official references: [installation](https://learning.postman.com/docs/postman-cli/postman-cli-installation/), [authentication/configuration](https://learning.postman.com/docs/postman-cli/postman-cli-authenticate-and-configure/), [identity commands](https://learning.postman.com/docs/postman-cli/postman-cli-auth/), [collection commands and reporting](https://learning.postman.com/docs/postman-cli/postman-cli-collections/).
