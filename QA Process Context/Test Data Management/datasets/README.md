# Reusable datasets

Place files approved for repository sharing in a subfolder named for their dataset ID. Keep files under `.local/test-data/` when authorized for local use only. Use approved restricted storage for sensitive data, and retain a nonsecret external reference.

Add the ID, revision, purpose, owner, permitted environments, classification and source to the [index](index.json). Use a full-file evidence reference for each file. If a dataset has a private file, keep its index in `.local/`. An external source stays with its owner.

Run `npm run qa -- data inventory` for the shared index, or add `--input .local/dataset-index.json` for a private index. The inventory checks the listed file hashes without printing their contents. Select the applicable revision in the [task preparation record](../data-preparation-record.md) and check its permitted use and starting state before execution.
