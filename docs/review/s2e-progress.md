# S2e progress

The staged execution path is implemented. Streaming is explicitly deferred in
the plan and `deferred.md`. Deployment and handwritten proof boundaries are
listed below.

## Resource envelope — completed

The inspected SQL boundary now converts native engine exceptions into a
structured DomainError only after session cleanup. Memory exhaustion returns
`budget_exceeded` with a fixed, actionable message; no native allocation sizes,
SQL fragments, source values or exception cause leave the boundary. Unknown
engine failures return a fixed `dependency_unavailable` envelope. Invalid
contracts return `validation_failed`. The raw S2a controls retain native errors.

The J-020 probe still forces real exhaustion, verifies its exact inspection /
execution sequence and asserts that no spill files appear. It now carries the
returned code as well as the message; the test additionally requires
`budget_exceeded` and records structured versus raw refusal accurately.
No attack SQL or existing refusal assertion was removed. `docs/bypass-attacks.md`
was not modified. This closes J-048's resource-envelope exception, which has been
removed from the registry.

Verification: 100 focused SQL checks passed, including a real integer-overflow
error that must not echo its input value and must close both sessions. The
bypass gate reports 95 passing checks, two open 5.7 transport prerequisites
(J-044/J-045), and zero regressions.

## Staged execution and governance

The user resolved both bounds in C.4. `maxStagingRows` defaults to 5,000,000,
10,000–100,000,000; `maxQueuedExecutions` defaults to 8 per pool, 1–64. Both are
project settings carried by the trusted execution request. Unknown post-pushdown
estimates refuse. Scan and queue refusals name the setting and value, and queue
refusals include retryability and current depth.

Both staging paths run against real PostgreSQL in the tests. The native scanner
is loaded from a signed, pinned local extension; no runtime download is allowed.
The treated path verifies source token types and treats before DuckDB receives a
row. Tests inspect appends and attachment calls, verify exact large integers and
arrays, and check that hidden columns and values are absent. An actual count
checks underestimated scans as well as the estimate admission gate.

The executor validates and binds empty pool schemas before source contact,
then creates a fresh pair for execution against the materialized data. The
application's inspection is not used. The request's independent entitlements
must agree with every column in the read plan. LIMIT is a tree transformation
followed by fresh parsing/inspection/binding and retained-handle execution;
large integers survive that JSON round-trip exactly.

Cancellation covers queued work, native execution and both source readers.
Native source leases share S1's connection ceiling and operation deadline;
source statement timeouts remain in force. Only in-flight staging appends are
drained on cancellation; a stalled source callback or credential promise cannot
make the source deadline wait indefinitely. Source and engine failures are
sanitized, and execution telemetry uses an identifier/outcome allowlist.

## Verification and remaining boundaries

- J-021: injected-clock execution cancellation and isolated real-source timing
  checks for both staging paths; both close within two seconds.
- J-024: row/SQL sentinel absent from the execution logging allowlist.
- J-025/J-026: bounded FIFO, cancellation, retryable depth envelope, LIMIT/OFFSET,
  explicit truncation, and exact integer round-trip.
- J-022/J-023: killing the HTTP sidecar after native execution begins sends no
  partial response; the dead endpoint refuses subsequent connections. The
  application/workspace degraded-state half awaits 5.7, which still has no query
  transport. No screen or fallback route was introduced here.
- C.5: no-spill configuration applies before staging; sessions, source leases,
  token keys and mutable connector batches are released on the tested exits.
  This does not substitute for S4's handwritten mapped-memory/filesystem sentinel
  scan. Read-only root, no temporary storage, no swap and no core dumps are
  mandatory requirements for the separate S5 OCI package; native development
  tests do not establish those deployment properties.

The bypass gate remains **95 passing, J-044/J-045 open under 5.7, zero
regressions**. `docs/bypass-attacks.md` and attack SQL/refusal assertions were not
changed. Streaming is explicitly deferred and every execution reports staged.

Final verification: the full functional run passed **112 files / 1,172 tests**.
The final staging-focused run, including the subsequent empty-pool/no-dummy case,
passed **20 tests**; the wider focused HTTP, process, deadline and resource run
passed **43 tests**. Both isolated source-cancellation performance cases passed.
Strict typecheck and lint passed. Scanner provisioning downloaded and loaded the
signed platform artifact successfully. No migration or screen was added.
