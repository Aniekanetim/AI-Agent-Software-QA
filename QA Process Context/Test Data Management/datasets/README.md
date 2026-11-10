# Reusable datasets

Use [guided intake](../../../automation/data/intake.md) for reviewed registration of new sources. It writes a version 1 index per dataset revision so a previously reviewed run can keep using its original index and files. Run `npm run qa -- data intake-list` to find those registrations. The [manual index](index.json) remains available for existing and manually managed entries.

Place files approved for repository sharing in a subfolder named for their dataset ID. Keep files under `.local/test-data/` when authorized for local use only. Use approved restricted storage for sensitive data, and retain a nonsecret external reference.

Add the ID, revision, purpose, owner, permitted environments, classification and source to the [index](index.json). Use `classification: "synthetic"` or `"explicitlyPermitted"`. For files use `source: { kind: "shared", files: [{ path, sha256 }] }` and the full-file hash. For a private index under `.local/`, use `kind: "private"` for local-only files. For an external dataset use `source: { kind: "external", reference }` with the nonsecret storage reference. Keep earlier revisions when required for retests.

Run `npm run qa -- data inventory` for the shared index, or add `--input .local/dataset-index.json` for a private index. The inventory checks the listed file hashes without printing their contents. Select the applicable revision in the [task preparation record](../data-preparation-record.md) and check its permitted use and starting state before execution.
