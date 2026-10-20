# X-05 — batch MCP session validity sweeps

Branch `x-05-batch-session-sweeps`, off landed main `cf5c608`. No connection caching,
configuration caching, pool-size change or modification to item 1.4.

## Why 11,720 acquisitions

The fixed one-second timer in `McpHttpServer.start` invokes `refresh`. Its
non-overlap guard skips a tick while the previous refresh is still running.
The old refresh enumerated every live session and called configuration.read:
one platform transaction for project timing/archival, then one tenant transaction
for pool modes/current key validity. Every session paid both acquisitions even
when no ping was due, and even when it shared a key with another session.

The measured run had **20 initialized sessions**: ten ordinary agent clients and
ten separate custody clients. These are visible as 20 completed initialize calls
in the capture and in the custody-agent launcher. 293 sweeps × 20 sessions × two
acquisitions = **11,720**, or **39.07 acquisitions/second**. It was not ten
sessions acquiring 39 connections per second. Counts are repeated checkouts,
not distinct sockets.

The one-second timer dates to item 5.5 (`6f253f3`), combining session validity,
mode-change notifications and heartbeat scheduling. It is an inherited scheduler
choice, not a heartbeat requirement: heartbeat defaults to 20 seconds and may be
5–60 seconds. It remains one second here to preserve the existing idle-session
closure/mode-notification delay. Every HTTP method still independently
authenticates current committed state before dispatch; a revoked key's next
request fails immediately, without waiting for the sweep. Idle transport closure
is tick-driven and includes database/scheduling latency; it is not claimed to be
instantaneous at commit.

## Batch boundary and revocation

One nonempty sweep now calls `readMany` once. A single `withPlatform` transaction
calls migration 081's narrow `read_mcp_session_states(uuid[])` worker function.
It reads all known session keys, joins their project/pool/credential bindings and
returns only valid identifiers, current modes and heartbeat/grace settings.
It excludes archived projects, revoked credentials, revoked/expired keys, future
keys and retiring keys whose grace ended. The adapter checks each returned tuple
against its already-authenticated principal and validates timing with Zod.

The function has a fixed safe search path and no public/tenant execute grant.
It grants the internal platform role only EXECUTE, not broad table access.
This is the existing narrow key-resolution/cleanup worker pattern, not a change
to tenant scope roles, RLS, transactions, acquisition or release. No key material,
aliases, hashes, prefixes, customer values or source metadata is returned.

No validity survives a sweep. The next sweep queries again; mutations need no
invalidation hook, including changes made through another operator, host or API.
Missing/invalid records close their sessions. An infrastructure failure or
incomplete batch closes the snapshot's transports rather than retaining previous
validity. A result cannot close a session newly authenticated with a rotated key
or overwrite freshly authenticated modes; an invalid result for the same key
still closes it even if another HTTP request refreshed the principal object.

## Reconcile the previous missing third

Use acquisition-start timestamps in the exact previous 300-second window,
04:12:31.233–04:17:31.233 UTC on 2026-10-20. Join acquisition request IDs to
completed HTTP records; no unknown/requestless work is silently discarded.

| Acquisition class | Count |
|---|---:|
| Agent query | 5,646 |
| Agent explain | 3,997 |
| Agent describe | 2,268 |
| Agent redeem | 161 |
| MCP response/control POSTs | 840 |
| Console | 366 |
| Engine reconciliation HTTP callbacks | 20 |
| Product background workers | 13,234 |
| **Receipt observer — test harness** | **3,003** |
| **All acquisitions** | **29,535** |

The previously reported query + console + background subtotal was **19,246**.
The remaining **10,289 = 3,997 + 2,268 + 161 + 840 + 20 + 3,003**.
Only **3,003** of that remainder is receipt-observer work, **10.17%** of all
acquisitions. Product acquisitions excluding that observer were **26,532**.
The observer polls run evidence through the API to verify outcomes; it is not
Dashboard traffic or a production background job. The 840 control acquisitions
were 280 POSTs with three acquisitions each, consistent with authenticated MCP
ping responses. The new capture labels protocol responses explicitly.

