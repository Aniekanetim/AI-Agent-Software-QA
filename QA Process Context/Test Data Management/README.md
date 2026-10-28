# Test data management

Plan data for the conditions being tested, including valid inputs, invalid inputs, boundaries, roles, lifecycle states and relevant combinations. Use synthetic or explicitly permitted data. A prepared account or fixture is not proof of its actual application state.

**Template — no dataset, account or cleanup action is authorized.** Apply [the common ownership rules](../README.md) and link this plan from the assignment.

| Field | Actual value |
| --- | --- |
| Data-plan ID / revision / state / owner / maintainer | Not supplied / Draft |
| Assignment / condition IDs / environment and build | Not supplied |
| Dataset or account reference / required starting state | Not supplied |
| Source and permitted classification / access roles | Not supplied |
| Preparation procedure / actual state verification | Not supplied; keep preparation and observation separate |
| Isolation / concurrency / repeatability controls | Not supplied |
| Reset, reuse and cleanup scope / retention / responsible owner | Not supplied; deletion is not implied |
| Evidence and secret-redaction rules | Not supplied |
| Actual review reference / unresolved questions | Pending |

Keep shared plans nonsecret. Private account bindings and credentials use the existing secure/ignored mechanisms. Apply the [global mailbox policy](../../automation/email/mailbox-policy.md): a fresh identity uses a supported purpose/run alias, continuation/retests reuse the original alias, and verification correlates exact recipient, purpose/sender and trigger time. Link the actual private account reference without copying passwords, OTPs or reusable links here.

Record generated-data rules or seeds when reproducibility requires them. Confirm the required state before execution and preserve failed-run data/evidence when authorized. A reset must not silently erase a finding or another worker's data. Data changes reopen only affected preparation; new retention, access or cleanup limits require the responsible owner's decision.
