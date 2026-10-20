# X-05 second branch — batch query reads

Branch `x-05-batch-query-reads`, off main after first-branch landing `ff30f7e`.
The measurement was presented before the reader authorized the full gate and
landing. Item 1.4, including acquisition/release and the
ten-connection pool, is unchanged. No configuration cache or connection reuse.
Any future reuse needs separate authorization: request-and-role keyed leases,
each scope opening its own non-nested transaction, aborted connections discarded,
and an admin-then-app request test proving admin-only data stays inaccessible.

## What changed

The original compilation already fetched all column decisions in a single SQL
snapshot; there was no application loop fetching one decision per element.
This branch folds row-scope decisions, pool existence and pool limits into that
same tenant read. The separate platform reads before and after compilation still
guard policy/catalogue version changes. Query preparation no longer reacquires
the pool just to fetch its limits.

The repeated catalogue references came chiefly from source routing: its source
read recomputed whether any column had a tokenized entitlement, although query
routing used the compiled plan's tokenized flag. Routing now fetches its source
set and assigned Engine metadata together, without that unused entitlement scan.
Every query phase still performs a fresh batch; none of these results survives
the call. Parser-only health retains its per-source refusal/fallback behavior.

An Engine is probed once per routing batch. Its health update still matches the
probed address, certificate pin and name, and now returns the updated record;
the preliminary duplicate Engine read and post-update singleton read disappear.
A concurrent edit causes the guarded update to return no record and refuses.
Tokenized routing reads current key metadata once per batch and attests each
distinct Engine. Execution retains its independent current-key/version check.
Existing probe-in-flight coalescing and failed-probe cooldown are unchanged;
there is no new persistent cache.

Evidence writes and their transaction boundaries are unchanged. Existing
background cadences are unchanged; opt-in diagnostic labels identify their jobs.

## Measurement

Final interval: **2026-10-20 04:12:31.233–04:17:31.233 UTC**, exactly 300 seconds.
The first branch's selection is repeated: requests arriving at the server inside
the interval, with their full acquisition drain included; global access-split
and queue figures cover the interval itself. Ten agents, two cedant pools, rate
750 ms, seed 1, custody enabled, real Engine and one signed-in Dashboard tab.
Existing demo state was used without reseeding, key rotation or policy edits.

| HTTP request class | Requests | Full-request acquisitions | Median | p95 | Worst |
|---|---:|---:|---:|---:|---:|
| Agent `opintel.query` | **372** | **5,646** | **15** | **22** | **25** |
| Console | **94** | **368** | **4** | **5** | **5** |
| Agent `opintel.explain` | 376 | 4,011 | 11 | 13 | 13 |
| Receipt observer | 751 | 3,004 | 4 | 4 | 4 |
| Other agent transport/tools | 682 | 3,275 | 6 | 6 | 7 |
| Engine reconciliation reports | 10 | 20 | 2 | 2 | 2 |

The console generated **94 API requests / 300 seconds = 0.3133 requests/second**;
its previous mixed-load capture had 87 (0.2900/second). Console per-request
acquisitions are unchanged. There were zero console HTTP errors and zero
per-run detail fetches. Browser initiation also counted 94 inside this interval;
120 browser requests across cold setup, window and drain are not relabelled as
five-minute server arrivals. All classes together generated 2,285 HTTP requests.
Medians are ordinary sample medians; p95 uses nearest rank. Counts include
recorded refusals, rather than selecting successful answers only.

Baseline query acquisitions: median **23**, p95 **32**, worst **36** (345 calls).
Console: median **4**, p95 **5**, worst **5** (87 calls). Of all 33,664
acquisitions, 30,817 were read only, 751 write only and 2,096 both.

The baseline's roughly nine catalogue references per query was an all-traffic
table total divided by the query count. Correlated governed query requests
actually referenced catalogue/entitlement relations in 2, 4 or 6 acquisitions
(median 4); explain and other traffic contributed to the original numerator.
Relation references are logical SQL references, not physical I/O measurements.
In the new capture, **all 372 governed queries reference each of catalog_object,
catalog_element and entitlement in exactly one acquisition**. The count is
independent of the pool's column count, also checked by the 500-column test.

All **29,535 acquisitions begun in the interval**, versus 33,664 previously:

| Access | New acquisitions | New share | Previous acquisitions | Previous share |
|---|---:|---:|---:|---:|
| Read only | **26,394** | **89.37%** | 30,817 | 91.54% |
| Write only | **911** | **3.08%** | 751 | 2.23% |
| Both | **2,230** | **7.55%** | 2,096 | 6.23% |

By request class, using the same acquisition-start window: agent queries had
**4,024 read-only (71.27%), 483 write-only (8.55%), 1,139 both (20.17%)**,
5,646 total. Console had **366 read-only (100%), zero write-only/both**.
Two further console acquisitions belong to selected requests but began during
drain, explaining 366 interval checkouts versus 368 full-request checkouts.
Background had 13,234 read-only acquisitions and no writes in this window.
Read/write flags retain the first branch's statement-reference definition;
RETURNING does not turn an UPDATE into a separate read acquisition. Run mix
is not identical in count: the faster run reached 372 query calls versus 345.


