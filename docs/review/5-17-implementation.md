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
bounded read batches, with one run aggregate per write transaction. Detail and export reads use a single statement snapshot to avoid
inconsistent parent/child reads during ageing. The query-mode writer leaves CIL
and generated SQL null; prompt composition remains outside this item.

Earlier migration tests now remove the new dependent schema inside rollback-only
transactions before testing their own down/up cycles. The settings migration test
addresses its migrations explicitly instead of assuming they are the latest two.
Their behavioural assertions remain intact.

## Verification

Final verification is in progress.

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
because the pinned Chromium binary is absent; Docker will supply that binary.
Strict typecheck and lint pass. Build passes with the existing bundle-size warning.
Final full-suite, browser comparison and bypass results will be recorded below.