Quantiles select HTTP arrivals inside the window and count their complete drain;
this class table selects checkouts inside the window. Those distinct boundaries
explain why some old per-request table totals differ slightly from this table.
No cache or row was discarded to force reconciliation.

## Repeat measurement

Final interval: **2026-10-20 04:54:30.114–04:59:30.114 UTC**, exactly 300 seconds.
Same ten agents, two cedant pools, rate 750 ms, seed 1, custody enabled, real
Engine, receipt checks and one signed-in Dashboard tab. No demo reseeding,
credential rotation or policy edits were performed for this measurement.

**294 completed nonempty sweeps each checked 20 sessions, ten distinct keys,
one project, and used exactly one acquisition.** No sweep failed closed.
MCP-sweep acquisitions were **294 / 300 seconds = 0.98/second**, versus
**11,720 / 300 = 39.07/second** previously. The timer is still nominally one
second; scheduling/DB latency explains fewer than 300 executions. The captured
sweep start/end timestamps and checkout timestamps independently reconcile one
checkout per sweep; this is not just an assertion based on the implementation.

All acquisitions whose checkout began inside the window:

| Acquisition class | Previous | New |
|---|---:|---:|
| Agent query | 5,646 | **6,329** |
| Agent explain | 3,997 | **4,508** |
| Agent describe | 2,268 | **2,544** |
| Agent redeem | 161 | **161** |
| MCP protocol responses | 840 | **840** |
| Console | 366 | **335** |
| Engine reconciliation HTTP callbacks | 20 | **20** |
| Product background workers | 13,234 | **1,859** |
| **Receipt observer — test harness** | **3,003** | **3,369** |
| **All acquisitions** | **29,535** | **19,965** |
| **Product subtotal excluding receipt observer** | **26,532** | **16,596** |

Every acquisition is accounted for. The receipt observer is **16.87%** of the
new total, versus 10.17% previously. Its absolute load grew with the number of
queries verified. It is not folded into agent-query acquisitions, console
traffic or background work. Product scope here means the simulated agent/API
workload excluding the receipt observer, not a claim that the workload's mix of
agent calls represents a customer production mix.

Full-request distributions select HTTP arrivals inside the window, then include
all their checkouts through drain. These totals therefore differ slightly from
the checkout-window class table above. Median is the ordinary sample median;
p95 is nearest rank. Refusals are included.

| Request class | Requests | Full-request acquisitions | Median | p95 | Worst |
|---|---:|---:|---:|---:|---:|
| Agent query | **421** | **6,332** | **15** | **22** | **25** |
| Agent explain | 424 | 4,516 | 11 | 13 | 13 |
| Agent describe | 424 | 2,544 | 6 | 6 | 6 |
| Agent redeem | 23 | 161 | 7 | 7 | 7 |
| MCP protocol response | 280 | 840 | 3 | 3 | 3 |
| Console | **87** | **340** | **4** | **5** | **5** |
| Engine reconciliation | 10 | 20 | 2 | 2 | 2 |
| Receipt observer — test harness | 843 | 3,372 | 4 | 4 | 4 |

Agent-query distributions remain **15/22/25**, versus 15/22/25 immediately before
this change and 23/32/36 before query-read batching. Console remains **4/5/5**.
The driver reached 421 query calls in the window versus 372 previously; this
is the same duration/rate/seed, not an artificially fixed count of successes.
Console server arrivals were **87 / 300 = 0.2900 requests/second**, versus 94
previously. Browser initiation counted 92; five requests begun in the final
0.6 seconds arrived just after the cutoff. Those exact paths/timestamps are in
the browser/API artifacts, not discarded as lost requests. Across cold setup,
window and drain the browser made 120 API requests. There were zero Dashboard
HTTP errors and zero individual run-detail fetches. No console cadence changed.

The remaining background breakdown is **294 MCP sweep + 886 presence sweep +
649 release cleanup + 30 completion recovery = 1,859**. All were read-only
in this interval. No unlabelled background work remains.

