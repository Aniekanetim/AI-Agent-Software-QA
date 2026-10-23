# Environments and builds

**Maintenance:** Human environment/technical owner. Agents record access/setup observations and actual runtime identities in their request, discovery context or shared progress, and propose canonical updates to this owner.

**Owner:** not assigned. **State:** setup template; no target configured. **Updated:** not supplied.

## Project and QA locations

| Field | Actual value |
| --- | --- |
| QA root on this machine | Not configured |
| Application repository / checkout | Not configured |
| Hosted-only access | A URL and authorized access can suffice for discovery; application checkout/start commands are not required for an already hosted target |
| Application source revision / branch | Not supplied |
| Human QA reviewer / developer role | Not assigned |
| Timezone for project records/scheduling | Not supplied |
| Required runtimes, versions and tools | Not supplied |
| Dependency install / build / start commands and working directories | Not supplied |
| Test execution command and working directory | Not supplied |

## Targets and identity

| Target / build | Normal browser URL | API base URL | Served build identity and verification method | Data store / override |
| --- | --- | --- | --- | --- |

Record actual targets. A before/after investigation may use separate faulty and corrected builds or a known failing release and its corrected revision. It does not require manufacturing a buggy build for every project. Preserve independent data and evidence; use the same applicable expectations unless a requirement change is explicit.

## Data, access and execution limits

Record required accounts/roles and where authorized credentials are obtained without storing secrets here. Specify synthetic/sanitized data, isolation, setup, any approved fault control, reset/cleanup scope and evidence to preserve first. Confirm configured storage paths instead of assuming defaults.

Record authorized environments/actions, external dependencies, resource limits and stop conditions. Install or reconnect the selected test tools on each machine. Copying documentation does not install browsers, restore databases or establish connector access.

## Recheck after transfer

Update machine paths and verify source/design versions, served target identity, data and tool readiness. Preserve historical outcomes. Reuse an existing approval only if its scope, criteria and target still apply; obtain a revised decision for a material change. Follow [portability instructions](../../docs/portability.md).
