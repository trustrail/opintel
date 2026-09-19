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
The snapshot contains `cedants` and `rules` with camelCase fields corresponding to
§4.3b. It is read again on every scan so deployment rule changes need no release.
Write rule snapshots using atomic replacement. This is deployment configuration,
not an automatic metadata synchronization protocol.

`filename_regex` is a Unicode JavaScript regular expression against the basename,
with the declared named `periodGroup` capture. `folder` matches the exact relative
parent directory, using `/` separators (`""` means the root). Only active rules
for active cedants in the configured project participate. Priority never breaks
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
filing carries its cedant, period, kind and matching rule ID. `supersedes` points
to the preceding ready filing for the same source/cedant/period/kind; distinct
bytes produce a restatement. SHA-256 duplicates within the source carry
`duplicateOf` and are not ready. Quarantined registrations never enter the ready
handoff and carry no attributed cedant. Retries/restarts retain registration and
duplicate history. Rule edits do not silently release quarantined registrations;
resolution and the user-facing register belong to 3.10.

State has an exclusive `.lock` containing the owning PID. Graceful shutdown drains
scans and removes it. After a crash, verify that PID is no longer running before
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

Re-export the tenant rule snapshot after migration 018. Cedants must declare
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
`{cedant_code}_{kind}`. `table_per_filing` uses the assigned base (up to 30
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
