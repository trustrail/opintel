# Needs-you validation

The read-only projection follows technical documentation §5.38a and NY-001–007.
Five focused integration tests exercise real tenant scopes, public HTTP cursor
handling and immutable lifecycle/review facts. An initial fixture omitted a row
decision actor; that fixture was corrected before the completed-candidate gate.
The first focused bootstrap also named Docker tags absent on this host; subsequent
runs use the exact images of the already-running Redis and SpiceDB services.
No product datastore or timing assertion was replaced.

The first full gate was interrupted after its typechecks, lint, artifact check
and all 59 conformance checks passed. Source-worker review found that its actual
connection-failure status is `unreachable`; the candidate's check projection
omitted it. That record is retained in
[needs-you-gate-interrupted.json](needs-you-gate-interrupted.json). Regression
coverage now includes both unreachable connections and the latest failed
introspection with a previously connected source. This is a changed candidate,
not a retry of the same failing tree. No commit was made from that gate.

The next full gate is **failed**, not green:
[retained result](needs-you-gate-failed.json). All 2,203 normal tests in 261 files,
all 59 conformance checks and the earlier four tiers passed; the final smoke
exceeded its 30-second test deadline. Wall time was 2,216.98 seconds. The retained
trace shows backend fixture construction consumed about 9.77 seconds inside the
user-path deadline; initial navigation consumed 7.22 seconds. The row decision
was saved, and the MCP call began about 28.66 seconds into that deadline. No
needs-you endpoint was called. The private trace/context are retained under
`tmp/console-backend-work/needs-you-gate-2-failure/`.

The changed harness provisions and closes only its backend infrastructure in
beforeAll/afterAll hooks, each retaining the existing 30-second default bound.
The continuous browser/MCP scenario remains 30 seconds, retry count zero, with
all original assertions and real database/Engine/MCP calls unchanged. This does
not change any normal-test hang guard or behavioral timing assertion. A focused
verification and a new full gate on the changed candidate are still required;
the prior passing tiers are not substituted for that new gate.

The revised smoke passed its focused verification: user path 10.7 seconds,
35.7 seconds including setup/runner. A subsequent full-gate attempt stopped in
preflight after 5.65 seconds, with **zero tiers started**, on the Redis worker's
unchanged five-second limit. [Retained record](needs-you-gate-preflight-failed.json).
Do not infer that the timeout diagnosed a product defect or memory exhaustion.
A separate Redis probe after cleanup completed in 2.71 seconds.

Inspection found two normal-service containers left by the earlier deliberately
interrupted gate. Those exact owned fixtures were removed. The launcher now
assigns a unique run ownership label to normal-service/browser fixtures, and the
parent performs bounded label-scoped fallback cleanup even if a child never
reaches its finally. Cleanup failure makes the gate red. Five ownership tests
passed, plus an actual Docker proof removed the labelled fixture and preserved
an unrelated sentinel; both synthetic proof fixtures were then disposed.
[Proof result](gate-container-ownership-proof.json). No service deadline,
behavioral assertion, tier, retry policy or shared installation was changed.

The next changed-candidate gate also **failed**:
[retained result](needs-you-gate-normal-failed.json), run
`7292502f-cab9-4329-b787-292881d99ea1`, candidate index tree
`8a787b0fae0cd326379261e210e27888c9e10056`. Strict typechecks, lint,
production-artifact exclusion and all 59 control-conformance checks passed.
Normal tests reported 2,207 passed and one failed across 262 files; all five
needs-you tests passed. The failure was the ten-second `beforeEach` database
reset in `test/evidence-export.test.ts`, case “ndjson evidence export must not
silently omit persisted release events (credential revoked)”. The test body
did not run. The browser/MCP smoke tier was not reached. Wall time was
2,263.664 seconds. Gate-owned database cleanup succeeded and no owned
containers remained for fallback cleanup.

No reset-blocker diagnostic was retained for this failure. The observer emits
blocker evidence for PostgreSQL lock-timeout failures, whereas this result is a
Vitest hook timeout. Therefore neither a lock blocker nor host exhaustion is
established as its cause. Docker available memory stayed above the gate's
one-GiB bound (recorded minimum 1,269,518,336 bytes). The private full log is
`/private/tmp/console-needs-you-gate-4.log`. No timeout was increased, no
unchanged-candidate rerun was started, and no backend item was committed from
this failed gate. Dependent backend items remain pending.

The first-hour baseline predates the subsequent source-secret decision and is
not an acceptance of that decision. The release harness still needs conversion
to the approved standalone Postgres fixture and Engine package `./sources add`
write path before it may count as customer-install acceptance. Gateway source
registration remains reference-only. The approved Engine command must support
hidden interactive password entry plus a private password-file path for the
noninteractive acceptance; neither path may expose credentials in output,
logs or process arguments. Browser-to-Engine sealed provisioning and folder-drop
demo provisioning remain design/backlog work, not an implementation here.

## Targeted commit authorization (2026-10-29)

The operator explicitly requested no full gate for this prompt and authorized a
branch commit after needs-you tests, the reset-hook test file, lint and strict
typecheck. This supersedes the full-gate requirement for these commits; the
failed full-gate records above remain failed.

[Reset diagnosis](reset-hook-diagnosis.json): on ALTAIR.local, Intel
MacBookPro14,2, Docker memory limit 4,104,384,512 bytes, the entire evidence-export
file passed three isolated runs (14 tests each). The formerly failing reset hook
took 1,514.127 ms, 929.382 ms and 847.237 ms. The maximum reset across each file
run was 2,058.353 ms, 1,067.992 ms and 1,062.601 ms. A temporary diagnostic runner
measured the existing first beforeEach hook, preserving its body and metadata;
the hook and ten-second limit were not edited. Under the operator's decision
rule this is **environment load**; reset diagnosis stops here. No cause beyond
that is asserted and no reset fix is proposed or applied.

Targeted commit checks passed: needs-you (five tests), gate-container ownership
(five tests), evidence-export (14 tests on each of three isolated runs),
`npm run lint` and `npm run typecheck`. No full gate was invoked for this prompt.
The branch is `feat/console-needs-you-first-hour`; it is not approved for merge.
