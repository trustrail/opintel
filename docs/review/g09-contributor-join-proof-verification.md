# G-09 contributor join proof verification

Version: 1 · 2026-10-19

The proposed per-scan-key inflation is not present. Counts are independent for each protected input and relation alias (`sidecar/sql/application/treatments.ts:205`, `sidecar/sql/application/cardinality.ts:20`), never a union of scan labels. A self-join reuses one staged object. Cross-source scans may label the same entity differently without adding those labels into a common contributor count.

`test/staging-source.test.ts` adds real PostgreSQL-to-Engine cross-source and self-join cases. Each relation contains four entities with two rows each; the join produces sixteen rows. Both refuse at floor five with `cardinality_count_low` at stage two. Positive controls at floor four return the independently calculated sums, 240 per side. The cross-source case explicitly establishes unequal labels across scans and four distinct labels in each scan. The existing per-scan rotation test remains unchanged.

Proof keys are local to the awaited source scan, never stored on the source/executor or sent through its contract. Both native-value and tokenized-value branches zero the buffer in `finally` (`sidecar/execution/infrastructure/postgres-source.ts:147`, `:156`). They are not retained beyond execution. This describes logical ownership and buffer clearing, not a claim that all JavaScript/native temporary memory is securely erased. No execution-wide shared key was needed or introduced.

The preceding pattern-rule run started at 12:22:42 local and reported a database cleanup failure during its 1,444-second duration. macOS power history records clamshell sleep at 12:23:36, wake at 12:46:24, another sleep at 12:46:56, and full wake at 12:49:33. The machine suspended during the run. A fresh isolated focused invocation, with database cleanup diagnostics enabled, passed all 55 tests in 73.16 seconds, including all pattern-rule tests. No cleanup assertion, timeout or retry policy was relaxed.

The completed-candidate gate retains settled-paint and recorded dev-port isolation preconditions. Its process is wrapped with `caffeinate -is` to prevent idle sleep; this does not make a laptop safe to close during validation. No throwaway gate pass is used.

The accompanying authoring-message correction names the qualified column, source, `contributorKey=true`, and the current console path to Contributor entity key. It applies to manual, bulk and pattern-rule authoring and snapshot compilation.

## Completed-candidate gate

One gate invocation passed on the unchanged code candidate based on `5c6b3c3`. Pre-run listener isolation was recorded at 2026-10-19T17:01:23.839Z with no Node listener; settled paint remains the browser capture precondition. The dev Engine started by the reseed was stopped through its recorded supervisor and left stopped. No assertions, timeouts or retries changed.

| Tier | Seconds | Result |
|---|---:|---|
| typecheck | 33.50 | Passed |
| typecheck:conformance | 6.64 | Passed |
| lint | 20.20 | Passed |
| build:production | 2.70 | Passed |
| test:conformance | 206.74 | Passed |
| test | 1187.70 | Passed |
| test:smoke | 44.63 | Passed |

Wall time: 1502.16 seconds (25m 02s). Domain/integration: 1,900 tests across 208 files. Conformance: 59 checks, 54/54 routes, zero findings. Browser/MCP smoke: one passed. Logs and the immediately preceding isolation record are retained locally as `/private/tmp/contributor-join-gate.log` and `/private/tmp/contributor-join-gate-isolation.txt`. The generated `test-results/gate.json` records the pre-commit base HEAD, not a claim that the later commit hash existed during validation.

## Change ledger

| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1 | 2026-10-19 | Record cross-source/self-join proof, key ownership and sleep-interrupted cleanup investigation | No change to contributor counting; configuration failures now provide actionable declaration guidance |
