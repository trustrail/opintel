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
closed-enum exception type and allowlisted native code in the
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

## Follow-up: exclude error-derived text from evidence

The later read-only audit found that the original E-06 field retained sanitized
stack frames. Although the native message was not copied directly, stack frame
coordinates came from untrusted exception text, including potential multiline
message content. That was insufficient for a bounded-only evidence guarantee.

The follow-up removes stacks entirely and removes E-06's use of the exception
logger sanitizer. Exception classification uses built-in identity, never `name`,
`message`, `stack`, `detail`, `constraint` or `cause`. Native `code` is compared
against the exact closed allowlist; unknown codes and classes become null.
Type is also a closed enum. The XQ worker forwards only a closed failure kind and an integer
HTTP status (100–599), never its error body or exception text. The existing
human refusal remains fixed authored text, independent of the exception.

The evidence detail and export readers both pass through `detailRecord` and
the shared boundary schema. That schema strips legacy exception stack/message
properties and maps unknown type/code strings to null before serialization; it does
not modify stored evidence. There is no new diagnostic in the agent response.

Read-time stripping is a mitigation, not removal: historical records still hold
their original exception text in storage. The existing data is demo data, so this
has no customer exposure here. A production deployment that ever wrote such
records would need the affected stored evidence purged through an explicitly
authorized incident procedure. Filtering reads alone is insufficient. No stored
evidence is purged or rewritten by this patch.

E06-002 asserts no access to native message/name/stack and null for unknown
classes/codes; E06-003 asserts legacy text removal and bounded decoding. No
validation was run during the initial confirmation-only audit. The user has now
authorized one full gate on this completed tightening, followed by merge/push
on green and rebuilding/restarting the development stack from that merge.

The pre-gate focused run passed five tests and failed four accessor assertions:
V8 read the message while the fixture replaced its lazy stack property. Install
the stack override before the instrumented message/name accessors so only query
path access is measured. No production change was needed for this fixture defect.

## Tightened-candidate gate

**PASSED once in 1215.28 seconds**: strict production/conformance typechecks,
unchanged lint, production-artifact exclusion, **59 conformance checks**,
**1,950 normal tests in 217 files**, and browser/MCP smoke (23.8 seconds).
All nine E06-001/002/003 tests passed inside this gate. No tier or full gate was
retried. Log: `tmp/e06/allowlist-full-gate.log`. Only validation documentation
changed after the green gate; production code and test assertions are unchanged.

Development handoff: rebuild the frontend and start fresh API, Engine supervisor
and Vite processes from clean merged main, with OPINTEL_DIAG=1. The local launcher
records the merged commit, diagnostic source hashes and fresh process IDs in
`tmp/e06/allowlist-runtime.json`, after Engine mTLS health, API and frontend checks.
This prevents the next soak from using the old E-06 evidence-writing process.
