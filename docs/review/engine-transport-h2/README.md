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
