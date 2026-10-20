# E-09 — returnedRows receipt contract

The reader chose a field rename with no measurement change. New row-scope
receipts use `returnedRows`: each governed source scan's staged row count after
pushed query predicates, before outer joins, aggregation and final result limits.
The count can therefore differ from final answer cardinality. Null means no
count was measured; missing scope still measures zero. The decision identifiers,
hash, referenced names and provenance retain their existing meanings and give
administrators the link to the immutable entitlement scope.

The Engine's COUNT(*) and scan/pushdown/filter paths are unchanged. The shared
strict Zod schema drives Engine, MCP, Activity and evidence-export contracts;
its inferred RowScopeReceipt type and generated Engine OpenAPI use returnedRows.
The console labels it returned rows. Privileged preview entitled counts are
separate and unchanged.

Historical evidence is not migrated or rewritten. The evidence reader alone
accepts the former stored key and normalizes it to returnedRows for list, detail
and CSV/NDJSON export. Current wire boundaries reject the legacy key, including
conflicting dual-key receipts, so a mixed Engine/Application deployment fails
contract validation rather than silently guessing.

The soak compares single-object declared queries with their own seeded expected
count. Composed IS NOT NULL projections retain the eligible input scan count because
that predicate is not pushed into the source scan; their filtered final answer
count is verified separately. Joins and aggregates retain independent per-input scan expectations,
not their final output count. No expected count comes from an actual response.
The original thirty-minute run is retained as FAILED; no capture or result is
rewritten into a pass.

## Classification and separate custody finding

All 165 alarms in the X-05 capture are E-09; zero are another row-count finding:
75 whole-pool 5/query 1/receipt 1, and 90 whole-pool 7/query 1/receipt 1.
The complete per-alarm ledger is [here](x05-row-count-classification.csv).

The single declared custody mismatch is E-06 recurring, fourth appearance. It
used QueryRelease.seal's generic catch path and discarded its exception; it did
not return the distinct missing-certificate-association reason. No E-06 fix is
included in this rename. See [the committed closure evidence](x05-thirty-minute-soak.md).
X-05 is closed by the reader's acceptance of the thirty-minute usable console;
that does not turn the separate custody finding into a pass.

## Validation and scope

Pre-gate validation passed: strict typecheck, unchanged lint and **48 focused
tests across six files**. Tests cover query-filter narrowing without changing
the governance decision, null/missing counts, declared and composed oracle
expectations, joins and aggregates, legacy wire rejection, historical list/detail,
sampling/retention and both export formats with stored evidence unchanged.
The full gate **FAILED** in **1231.16 seconds** at its final smoke assertion:
`e2e/smoke.spec.ts` still expected “5 entitled rows”, while the console correctly
rendered “5 returned rows”. All **1,942 normal tests in 216 files**, 59 conformance
checks, strict typechecks, unchanged lint and artifact exclusion passed.
The stale smoke expectation was corrected; the direct browser/MCP smoke then
**passed (20.1 seconds)**. The original failed full-gate record is preserved in
`tmp/e09/full-gate.log`; the focused correction is in `tmp/e09/smoke-corrected.log`.
The reader explicitly authorized **one fresh full gate, then merge/push if it
passes**, after receiving the failure and correction report. The failed record
will not be replaced or described as a pass.

This is a **different candidate**, not a smoke-only correction. After the failed
gate, exhaustive historical replay exposed an oracle edge: the Engine does not
push IS NOT NULL into the source scan, so six scan receipts legitimately retain
all eligible rows although the final answers filter them. The oracle and its
unit test now retain the expected scan count, with the existing final-answer
check still enforcing the filtered result. An additional real PostgreSQL/Engine
regression proves three scanned rows versus two final rows under a non-pushed
null predicate. No Engine measurement or pushdown behavior was changed.

Other changes since the failed gate are the smoke text assertion, oracle call
signature, related README/test-specification/review wording, and normalization
of the CSV ledger's line endings (the 165 case facts are unchanged). Specifically:
`e2e/smoke.spec.ts`, `scripts/soak/scenarios.ts`, `scripts/soak/reinsurance.ts`,
`test/row-scope-receipt.test.ts`, `test/staging-source.test.ts`,
`scripts/soak/README.md`, `docs/test-specification.md`, this review document, and
`docs/review/x05-row-count-classification.csv`.

Historical replay covers **2,176 scope facts from 1,879 recorded queries**:
165 mismatches under the former whole-eligible-set comparison, **zero** under
the corrected independent per-scan expectation. This replay does not turn the
original failed soak or its E-06 finding into a passing live run. Results:
`tmp/e09/replay.json`; replay script: `tmp/e09/replay.ts`. The corrected
oracle/source tests passed **22 tests in two files**, including the new real
scan-versus-final-count regression; strict typecheck also passed again.

The external partner brief is explicitly excluded by the reader's follow-up.
No external original was modified. Use the changed-file list to keep it in step;
there is no claim that a partner-facing artifact was updated here.

The thirty-minute report and classification ledger were committed separately as
`f751cbc` before the rename. No tenant-wrapper, connection lifecycle, pool sizing,
caching, applied migration, evidence mutation, refusal or custody changes are
part of this branch.

## Authorized fresh gate result

**PASSED in 1203.16 seconds**: strict production/conformance typechecks,
unchanged lint, production-artifact exclusion, all 59 conformance checks,
**1,943 normal tests in 216 files**, and the browser/MCP smoke path. Log:
`tmp/e09/full-gate-fresh.log`. This was the one fresh gate expressly authorized
after the failed first run; neither result was overwritten or reclassified.
The fresh candidate includes the additional oracle correction and regression
described above, not just the smoke assertion change. Post-gate edits only
record this result and mark E-09 resolved.

## Complete changed-file list

- `docs/algorithm-specifications.md`
- `docs/implementation-plan.md`
- `docs/master-backlog.md`
- `docs/review/e09-returned-row-receipts.md`
- `docs/review/row-scoping-design-position.md`
- `docs/review/v01-ten-agent-conformance.md`
- `docs/review/x01-duckdb-binding-upgrade.md`
- `docs/review/x05-row-count-classification.csv`
- `docs/review/x05-thirty-minute-soak.md`
- `docs/slice1-technical-documentation.md`
- `docs/test-specification.md`
- `e2e/smoke.spec.ts`
- `scripts/soak/README.md`
- `scripts/soak/reinsurance.ts`
- `scripts/soak/scenarios.ts`
- `sidecar/execution/application/execute.ts`
- `sidecar/openapi.json`
- `src/app/activity/detail.tsx`
- `src/modules/evidence/infrastructure/read.ts`
- `src/modules/mcp/application/query-preparation.ts`
- `src/shared/row-scope-contract.ts`
- `test/evidence-export.test.ts`
- `test/evidence-lifecycle.test.ts`
- `test/reinsurance-conformance.test.ts`
- `test/row-entitlements.test.ts`
- `test/row-scope-receipt.test.ts`
- `test/staging-source.test.ts`
