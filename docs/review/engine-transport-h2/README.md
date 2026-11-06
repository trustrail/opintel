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
