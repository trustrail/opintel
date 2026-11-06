# ARCH-01 — pooled gateway/engine HTTP/2

Branch from main a15d35f; no cloud access. Work in progress, no completion claimed.

## Measurement plan and baseline provenance

The retained f1887d1 amd64 archives and published manifest remain available.
`git diff f1887d1..main -- src sidecar scripts/operator/customer-install.ts
deploy/engine deploy/engine-package` is empty at branch creation. They are an
HTTP/1 gateway/engine baseline equivalent to current main for the transport
under investigation. Their archive and image identities remain f1887d1; they
are not relabelled as a newer release.

The committed standard Stage-5 harness gains `--transport-benchmark`. After the
soak and browser checks finish, the ordinary custody extension performs its
existing checks, then 50 public verify calls and 50 shipped kit queries over the
same first-hour fixture. It records the first 50 completed calls in that isolated
window for /execute, /custody/attest and /health. Failed/missing calls stay failed
or not exercised, never silently replaced by successful samples. p50/p95 are
nearest-rank values over the successful selected calls; a pass needs 50/50 on
each path. Legacy HTTP/1 attempt metadata is grouped by callId, including retry
backoff, while HTTP/2 uses the per-call summary. Complete private API logs are
streamed to disk using the existing capture helper, without the subprocess
string-buffer truncation limit. Result artifacts retain only metadata.

The companion image is prepared before the fresh SMTP sign-in and benchmark,
keeping build time out of that window. Its actual source revision is recorded
separately from the gateway archive revision. Custody/companion assertions stay
at the end of acceptance. No scenario or receipt assertion is removed.

## Required design

Use Node's built-in http2, not a second HTTP library. Packaged Node is pinned by
its existing upstream image digest. Inspecting that pinned runtime image on this host reports NODE_VERSION=22.23.4; Node core http2 adds no separately versioned dependency.
Retain hostname/CA validation, mTLS and an explicit certificate pin check before
any HTTP/2 stream is written. Pools must be separated by pinned TLS identity;
a session authenticated under a different pin/client identity is never reused.
Per-call deadlines include waiting for stream capacity. Written streams never
replay; only pre-write connection failures may retry with bounded jitter.

Owner added six install-time settings with defaults: max sessions 1, stream
concurrency 32 (bounded by peer SETTINGS), idle timeout 60000ms, maximum age
600000ms, connect timeout 5000ms, ping interval 15000ms, two missed pings before
reconnect. Max sessions only grows above one when stream capacity is exhausted.
Settings are validated at startup. These are configuration, not new egress.

There is no implemented metrics endpoint. Owner directed latency summaries into
the existing engine health read and Settings engine panel: count, p50, p95 and
last by path; no new network endpoint. Use existing console foundations only.

Baseline harness validation: benchmark parser, companion acceptance wiring and
release/XQ contract files passed 10/10 tests; final parser/preparation-order
checks passed 5/5. Repository lint and changed-script syntax checks passed.
Unused build-cache cleanup reclaimed 5.32GB; host free space reached 11GiB.
Development Postgres and Redis remained healthy. Required SMTP/XQ setting names
and all four identity exports were present (no values were printed).

## HTTP/1 baseline attempt — failed, not retried

The standard invocation was:

```sh
PLATFORM=linux/amd64 RELEASE_MANIFEST=tmp/release-f1887d1-published.json STAGE4_PROVIDER_ENV=.env node scripts/images/stage5-smoke.mjs tmp/cloud-f1887d1-archives --candidate --duration-seconds 120 --transport-benchmark
```

Retained run: `tmp/stage5-acceptance-awBfUg/result.json`; host log:
`/private/tmp/arch01-h1-baseline.log`. Started 2026-11-06T02:27:42.302Z.
Install, identity import, pairing, SMTP relay and owner sign-in passed. First-hour
engine verification returned HTTP 503 at 02:47:18.285Z. Its `/health` transport
call recorded four failed connect attempts, no TCP/TLS completion and no request
write. Attempt 1 took 1015ms; attempt 4 ended at the caller deadline with
ABORT_ERR. Retained gateway log lines 294–523 contain the phase records and
`engine.probe_refused` (stage transport, phase connect).

The first-hour flow stopped before any latency selection or custody extension.
Thus before p50/p95 are **not measured**, not zero; no successful-call samples
are substituted, and this baseline acceptance has not been rerun. The retained
records establish a connect-stage failure, not its underlying network cause.
The uncommitted H2 product draft did not enter the immutable f1887d1 application
archives used by this run.

### Established baseline harness cause and correction

The retained installation has different authoritative addresses:
`gateway/state/peer.json` retained the original LAN address, while
`gateway/state/output/peer.json` and `gateway/state/paired-engines/peer.json`
contain the same-host Docker route. Stage 5 read the former at its first-hour
registration step; the API/console use the latter projection mounted through
INSTALLATION_PAIRING_FILE. The standard harness now reads that projection,
with no fallback to the original LAN address. FH-008 proves that distinction
with two different fixture addresses and refuses an absent projection. This
is a harness input correction, not a transport or application fix. It explains
which different target was used; the earlier phase log alone did not establish
the underlying host-network failure.

