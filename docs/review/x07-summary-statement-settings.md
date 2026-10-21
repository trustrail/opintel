# X-07 — summary statement settings

20 October 2026 measurement; reader-authorized final gate and landing.

## Scope of the change

The reader explicitly authorized this limited extension of the handwritten
scope wrapper. `tx.query(sql, params, settings)` accepts only:

| Setting | Permitted values |
|---|---|
| `jit` | `on`, `off` |
| `work_mem` | Integer KiB from 64 through 65,536 |

Unknown names and invalid values are rejected before setting anything. Raw
SET/RESET, transaction control and SELECT set_config still hit the original
rejection. Roles, tenant settings and RLS are not tunable through this API.
The wrapper issues SET LOCAL before the selected statement, restores the
previous values before following statements, and serializes queued statements
through restoration. The scope drains queued work before commit or rollback
and release, including when Promise.all rejects early. PostgreSQL statement
errors retain the existing rollback path.

Counts uses JIT off and 5,879 KiB work_mem, in its existing transaction.
Custody uses JIT off in its separate transaction. Scoping events and other
reads keep their defaults. No query text, grouping, filter, authorization,
receipt semantics, migration, client invalidation or polling cadence changed.

## Custody measurement before changing custody

The exact custody statement was extracted from the reader and explained through
withTenant with the same tenant context, seven-day filter and dedicated-session
JIT setting used for the earlier counts comparison. Range:
2026-10-14T00:00:00.000Z through 2026-10-20T20:52:12.061Z, exclusive at the end.
work_mem remained 4 MB. Medians of three sequential, alternating pairs;
EXPLAIN ANALYZE execution time, excluding planning and connection overhead:

| Condition | JIT on | JIT off |
|---|---:|---:|
| Idle | 330.585 ms | 208.126 ms |
| Ten agents, Dashboard open | 1,840.430 ms | 1,022.315 ms |

Idle on samples: 362.203 / 330.585 / 289.652 ms; off:
208.126 / 215.665 / 206.150 ms. Loaded on:
1,558.206 / 1,840.430 / 2,228.270 ms; off:
932.955 / 1,278.754 / 1,022.315 ms. Both conditions favor disabling JIT;
that decision was made before applying the custody change. This preliminary
load lasted two minutes; the endpoint measurement below is a separate full
ten-minute workload on the completed candidate.

The preliminary custody workload reported one unexpected dependency_unavailable
for a custody credential scenario and therefore FAILED its scenario assertion.
Operational errors were zero; receipt invariants passed with zero skipped
checks. The execute-refusal receipt identifies XQ escrow HTTP 400:
`release_prepare_failed`, phase `escrow`, provider `xq`, exception
`CustodyProviderError`, provider failure `http_refused`, status 400. Opintel
failed closed before issuing a release grant. This is a real provider/integration
availability concern, not a harness oracle mismatch; the bounded diagnostic does
not establish why XQ rejected it. Receipt:
`01a15b5d-e57d-704f-b81e-8d4f601fe974`, started
2026-10-20T22:10:42.891895Z, completed 22:10:47.732000Z. That failure remains
recorded and is not presented as a passing soak.

## work_mem sizing

The completion-side external sort's temporary-file size was not treated as
its RAM requirement. A sizing EXPLAIN with JIT off and bounded work_mem of
65,536 KiB measured an in-memory quicksort footprint of 4,703 KiB. The selected
value is ceil(4703 × 1.25) = **5,879 KiB**, providing 25% measured headroom.
A second EXPLAIN at that value used 4,709 KiB for that sort and reported
**zero temporary blocks read and zero written**. The separate grouping sort
used 2,375 KiB and stayed in memory. Sorted aggregation remains unchanged.

The post-load plan, including 31,274 input rows and 14 output groups, again
reported **zero temporary blocks read/written** at 5,879 KiB. Its completion
sort used **4,836 KiB**, and its grouping sort used 2,479 KiB. No statement probes or validation commands run during
that endpoint measurement. The post-load plan includes the newly written
synthetic evidence in its seven-day range.

## Endpoint measurement

Window: **22:31:58.819–22:41:58.819 UTC**, 20 October 2026.

The harness mounts Dashboard only, with ten agents, seed 1,
750 ms inter-operation pacing, real Engine/MCP and custody enabled for 600
seconds. It does not mount Pools and does not reproduce or attribute the
unexplained historical pool-list storm. Requests are measured at the HTTP
boundary, including authentication, three sequential summary reads, settings
overhead and serialization. Responses are selected by request start inside
the 600-second window, even if they finish afterward. Percentiles use nearest
rank. The stream lifetime is excluded from ordinary response latency.

The quoted 18,685.41 ms / 22,382.73 ms baseline is for all console HTTP responses;
the baseline summary endpoint alone had p95 and maximum both 22,382.73 ms.
Both comparisons are reported separately:

