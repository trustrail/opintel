# E-06 — attributable custody preparation failures

## Enforcement and oracle clarification

The prior rename changed exactly three properties in execute.ts: initial null,
missing-decision zero, and assignment of the existing staging COUNT(*), from
entitledRows to returnedRows. Its source read, pushdown, filtering, treatment,
COUNT(*), staging and governance behavior were unchanged. Comparing the parent
file after substituting the property name reproduces the landed file exactly.

The additional IS NOT NULL correction was in the soak oracle only. That query
predicate is not pushed by the existing Engine translator: it runs in the outer
query after governed rows are staged. The harness predicts the unchanged scan
count separately from the filtered final answer count. Equality predicates that
are pushed use the declared query expectation; joins/aggregates retain per-input
scan expectations. No change in which rows are staged accompanied that oracle fix.

Historical normalization uses a strict union: current records require returnedRows;
legacy records require entitledRows and map its value. Each required field is
nullable, without a default. Explicit null remains null, zero remains zero;
a scope missing both keys fails validation, and conflicting dual-key records
also fail. Absence of rowScopes as a whole remains absence. No stored record is
rewritten. E06-COMPAT proves these cases through the actual evidence reader.

## Cause preservation

Caught failures retain the preparation phase, bounded provider identity, safe
exception type/native code and sanitized application source frames in the
execute-refusal stage's releaseFailure field. XQ's disposable worker previously
also discarded causes; it now forwards bounded HTTP refusal/status, unreachable,
deadline and worker-failure classes. No provider body, URL, recipient, credentials,
key shares, row values or raw native message is retained. Unrecognized native
codes remain null rather than being copied into evidence.

Authorized detail reads and evidence exports expose releaseFailure. The MCP
refusal whitelist excludes it: the agent's content, metadata, retryability and
failure code remain exactly as before. No result, release grant or delivery is
created by these failures. Existing cleanup and buffer-zeroing remain unchanged.
There is no new logging of native messages or customer data.

## Validation

E06-001 exercises the real worker against controlled HTTP 412, disconnected and
unanswered peers (including a response whose headers arrive but whose body stalls). E06-002 injects escrow and grant-issue exceptions and checks
the committed refusal stage and exact MCP response, including secret rejection.
E06-COMPAT covers historical missing versus null/zero fields. Full gate follows
focused validation on the completed candidate; no retry is authorized.

Pre-gate body-deadline check initially expected the native fetch deadline, but
this runtime reached the existing 20-second worker watchdog instead. Evidence
correctly identified worker_deadline_exceeded. The diagnostic test now accepts
either actual deadline source for a stalled body, while still requiring its
precise kind in durable evidence and the unchanged complete refusal. No timer
or enforcement assertion was changed. The initial failure remains in
`tmp/e06/body-deadline-focused.log`.

Pre-gate validation: strict typecheck and unchanged lint passed. **22 distinct
focused tests** pass across the evidence export, historical count compatibility,
custody refusal and XQ contract files. The final six-test refusal recheck includes
both deadline paths and preserves the initial failed expectation's log.
Full gate result will be recorded after its single completed-candidate run.

## Completed-candidate gate

**PASSED once in 1213.80 seconds**: strict production/conformance typechecks,
unchanged lint, production-artifact exclusion, all 59 conformance checks,
**1,947 tests in 217 files**, and the browser/MCP smoke path (23.4 seconds).
No full-gate tier was retried. Log: `tmp/e06/full-gate.log`. Post-gate edits only
record validation and mark E-06 resolved; implementation remains the tested tip.