The benchmark parser and first-hour contracts passed 7/7 after this correction.
The broader installer/packaging/transport/settings/cleanup batch passed 66/66,
including DEP-008 and the real non-root archive/runtime checks. Strict typecheck
passed before the subsequent scope-isolation hardening; it will be rerun on the
completed tip. Repository lint passed before that hardening. No full gate has
run yet. Per-path health summaries are scoped by project as well as engine/pin;
sharing one pinned connection never shares one project's counters with another.

The corrected first-hour driver also honours the engine auto-attached by the
public project-creation API: it checks its listed address and pairing pin,
then verifies it instead of issuing a duplicate registration. When no engine
was attached, it still registers through the public engine API. Both branches
are exercised by FH-009; the final first-hour/parser batch passed 9/9.

Session limits include draining sessions. Age rotation begins at the configured
age even while a stream is active; new streams wait for capacity while written
streams drain under their own deadlines. This preserves the one-session default
without replay or unbounded replacement connections. Debug phase capture is
opt-in with `LOG_LEVEL=debug` in package.env. Measurements use production-default info summaries, not an artificially verbose debug run.

The benchmark query explicitly reads `id, token_id`, ordered only by the clear
id. In benchmark mode the standard custody fixture prepares that token column
through the public declaration/entitlement APIs and initializes its token key
through the existing API when absent. This is necessary to generate real
`/custody/attest` samples: engine verification alone does not attest a key, and
a clear-only query would leave the requested attestation measurement empty.
Outside benchmark mode the custody acceptance fixture is unchanged.

### Canonical-engine baseline candidate — source route stop

`tmp/stage5-acceptance-nr0ZLs/result.json` stopped at source-connected. Engine
verification, custody designation, project settings and source registration
passed. The failing `/test-connection` completed DNS at 03:54:45.536Z, TCP at
.539Z, TLS at .545Z and write at .546Z; the API aborted the response at
03:54:54.451Z (8921ms total). Engine logs 683–744 show one source lease, a
10000ms source-connect allowance, ETIMEDOUT at 03:54:55.668Z and lease release.
The source Postgres log has no corresponding incoming remote connection.
These records locate the failure after the gateway/engine handshake; they do
not identify the underlying host-network reason.

Stage 5 still passed the Mac LAN address to the external source and to
container-side gateway clients. The existing console-first-run-install harness
uses host.docker.internal for those same Docker Desktop paths. Stage 5 now
uses that established route on macOS for both; Linux retains its explicit host
address. Source container/network, published port, reference import, policy,
public registration and SQL assertions are unchanged. No application timeout
or egress permission is changed to accommodate the fixture. FH-010 covers the
platform distinction. This is a new corrected harness candidate, not a gate
retry. Both earlier runs remain failed; neither produced latency samples.

The complete Docker Desktop caller-route correction passed 10/10 first-hour
and benchmark-parser tests; repository lint and changed-script syntax checks
passed. The route matches the pre-existing console-first-run-install harness
for container-side public gateway access as well as the ordinary source. The
LAN address remains the installation host identity used for pairing; only
local caller routes select the established Docker Desktop alias.

## Current targeted validation

The completed product source passed strict typecheck and repository lint. The
final targeted batch passed 164/164 across 17 files: source/engine contracts,
V-01, custody wire confidentiality, outage/supervision, cancellation, scoped
latency metadata, Settings, customer install/upgrade, DEP-008 and cleanup. The
unchanged sidecar HTTP file passed 18/18 in isolation (13.03s total): the real
SIGTERM case took 2.854s and wire/execution case 0.403s. Earlier 10s-startup and
3s-request deadline failures did not reproduce in that idle run; their cause
was not retained well enough to establish. No guard was raised for them.

The final transport file passed 22/22, including whole-connection and stream-only resets after write, and aborting one pending-connect
waiter while another completes on the same authenticated session. The final
harness/parser contracts passed 11/11. Public verify-call timings are retained
separately from private /health timings so an API verification measurement is
not misrepresented as only its network hop. A caller failure forces the
benchmark result to fail even if old HTTP/1 metadata lacks an HTTP status.

Remaining before completion: corrected HTTP/1 measurement candidate, completed
tip gate, fresh H2 archives/acceptance, 10-minute soak and after measurements.
No gate or candidate acceptance is claimed yet; no cloud host was contacted.


## Corrected HTTP/1 baseline — blocked by XQ enrollment

Candidate f0b22f2 ran the exact Stage-5 command above, retaining
`tmp/stage5-acceptance-EBDV8P/result.json` and
`/private/tmp/arch01-h1-baseline-docker-route.log`. The archives and product
images are still the immutable HTTP/1 f1887d1 baseline, not H2 candidate images.

Installation, four identity imports, pairing, real SMTP, fresh owner sign-in,
engine verification, source connection and scan, pool/table/row decisions and
all six column treatments passed. At the first MCP query the agent kit exited
nonzero: `MCP initialization: gateway refused the request (HTTP 401) ·
unauthenticated / identity_unproven`. This is retained in `024-first-hour.log:1`.

