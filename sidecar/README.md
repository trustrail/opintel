# Postgres connector hosting

Item 3.4 supplies connector logic; S1 supplies the HTTP service, pinned mTLS,
configuration, and durable audit/vault adapters. This directory is a separate
runtime entry point. Application code uses `SidecarSourceConnector` over HTTPS
and must never import the Postgres adapter.

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
403; successful values have the declared wire response shape. No HTTP listener
or `/health` implementation is included here. Resolve vault references only
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
