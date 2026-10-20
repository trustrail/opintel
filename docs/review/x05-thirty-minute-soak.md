# X-05 — thirty-minute ten-agent Dashboard run

Measured main tip: `979bb243b51e51d890509a67805aee14376e28a4`.
Interval: **2026-10-20 05:37:14.454–06:07:14.454 UTC**, exactly 1,800 seconds
(01:37:14–02:07:14 America/Toronto). Ten agents, both existing reinsurance demo
cedant pools, 750 ms rate, seed 1, OPINTEL_DIAG=1, real Engine, custody enabled,
and receipt observation enabled. No reseeding, policy edits, key rotation,
connection reuse, pool change, reserve or caching was added before/during the run.
Item 1.4 remained unchanged. Pool maximum remains ten.

## Landing and earlier branch

`x-05-batch-session-sweeps` passed its full gate once in **1361.23 seconds**:
strict production/conformance typechecks, unchanged lint, production-artifact
exclusion, 59 conformance checks, **1,937 tests in 215 files**, and one
browser/MCP smoke path. No tier was retried. It was committed, fast-forward
merged to main and pushed as `979bb243b51e51d890509a67805aee14376e28a4`.
Log: `tmp/x05-sweep/full-gate.log`.

`x-05-diagnostics-and-console-failures` was already committed, gated, merged
and pushed as **`ff30f7e05e85819bd9bb994616eb342466959d1d`**. Git ancestry confirms
it is included in the measured main tip. Its gate passed once in 1197.83 seconds
(1,923 tests/211 files, 59 conformance checks, one smoke). Its landed source
includes the 30-second application deadline, caller cancellation, separate
network/invalid-JSON/unexpected-error-envelope/success-schema-mismatch messages,
and fetched-at/refresh-in-flight display. No second landing was necessary.

## Console result

**The Dashboard remained usable for the full interval. No console failure time
or browser failure screen occurred.** Chrome was launched with `headless:false`,
with one signed-in Dashboard tab at 1440×1000, brought to the front. The runner
kept that tab on the Dashboard throughout the workload and drain. It did not
reload, navigate away, manually refresh, restart or recover the page during the
run. Every 30 seconds it checked the Dashboard heading and route, clicked
Collapse menu, observed Expand menu, clicked it, and observed Collapse menu.
These interactions do not issue additional data refresh requests.

**60/60 in-window interactive probes passed**, plus one before agent startup
and one after drain: **62/62 total**. Across all probes, menu-pair interaction
latency was median **548 ms**, p95 **1,103 ms**, worst **2,296 ms** (including
Playwright actionability checks). No step reached its five-second timeout.
There were **zero console HTTP errors, zero API request failures and zero page
errors**. Periodic screenshots were inspected; the Dashboard retained its as-of
display and showed Refreshing during requests. Its five-minute configuration
refreshes advanced the timestamp without recovery actions.

**518 console API requests arrived in the interval: 0.2878 requests/second**,
versus the original 3.8/second baseline (92.4% lower). Browser initiation also
counted 518 in-window; total browser count including cold load/drain was 544.
The current capture is under agent load, not an idle-only reproduction.

## Pool waiting and event-loop delay

The existing one-second sampler recorded **1,748 pool samples** over 1,800
seconds. **117 samples had waiters (6.69%)**, with **peak sampled queue depth 11**.
The sum of sampled queue occupancy was **298**. This sum is not 298 distinct
queued requests: a waiter may span samples, and between-sample peaks are not
observable. The histogram is retained in `measurement.json`. Waiting includes
the receipt observer's harness traffic; it is not a product-only capacity test.

Event-loop monitoring uses 20 ms resolution and resets its histogram each
nominal one-second interval. Across **1,748 intervals**:

| Measurement | Milliseconds |
|---|---:|
| Mean of interval means | 40.66 |
| Median interval mean | 38.21 |
| p95 of interval means | 60.63 |
| Median interval p99 | 135.79 |
| p95 of interval p99 | 273.15 |
| Worst observed delay | **807.40** |