Gateway log lines 4428–4429 record the enrollment escrow subscription subcall
from 2026-11-06T05:11:50.119Z to 05:11:51.693Z, HTTP 200, written true. Its
validation subcall ran from 05:11:51.791Z to 05:11:55.683Z, status null,
written false. Lines 4431–4439 record the identity_unproven refusal, no bound
fingerprint and no completed challenge state. Public identifiers/identity labels
are intentionally omitted from this report. The diagnostic record is emitted
by `src/modules/release-custody/infrastructure/xq-provider.ts:16`; subcall
classification is in `xq-worker.mjs:37`.

Evidence establishes an unfinished XQ enrollment subcall on the unchanged
baseline. It does not establish whether DNS, TCP, TLS or the remote provider
caused it; no native failure code or phase is present in those records. This
is not evidence of an H2 regression. Under the standing blocker rule, stop
here: no provider workaround, no substitute step, no repeated packaged run.

The H2 product candidate and its six startup-validated settings are committed
and pushed as f0b22f2. Targeted validation is as recorded above. No completed
before/after latency samples, H2 packaged acceptance, ten-minute soak or full
gate are claimed. The full gate has not run. These remain outstanding; the task
is incomplete. No cloud host was contacted and nothing was merged.


## Owner-authorized HTTP/1 rerun — stopped before enrollment

Owner requested one fresh baseline rerun after the XQ stop. On branch tip
1f65402, the same standard Stage-5 command above ran from the beginning with
immutable f1887d1 archives. Retained artifacts:
`tmp/stage5-acceptance-my25Zg/result.json`, `gateway-services.log`,
`engine-services.log`, and `/private/tmp/arch01-h1-baseline-owner-rerun.log`.
The harness exited 1; no product/config changes or substitute steps were used.

Gateway/engine install, all four identity imports, pairing, real SMTP and fresh
owner sign-in passed. This attempt failed earlier: first-hour verify-engine
returned HTTP 503. Gateway log lines 205–281 retain one /health call
931990b3-1975-44a7-b034-8f7da7e72f44 with these UTC timestamps:

| Phase | Timestamp | Measured duration |
|---|---|---|
| Attempt start | 2026-11-06T05:32:26.059Z | — |
| DNS complete, address returned | 05:32:26.080Z | 20.638 ms |
| TCP connected | 05:32:26.088Z | 8.077 ms |
| TLS complete / request written | not recorded; both null | — |
| Failure | 05:32:35.066Z | 9007.141 ms total |

The failure is phase tls, native code ABORT_ERR, written false, aborted true.
Only one attempt is recorded. Log lines 277–288 record probe and verification
refusals. The retained engine log contains no /health request record. These
records establish a TLS-phase deadline abort, not its underlying cause.

Enrollment was never reached, so the prior XQ failure was neither reproduced
nor disproved. There are zero custody.xq_escrow_request diagnostics in this
run; there are no new XQ validation timings to report. The previous attempt's
validation timing remains 05:11:51.791Z–05:11:55.683Z (3892 ms), status null,
written false, attempt 2. Individual retry/connection phase timings were not
recorded by that diagnostic.

Stopped after this single authorized rerun. No further baseline, cloud access,
full gate, H2 acceptance or latency measurement was run. Await owner decision
on how to obtain the HTTP/1 baseline.


## Owner decision — resume H2 acceptance

The owner abandoned Intel HTTP/1 measurement as an environmental TLS stall.
Before/after latency will be measured on the cloud pair by the owner after
merge, not by this task. No local before/after numbers are claimed.

Resume the completed-candidate full gate, then the standard H2 packaged
acceptance with custody/companion checks and a ten-minute soak. The standard
Stage-5 harness now accepts `--transport-diagnostics`: it sets the existing
validated LOG_LEVEL=debug in the test installation, retains complete API phase
logs, and writes sanitized transport-diagnostics.json on success or failure.
The summary counts TLS deadline stalls, their phase timestamps/durations and
whether a later successful attempt on the same call recovered them. It does
not alter retries, deadlines, pin validation or written-request replay rules.
Successful calls with retries are counted separately; a retry is never assumed
to be a recovered TLS stall without a recorded TLS failure on that call.

Removed only the duplicate extracted images.tar files from the four failed
baseline lab directories. Original immutable tar.gz archives, all logs/results,
identity files and database/Docker volumes remain retained. Host free space
increased from 2.4 to 5.6 GiB. No cloud host was accessed.

Diagnostic capture targeted tests passed 12/12 across four files, including
DEP-008. Changed-script syntax and repository lint passed. The completed-tip
gate is next; no earlier full gate has run on this H2 candidate.


## Single completed-candidate gate — failed at conformance startup

`npm run check` ran once on d65c789313a07e5938c17f61c46eaba4ab2213f0.
Private log: `/private/tmp/arch01-h2-full-gate-d65c789.log`. Committed metadata:
`gate-d65c789.json` and `conformance-d65c789.json` in this report directory.
Total wall time 651.055s; cleanup succeeded.

| Tier | Result | Seconds |
|---|---|---:|
| Strict typecheck | passed | 54.151 |
| Conformance typecheck | passed | 11.661 |
| Lint | passed | 27.841 |
| Production build/artifact exclusion | passed | 9.663 |
| Router-derived control conformance | failed before tests | 503.078 |
| Normal tests | not run | — |
| Browser/MCP smoke | not run | — |

