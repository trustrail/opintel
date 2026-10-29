# Console-next Pools review

Implementation: `src/console-next/pools`, in the existing parallel package `@opintel/console-next`. Open `/?project=PROJECT&screen=pools`; `pool=POOL` selects a pool and `tab=credentials` or `tab=agents` selects its workbench. Home now links to this Pools screen. Run `npm run console:dev` and use the same hostname as the signed-in current console (for example, `http://localhost:5174`) so its session cookie is shared across ports. The current console and master stylesheet are unchanged. No backend changes or migrations.

## Real data and commands

| Surface | Contract |
| --- | --- |
| Picker and All pools | `GET /api/v1/projects/:id/pools`, every cursor page |
| Pool credentials and key metadata | `GET /api/v1/pools/:id?projectId=…` |
| Access | `GET /api/v1/pools/:id/tables?projectId=…`, every page |
| Treatments and report rings | `GET /api/v1/pools/:id/entitlement-members?projectId=…&mode=name&decision=all`, every page; absent treatment is undecided |
| Agents & people | `GET /api/v1/pools/:id/agents?projectId=…`, every page, all recorded states |
| Row rule text | Administrator-only `GET /api/v1/pools/:id/row-entitlements?projectId=…&status=all`; other roles retain permitted status information without calling it |
| Set rows | `PUT /api/v1/pools/:id/tables/:objectId/rows` with project and typed `rowRule` |
| Create tables across sources | Project `GET /catalog`, followed by `parent=objects:SOURCE`, all pages; source labels are the catalogue's exposed aliases |
| Create pool | `POST /api/v1/projects/:id/pools`, idempotency key, `tableSetup: {tables,rowRule,startingMode}`, explicit budgets |
| Grant access | `POST /api/v1/pools/:id/credentials`, labelled key and idempotency key |
| Rotate | `POST /api/v1/pools/:id/keys/rotate`, credential ID, idempotency key, explicit confirmation |
| Revoke | `POST /api/v1/pools/:id/credentials/revoke`, typed label confirmation and, when required, explicit live-grant count confirmation |
| Navigation attention | Project needs-you, all pages; column/row decisions mark Pools and Data, settings/checks mark Settings |

Connected now is derived per pool from the backend's fresh `connecting`, `active` and `idle` presence states. `stale` and `disconnected` are excluded. It does **not** use `PoolSummary.agents` or `activeAgents`. Reads refresh every 15 seconds. All pools sums these per-pool presences; a self-declared agent name in two pools is not deduplicated into an authenticated identity.

Column rings count each column treatment once in each pool. The decided ring counts non-null treatments, including withheld; the row ring uses the table binding's `needsRows` flag. Waiting combines undecided columns and tables needing their own row decision. Report numbers open their matching treatment list, row-status list, credentials or fresh-agent filter. The All pools waiting/connected numbers filter pool rows. A column in two pools counts twice, explicitly stated in the band.

Creation requires **Threads per query**, suggested 1, plus a confirmation checkbox. **Queries at once** (`concurrency`) lives under More limits alongside `rowsPerRequest`, `timeoutMs` and `memoryMb`. Empty fields display “project limit” and are omitted from the request. `rowsPerDay` is absent. The common rule supports typed text/number/boolean/null comparisons or an explicit All rows decision. Incompatible tables stay closed according to the backend contract. Starting with nothing or copying compatible decisions uses the existing backend modes; rows and credentials are never copied.

Credential/creation refreshes finish before the one-time key dialog opens, so an earlier completion cannot dismiss the next action. New keys are shown once in transient component state and never returned into the TanStack mutation/query cache. Rotate/revoke stay in row menus behind confirmation. Revoked credentials remain visible with status; the report band includes active credentials only. There are no sample federated grants, verified-person claims, By person switch or person columns. The agents list explains that people appear with identity federation.

## Foundations and review differences

Shared Home navigation, kind icons and hover names, seven treatment marks, Radix primitives and visx Ring are reused. All pools' strip chart also uses visx. Tokens stay in the single tokens file, including the readable report-band palette. Visible keyboard focus, disabled states, fixed list rows, phone touch targets and loading/empty/error states are retained. There is no independent chart animation; reduced motion is respected.

Differences from images 04–09:

- Fixture data is real: Warehouse/warehouse, records and field names, Query pool/Bulk pool, one real observed agent and an issued key. Its names, counts, treatments, rows and dates differ from the illustrative Cedant examples; no samples are injected to fill out rows or charts.
- The public catalogue/table contracts do not expose table versus view kind. Existing needs-you context supplies the real kind where available, including view icons. When that metadata is absent the kind icon is omitted, never guessed as table. Complete kind coverage needs that read contract extended in a later backend scope.
- Catalogue source labels in the create chooser are exposed aliases. Access has full source names where the permitted row projection supplies them; those labels are omitted when unavailable. Table counts are labelled as bound tables to distinguish legacy source-wide pools.
- Row entry expands inline, with a typed value selector and an explicit All rows checkbox. The column is entered by name rather than the image's column dropdown. Existing effective rule words come from the administrator-only projection; restricted roles see the permitted row-status badge.
- The create limit uses a native positive-integer input and an explicit confirmation checkbox rather than the pictured stepper. Threads replaces the image's required concurrency label as requested; optional concurrency appears once, and no unenforced daily limit appears.
- The report's decided-column ring measures columns, rather than the example's fraction of fully decided tables. Names beneath example rings are omitted because the rings describe the complete selected pool. Zeroes are real measured zeroes.
- Credential labels and statuses replace sample issued-for chips. Key-based access and self-claimed agent names are distinguished; no federated row or person placeholder is rendered. Seen/use ages are derived from actual timestamps with absolute time on hover where applicable.
- Phone tabs retain “Who can get in” and “Agents & people” instead of shortening them to “Who gets in” and “People”. Phone treatment links use a horizontally scrollable strip of 44 px targets rather than the image’s tightly packed marks. The pool picker includes a theme action, and the primary icon uses the credential/pool kind instead of a plus. Phone buttons remain at least 44 px; the primary icon button has an explicit accessible name.
- Spacing, type and radii follow the approved Home token scale rather than the images' individual pixel sizes. The phone report is inset 16 px; bottom navigation follows the shared Home foundation. Dark versions use that foundation; no separate approved dark Pools image exists.
- Legacy source-wide pools have no explicit rows in the table-binding endpoint. Access reports that absence rather than inventing bindings; their real column treatments still contribute to the band and All pools.

## Validation and captures

- `npm run typecheck`: passed, strict repository typecheck.
- `npm run lint`: passed, including tokens and dependency boundaries.
- `npm run console:test`: 31 tests passed in three files, including existing Home/foundations and new Pools tests.
- Manual real-API browser review: all five views captured at both widths/themes; row rule, credential issue/rotate/revoke and creation verified. Zero page errors and zero failed API responses. The final capture evidence lists the actual calls.
- No backend code changed; no migration or backend contract changes. The manual review exercises the existing backend implementations. No full gate or merge was run.

The regression tests include complete pagination, rejecting stale presence as connected, ignoring misleading summary counts, explicit thread input, optional-limit omission, viewer permission boundaries, column/row filters, the active-credential filter, typed row submission, progress labels, and delayed mutation completion without leaking a key into the cache or closing a subsequent dialog.

The capture harness uses isolated PostgreSQL, real Engine requests, SpiceDB authorization and the actual API route implementations. Only authentication is supplied by the fixture. It binds the review table through the public table API. It also exercises row submission, credential issue/confirmed rotate/confirmed revoke and table-scoped creation with confirmed threads and optional concurrency. No browser responses are mocked.

| View | 1440 light | 1440 dark | 390 light | 390 dark |
| --- | --- | --- | --- | --- |
| Access | [1440 light](pools-screenshots/pools-access-1440-light.png) | [1440 dark](pools-screenshots/pools-access-1440-dark.png) | [390 light](pools-screenshots/pools-access-390-light.png) | [390 dark](pools-screenshots/pools-access-390-dark.png) |
| Who can get in | [1440 light](pools-screenshots/pools-credentials-1440-light.png) | [1440 dark](pools-screenshots/pools-credentials-1440-dark.png) | [390 light](pools-screenshots/pools-credentials-390-light.png) | [390 dark](pools-screenshots/pools-credentials-390-dark.png) |
| Agents & people | [1440 light](pools-screenshots/pools-agents-1440-light.png) | [1440 dark](pools-screenshots/pools-agents-1440-dark.png) | [390 light](pools-screenshots/pools-agents-390-light.png) | [390 dark](pools-screenshots/pools-agents-390-dark.png) |
| All pools | [1440 light](pools-screenshots/pools-all-1440-light.png) | [1440 dark](pools-screenshots/pools-all-1440-dark.png) | [390 light](pools-screenshots/pools-all-390-light.png) | [390 dark](pools-screenshots/pools-all-390-dark.png) |
| Create pool | [1440 light](pools-screenshots/pools-create-1440-light.png) | [1440 dark](pools-screenshots/pools-create-1440-dark.png) | [390 light](pools-screenshots/pools-create-390-light.png) | [390 dark](pools-screenshots/pools-create-390-dark.png) |
| More limits (detail) | [1440 light](pools-screenshots/pools-create-limits-1440-light.png) | [1440 dark](pools-screenshots/pools-create-limits-1440-dark.png) | [390 light](pools-screenshots/pools-create-limits-390-light.png) | [390 dark](pools-screenshots/pools-create-limits-390-dark.png) |

Four additional `pools-create-limits-WIDTH-THEME.png` captures show the lower dialog section. [Capture evidence](pools-screenshots/capture.json) records API responses, viewport files and verified writes. These are manual review captures, not retired historical pixel baselines.
