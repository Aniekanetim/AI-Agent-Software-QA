# Slack access

Use `catalog-jobs --connection <id>` to find retained unfinished inventories after an interrupted/failed native import. Validation errors expose current progress without accepting bad evidence or releasing another request's reservation. Repair and import only the pending page. Read-only inspection does not advance coverage. See [company context](../company-context/README.md#no-change-dispositions-and-execution-provenance) for disposition boundaries and pinned execution evidence.

Catalog imports accept previous evidence so a native reader can resume with only the next actual page. API/native readers share durable cursor history and completed-read eligibility. Before execution/G5/action preparation, reserve the actual company-source boundary and obtain its request-bound reads; an earlier capture is not a new operation. No terminal adapter can manufacture access to the host integration.

Use [company context](../company-context/README.md) to select company/project channels, retain source versions and use learned information through the existing QA gates.

First inspect the actual harness integration directory and connected-account metadata. Reuse an adequate Slack connection. Installation, authentication, workspace access, channel visibility and actual history/thread/directory operations are separate facts. The adapter never assumes unrestricted private-channel or direct-message access. [Slack history access](https://docs.slack.dev/reference/methods/conversations.history/#usage-info)

## Native harness connection

The host agent performs actual native Slack calls. `HostSlackAdapter` accepts callbacks to those operations. It does not launch a fictitious connector or use a browser to bypass the selected connection.

`company-context discover --input ...` registers the observed identity, host reference, capabilities and actual inspection evidence for the current harness. For captured operations, `import-host-catalog` and `import-host-page` verify exact workspace/principal/request metadata and an output digest before normalization. Use `hostPageDigest` on the normalized page and retain its real tool-call evidence. Both the call and page belong in private records. A digest establishes consistent retained bytes, not proof that a human or Slack approved an interpretation.

For a refresh, inspect `company-context job --job ...`, perform the next pending history/thread/directory request through the actual native tool and retain its parameters, source and normalized response. Import one page using `import-host-page`. Do not claim a search-only connector supplied complete channel history. Where native capabilities are insufficient, report the exact gap and offer an adequate authorized API route.

## Direct API connection

Use the adopting company's authorized Slack app/token or existing secure connection. This package does not run a hosted OAuth service or issue a company token. Keep the token in a selected `QA_SLACK_...` environment variable, outside committed files and command arguments.

```shell
npm run qa -- company-context inspect --input .local/slack-api-inspection.json
npm run qa -- company-context channels --connection <actual-id> --source <actual-inspection-reference>
```

The inspection input contains only `id`, `credentialVariable` and `source`. The actual token is resolved at runtime. `auth.test` verifies identity. Supported reads use `conversations.list`, `conversations.info`, `conversations.history`, `conversations.replies` and `users.list`. A 200 response containing `ok: false` is an operation error. HTTP 429 retains `Retry-After`; errors suppress credentials/provider bodies. [Rate limits](https://docs.slack.dev/apis/web-api/rate-limits/)

The [manifest example](examples/slack-app-manifest.example.json) shows read scopes for a bot-based connection. Choose scopes appropriate to the actual installation, then verify each operation. Listing a channel does not prove its history or threads are readable. Private sources may need membership or different authorized access. Directory reading does not guarantee email fields or decision-owner authority. [Thread access](https://docs.slack.dev/reference/methods/conversations.replies/) · [Member listing](https://docs.slack.dev/reference/methods/users.list/)

## Channel selection and membership

Prepare the real catalog and use [the selection shape](examples/selection.example.json). Replace every evidence reference with the actual generated reference; examples are unconfigured templates.

Joining is an optional separate capability. A real membership authorization identifies `action: join`, workspace, acting user, channel and original source. Add the applicable membership scope only when needed. `company-context join` journals the attempt and verifies membership. A timeout requires readback using the original operation before another attempt. Private-channel invitations follow Slack's actual supported procedure. Channel selection never authorizes message posting.

Use the [basis example](examples/source-binding.example.json) to relate decisions to actual reviewed criteria. Refer to the public `types.ts` interfaces and company-context guide for exact records. No example establishes a live source, decision or approval.

## Limits

The first release supplies native/API reads, bounded historical/thread refresh, source versions and current-use guards. A continuously running HTTP/Socket Mode receiver is not activated. Future event support must authenticate deliveries, persist before acknowledgement, deduplicate events and reconcile gaps through the same source store. [Slack Events API](https://docs.slack.dev/apis/events-api/)