The first retained error is log line 83:
`Error: Timed out waiting 120000ms from config.webServer.`
The conformance report records 0/30 screen routes visited, not a completed
screen check. The build/preview startup command is in playwright.config.ts:31;
the existing startup guard is 120000ms at line 34. Dependency installation
completed, but the retained output contains no earlier build/route-registration
error or server-ready line. The underlying startup cause is not established.

Host available memory began at 1760972800 bytes, reached a recorded minimum of
844955648 bytes at 2026-11-06T12:21:10.689Z, with 130 samples and none missing.
This does not establish an OOM or explain the startup failure.

Stop after this single gate failure, with no tier or gate retry. Fresh H2
archives, packaged custody/companion acceptance and the ten-minute soak have
not run. TLS-stall recovery counts/timings for that packaged candidate are
not exercised, not zero. The opt-in diagnostic capture is committed for the
next authorized run. Cloud before/after latency remains deferred to the owner
after merge. No cloud host was accessed and nothing was merged.


## Owner-authorized continuation after Docker restart

Owner authorized restarting at conformance, then normal tests and smoke before
packaged acceptance and the ten-minute soak. Docker restart left development
PostgreSQL and Redis stopped; standard `docker compose up -d --wait
--wait-timeout 120 postgres redis` brought both to healthy. Host free space was
9.5 GiB.

The gate now supports explicit `--from TIER` selection, with unchanged service
preflight, fresh isolated migrated database, port isolation and teardown. It
records resumed scope and selectedComplete separately; complete is false for a
partial run. Unknown/ambiguous tier arguments refuse before running anything.
The prior failed record and its four passed tiers remain separate evidence.
This is a requested continuation, not an unreported full-gate retry.


## Docker-restart continuation result — normal tier failed

The owner-authorized standard continuation ran once on
6180f72ab6f9e560a69357eb002d0f07f4929007:

```sh
npm run check -- --from test:conformance
```

Retained private log: `/private/tmp/arch01-h2-gate-resume-6180f72.log`.
Committed run metadata: `gate-resume-6180f72.json`. Fresh migrated database and
normal teardown succeeded. The result explicitly records resumed scope,
selectedComplete=false and complete=false; the earlier failed full run remains
separate evidence.

| Selected tier | Result | Seconds |
|---|---|---:|
| Router-derived conformance | 40/40 passed; 30/30 routes; zero findings | 221.631 |
| Normal tests | 2361 passed, 3 failed; 275 passed files, 3 failed | 1487.688 |
| Browser/MCP smoke | not run after failed normal tier | — |

Total continuation wall time: 1718.753s. The previously failed 120s web-server
startup did not recur after Docker restart. This observation does not establish
its earlier underlying cause.

### Exact failed assertions

- `test/filing-register.test.ts:222`, ING-31/32 (887ms case, 14986ms file):
  console.info entries are checked against the ingest-only property allowlist;
  Object.keys(entry).every(...) returned false. The prior all-logs secret
  exclusion at line 220 passed. New transport info summaries are JSON strings
  emitted at `src/shared/infrastructure/engine-transport.ts:70`; this is a
  candidate explanation for the ingest-only spy failure, not an entry-by-entry
  diagnosis retained by the assertion.
- `test/mcp-query.test.ts:42`, E-10 child exit after health check 2 (1490ms case,
  40336ms file): expected source_unavailable / engine_registry, retryable true;
  received source_unavailable / sidecar_transport_failed, retryable true.
  The exact public cause changed in this observed race; no assertion is relaxed.
- `test/pool-key-route-schemas.test.ts:35`, I-003 (1763ms case, 1769ms file):
  GET /api/v1/projects/:id/provenance/:receiptId was rejected because each of the
  six steps contains facts.items.key. The scanner treats a property literally
  named key as potential credential exposure. The test and shared provenance
  schema are unchanged relative to main a15d35f. Main was not run in isolation,
  so an inherited failure is not claimed as established.

No code/test fix, additional run or normal-tier retry followed these failures.
The H2 transport file itself passed all 22 tests in this continuation. Packaged
acceptance, custody/companion checks and the ten-minute soak did not start.
Packaged TLS-stall retry counts/timings remain not exercised, not zero. The
owner's cloud before/after latency measurement remains deferred until after
merge. Nothing was merged and no cloud host was accessed.


## Approved three-defect correction and mandatory lab cleanup

- Execution client transport failures now use engine_registry, preserving
  parent/deadline cancellation and existing malformed-response classification.
  Native phase/reason remains in opt-in transport debug records. Historical
  refusal enums and issued receipts are unchanged.
- The ingest-only console spy was rejecting the new JSON transport info line.
  Its additional allowlist is EngineTransportCallSummary: fixed event, bounded
  path/outcome, UUID, timestamps and numeric timings/counts only. All-logs secret
  exclusion remains; arbitrary fields and value-like paths are rejected.
- Provenance's machine fact identifier is field, distinct from its display
  label. API projection, console, fixtures and contract assertions change
  together. The secret-schema scanner's assertions are not relaxed. No stored
  evidence, schema migration, route or permission is changed.
