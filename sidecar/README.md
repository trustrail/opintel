# Postgres connector hosting

S1 supplies the runnable HTTPS host in `start.ts` and `http/server.ts`, validated
file configuration, pinned mTLS, the five wire endpoints, a durable local sampling
audit sink, disconnect cancellation, and graceful shutdown. Item 3.4 supplies its
connector logic. See [START-HERE.md](../START-HERE.md#local-sidecar-s1) for local
startup and application client configuration. Application code contacts this
runtime through `SidecarSourceConnector`; it never imports the Postgres adapter.

Use `createPostgresConnector({ vault, audit, limits })` once per host. Supply the
existing `VaultPort`: `DevelopmentVaultAdapter` in development, or a production
secret manager adapter. For example, `vault://customer/warehouse` resolves from
`OPINTEL_SECRET_CUSTOMER_WAREHOUSE` in the sidecar's development environment.
Provision credentials in that environment or secret manager; the application
receives only the reference. This wiring never calls `store`, persists a resolved
credential, or caches one between operations. A missing reference refuses with
`dependency_unavailable` and a credential-safe message.

The factory constructs one `PostgresSourceScope` with the vault's read capability
and explicit `maxConnectionsPerSource`, `statementTimeoutMs`, and
`operationTimeoutMs` limits. Share the connector across requests so calls for
the same project/source share a connection ceiling. Excess calls are refused
with `budget_exceeded`; connections are never pooled or left open after a call.
The scope owns a repeatable-read, read-only transaction and closes the source
connection on success, error, or cancellation. The application metadata scopes
remain separate and unchanged.

Supply a `SamplingAuditPort` that persists identifier-only events.
The connector consumes the §2.7 request envelopes, with
Zod validation, and returns `Result` values. The host maps `forbidden` to HTTP
403; successful values have the declared wire response shape. The HTTP host serves `/health` without source contact and reports contract 1. Resolve vault references only
inside this runtime. Do not log raw driver exceptions or resolved credentials.

Sampling records `started` before source contact and `completed` or `failed`
afterward. Missing consent records `refused`. An unavailable audit sink refuses
the call; an unavailable completion sink prevents returning values. Audit events
contain correlation, project, source and element identifiers, consent, and
outcome, never values or credentials. Frequencies count non-null textual values,
ordered by frequency descending, with C-collated text breaking ties. Schema,
object and column names are quoted separately; values are parameters.

Introspection reads system catalogues only. It preserves `attnum` as stableRef
and ordinal, omits dropped/inaccessible columns, and includes primary, unique
and foreign-key membership in isKey. Foreign-key object addresses use PostgreSQL
quoted qualified identifiers. It includes tables, partitions, foreign tables,
views and materialized views readable by the credential. Estimates come from
catalogue statistics; an unanalyzed table or ordinary view returns null, while
a missing/inaccessible object returns an error. Neither introspection nor
estimation executes a view or reads table values.

The integration tests provision and remove an isolated source schema and login
inside test Postgres. G-003–G-005 combine real snapshots with the existing pure
catalogue aggregate. Persisting the diff belongs to 3.6; testing preservation
against actual entitlement rows belongs to 4.1.

The S1 host passes an `AbortSignal` to every connector method and aborts it when
its HTTP request is aborted or the response connection closes before completion.
There is no cancellation endpoint. An abort cancels the operation's Postgres
backend using `pg_cancel_backend` through a short-lived, bounded control connection
with the same credential, then closes both connections. The query-connection
ceiling remains per source; cancellation uses a separate control connection so a
full query ceiling cannot prevent releasing those queries. If cancellation cannot
reach Postgres, closing the query connection and its statement timeout remain the
fallback. These controls do not govern DuckDB sessions (S3).

## Landing watch and identify (3.7)

Add optional `landingZones` to the service JSON. Each entry has `projectId`,
`sourceId`, `directory`, `rulesFile`, `stateFile`, and optional `pollMs` (default
1000). Paths resolve relative to the service configuration. The input directory
must exist; keep the state and rule files outside it, on the customer's disk.
Provision one watcher per source. No HTTP endpoint or customer file upload is
involved. Restart the sidecar after changing its zone configuration.

Provision `rulesFile` as the JSON metadata snapshot returned by the application's
`readIdentificationRules({projectId, userId})`, using its normal tenant scope.
The snapshot contains `filingParties` and `rules` with camelCase fields corresponding to
§4.3b. It is read again on every scan so deployment rule changes need no release.
Write rule snapshots using atomic replacement. This is deployment configuration,
not an automatic metadata synchronization protocol.

`filename_regex` is a Unicode JavaScript regular expression against the basename,
with the declared named `periodGroup` capture. `folder` matches the exact relative
parent directory, using `/` separators (`""` means the root). Only active rules
for active filing parties in the configured project participate. Priority never breaks
a tie. Zero matches, multiple matches, an invalid regex, or a missing period/kind
quarantine with a reason; conflicts record all matching rule IDs. A folder rule
alone cannot supply a named period capture and therefore cannot produce a ready
filing. No period is inferred from a filename when its rule did not declare one.
Numeric `YYYY-M`, `YYYY-MM`, and slash-separated equivalents normalize to
`YYYY-MM`; other period labels stay verbatim. No host date parsing is used.

Deliver files by atomic rename into the zone after the producer closes them.
The watcher also waits for unchanged metadata across two scans and checks it
again after hashing. It never parses spreadsheets: bytes stream solely through
SHA-256. Symlinks are not followed. Original files remain in place, including
quarantined files. Do not mutate a delivered file while a downstream processor
is using it.

On a genuine first run, an empty landing zone initializes durable state with its
project/source identity and an empty filing list before accepting arrivals. If
state is missing while files exist anywhere in the zone, startup refuses with an
explicit missing-history message. An operator must restore the state or confirm
a genuine first run, set the files aside, initialize the empty zone, and then
redeliver them. Startup does not decide that existing files are new.

Local state is atomically replaced and synced before a filing becomes visible.
`ready` records are the durable handoff for 3.8, **not landed tables**. A ready
filing carries its filing party, period, kind and matching rule ID. `supersedes` points
to the preceding ready filing for the same source/filing party/period/kind; distinct
bytes produce a restatement. SHA-256 duplicates within the source carry
`duplicateOf` and are not ready. Quarantined registrations never enter the ready
handoff and carry no attributed filing party. Retries/restarts retain registration and
duplicate history. Rule edits do not silently release quarantined registrations;
resolution and the user-facing register belong to 3.10.

State has an exclusive `.lock` containing the owning PID. SIGTERM stops the batch
between durable operations, drains current work, flushes audit and exits. The
process-wide `shutdownTimeoutMs` bounds all cleanup, including outbound receipt
I/O. Expiry exits nonzero and leaves unfinished locks for operator recovery.
After a crash or shutdown expiry, verify that PID is no longer running before
removing the stale lock and restarting. Keep a source bound to the same state
file: changing it discards its duplicate/restatement history. Watcher failures
log a fixed warning without paths, file contents, or captured labels.

## Extraction (3.8)

The runnable sidecar inspects each ready filing and records its extraction summary
on that same arrival: selected sheet name/index, header row, row count, and ordered
columns with their original headers, stable output names and inferred types.
Arrivals are committed before extraction opens the workbook. Existing ready
filings without a summary resume on the next scan with the same filing ID. A failed file
becomes quarantined with a reason; its siblings continue. Nothing is landed yet.

Re-export the tenant rule snapshot after migration 018. Filing parties must declare
`decimalSeparator` (`.` or `,`) and `dateFormat` (`DD/MM/YYYY`, `MM/DD/YYYY`, or
`YYYY-MM-DD`). Neither has a default. Rules declare exactly one of `sheet` (exact
name) or `sheetIndex` (one-based), plus `headerRow` (one-based; the database default
is 1). Old snapshots lacking these declarations refuse extraction rather than
infer a locale or sheet. Migration 018 adds these columns nullable so existing rows survive unchanged.
Extraction refuses incomplete declarations during the backfill window. Follow
[the backfill procedure](../docs/review/extraction-backfill.md); NOT NULL and
exactly-one-sheet enforcement must ship in a later migration only after that
backfill has been verified. No enforcement migration is queued automatically.

CSV is UTF-8, comma-delimited with quoted fields, with optional UTF-8 BOM. Declare
`sheetIndex: 1` for its single logical sheet. Commas inside European numbers must
be quoted. XLSX uses the declared exact sheet or index. `.xls` and other formats
quarantine. CSV delimiters, worksheet selection and dates are never autodetected.

Numeric text uses the declared decimal separator and validates any grouping with
the other separator in groups of three. Canonical numeric output remains a
string for lossless Postgres NUMERIC input; it is never rounded through a JS
number. Text that does not match the declaration remains text. Date strings must
match the declared format and a valid calendar date. Native XLSX numeric cells
use the workbook's numeric representation, and date cells respect its 1900/1904
calendar. Excel's fictitious 1900-02-29 refuses. Date-times remain text without an
invented timezone. No machine locale or timezone controls parsing.

Data ends at the first fully empty row, including a missing XLSX row. Trailing
notes after it are excluded. Merged data cells repeat their anchor value across
the range; a merge intersecting the header quarantines. Formula cells use only
their cached result; missing caches and spreadsheet error cells quarantine.
Missing headers become `column_N`; duplicates receive `_2`, `_3`, etc., reserving
literal headers so a generated name cannot displace one.

Optional `verifyColumn` and `verifyValue` must be supplied together. The original
header must identify exactly one column, and every data row must match the
expected raw value. A mismatch records the filename attribution and conflicting
content in the customer-local quarantine reason. Logs contain identifiers and a
fixed refusal code only. Content never creates an attribution or releases a
quarantine from 3.7.

`SpreadsheetExtractor.inspect()` provides a typed summary. Its `rows()` iterator
first infers all column types, then re-reads rows with those final types; any mixed
column is TEXT and retains original textual values. It yields Result values and
never writes a landing table. Item 3.9 must consume the iterator transactionally,
rolling back if a later read fails. The file's SHA-256 is checked before and after reads.

Both readers stream rows. XLSX shared strings use an indexed temporary directory
on the sidecar's local filesystem, cleaned up when the reader closes; values do
not leave the customer's environment. Memory is bounded by row and metadata
limits, not row count. A row/shared string or CSV record exceeding 1 MiB refuses;
Expanded rows have the same limit, and active merged values have an 8 MiB limit.
XLSX limits also cap columns at 16,384, styles at 65,536, and merged ranges/workbook
parts at 100,000. Files beyond these limits fail individually. Extraction does
not evaluate formulas, resolve external workbook links, or contact a database.

### Landing into customer Postgres (3.9)

The sidecar now consumes extraction rows transactionally. It still sends no file
or row values to the application. Provision the source's `receives_landings=true`
and explicitly choose `landing_strategy` through the tenant scope. Existing
ordinary Postgres sources retain `receives_landings=false` and no strategy.
Migration 019 adds these settings and the optional per-rule
`period_as_at_format`; it backfills neither a strategy nor a period convention.

Add the following to the service configuration (IDs/paths are illustrative):

```json
{
  "receiptUrl": "https://localhost:3101",
  "landingZones": [{
    "projectId": "11111111-1111-4111-8111-111111111111",
    "sourceId": "22222222-2222-4222-8222-222222222222",
    "directory": "/customer/incoming",
    "stateFile": "/customer/state/arrivals.json",
    "rulesFile": "/customer/config/rules.json",
    "landing": {
      "name": "Bordereaux",
      "credentialRef": "vault://customer/landing-postgres",
      "strategy": "append_as_at"
    }
  }]
}
```

The rule snapshot accepts `periodAsAtFormat`: `month_end`, `month_start`,
`quarter_end`, `exact_date`, or null. Null retains the period label with a null
as-at date. Declared formats parse strictly; invalid labels quarantine. Receipt
date is never substituted. Raw headers remain quoted PostgreSQL column names;
empty/duplicate headers use extraction's established names. A header using the
reserved `_opintel_` prefix, containing NUL, or exceeding PostgreSQL's 63-byte
identifier limit refuses rather than silently truncating or overwriting it.

Resolve the Vault reference to a customer-managed Postgres credential permitted
to create schemas/tables and insert/alter landing tables. The existing source
connector remains read-only; the landing writer uses a separate write scope.
Each filing commits all its DDL, rows, column-type history, and commit receipt in
one transaction. Writes are serialized to prevent namespace/schema races and
bounded by the configured statement timeout. A late extraction failure rolls
back the whole filing. Database outages retain the ready filing for retry.

Schemas use the normalized source name, with collision suffixes. Assignment is
persisted once in customer-local `_opintel_landing.sources`; changing a display
name does not rename existing tables. Within it, append tables are named from
`{party_code}_{kind}`. `table_per_filing` uses the assigned base (up to 30
characters), underscore and the filing UUID without hyphens. Customer-local
commit metadata retains each receipt and its `supersedes` link, including empty
filings. All rows carry the five `_opintel_` provenance columns specified in
§4.3b. Added columns are nullable; type changes quarantine with the establishing
filing ID. Neither strategy updates or deletes prior landed rows.

The first committed filing fixes the strategy in the customer database. Restart,
configuration changes, and an unavailable application cannot bypass it. The
commit receipt makes replay idempotent if a crash occurs before local arrival
state is saved. This is commit recovery metadata, not a replacement arrival
register; item 3.10 must reconcile it with the existing arrival history.

### Receiving landing receipts

`npm run dev:api` starts a separate pinned-mTLS listener on `127.0.0.1:3101` when
`tmp/sidecar/client.json` exists. In deployments set
`LANDING_RECEIPT_CLIENT_CONFIG` to the application sidecar-client TLS configuration,
`LANDING_RECEIPT_HOST` to the bind address, and optionally `LANDING_RECEIPT_PORT`.
This route is not exposed on the browser API listener. It uses the application
certificate as its server identity and pins the sidecar certificate as client.
The sidecar sends using its server certificate and pins the application's
certificate. **Both certificates therefore need serverAuth and clientAuth EKUs
and appropriate server DNS/IP SANs.** Newly generated development certificates
include both usages. Existing S1 development certificates must be replaced during
a coordinated local restart: stop API/sidecar, move `tmp/sidecar/tls` aside, run
`npm run dev:up`, then restart the API. Do not reuse the old running process's pins.
The existing TLS configuration paths continue to point at the new pair.

`POST /landing-receipt` takes the shared Zod `LandingReceipt` payload directly,
returns 204 after durable acceptance, and uses the standard error envelope for
refusals. Its generated contract is `sidecar/landing-receipt.openapi.json`.
The application locks the source row, fixes/validates the strategy and inserts an
idempotent receipt inbox entry in one tenant transaction. Identical retries
succeed; conflicting receipts refuse. The inbox is metadata only and has forced
RLS; it is not the evidence record writer (ING-24 belongs to 5.11).

A receipt refusal or network failure **does not undo landing**. Arrival state
keeps `landing.receipt`, `landing.registered=false`, and the registration error.
Subsequent scans retry delivery without re-reading or re-inserting the filing.
These landed-but-unregistered entries remain visible to the future 3.10 register.
Reconcile the application source/strategy or restore connectivity; never remove
customer rows as a substitute for receipt reconciliation.

### Upgrade to industry-neutral filing parties

Stop the application workers and sidecars for the upgrade. Apply migrations 020
and 021; migrations 017–019 are unchanged historical inputs. Migration 020 renames
`cedant` to `filing_party`, `cedant_file_rule` to `filing_party_rule`, and
`cedant_id` to `party_id` in place, including named indexes/constraints. Existing
IDs, rows, forced RLS, grants and foreign keys remain intact. Downgrade refuses
if new free-text kinds cannot fit the old enum; it does not delete those rows.

Re-export the rule snapshot with `filingParties` and rule `partyId` fields before
starting the new sidecar. On startup the watcher validates version-1 arrival
history, converts `cedantId` to `partyId`, and atomically persists version 2 under
its exclusive state lock. It retains all filing IDs, fingerprints, hashes,
duplicate/restatement links, extraction summaries and registration outcomes.
It never initializes fresh history as part of this rename. Invalid/mixed formats
refuse startup; old binaries cannot read version 2.

On its first customer-Postgres transaction the new writer takes the existing
landing advisory lock and checks `_opintel_landing.groups`. For an old database it
executes `ALTER TABLE _opintel_landing.groups RENAME COLUMN cedant_id TO party_id`.
PostgreSQL keeps the same primary-key index and column identity. This upgrade and
the non-empty-kind check commit transactionally; fresh databases create the new
column directly, and subsequent startups do not repeat the rename. A database
containing both names refuses for operator reconciliation. No landed tables are
renamed, no customer rows are copied, and stored table assignments, column type
history and commit receipts remain unchanged. Do not run old and new writers
against the same database: the old SQL references the removed column name.

`kind` is non-empty text, not a platform enum. Null still represents an incomplete
rule or an unattributed quarantined arrival and cannot be landed. Migration 021
supplies the reinsurance industry's `filing_party` subject with display name
“Cedant” and its `filing_kind` parameter values in vocabulary data. Other packs
can provide their own language and meaningful kinds; platform validation accepts
other non-empty values without a release. Reinsurance labels in historical
migration/upgrade code are compatibility identifiers only.

### Filing register (3.10)

The register owns the existing `stateFile`; the watcher delegates to it. No second
arrival history is created. Filing IDs, hashes, received timestamps, duplicates,
restatement links, extraction summaries and customer-local reasons survive restart.
The source strategy is stamped on new arrivals and committed receipts.

Each changed outcome has a durable increasing revision. `/arrival-notice` sends
only the declared metadata and quarantine category over the pinned mTLS pair;
it never sends paths, workbook contents or raw reasons. The application stores a
projection, discards older/equal revisions and exposes cursor-paginated
`GET /api/v1/projects/:id/filings` under `project#view`. Receipts supply landed row
counts and supersession. A refused receipt leaves committed rows intact and the
local register shows `landing.registered: false` with its error. Notice delivery
is retried independently of receipt delivery.

Reconciliation runs at startup and every 30 seconds after completion. Failed passes
retry after 30, 60, 120, 240, then at most 300 seconds; success resets the delay.
Recovery, existing filing retries, and failed notice delivery run only on this schedule,
not on the file-scan timer. New arrivals still receive an initial processing/delivery
attempt. Shutdown clears both timers and waits for in-flight work.
Reconciliation consults customer Postgres commit receipts, repairing local receipt
loss without opening or inserting the workbook again. Reconciliation also replays
delivered receipts idempotently to check and repair the application inbox. Reconciliation counts
current zone entries against durable registrations, including quarantines and
duplicates. Unsettled, unreadable and special entries count as unregistered;
nothing is silently reported as accounted for. Only counts and `checkedAt` leave
via `/reconciliation-report`. The pinned request carries `x-opintel-project-id`
for tenant scope; the payload contains no file list.

Stop the sidecar before a local command: the register retains exclusive state
ownership, including for inspection. Use the same config and state path:

```sh
npm run sidecar:register -- list SOURCE_ID - path/to/service.json
npm run sidecar:register -- show SOURCE_ID FILING_ID path/to/service.json
npm run sidecar:register -- reconcile SOURCE_ID - path/to/service.json
npm run sidecar:register -- retry SOURCE_ID FILING_ID path/to/service.json
```

`show` deliberately displays local detail to the operator, including the raw
reason. This output is not telemetry; do not forward it to a log collector.
Correct the rule and re-export the snapshot before retry. Retry preserves the
filing ID and re-runs identification, extraction and landing; it offers no manual
attribution. Changed bytes require a new arrival rather than rewriting history.
Restart the sidecar after the command. Rule edits alone never release quarantine.
Ingest logs and span attributes use an enforced field allowlist: only a fixed
event, UTC timestamp, source/project/filing UUIDs, fixed error category and attempt count.
Raw reasons, filenames, column names, file contents and cell values are never logged.
Delivery attempt counts track consecutive failures, reset on success and restart;
scan failure counts are cumulative for the running register. Retry state resets on restart.
Demo preparation uses the normal one-second file scan interval and upgrades its
legacy 25 ms setting when preparation is rerun; it does not alter other custom intervals.

Receipt and source clients validate and preserve the peer’s error category and
retryable flag. Invalid envelopes remain transport/protocol failures. Introspection
records and demo CLI diagnostics retain the category without logging raw peer messages.

### Reinsurance demo pack (3.11)

Migration 024 publishes **Bordereaux Store** for `reinsurance-treaty`. The reviewed
pack data is `src/modules/sources/demo/reinsurance.json`; its SchemaSpec and
GeneratorSpec match the database seed. It contains twelve synthetic filing parties
with twelve initial XLSX files and one restatement. Sheets, header rows, decimal
separators, date formats and premium headers vary. The twelfth file intentionally
has a merged header and quarantines. Shared treaty references join across the
landed tables. The fixed seed produces reproducible cell values; these are
synthetic evaluation files, not customer submissions or the later full evaluation
fixture with pools and entitlements.

`POST /provision-demo` uses the existing pinned-mTLS envelope and returns the
configured Vault reference and database name. It accepts only a configured demo
reference and a landing zone bound to the request's project/source. It neither
creates databases nor calls `VaultPort.store`. For spreadsheet templates it only
publishes files: the unchanged watcher, identification, extraction and landing
ports do the rest. A `dependsOn` file is withheld until the predecessor's filename
appears in the durable register. `supersedes` must reference that same dependency
and the same party/kind/period. The producer never assigns a filing ID or inserts
landing rows.

File IDs are safe filename components; delivery names are `id_period.xlsx`.
The corresponding declared SchemaSpec table is `party_kind`; its name indexes
`rows` and `columns`. The pack helper exports exact identification rules using
these names, declared sheet/header/locale and `month_end` period interpretation.
The helper's month-end convention belongs to this pack's deployment metadata,
not a default added to ingest. The generator refuses missing/ambiguous objects,
unknown dependencies and cycles before publishing. A template signature and
prepared workbooks are cached outside the zone; these are delivery artifacts,
not arrival history. Retries reuse the bytes and never overwrite an existing
file. Changed templates require a new zone/source. Stale `.provision-lock` recovery
uses the same operator procedure as the register lock after an unclean shutdown.

The operator configures the demo target in `service.json`:

```json
"demo": {
  "database": "opintel_demo",
  "credentialRef": "vault://demo/postgres"
}
```

Prepare its matching landing zone, reserved source identity and tenant rules before requesting
files. Keep staging and the zone on the same filesystem for atomic no-replace
publication. PostgreSQL writes use the zone's declared strategy; there is no
strategy default in the connector. The development pack setup deliberately
selects `append_as_at` to demonstrate both versions of the restatement.

For the local development workflow, first run `npm run dev:up`; it creates
`opintel_demo` without application migrations and passes its URL to the sidecar's
read-only environment Vault adapter. Start with an existing reinsurance project:

```sh
npm run demo:pack -- prepare PROJECT_ID USER_ID
# dev:up stops the recorded sidecar before loading the prepared configuration.
npm run dev:up
npm run dev:api
# Open the project’s Data sources screen and click Connect on its demo card.
# Alternatively, in a second terminal:
npm run demo:pack -- provision PROJECT_ID USER_ID SOURCE_ID
```

Preparation creates tenant rules and an empty zone, reserves the source UUID,
and publishes `demo_source_template.deployment_ref[projectId]` through the operator
scope. It inserts no `data_source` row and writes no spreadsheet. Repeating prepare
reuses the reserved identity. Connect inserts the source and queued run atomically.
The browser and optional provision command use the same registration service,
which delivers the declared files, waits for ordinary arrival notices, then invokes
the ordinary `IntrospectionJob` through `SidecarSourceConnector`. The API must run for arrival notices and receipts.
The intentional merged-header quarantine remains visible in the local register.
A corrected workbook is a new arrival; changed bytes cannot rewrite its history.
Use the ordinary local retry command for rule corrections, without changing
attribution. No entitlement is granted by preparation, delivery or introspection;
the persisted undecided assertion belongs to item 4.1.

Migration 023 refuses to proceed if legacy credential-less demo rows exist. Back
up the source metadata and provision the real reference, then backfill during a
maintenance transaction: drop `credential_matches_origin`, update only the
identified demo rows to their configured references, add the new non-null check
from 023, and commit. Run migrations normally afterwards. Never invent a reference
or clear a live credential to make a migration pass. Rolling 023 down while demo
sources retain real references intentionally refuses rather than erasing them.

### Recovering a failed source

The Data sources screen displays the saved failure message unchanged and offers
Retry to project administrators. Retry uses `POST /api/v1/sources/:id/introspect`
with `{ "projectId": "..." }`, authorized by `project#bind_source`. It creates a
new run on the existing source and preserves prior runs and schema selection.
For demos, it resumes prepared delivery before introspection. Operators may also
repeat `demo:pack provision` with the same project, user and reserved source ID.
An active run is reused; a completed connection is not provisioned again.
Do not delete a source to recover a failed run. Existing register IDs, hashes,
landed rows and supersession links remain authoritative. Fix any reported
preparation mismatch before retrying. The command returns failure if background
preparation fails, with its safe actionable message.
