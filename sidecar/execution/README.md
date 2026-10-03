# Staged execution (S2e)

`StagedExecutor` serves `/validate` and `/execute` behind the pinned application
certificate. The shared Zod contract is `src/shared/execution-contract.ts` and
also generates the OpenAPI document. It is an application-to-Opintel Engine contract,
not an agent-selectable entitlement or resource policy. Item 5.7 supplies that
transport from authenticated pool requests.

The request carries source credential references, the B.3 read plans with element
IDs, independent entitlements, pool namespace, policy version, aggregate minimum,
pool limits, and the project's `maxStagingRows` / `maxQueuedExecutions` settings.
Omitted decisions never become columns. A mismatch between a staged column's
treatment and its entitlement refuses before source access.

Validation creates empty in-memory pool schemas, parses, inspects and binds;
it opens no source connection and cannot prove runtime cardinality. Execution
first performs the same check, obtains post-pushdown estimates for every referenced
object, and admits every scan before fetching any. Unknown estimates refuse.
Simple comparisons and conjunctions on clear columns of one base object push
down. Joins, CTEs and untranslatable predicates retain the full-object estimate;
a token predicate is never sent to a plaintext source. Staged row counts also
refuse an underestimated object that exceeds the configured bound.

Clear/aggregate-only objects use the signed PostgreSQL scanner in the privileged
instance: read-only attach, explicit entitled projection, materialize, detach.
Treated objects use the Opintel Engine's scoped cursor reader, source base-type checks,
canonicalisation/tokenization/masking, then bound appends of treated rows. No
attachment is made for those objects. In-memory chunks transfer the staging
tables into the independent agent instance. Its search path is the declared pool
namespace. C.2 hardening and configuration lock follow staging; only that instance
inspects, binds and executes agent SQL.

The execution semaphore and FIFO queue are shared by one Opintel Engine host, keyed by
project and pool. The project queue setting is a waiting bound per pool, not a
second concurrency limit. Queued requests own no source or DuckDB session. The
execution deadline includes queueing, validation, estimates, staging and execution.
Abort interrupts DuckDB and cancels the source backend. Both source paths share
the existing per-source connection ceiling, statement timeout and operation
deadline. Scanner connection caching and parallel source scans are disabled. Native
connection establishment is capped at one second so cancellation cannot remain
blocked in libpq connection setup beyond the two-second release budget.

The outer LIMIT obtains at most the configured result rows plus one. Its tree
is rendered, parsed, inspected and bound again; only the retained handle runs.
The extra row sets `truncated`. Existing LIMIT/OFFSET is preserved. Native JSON
int64 constants are preserved without JavaScript rounding during this rewrite;
source-location metadata is normalized during rendering.

All instances close before a response is returned, including cancellation and
failure. Engine spill is disabled from instance creation, before staging starts.
Connector batches are cleared in `finally`, token keys are disposed, and source
connections are released. Execution logging uses an explicit identifier/outcome
allowlist; native errors and rows never enter it. This is cleanup enforcement,
not S4's handwritten proof that no sentinel remains in disk or mapped memory.
JavaScript strings and driver buffers cannot be claimed to have been securely
erased by assigning null to a batch.

Provision the extension outside query execution:

```
npm run sidecar:prepare-scanner
```

Set `postgresExtension` in Opintel Engine configuration to that file (relative paths
resolve beside the configuration file). The download is pinned to DuckDB 1.4.3
and the runtime platform; DuckDB verifies its signature. CI provisions it before
tests. Missing scanner configuration refuses clear staging with an actionable
error. Query execution never INSTALLs or downloads an extension.

C.5's deployment requirements remain mandatory for S5's OCI package: read-only
root filesystem, no writable temporary storage, swap disabled, core limit zero.
There is no S5 image in this repository yet, so the native development host does
not establish those container properties. S4 owns the sentinel proof. Streaming
is deferred: every successful execution here reports `executionPath: staged`.