| Pool waiting observation | Previous | New |
|---|---:|---:|
| Nominal one-second samples | 293 | **293** |
| Samples with waiting callers | 29 | **29** |
| Maximum waiting count | 10 | **8** |
| Sum of sampled waiting counts | 97 | **86** |

New waiting histogram: 0:264, 1:12, 2:4, 3:2, 4:4, 5:1, 6:4, 7:1, 8:1.
The frequency of sampled waiting did **not** fall. The sum is sampled queue
occupancy, not distinct queued requests; shorter queues can occur between
samples. Waiting describes the measured mixed workload, **not a counterfactual
product-only capacity estimate**. Receipt verification was retained rather than
skipped to make queues look smaller. No pool-sizing conclusion is drawn from
harness load. The pool still has ten connections.

All 19,965 interval acquisitions: **16,439 read-only (82.34%), 1,059 write-only
(5.30%), 2,467 both (12.36%)**. Excluding the read-only receipt observer:
**13,070 read-only, 1,059 write-only, 2,467 both = 16,596 product acquisitions**.
Agent queries had 4,500 read-only, 546 write-only and 1,283 both; console had
335 read-only and no writes. These retain the earlier statement-reference
classification, not physical I/O accounting.

## Validation

**49 distinct focused tests pass across eight files**, including migration
up/down/up and permissions, real SDK revocation/failure/rotation races, query,
credential lifecycle, table grants and SQL diagnostics. Strict typecheck and
unchanged lint pass. No scope.ts diff, new route, pool-size change or cache.

The initial focused bootstrap correctly refused to run before 081 was applied
to the test database. The first actual run passed 48/49 tests: the expiry
fixture attempted grace before creation, rejected by the existing constraint.
After correcting that, its malformed-timing fixture was also correctly rejected
by the database. The final fixture represents an old expired key and injects
malformed adapter output for the boundary test, without disabling either
constraint. That test file then passed all four tests. Production code and
migration 081 were unchanged by these fixture corrections. Passing initial
files and the targeted rerun cover all 49 tests; they are not represented as a
single all-green initial run.

**Soak PASSED**, exit 0: zero invariant breaches, zero operational errors,
zero skipped receipt checks, 130 verified custody values and zero custody
refusals. Scenario coverage **56/85** is reported as partial, not release-complete.
Whole-process outcomes including drain: 352 success, 14 dependency_unavailable,
19 element_withheld, 25 unsupported_on_aggregate_only, 14 entitlement_missing.
All 19,965 interval scope records committed. Zero failed/unfinished acquisition
records, unmatched selected HTTP requests, non-null DB request IDs without HTTP
records, unmatched acquisition classes, unknown access or opaque-function records.

The authorized query-read batching branch passed its full gate once in 1176.32s
(1,928 tests/213 files, 59 conformance checks, one smoke), then merged/pushed as
`cf5c608e3ed90527fba60aabb74af6e50e5f5ce5`. This sweep follow-up passed its full gate once in **1361.23 seconds**:
strict production/conformance typechecks, unchanged lint, production-artifact
exclusion, all 59 conformance checks, **1,937 tests in 215 files**, and the one
browser/MCP smoke path. No tier was retried. Landing is authorized after that
passing gate; the subsequent thirty-minute run is recorded separately.
Migration 081 was applied to the isolated test and local development databases.

Local artifacts, ignored by Git:

- `tmp/diag/2026-10-20T04-51-22.925Z.jsonl`
- `tmp/soak/2026-10-20T04-54-25.384Z-42844.jsonl`
- `tmp/x05-sweep/measurement.json`, `baseline-classes.json`, `browser-coverage.json`
- `tmp/x05-sweep/analyse.py`, `analysis-output.log`, `run.mjs`, `browser.json`
- `tmp/x05-sweep/focused-initial.log`, `focused-recheck-fixture.log`, `focused-recheck.log`
- `tmp/x05-sweep/typecheck.log`, `lint.log`, `soak.log`, `full-gate.log`

The owned browser/API/Engine/console processes are stopped and the temporary
observer cookie removed. Docker services and recorded evidence remain in place.