- Further targeted E-10 validation found the old session could be cut off before
  GOAWAY delivered. Host shutdown now allows graceful session close under its
  original deadline. Cancellation also destroys the abandoned response stream,
  so an active-SQL shutdown does not wait for an unfinishable H2 stream. Public
  cause and receipt assertions remain intact; unknown execution is never
  converted into a fabricated zero-use result.

The shared acceptance lab cleanup covers Stage 3/4/5, console archive acceptance,
image/runtime smoke and the ingress handshake proof. It removes only owned
resources, captures logs first, and fails acceptance on cleanup/retention errors.
Fresh package projects, run labels, private lab bind mounts and owned networks
cover the shipped one-shot commands too. Stage 5 deletes its named nested-Docker
volume, which removes that lab's internal containers, volumes and networks.
There is no keep-running bypass or global prune; old retained labs are untouched.
Pending console fixture work is awaited before cleanup so it cannot recreate
services afterward. Logs/results and immutable archives stay for review.

Initial correction testing passed 148/149; the remaining E-10 evidence assertion
led to the GOAWAY fix. Further shutdown/cleanup checks found abandoned streams
and unstarted unlabeled fixture discovery; these were fixed without raising
existing hang guards. Final MCP/sidecar/cleanup regressions passed 50/50. Other
contracts (provenance, secret scan, engine settings, first-hour, companion,
DEP-008) passed in the targeted batches. Console provenance/shared-record tests
passed 13/13. Strict typecheck, conformance typecheck, lint, changed-script syntax
and production artifact checks passed on the corrected source. Next: commit and
push, then the owner-requested normal/smoke continuation and fresh H2 acceptance.


## Corrected candidate validation and packaged stop (2026-11-06)

Evidence: on b8c71ba, `npm run check -- --from test` passed all 2,371 normal
tests in 279 files and the browser/MCP smoke (15.7 s scenario; 39.6 s suite).
This was the authorized staged continuation, not a single uninterrupted full gate.
The retained gate metadata is [gate-normal-smoke-b8c71ba.json](gate-normal-smoke-b8c71ba.json).

The standard candidate build, publish and customer-package commands completed:
all eight amd64 images published and all four audited archives built under
`tmp/arch01-b8c71ba-amd64-archives/`. Paths and SHA-256s are recorded in
[packaged-b8c71ba.json](packaged-b8c71ba.json).

The one fresh Stage 5 invocation used that published manifest, `--candidate
--duration-seconds 600 --transport-diagnostics`, and stopped at real-smtp-relay.
Gateway/engine install, four identity imports, pairing and permission checks
passed. The private relay log records mail.failed at 14:49:39.321 UTC,
ETIMEDOUT, responseCode null. It does not establish whether DNS, TCP, TLS or SMTP
greeting timed out. No owner sign-in, first receipt, custody/companion checks or
soak ran. Zero H2 calls were captured: TLS-stall recovery is not exercised.

Cleanup initially reported the nested Docker container and its data volume
removed. A wider audit found the relay's compose command used the outer daemon
and created one outer network. Its project label matched this fresh installation
and it had zero endpoints; it was explicitly removed and the project network
query then returned none. The initial result remains unchanged; the correction
is recorded separately. Stage 5 now explicitly runs the relay on the installed
nested daemon and tracks both package project names for cleanup. This fixes a
proven harness wiring/leak defect; it does not establish the SMTP timeout's
underlying cause or prove live delivery. No packaged retry followed the failure.

The correction passed 13 first-hour/cleanup tests, 3/3 provisioning-runtime tests, syntax and lint. An attempted
Node test-runner invocation of the Vitest provisioning suite was invalid; the
standard npm test invocation is the authoritative provisioning check. Local
sandbox IPC was denied before tests, so it was run with the required host access.
Before/after latency remains deferred to the owner's cloud pair after merge.
No cloud host was accessed and nothing was merged.


## Owner-authorized fresh acceptance rerun (no republish)

The standard Stage 5 command was repeated from the start on the existing b8c71ba
published manifest and four archives, using `--candidate --duration-seconds 600
--transport-diagnostics`. Run: `tmp/stage5-acceptance-0HIRZf`.

Evidence: real SMTP accepted the test message; fresh owner SMTP sign-in and the
first-hour flow through a receipt passed. All 200 XQ escrow/redeem round trips
passed. No SMTP timeout recurred. The earlier daemon-selection correction is
present, but this single pass does not establish the earlier timeout's cause.

Acceptance then failed: the soak's seed step exited 1, with ECONNREFUSED to its
configured source database endpoint (demo-soak.log line 40; retained
verification/output/failure-2026-11-06T15-20-14.320Z-19.log line 1).
The soak result records only seed/exitCode 1. The driver subsequently reported
its standard start timeout. The endpoint's refusal is established; its underlying
cause has not been diagnosed. No fix or further acceptance retry followed.
Browser, outage, traffic and final custody/companion checks did not execute.

Transport diagnostics retained 65 completed calls, zero failed attempts, zero
successful calls with retries and zero observed TLS stalls. Thus no retry was
needed in these completed setup calls; the ten-minute traffic proof is still
not exercised. Before/after cloud latency remains owner-run after merge.