| HTTP responses | Baseline p95 | Baseline max | Candidate p95 | Candidate max | Candidate n |
|---|---:|---:|---:|---:|---:|
| All console, excluding stream lifetime | 18,685.41 ms | 22,382.73 ms | **3,392.55 ms** | **4,371.48 ms** | 248 |
| Summary endpoint alone | 22,382.73 ms | 22,382.73 ms | **4,371.48 ms** | **4,371.48 ms** | 17 |

The summary sample is small enough that nearest-rank p95 equals its maximum.
These are complete HTTP response times, not individual SQL execution times.
Console request rate increased from 0.2567 to **0.4133 requests/second** because
more live refresh cycles completed. Browser and server reconcile exactly:
248 request starts, matching by endpoint. No extra measurement requests were
inserted into the load window.

| Console endpoint (project normalized to P) | Requests |
|---|---:|
| `/api/v1/pools/384f01f7-df62-45d5-95c9-088bec8eb13a/agents` | 51 |
| `/api/v1/pools/384f01f7-df62-45d5-95c9-088bec8eb13a/entitlement-groups` | 2 |
| `/api/v1/pools/3972364d-f276-4dd9-b37c-0bb229f250a0/agents` | 51 |
| `/api/v1/pools/3972364d-f276-4dd9-b37c-0bb229f250a0/entitlement-groups` | 2 |
| `/api/v1/pools/85eb3b4b-923f-494a-a003-2b332d17cec1/agents` | 17 |
| `/api/v1/pools/85eb3b4b-923f-494a-a003-2b332d17cec1/entitlement-groups` | 2 |
| `/api/v1/pools/bdf0f023-40e5-465a-9186-30a73dccaefd/agents` | 17 |
| `/api/v1/pools/bdf0f023-40e5-465a-9186-30a73dccaefd/entitlement-groups` | 2 |
| `/api/v1/projects/P/custody-observations` | 17 |
| `/api/v1/projects/P/dashboard/feed` | 17 |
| `/api/v1/projects/P/observations` | 17 |
| `/api/v1/projects/P/pools` | 1 |
| `/api/v1/projects/P/runs` | 17 |
| `/api/v1/projects/P/runs/summary` | 17 |
| `/api/v1/projects/P/stats` | 1 |
| `/api/v1/projects/P/suggestions` | 17 |

The final load **PASSED** its exercised assertions: 84/85 scenarios exercised,
zero invariant breaches, zero operational errors, receipt checks enabled with
zero failures or skipped checks. The expired retiring-credential grace scenario
remained unexercised. All 22 Dashboard probes passed; no browser HTTP failures,
page errors or aborted requests were recorded.

The stream had one open and one snapshot before the load, no reconnects or
backpressure closes, and one controlled client close after draining. There were
zero opens/closes/snapshots during the 600-second load window. Pool samples:
582, with waiting in 59; sampled peak waiting queue **6** (baseline 11),
acquisition wait p95 **21.42 ms**, maximum **393.66 ms**.

Raw metrics and all 17 summary response samples:
`tmp/x07-statement-settings/measurement.json`. API diagnostics:
`tmp/diag/2026-10-20T22-31-39.146Z.jsonl`. Browser workload:
`tmp/x07-statement-settings/endpoint/browser.json`. Post-load plan:
`tmp/x07-statement-settings/counts-endpoint-after-off-5879.json`.


An interrupted endpoint rehearsal is preserved under
`tmp/x07-statement-settings/endpoint-partial` and excluded: review found the
new queue needed draining before rollback/release. The final candidate includes
that correction and failure-path regression coverage.

## Validation

The focused normal test launcher passed 45 tests in five files: raw rejection,
setting bounds, real PostgreSQL restoration and queued settings, RLS and
Activity assertions. A direct Vitest invocation initially refused the non-owned
SpiceDB target before running tests; the normal launcher supplied isolated
services. Standalone strict typecheck and lint passed before the final queue
lifecycle correction. The single `npm run check` invocation stopped at strict typecheck after
34.86 seconds: the queue-drain correction retained the old `Tx` return
annotation, producing TS2353/TS2339. The annotation was corrected to the private
`{tx, drain}` shape; strict typecheck then passed. TypeScript transpilation
confirms identical emitted JavaScript before/after this type-only correction,
so the endpoint measurement remains applicable. Proof:
`tmp/x07-statement-settings/type-only-proof.json`.

The failed gate record is preserved in `tmp/x07-statement-settings/gate-initial.json`
and restored byte-for-byte to `test-results/gate.json` after the browser harness
cleared its output directory. `npm run check` is not retried.
The previously unattempted tiers then ran once, sequentially, with the same
port-isolation checks before conformance and smoke. All passed:

| Tier | Result | Seconds |
|---|---|---:|
| Conformance typecheck | Passed | 8.31 |
| Lint and boundaries | Passed | 27.34 |
| Production build and artifact exclusion | Passed | 3.95 |
| Route conformance | 54/54 routes, zero findings | 129.69 |
| Normal domain/integration | 219 files, 1,983 tests passed | 1,180.03 |
| Browser/MCP smoke | 1 passed | 50.72 |

