# Bring project data into QA

Give the agent the source file or canonical storage reference and explain which check needs the data. The agent looks for an applicable revision using `data inventory` for manually indexed datasets and `data intake-list` for guided registrations. Reuse the exact reviewed revision when it still serves the check. During onboarding, record any data already available and defer intake until a task needs it if the project is still setting up.

## Inspect the source

For an authorized local file, run one of these commands. Inspection summarizes record counts, one-based field positions, repeated values by field, and issue locations. The report contains counts and source line numbers. Read the relevant labels and values in the authorized source separately when proposing a mapping or investigating questionable records.

```shell
npm run qa -- data intake-inspect --file "path/to/rows.csv"
npm run qa -- data intake-inspect --file "path/to/source.md" --format markdown-table --table 1
npm run qa -- data intake-inspect --file "path/to/source.md" --format markdown-profiles --from-line 10 --through-line 50
```

CSV uses a header and comma delimiters, with support for quoted commas, line breaks, doubled quotes, and UTF-8 with or without a BOM. Markdown table mode recognizes pipe tables with outer pipes and a delimiter row. Profile mode uses headings followed by lines such as <code>- &#96;field_name&#96;: value</code>. Choose the intended line range when a document mixes profiles with research notes or other records. Fenced code is skipped. A source can be up to 4 MiB. For an unsupported format or larger file, retain the canonical reference or use an approved derived file.

Review reported issues in context. A repeated name may belong to multiple records, and an identifier-shaped value may be valid for the field. Compare source labels and values with the project's accepted data rules before recommending corrections, exclusions, or use as a deliberately invalid fixture. Keep positive fixtures and deliberate invalid or boundary cases in clearly identified datasets.

## Preview the proposed dataset

The agent prepares a request under `.local/` with the dataset ID, revision, purpose, owner, classification, allowed environments, and a nonsecret canonical reference. Reuse permissions already granted for the relevant source and use. Ask the responsible owner about unresolved access, sharing, or data rules for the affected check.

| Mode | Result |
| --- | --- |
| Reference (default) | A versioned catalog entry pointing to the canonical source. Use this for external or restricted storage. An optional local source adds an inspection hash to the receipt. |
| Copy | An approved private byte-for-byte copy of the selected local source. Use when local repeatability requires retaining the original bytes. |
| Curate | A derived JSON array with the chosen source fields mapped to explicit output names. The preview records the source lines retained and any excluded lines and reasons. |

Visibility defaults to private. Shared registration requires review for repository sharing, including the reference, fixture content, and receipt metadata. Classify generated inputs as `synthetic` and supplied inputs permitted for this use as `explicitlyPermitted`. Keep credentials in their approved storage.

Example request for a synthetic two-column source. Field positions follow the CSV header, selected table, or order in which labels first appear in the selected profile section. A row with missing required values or inconsistent width needs correction or an explicit exclusion. Curated values remain strings, including numbers and JSON found in a source cell. Any project-specific conversion or enrichment belongs in a separately reviewed preparation step.

```json
{
  "dataset": {
    "id": "sample-profiles",
    "revision": "1",
    "purpose": "Profile input fixtures",
    "owner": "QA dataset owner",
    "environments": ["staging"],
    "classification": "synthetic"
  },
  "reference": "approved-fixture-storage/sample-profiles/revision-1",
  "mode": "curate",
  "visibility": "private",
  "source": { "file": "path/to/profiles.csv" },
  "fields": [
    { "from": 1, "to": "name", "required": true },
    { "from": 2, "to": "handle" }
  ],
  "exclude": [{ "line": 8, "reason": "Blank name reserved for a separate negative fixture." }]
}
```

```shell
npm run qa -- data intake-preview --input .local/intake-request.json
```

Brief the reviewer on the use, exact selection, destination, permitted environments, exclusions and open questions. For shared files, review the exact proposed values in an authorized context. Use the digest printed by the reviewed preview and a reference to the actual review decision. Registering records the supplied decision and checks that the source and plan still match it.

```shell
npm run qa -- data intake-register --input .local/intake-request.json --preview-sha256 <preview-digest> --review-source <actual-decision-reference>
npm run qa -- data intake-list
```

Each registration has a version 1 index, receipt, and any approved artifact under its dataset ID and revision. Private registrations live under `.local/test-data/registrations/`. Shared registrations live under `QA Process Context/Test Data Management/datasets/`. An identical retry returns the existing registration. For changed contents, preview and review a new revision. Preserve earlier revision directories and any manually maintained indexes used by existing approvals.

## Use the registered revision

Copy the returned index evidence, ID, and revision into the [data preparation record](../../QA%20Process%20Context/Test%20Data%20Management/data-preparation-record.md). Add the actual input and its preparation evidence. A reference-only entry still needs evidence of the authorized input the agent prepared. For application records, establish the required role or state separately. Use the existing [readiness procedure](README.md#bind-readiness-to-execution) to connect the selected checks and data to the reviewed execution scope. If intake remains unresolved, record the dependency against the affected checks and continue separately approved work.