These are distributions of interval summaries, not an invented pooled global
p99. Scheduler/DB delay accounts for fewer than 1,800 nominal samples.

## Acquisitions and full accounting

Counts below select acquisition starts in the exact 1,800-second interval.
All **115,568 acquisitions** reconcile. Product acquisitions excluding the
receipt-observer harness were **96,274**; observer acquisitions were **19,294**.

| Acquisition class | Count |
|---|---:|
| agent describe | 14,334 |
| background | 12,187 |
| agent explain | 25,835 |
| agent query | 35,902 |
| receipt observer | 19,294 |
| engine reconciliation | 118 |
| mcp protocol response | 5,220 |
| console | 2,032 |
| agent redeem | 646 |
| **All** | **115,568** |

Background: **1,746 MCP validity sweeps**, **5,370 presence sweeps**, **4,891
release cleanups**, **180 introspection completions**. All 1,746 nonempty MCP
sweeps completed, each checking 20 sessions/ten keys/one project with exactly
one acquisition. No validity was cached.

Read/write split: **95,342 read-only (82.50%)**, **6,161 write-only (5.33%)**,
**14,065 both (12.17%)**. There were no unknown-access or opaque-function records.

For acquisitions per request, select HTTP arrivals in the interval and count
all their acquisitions through drain. This is a different boundary from the
checkout table above; boundary differences are retained rather than discarded.

| Request class | Requests | Median | p95 | Worst |
|---|---:|---:|---:|---:|
| agent describe | 2,389 | 6 | 6 | 6 |
| agent explain | 2,389 | 11 | 13 | 13 |
| agent query | 2,388 | 15 | 20 | 25 |
| agent redeem | 93 | 7 | 7 | 7 |
| console | 518 | 4 | 5 | 5 |
| engine reconciliation | 59 | 2 | 2 | 2 |
| mcp protocol response | 1,740 | 3 | 3 | 3 |
| receipt observer | 4,824 | 4 | 4 | 4 |

Agent-query median/p95/worst is **15/20/25**, against the original **23/32/36**
and preceding five-minute sweep run **15/22/25**. No further pool change was made.
There were **zero failed acquisitions, zero unfinished acquisitions, zero
unmatched selected HTTP requests, zero non-null database request IDs without
HTTP records, zero unmatched classes and zero unlabelled background work**.
All in-window scope transactions committed. No selected HTTP request had a 5xx
or transport-close status.

## Soak result: FAILED, exit 1

The Dashboard capacity condition was met using the existing ten-connection pool;
this run supplied no need for reserved capacity. **The soak itself did not pass**,
and its failed status is retained. The reader has accepted this run as the
**evidence closing X-05**: the console held for thirty minutes under ten agents
and reserved capacity was not required. E-09 and the separate custody finding
are tracked independently. Its assertions
and receipt requirements were neither weakened nor suppressed.

- Whole-process counters below include setup and drain. **2,389 query outcomes**: 2,110 successes; 67 dependency_unavailable;
  72 element_withheld; 95 unsupported_on_aggregate_only; 45 entitlement_missing.
  All ten agents ran through the interval (234–245 outcomes each).
- **84/85 declared scenarios exercised (99%)**. The unexercised scenario was
  `credential/retiring/custody`: the seeded retirement grace period had expired.
  This is disclosed scenario noncoverage, not a skipped receipt check.
- **94 custody offers/completions**, all reported successful, verifying
  **520 released plaintext values** against the seeded oracle. Custody
  refusals/skips: **0/0**. The summary's custody completion counters total 94.
- **166 invariant breaches**: **165 entitled-row-count mismatches** and
  **one declared scenario outcome mismatch**. Operational errors: **0**.
- **2,389 receipt observations**, verification active, receipt observer failure
  false, **zero skipped receipt checks**. The driver requires
  `checksSkipped === 0` for success; a nonzero value fails the process.