The remaining-tier sequence took 1,400.10 seconds. Its separate record is
`tmp/x07-statement-settings/remaining-tiers.json`, with log
`tmp/x07-statement-settings/remaining-tiers.log`. The corrected strict
recheck is `tmp/x07-statement-settings/typecheck-corrected.log`.
This is **not** represented as a green completed full-gate invocation: the
single full-gate invocation failed; its type-only defect was fixed and all
checks subsequently passed without retrying that invocation.

The reader subsequently authorized a fresh full gate on the final tree and
commit/merge/push only on green, plus X-07 closure, X-06 second-part landing and
unscheduled X-08 rollup coverage. This supersedes the earlier no-retry instruction
for this explicit final validation. The fresh gate result is recorded below. Diagnostic scripts and raw plans remain under ignored
`tmp/x07-statement-settings`.


## Reader-authorized fresh full gate — failed

The final-tree `npm run check` ran once under the reader's explicit new
authorization. It stopped after the normal suite, in **1,226.06 seconds**:

| Tier | Result |
|---|---|
| Strict and conformance typechecks | Passed |
| Lint and boundaries | Passed |
| Production build / review-route exclusion | Passed |
| Route conformance | 59 checks passed; 54/54 routes, zero findings |
| Normal domain/integration | **1 failed, 1,982 passed; 218/219 files passed** |
| Browser/MCP smoke | Not reached |

Failure: `test/dashboard-read-model.test.ts:45`, RED-019, expected two queries
and one prompt for today but received zero. The fixture chooses the real UTC
date and inserts runs at **01:00 UTC** on that date (line 32), while
`readDashboardModel` independently uses the real current-time cutoff
(`src/app/dashboard/read-model.ts:39`). The test ran shortly after midnight
on **21 October UTC**; its inserted runs were in the future. The injected noon
TestClock belongs only to PostgresDashboardReader and does not control the
client composition's wall clock. The summary correctly excludes future runs;
the fixed expected mode counts are a date-dependent harness defect. This cause
was checked read-only; no test/product change, clock manipulation or retry was
used to obtain a passing record.

Full log: `tmp/x07-statement-settings/final-full-gate.log`; copied result:
`tmp/x07-statement-settings/final-full-gate.json`. The earlier full gate's
failure and subsequent individual-tier passes remain recorded above.

**No commit, merge or push.** The conditional landing authority was not
satisfied. Backlog closure/merged statuses were not applied: their prepared
text, including unscheduled X-08 rollup coverage, is retained in
`tmp/x07-statement-settings/master-backlog-ready.md`. The master backlog is
unchanged. The loaded endpoint measurements remain valid; the failed test did
not change the candidate or the recorded measurements.


## RED-019 correction and newly authorized final validation

The reader authorized correcting RED-019 and a fresh full gate, followed by
commit/merge/push and the drafted backlog updates only if it passes. Dashboard
composition now accepts an injected current-time function; its default remains
the existing wall clock. The fixture shares a fixed clock with server readers,
seeds relative times and proves identical results under 00:10/23:50 UTC host
clocks. Focused validation passed (two files, five tests).

The [test-tree audit](red019-test-clock-audit.md) inventories 90 remaining
wall-clock matching lines in 45 files, distinguishing fixture inputs from real
timing checks and an intentional negative control. Only RED-019 was fixed.
The prepared backlog now includes unscheduled H-06 with the fixture list.
The historical failed gate above remains a failed record; the new final gate
result will be recorded separately.


## Final full gate — passed

The newly authorized `npm run check` ran once on the completed candidate and
exited 0 in **1,461.41 seconds (24m21s)**. No retry was needed.

| Tier | Result | Seconds |
|---|---|---:|
| Strict typecheck | Passed | 33.20 |
| Conformance typecheck | Passed | 8.42 |
| Lint / boundaries | Passed | 18.06 |
| Production build / review-route exclusion | Passed | 2.62 |
| Route conformance | 59 passed; 54/54 routes, zero findings | 157.91 |
| Normal domain/integration | 219 files, 1,984 tests passed | 1,204.71 |
| Browser/MCP smoke | Sign-in → pool → row filter → authenticated query → receipt passed | 36.45 |

Both RED-019 host-clock cases passed in this full gate. The gate ran against the
uncommitted candidate based on `5245596`; its JSON therefore records that base
commit, not a subsequently created commit. Only this validation record was added
after the gate; implementation and tests were unchanged.

Log: `tmp/red019-clock/full-gate.log`; copied machine result:
`tmp/red019-clock/full-gate.json`. Prior failed invocations remain historical
failures. The passing result satisfies the reader's conditional landing
instruction and authorizes the drafted X-06/X-07, X-08 and H-06 backlog updates.
