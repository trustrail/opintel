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