Cleanup passed, removing two owned outer containers and the nested daemon's data
volume (which contains its internal applications/networks/volumes). Subsequent
queries found no run-labelled containers/volumes or gateway compose network.
Logs and results remain on disk. See
[packaged-rerun-b8c71ba.json](packaged-rerun-b8c71ba.json).

The harness now retains a private nested container list and state-only inspect
snapshot on an SMTP-phase failure, before service logs and teardown. This avoids
retaining container environment secrets in the state snapshot; existing gateway,
engine and mail fixture logs remain private. At real-smtp-relay the SMTP server
is external, not the later local Mailpit fixture, so there is no local mail daemon
container to inspect at that step. No archive or image was rebuilt or republished.

Capture/packaging contracts passed 11/11; syntax and lint passed. Lint initially
rejected a throw in the finally block; cleanup now records that failure and
continues teardown. No product code changed in this round.


## Seed refusal diagnosis and harness-only correction

EVIDENCE-01 was canceled by the owner after confirming capture sampling was
42%. Its uncommitted investigation is preserved in a named local stash on
fix/receipt-capture; none of it ships on this branch.

The failed seed's target was host.docker.internal at the source fixture's
outer-daemon published port. deploy/verification/command:23 explicitly adds
host.docker.internal:host-gateway for the verification job. Under nested Docker,
that is the inner daemon's gateway; the retained failure names
172.18.0.1:65105 (demo-soak.log:40 and the seed failure log:1), rather than the
outer host that owns the published port. The successful first-hour engine route
uses that hostname without the verification job's host-gateway override.

The Stage 5 seed URI now uses the already discovered explicit outer host address
(hostAddress), while the engine source reference retains its existing caller
route (customerSource.host). The source, schema selection, credentials, seed
options and expected soak answers are unchanged. No product transport change,
image rebuild or republish is needed. FH-012 protects this distinction.


Seed-route correction validation: 12/12 first-hour and provisioning tests passed;
syntax and lint passed. Committed/pushed as 67b8c47 before the fresh standard
acceptance attempt, with the existing b8c71ba manifest/archives and no republish.

That attempt, tmp/stage5-acceptance-ttSA3A, stopped at memory preflight: docker
info did not complete within the existing 10-second inspection limit. It did
not extract/install archives or start any fixture. Cleanup passed with zero
resources created/removed. A subsequent direct read-only docker info eventually
returned 8,325,959,680 bytes and 4 CPUs; its elapsed time was not measured.
No timeout was changed, Docker was not restarted, and acceptance was not retried.
See [seed-route-preflight-stop.json](seed-route-preflight-stop.json). The corrected
seed route therefore remains to be exercised in packaged acceptance.


## Final authorized acceptance after Docker Desktop restart (2026-11-06)

`docker desktop restart --timeout 180` exited 0. The standard Stage 5 command
then ran once, with existing b8c71ba published images/archives and
`--candidate --duration-seconds 600 --transport-diagnostics`. No rebuild,
republish, timeout change, cloud access or subsequent acceptance run occurred.
Run: tmp/stage5-acceptance-qO0puT; harness revision 09c04d2.

Preflight passed at 7.75 GiB Docker allocation. Gateway/engine install, four
identity imports, pairing, real SMTP, fresh owner sign-in, first-hour receipt
and 200/200 XQ escrow/redeem round trips passed. The corrected seed route was
exercised successfully: seed and lifecycle-renew each exited 0.

Prepare exited 1: retained verification/output/failure-2026-11-06T16-02-31.437Z-59.log:1
says "Escrow query refused". Gateway log lines 1514 onward in the private
prepare-gateway.private.log record mcp.refused at 16:02:31.399Z,
source_unavailable / engine_registry, evidence ID
01a1b198-eb3f-77e2-9e13-e32ca929da71. No failed engine transport attempt was
recorded, so a DNS/TCP/TLS timeout is not established by this refusal. The exact
registry reason is not retained by prepare's generic error and is not inferred.
The driver eventually recorded its standard soak-start timeout after that exit.

Final transport capture: 155 completed calls, zero failed attempts, zero
successful calls with retries, zero observed TLS stalls or recovered stalls.
This is successful setup-transport evidence, not a ten-minute traffic proof.
No soak traffic, packaged browser/outage, or final custody/companion regressions
ran. Cloud before/after latency remains deferred to the owner after merge.

Cleanup passed: two owned outer containers removed plus the nested daemon's data
volume (and thereby its internal application containers, volumes and networks).
Logs and results remain retained. See
[packaged-after-restart.json](packaged-after-restart.json). No further acceptance
runs today, as instructed; no merge.

Post-cleanup ownership queries returned no run-labelled containers/volumes or
gateway compose network. Report-only lint and diff whitespace checks passed.


## Prepare refusal diagnosis: exact heartbeat binding mismatch

This is distinct from 67b8c47's seed route fix. The seed targeted an outer
published database port through the nested gateway. Prepare's requests reach
the gateway, but its verification process registers an engine heartbeat binding
that differs from the installed API's binding by a trailing slash:

- gateway/state/package.env: GATEWAY_HEARTBEAT_URL=https://host.docker.internal:3102/
- verification/verification.env: ENGINE_HEARTBEAT_URL=https://host.docker.internal:3102
- retained engine/state/control/state.json: both installed bindings end in `/`.

