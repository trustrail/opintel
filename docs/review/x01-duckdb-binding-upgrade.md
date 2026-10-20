# X-01: DuckDB binding-upgrade hypothesis

Version: 1 · 2026-10-18

The npm latest release at investigation time is `@duckdb/node-api` **1.5.6-r.1**, exact-pinned with matching bindings; native engine `v1.5.6/069cc9f9b5`. This exceeds the requested 1.5.5-r.5 floor. Upstream [490](https://github.com/duckdb/duckdb-node-neo/issues/490), [494](https://github.com/duckdb/duckdb-node-neo/pull/494) and [495](https://github.com/duckdb/duckdb-node-neo/pull/495) describe invalid-index/null-handle and validity-mask guards. They do not establish the cause of our `DBConfigOptions::operator=` crash. X-01 remains open pending evidence.

## Readiness negative control

Before replacing the scanner, the upgraded Engine was started with the preserved signed 1.4.3 scanner. Native LOAD explicitly rejected a v1.4.3 binary on v1.5.6. Actual startup exited 1 before ready, reporting “The configured signed PostgreSQL scanner could not be loaded.” Diagnostic record: `tmp/diag/x01-upgrade/mismatch.json`. No customer row was read. The new scanner is fetched for the validated engine build/platform and signature-checked by LOAD.

## Compatibility and crash diagnostics

The new serializer omits the empty UNION `children` property. The strict schema permits absence; a supplied property must remain empty. Both operands remain inspected and unknown properties remain refused. The reserved-keyword inventory still covers all engine-reserved names.

Supervisor exit records include the signal and a bounded 4096-byte stderr tail. Unknown lines are explicitly withheld because native stderr can contain SQL or values; byte count, withheld-line count and truncation flag distinguish silence from redaction. Existing live stderr forwarding is unchanged. Tests cover SIGKILL, bounded tails, split writes and redaction.

## Validation

The completed code candidate passed one full gate on 2026-10-19, before commit (the gate records parent HEAD `4468609`; the worktree contained this candidate). No gate rerun.

| Tier | Result | Seconds |
|---|---|---:|
| typecheck | Pass | 35.943 |
| typecheck:conformance | Pass | 5.804 |
| lint | Pass | 19.480 |
| build:production | Pass; review routes absent | 2.903 |
| test:conformance | 59 checks; 54/54 screen routes; zero findings | 174.172 |
| test | 1,868 tests / 204 files pass | 1302.942 |
| test:smoke | One browser/MCP path passes | 44.712 |
| Total | Pass | 1586.017 |

Gate record: `tmp/diag/x01-upgrade/gate.json`; log: `/private/tmp/x01-gate.log`. No Node listeners were present immediately before the gate. Before the gate, the unchanged bypass inventory passed 97 checks with zero open checks/regressions. Focused compatibility checks passed 207 tests after correcting the serializer boundary; an earlier focused run found the UNION incompatibility (261 pass, one fail). A sandbox-blocked focused invocation did not execute tests.

## Fifteen-minute ten-agent soak — 2026-10-19

External mode used the existing demo manifest, two pools, ten credentials, rate 750 ms, seed 1, custody enabled and the existing four fixed device names. No seeding or credential mutation. The owned API and supervisor started after the gate with no other Node listeners. Agent-side certificate exchanges all succeeded. The duration flag was 900 seconds; startup/drain made the soak process wall time 917.042 seconds (04:28:45.494–04:44:02.536 UTC).

**Engine: zero unexpected exits, zero restarts.** Child PID 35439 remained alive for the entire run. Cleanup began only after the soak exited. The sole exit record was requested shutdown: code 0, signal null, stderr tail empty, stderrBytes 0, withheldLines 0, truncated false. The API also exited normally during cleanup. Both owned services were left stopped; post-run listener check found no Node listener. Process record: `tmp/diag/x01-upgrade/soak-processes.json`; Engine exit records: `tmp/diag/x01-upgrade/engine.log`.

1,132 queries: pool A 563, pool B 569, 110–117 per agent. Outcomes: 990 success, 28 dependency_unavailable, 48 unsupported_on_aggregate_only, 39 element_withheld, 27 entitlement_missing. All 28 dependency_unavailable responses explicitly say certificate_association_missing; they are missing stored associations, not Engine failures. All 47 offered custody bundles completed, verifying 260 values. 115 joins were attempted, matching 272 rows. Query latency p50/p95/p99: 3653/5959/7555 ms.

**The soak did not pass overall: exit 1, 55 invariant breaches.** All 55 are the existing E-09 row-count semantics mismatch (the count is now named `returnedRows`) on recoveries: expected 7/actual 1 (30), expected 5/actual 1 (25). The Engine counts the staged rows after the query filter (`sidecar/execution/application/execute.ts:91`); the harness compares against the full entitled fixture count (`scripts/soak/reinsurance.ts:154`). No assertion or expectation was changed. Operational errors: zero. An early live status scan mistakenly searched for ALARM rather than INVARIANT BREACH and reported zero; this final summary corrects it.

84/85 declared scenarios passed; retiring-key custody was NOT EXERCISED because its grace window had elapsed. The observer cookie was rejected with HTTP 401, so 3,396 stored-receipt checks were explicitly skipped, with no database fallback. This run therefore makes no claim about those receipt checks.

Soak log: `tmp/soak/2026-10-19T04-28-46.624Z-35450.jsonl`. The upgrade did not reproduce X-01 within this bounded run. The original crash occurred around eighteen minutes; fifteen minutes without a crash neither diagnoses the original cause nor establishes a fix. X-01 remains open.

## Change ledger

| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1 | 2026-10-18 | Upgrade hypothesis, matching scanner, mismatch control and exit diagnostics | No entitlement or custody assertion relaxed; X-01 not diagnosed or closed |
