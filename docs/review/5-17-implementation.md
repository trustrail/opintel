# Item 5.17 — Evidence lifecycle

Full evidence ages into a per-run rollup in the same transaction that removes the
full aggregate. Incomplete headers remain. Rollup expiry uses its creation time
and the greatest of the current full window, current rollup window and the floor
recorded at creation. Unset windows preserve their corresponding records.
Activity, detail and both export formats distinguish rollups from full records;
exports use source-only counts so derived deliveries do not inflate disclosure.

The writer redacts request arguments before committing the header. Maintenance
rewrites historical request/generated-SQL arguments and appends the time, fields
and exact policy to the run. Application privileges remain append-only. Narrow
maintenance functions own redaction and retention; invoker read views preserve
RLS. Downgrade refuses to erase irreversible redaction, sampling or rollup facts.

Sampling pins both percentage and selection at open. Only successful runs can
omit detailed stages and source plans; headers, completions, element delivery
facts and source-contact provenance remain. Refusals and failures always retain
detail. The database also rejects a failure completion claiming omitted detail.

API startup provisions partitions through UTC month +3 before listening. An
hourly, non-overlapping job repeats provisioning, then redaction and retention in
bounded read batches, with one run aggregate per write transaction. Detail and
export reads use a single statement snapshot to avoid inconsistent parent/child
reads during ageing. The query-mode writer leaves CIL
and generated SQL null; prompt composition remains outside this item.

Earlier migration tests now remove the new dependent schema inside rollback-only
transactions before testing their own down/up cycles. The settings migration test
addresses its migrations explicitly instead of assuming they are the latest two.
Their behavioural assertions remain intact.

## Verification

**Final full suite: 137 files passed; 1,357 tests passed; zero failures**
(479.57 s), with browser work stopped. This supersedes the initial full run
below. Migration down/up tests are included. All database verification used the
isolated test database; development data was not migrated or cleared.

The first full run completed with 1,353 passes and four failures (594.50 s):
ING-17 timed out while browser setup overlapped it; the new rollup table lacked
the required `tenant_write` policy name; the explicit grants inventory lacked the
two new tables; and the new rollback test passed a JavaScript Date that truncated
its fixture header's timestamp microseconds. The corrections add an explicitly
denying `tenant_write FOR INSERT WITH CHECK(false)` policy, declare the exact new
grant contracts, and preserve the fixture timestamp as PostgreSQL text. No grants
were broadened to satisfy the policy-name check. Retention was also tightened to
one run aggregate per write transaction.

The corrected isolated regression passed **26 tests in five files** (22.13 s),
including Q-025–Q-027, atomic rollback, migration down/up, grants, RLS and both
export formats. ING-17 subsequently passed alone with its original timeout and
assertions: **2 matching checks passed, 11 nonmatching tests skipped** (52.39 s).

Initial pinned-Docker visual run: **8 passes and 1 pass on retry**; the retry was
the 1440px settings navigation exceeding its test deadline. All 390/900/1440
rollup screens passed axe and overflow assertions. The narrow rollup list and
detail images were inspected. Host functional browser execution could not start
because the pinned Chromium binary is absent; the final Docker run supplied it.

**Final browser comparison: 13 passed, zero retries** (1.4 minutes), using bundled
Chromium 153.0.8010.12 in the pinned Playwright container. This includes functional
loading/empty/error/incomplete states, axe, overflow and 390/900/1440 snapshot
comparisons for Activity, record detail, rollups and Settings. No CSS class was
added and the master stylesheet was unchanged.

After the full suite, the sole implementation addition was a
`(project_id, created_at, id)` index for ordered rollup expiry. Migration 052 was
reverted and reapplied in the isolated database, then the **final 26-test focused
regression passed again** (16.71 s), including its down/up and rollback checks.
The full suite was not repeated for this index-only addition.

**Complete bypass gate: 97 passing checks, zero registered open checks, zero
regressions.** Strict typecheck, lint, production build and diff checks passed.
The build retains the existing bundle-size warning. These are completed results;
no verification run is pending.


## Migration delivery correction

The expiry index added after the full run is now delivered by forward migration
**054**. Published 052 is unchanged. Forward migration 053 separately fixes the
049 policy delivery error that had blocked the development database from reaching
052 at all. See [the migration correction report](049-migration-correction.md).

## Forward-provisioning availability correction

Provisioning and retention now have independent hourly timers and non-overlap
guards. A retention pass that never settles cannot prevent provisioning.
Provisioning waits at most 10 seconds in its own code. Because the hand-written
scope exposes no cancellation, the underlying database operation remains
single-flight after a timeout; retries do not accumulate stuck requests. No
scope-wrapper or migration changes were made for this correction.

Each provisioning attempt, including failure, measures contiguous attached
partition coverage across all four evidence tables. Measurement has its own
10-second bounded wait. `opintel_evidence_partition_horizon_months` reports full
future UTC months; below two raises a ticket condition, missing current-month
coverage raises a page condition, and failed/timed-out measurement invalidates
the gauge and raises an unknown-horizon ticket condition. Actual range bounds
are inspected, so a gap cannot be hidden by a later partition or a detached
similarly named table.

The telemetry port defaults to structured logs. These are alert events, not
external notification delivery. Item 1.15 explicitly owns receiver wiring and
missing-hourly-observation detection; the receiver is a deployment decision.
The absent production supervisor is recorded under S5 in deferred.md.

Verification: a freshly created disposable database migrated through 054 and
passed **14 tests in four files** (14.90 seconds), including lifecycle regression
and a real PostgreSQL catalog observation. An additional cannot-measure timeout
test was then added; the final scheduler/health unit run passed **9 tests in two
files**. Existing development and isolated test databases were not reset. Lint
and strict typecheck passed. No full or bypass rerun was needed for this change
to maintenance scheduling and telemetry.