The Stage 5 driver reconstructed heartbeat.origin, removing the slash. The
verification config passes this value unchanged to the operator's EngineRegistry
(provision-service.ts:31), and its HttpsEngineProbe registers it. The API refresh
registers the installed slash-terminated value. The controller's registration
comparison (controller.ts:98-105) compares the complete binding JSON; a different
value replaces the binding with policy:null and deletes its applied version.
The next heartbeat records appliedVersion:null in the gateway; query admission
refuses a non-current policy (registry.ts:65-66; repository.ts:10-16).

The retained gateway-services.log records null appliedVersion at lines 1843–1848
(16:02:17.312Z) and 1926–1931 (16:02:28.104Z), then matching policy again at
16:02:32.374Z. Prepare's escrow query was refused at 16:02:31.399Z with
source_unavailable / engine_registry. All engine transport calls completed;
this is an acknowledgement reset, not evidence of a DNS/TCP/TLS stall.
See [prepare-heartbeat-diagnosis.json](prepare-heartbeat-diagnosis.json).

Fix: read the installation's GATEWAY_HEARTBEAT_URL from its generated package.env
verbatim; do not reconstruct/normalize the binding. No product code, policy
checks, timeouts, expected query answers or installed configuration is changed.
FH-013 failed on the old driver before this fix; the config test verifies both
slash forms are passed through unchanged. Initial test bootstrap found the
standard dev Postgres/Redis stopped after Desktop restart; docker compose up -d
--wait --wait-timeout 90 postgres redis restored both to healthy before tests.

Heartbeat binding correction: 22/22 targeted/packaging/provisioning tests,
changed-script syntax, lint and whitespace checks passed. No full gate rerun for
this harness-only change. Fresh acceptance follows with existing images.


## Corrected heartbeat binding: fresh packaged result

On harness 3cd0bd8, the standard fresh Stage 5 run used the existing published
b8c71ba images/four archives, `--candidate --duration-seconds 600
--transport-diagnostics`, with no rebuild or republish. Run:
`tmp/stage5-acceptance-QVmqog`.

Preflight, installs, identities, pairing, real SMTP, fresh sign-in, first receipt
and 200/200 XQ round trips passed. Seed, lifecycle-renew and prepare all exited
0. The prior prepare refusal did not recur after preserving the exact installed
heartbeat binding. Packaged browser and console outage/recovery checks passed.

The ten-minute soak started at 16:26:04.652Z and completed with exit 1/status
FAILED: 292 queries and 292 receipts, 256 successful queries, three invariant
alarms (declared scenario outcome mismatches), operationalErrors 0 under the
soak's classification. Refusals were engine_saturated 2, source_unavailable 5,
element_withheld 13 and unsupported_on_aggregate_only 16. Receipt checks were
enabled, failed=false, checksSkipped=0. Custody verified 90 values, refusals 0,
skipped 0. Coverage exercised 41/115 declared cells (36%); this is not complete
V-01 capability coverage and is not presented as such.

Two clear cedant scenarios, one per pool on policies, unexpectedly received
engine_saturated. The pool-0 claims clear cedant scenario unexpectedly received
source_unavailable / engine_registry, receipt
01a1b1b3-3d14-77ff-9230-d9dac3343708. Its public error says the registered Engine
is unavailable or has not passed verification. That does not establish the
underlying registry condition. See bounded alarm evidence in
[packaged-heartbeat-binding.json](packaged-heartbeat-binding.json).

Final gateway capture contains 1,373 completed H2 calls, zero failed transport
attempt records, zero successful calls requiring retries and zero observed or
recovered TLS stalls. This does not explain the application refusals or turn the
soak into a pass. No timeout, admission limit or expectation was changed.

The standard harness stopped on the failed soak; its final custody and companion
row/aggregate/replay checks therefore did not run. Cleanup passed, removing the
owned source and nested Docker containers plus the nested data volume. Retained
logs/results remain available. No further acceptance run or product fix followed;
the remaining traffic refusals are a blocker to acceptance. No merge.

Post-cleanup checks found no run-labelled containers/volumes or gateway compose
network. Report-only lint and whitespace checks passed.


## Owner-approved capacity classification and H2 trace for the registry refusal

The two engine_saturated answers are correct capacity refusals under load. They
are now counted separately in the soak summary and per-cell coverage, without
incrementing a cell's exercised/matched count. Capacity-only cells say CAPACITY
REFUSED and remain unhit; a capacity refusal cannot erase a prior wrong answer.
The 115 fixture expectations are unchanged. Stored historical reports remain
unchanged; this is a new classification, not a rewritten previous verdict.

Only plain error responses with engine_saturated and no structured values or
release failure qualify. Returned values on a refusal, incorrect rows/treatments,
wrong governance outcomes, receipt issues, escrow failure and non-capacity
infrastructure mismatches remain failures. Receipt verification still runs for
capacity refusals. Capacity does not receive false capability coverage.

