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
its existing upstream image digest; confirm the concrete version with the image.
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
opt-in with `LOG_LEVEL=debug` in package.env; the benchmark harness selects it.

The benchmark query explicitly reads `id, token_id`, ordered only by the clear
id. In benchmark mode the standard custody fixture prepares that token column
through the public declaration/entitlement APIs and initializes its token key
through the existing API when absent. This is necessary to generate real
`/custody/attest` samples: engine verification alone does not attest a key, and
a clear-only query would leave the requested attestation measurement empty.
Outside benchmark mode the custody acceptance fixture is unchanged.