The row-count mismatches compare the seeder's total entitled-object count with
receipts for filtered queries: **75 expected 5/actual 1**, **90 expected 7/actual
1**. For example the recovery query at 05:45:09.136 UTC selects one recovery ID
and reports the count now named `returnedRows` as 1. The Engine currently counts the staged scan after
pushdown (`sidecar/execution/application/execute.ts`), whereas the soak compares
to the unfiltered fixture object count (`scripts/soak/reinsurance.ts`). This
identifies the discrepancy, not a decision to reinterpret or remove the assertion;
no fix or reclassification was made during/after the capture.

The declared mismatch was a custody scenario for a Cedant 02 credential:
query started **05:43:14.686 UTC**, duration **5,212 ms**, expected success,
actual **dependency_unavailable / release_prepare_failed**. Evidence identifier:
`01a157d5-e001-7be3-83d7-ff4194f3f988`. The captured response does not identify a
more specific cause. Other expected refusals are preserved in the outcome totals.

## Artifacts and cleanup

Raw local artifacts (ignored by Git):

- `tmp/diag/2026-10-20T05-35-40.862Z.jsonl`
- `tmp/soak/2026-10-20T05-37-09.383Z-52076.jsonl`
- `tmp/x05-thirty/measurement.json`, `summary.json`, `analysis-output.log`
- `tmp/x05-thirty/browser.json`, `browser-progress.json`, `browser-run.log`
- `tmp/x05-thirty/dashboard-probe-1.png`, probe-10/20/30/40/50/60 screenshots,
  `dashboard-wide.png`, `dashboard-narrow.png`
- `tmp/x05-thirty/run.mjs`, `analyse.py`, `api.log`, `engine.log`, `soak.log`

The browser closed after the completed run and drain. The temporary observer
cookie was removed; owned Engine and console services were stopped. Docker
services and recorded evidence were retained. No post-run implementation or
pool changes were made; this report is a local review artifact.

A separate **post-run idle failure** was observed on cleanup: the API had exited
on an unhandled pg Client `Connection terminated unexpectedly` error. The last
diagnostic timestamp was **09:12:26.802 UTC**, more than three hours after this
capture ended. This was outside the measured interval and after the Dashboard
browser closed at 06:07:24 UTC; it is not hidden inside the claim of a thirty-minute
usable console. No recovery or implementation change was made for it.

## Follow-up classification before E-09 implementation

All **165/165 row-count discrepancies are E-09; zero are another finding**.
Independent replay of every mismatching query's explicit `recovery_id` equality
against the seeded eligible rows produces one expected row, matching its receipt.
75 alarms compare whole-pool 5 versus query/receipt 1; 90 compare whole-pool 7
versus query/receipt 1. The complete per-alarm ledger is
[x05-row-count-classification.csv](x05-row-count-classification.csv), with original
JSONL line numbers, query, pool, oracle counts and classification.

Correlation uses pending query/scope/count tuples rather than assuming the nearest
preceding record is its query. Concurrent writes create five points with two
equivalent pending candidates; FIFO assigns query identities in the ledger. Both
candidates independently satisfy E-09 in every case, so that ordering ambiguity
does not affect any alarm's classification. No query obligation or alarm is left
unmatched. The local replay script and detailed results are
`tmp/x05-thirty/classify.py` and `row-count-classification.json`.

The single declared custody mismatch is **E-06 recurring, fourth appearance**,
not missing credential association. Its response carries only
`cause=release_prepare_failed` and the generic provider-check message. The
missing-association branch separately returns
`reason=certificate_association_missing` and an explicit register-association
message; neither occurs here. The captured failure therefore passed through
`QueryRelease.seal`'s catch (query-release.ts:37), which discarded the exception.
The underlying provider/network/database cause cannot be reconstructed from this
capture. It remains a real finding; no E-06 fix is included in the E-09 rename.