The remaining engine_registry refusal is resolved by retained H2 records:
health call b5a1140f-4521-4f1a-bf74-3a660b5a32ed returned HTTP 200 (written
16:31:05.202Z, response 16:31:06.096Z). Registration call
0f6e9b57-da38-4822-bb9f-b10a74ceb45c was written 16:31:06.356Z and returned HTTP
503 at 16:31:13.725Z, completing in 7517.3 ms. Both used the existing pinned H2
session: original DNS 6 ms, TCP 3 ms, TLS 7 ms, H2-ready 19 ms; no new handshake
or connection failure occurred for these calls.

At 16:31:13.873Z the gateway logged engine.verification_refused,
stage egress_registration, and invalidated readiness (registry.ts:132). At
16:31:16.556Z the query was refused from that registry state; its evidence ID
never appears in the engine's request log, and there is no /execute dispatch
for it. The engine answered; this is a service 503 followed by intentional
registry invalidation, not an unexplained stale registry view or H2 failure.
Why the engine's internal registration returned 503 is not established here.
Bounded phase evidence:
[capacity-and-registry-classification.json](capacity-and-registry-classification.json).

No product timeout, retry, registry behavior, admission policy or oracle answer
has been changed. The approved change is confined to the verification soak.

Capacity correction validation: initial regressions failed as expected; the
first implementation had a coverage-summary ReferenceError, fixed before the
final run. Final targeted/packaging/provisioning tests 22/22, versioned fixture
specification tests 4/4, strict typecheck, lint, help/syntax and whitespace checks
passed. Script-only verification change: no full gate rerun.


## Capacity-aware packaged run and final-check input correction

All eight amd64 1524328 candidate images built/audited and published via the
standard workflow; all four archives built under
`tmp/arch01-1524328-amd64-archives/`. Published manifest:
`tmp/arch01-1524328-published.json`. This contains the verification-only capacity
change; no product behavior change. Standard acceptance run:
`tmp/stage5-acceptance-e5UC0N`, duration 600, diagnostics enabled.

Installs, identity imports, pairing, real SMTP, fresh sign-in, first receipt,
200 XQ round trips, prepare, browser and console outage/recovery passed. The
full ten-minute soak PASSED: 339 queries/receipts, invariantBreaches 0,
operationalErrors 0, no capacity refusals on this run, receipt checks enabled
with failed=false/checksSkipped=0. Custody verified 102 values. The completed
run did not reproduce the earlier scenario or engine_registry failures.
Gateway transport captured 1,575 completed calls with no failed attempts,
TLS stalls, recovered stalls or successful retry calls.

Final custody/companion phase stopped at agent-identity-import, before its
query/unseal checks. The companion image preparation completed; this was not a
build timeout. The agent command's private log reports invalid input or refused
exchange, and no identity-bundles directory was created. Its source ZIP was
passed directly from the host's ~/.xq tree. The fresh nested Docker daemon has
only the acceptance directory mounted at the same path; that host-only ZIP is
not available to it. Docker bind semantics create a directory for an absent
source, which the importer's file-only input check refuses. The first successful
import phase already stages its ZIP within the shared acceptance directory.

Fix the final harness path the same way: copy the original export into the
private agent-host directory, preserve its filename and chmod 600, then invoke
the unchanged shipped importer. FH-014 verifies path, original preservation,
mode and driver wiring. No key data reaches gateway service mounts. No product,
XQ exchange, timeout or archive change is required for this correction.
See [capacity-soak-and-agent-input-stop.json](capacity-soak-and-agent-input-stop.json).

Cleanup of the failed run passed. For disk space, only redundant images.tar
payloads in three previously reported/committed labs (QVmqog, qO0puT, 0HIRZf)
were removed; logs, records and their canonical archives remain. Free space
rose to 8.2 GiB before the next standard run. No evidence records were edited.

Final import staging correction: 14/14 targeted/provisioning tests, syntax,
lint and whitespace checks passed before commit and the next fresh standard
acceptance. The eight published images and four archives are reused.


## Corrected agent input attempt: Docker preflight blocker

The tested harness-only import fix was pushed as 0234be3. The next fresh
standard acceptance reused the 1524328 published manifest and four archives;
no republish or product change. It stopped at memory preflight in
`tmp/stage5-acceptance-sfYxv3`: docker info exceeded the existing 10-second
allocation-inspection limit. No install or fixture started. Cleanup passed with
zero resources created/removed. No timeout was changed or Docker restart or
further acceptance retry attempted. See
[agent-input-correction-preflight-stop.json](agent-input-correction-preflight-stop.json).

Thus the ten-minute capacity-aware soak is proven passing on 1524328 (339
queries, zero breaches/errors, 102 values unsealed), while the final agent-kit and
companion row/aggregate/replay regression remains unverified after the input
fix. The source and bounded evidence are pushed; overall acceptance is blocked.

A final guard keeps revoked-credential scenarios outside capacity deferral: an
engine_saturated result for a revoked credential is still a failed authentication
expectation. Revocation must be enforced before admission; the capacity exception
must never mask that governance defect. This only tightens the verifier, and its
new guard has not been packaged/exercised live after the preflight stop.

Final revocation guard targeted tests 11/11, provisioning-runtime 3/3, help/syntax,
lint and whitespace checks passed. No further packaged run followed the
preflight blocker. The latest guard is unit-tested, not live packaged proof.
