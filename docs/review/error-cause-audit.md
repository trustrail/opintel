# Exception cause-loss audit — 2026-10-07

Read-only audit of catches in `src/`, `sidecar/` and `scripts/`, prompted
by the API startup catch. The startup handler is corrected separately;
the other paths below are findings, not changes. Raw causes must never be
added to production output: S4a's sanitiser applies to diagnostic logging.

## Generic failures that lose the native diagnosis

| Location | What remains after the catch |
|---|---|
| `src/platform/http/start.ts:307` | Previously only “API server failed to start.”; now S4a-sanitised type, message and frames |
| `sidecar/ingest/command.ts:56` | Register CLI prints a generic checklist |
| `scripts/demo-pack.ts:78` | Domain errors are reported; other exceptions become a generic checklist |
| `scripts/sidecar-dev.ts:24,56,65,91` | OpenSSL failure replaced; invalid health response replaced; every lock-open failure described as an existing lock; readiness polling drops individual failures |
| `scripts/dev-demo.ts:13` | Every lock-open failure described as an existing lock |
| `scripts/service-readiness.ts:77` | Redis connection/ping failure replaced by endpoint unavailable |
| `src/modules/engines/infrastructure/tls-config.ts:7` | File, parse, schema and certificate-read errors collapse to missing/invalid TLS material |
| `sidecar/start.ts:55` | Shutdown failure prints only a fixed message |
| `src/platform/http/start.ts:196,203,209,216` | Ordinal repair, rule delivery, custody rehearsal and presence sweep log event/category only |
| `src/platform/http/evidence-maintenance.ts:15` | Only maintenance phase reaches the failure callback |
| `src/modules/evidence/application/partition-monitor.ts:13` | Unknown horizon and alert, without read failure diagnosis |
| `src/platform/sse/port.ts:13`; `src/modules/pools/infrastructure/presence-sweep.ts:11` | Event, project and category only |
| `src/modules/sources/infrastructure/introspection-completion-recovery.ts:15`; `postgres-introspection-store.ts:32` | Rule-delivery warning retains identifiers, loses exception |
| `sidecar/start.ts:33` | Custody cleanup warning retains category only |
| `src/modules/sources/application/source-registration.ts:77,100` | Unexpected preparation/execution becomes a fixed dependency failure; failure-recording exception becomes run-id warning |
| `src/modules/sources/application/introspection-job.ts:54,91` | Poll failure aborts; uncancelled job failure becomes “Introspection failed.” |
| `src/platform/http/start.ts:269` | Current-user lookup failure becomes anonymous (`null`) |

## Infrastructure failures converted to safe outcomes without a diagnostic

These paths report an outcome, but their original exception is no longer
available to the HTTP logger. A safe refusal is not itself a replacement
for an operator diagnostic.

| Location | Conversion |
|---|---|
| `src/modules/mcp/application/query.ts:23,26,30,57`; `explain.ts:51` | Preparation/execution/evidence failures to fixed dependency refusal |
| `src/modules/ingest/api/landing-receipt-server.ts:57` | Receipt registration to fixed 503 |
| `src/modules/tenancy/application/{list-tenancy,list-members,explain-permissions}.ts` | Infrastructure/auth failures to dependency refusal |
| `src/modules/tenancy/application/{create-company,create-project,invitations}.ts`; `src/modules/pools/application/binding.ts` | Outbox/email/access failures to incomplete delivery or access; durable retry remains |
| `src/platform/mail/local-file-adapter.ts:52`; `outbox.ts:86` | Mail write/send failure to unavailable/retained mail |
| `src/modules/identity/infrastructure/platform-provider-readiness.ts:14` | Configuration/secret lookup failure makes provider unavailable |
| `src/modules/identity/application/oidc.ts:111` | Provider exchange failure to fixed callback refusal |
| `src/modules/entitlements/infrastructure/custody-client.ts:21,31,39` | Discovery/transport/response failure to fixed custody diagnostic; existing DomainError preserved at line 31 |
| `src/modules/sources/infrastructure/sidecar-source-connector.ts:153`; `src/modules/engines/infrastructure/probe.ts:15` | Invalid/failed peer response to fixed error/verification refusal |
| `sidecar/execution/application/execute.ts:69,82` | Unexpected append/execution failure to fixed refusal (structured classification is S4b's separate scope) |
| `sidecar/http/server.ts:113` | Unexpected outer handler rejection to fixed 503 unless aborted |
| `sidecar/custody/infrastructure/file-custody.ts:32,33,34,70,112` | State/key/escrow failures to safe step/category outcomes |
| `sidecar/demo/provision.ts:128`; `sidecar/ingest/infrastructure/receipt-client.ts:37,41` | Demo write/receipt failure to fixed diagnostic |
| `sidecar/ingest/register.ts:163`; `sidecar/ingest/infrastructure/workbook-reader.ts:239` | Unexpected extraction/read failure to generic quarantine/malformed outcome; known InvalidWorkbook message retained |
| `sidecar/infrastructure/postgres-connector.ts:129` | Audit failure becomes false, fails closed |

## Deliberate fallback and cleanup catches

Not every empty catch is a missing diagnostic. Cursor/JSON/id/timezone/
regex validation intentionally rejects invalid input; session/OIDC decoding
discards malformed records. Evidence SQL parsing/redaction fails closed.
Frontend mutation catches generally leave the error in TanStack Query for
the screen to render. SSE malformed input is rejected and reconnect loss
is signalled. Authorization's cached-snapshot fallback deliberately uses
the bounded staleness policy (`spicedb-authorization-port.ts:112`).

Rollback, unlink, close, cancellation and queue-chain catches often preserve
the primary failure or keep a queue alive. In particular, the ingest
reconciliation scheduling catch at `register.ts:118` is **not** an
unreported failure: `reconcile()` logs `ingest.reconciliation_failed` before
rethrowing. Its log retains category rather than native diagnosis.
Postgres cancellation failures use connection closure and statement timeout
as fallback. These should be assessed separately from startup failures.

`sidecar/startup-check.ts` does not currently discard the cause: it retains
it and constructs a diagnostic. Conversely, several development commands
still print raw messages; that is a separate output-sanitisation concern,
not a cause-loss finding.