Baseline pool sampling: 292 samples at a nominal one-second cadence, 90 with
waiting callers, maximum waiting count **28**, sum of sampled waiting counts
**1,275**. That sum is not the number of distinct requests queued; scheduling
delay means there were fewer than 300 samples. The new report uses the same
sampling method.

| Pool waiting observation | Previous | New |
|---|---:|---:|
| Samples | 292 | **293** |
| Samples with waiting callers | 90 | **29** |
| Maximum waiting count | 28 | **10** |
| Sum of sampled waiting counts | 1,275 | **97** |

New waiting histogram: 0:264, 1:7, 2:8, 3:4, 4:3, 5:3, 7:1, 9:2, 10:1.
These are sampled queue depths, not a distinct-waiter count or a claim that
no shorter queues occurred between samples. The pool still has ten connections.

## Background work

The old capture had **12,967 background acquisitions (38.52%)**. Their shapes
were 5,854 project-only reads; 5,720 pool/key reads; 708 presence reads; 588
release-grant references; 69 project/member discovery reads; 20 introspection
completion reads; and 8 credential/key alias-cleanup reads. Fourteen acquisitions
also wrote release-grant state. No background acquisition referenced `engine`.

MCP session refresh reads project timing and current pool/key validity for every
session every second. This detects committed revocations/mode changes from other
hosts and sends heartbeats; request authorization independently rereads current
state. Presence aging runs every five seconds, enumerates projects and current
agents, then locks/ages each presence row. Release cleanup runs every second,
handles due grants/escrows and periodically retires legacy aliases. Introspection
completion delivery recovers durable events every thirty seconds. The new
capture's bounded job labels distinguish these directly rather than assigning
the old project-only/discovery reads by inference. Foreground Engine reads are
request-time routing, readiness verification and token-key checks.

The new labels account for **all 13,234 background acquisitions (44.81% of all
acquisitions)**:

| Worker | Acquisitions | What the work is |
|---|---:|---|
| MCP session refresh | **11,720** | 5,860 project-timing reads and 5,860 current pool/key-validity reads; revocation/mode-change detection and heartbeat scheduling |
| Presence sweep | **900** | Project discovery, timing settings, active-agent lists and per-agent locked aging checks |
| Release cleanup | **584** | Due-grant/escrow cleanup and periodic legacy-alias retirement checks |
| Introspection completion | **30** | Project discovery and durable completion-event recovery |

There are **zero unlabelled background acquisitions** and **zero background
Engine reads**. The background percentage grew while total foreground
acquisitions fell; the workers were not removed or slowed in this branch.
Session validity checks are access-control/revocation work, not merely cosmetic
health polling. Presence aging is the separate five-second job. Their continued
competition for the same pool is visible in the remaining queue counts.

## Validation

**86 tests passed in 8 files**: the new compilation/routing batch tests plus
unchanged Engine registry, entitlement read, MCP query/explain, policy-version
and row-entitlement suites. Strict typecheck and unchanged lint passed.
`git diff -- src/platform/db/scope.ts` is empty; no pool or wrapper lifecycle
change. No migration, route or stylesheet change.

**Soak PASSED**, exit 0: zero invariant breaches, zero operational errors,
zero skipped receipt checks, 130 verified custody values, zero custody refusals.
Scenario coverage was **48/85**, not complete release coverage. Whole-process
outcomes including drain: 329 success, 10 dependency_unavailable,
22 unsupported_on_aggregate_only, 15 element_withheld, 3 entitlement_missing.
Refusals remain recorded. All 29,535 interval acquisitions committed; zero
failed/unfinished acquisitions, zero unmatched selected HTTP requests, zero
non-null database request IDs missing an HTTP record, zero unknown access or
opaque-function records.

Raw and derived local artifacts, ignored by Git:

- `tmp/diag/2026-10-20T04-10-31.526Z.jsonl`
- `tmp/soak/2026-10-20T04-12-26.320Z-32001.jsonl`
- `tmp/x05-second/measurement.json`, `tmp/x05-second/coverage.json`
- `tmp/x05-second/analyse.py`, `tmp/x05-second/analysis-output.log`
- `tmp/x05-second/run.mjs`, `tmp/x05-second/browser.json`
- `tmp/x05-second/focused.log`, `typecheck.log`, `lint.log`, `soak.log`

The owned browser and measurement services are stopped; the temporary observer
cookie is removed. Docker services and recorded evidence remain in place.
Landing validation: **the full gate passed once in 1176.32 seconds**: strict
production/conformance typechecks, unchanged lint, production-artifact exclusion,
59 conformance checks (54/54 routes, zero findings), **1,928 tests in 213 files**,
and the one browser/MCP smoke path. No tier was retried. The reader authorized
commit, merge to main and push after this result.
