# Acceptance table button correction

Approved merge of fix/column-grid-diagnostic was pushed to main as bbad6ee.
A fresh packaged run on the existing 42391a3 images passed engine verification
(no 503) but timed out on the exact accessible button name. The shared table
kind icon contributes to that name; it is not just the visible catalogue code.

The harness now selects the button containing code text matching the exact full
catalogue name, rather than comparing its entire accessible name. No product
source, timeout, treatment/query/receipt assertion or image changed. The grid
header assertion remains before treatment selection.

Dev regression with real seeded API routes passed both the pool Access link and
the exact code-text button selection: 1 test passed (57.804 s), grid rendered,
zero console/page errors and zero HTTP failures. Evidence:
[dev-result.json](acceptance-button-regression/dev-result.json),
[grid screenshot](acceptance-button-regression/column-grid.png). Trace retained
privately at tmp/acceptance-button-dev-trace.zip. New results were moved aside
and original main diagnostic evidence restored, preserving both runs.

Script syntax and lint passed. Duplicate images.tar files in completed local
labs were removed; original archives, service state and logs were preserved.
A fresh packaged run with the corrected code-text locator is pending. It will
use the existing 42391a3 archives, with no image rebuild/publication.

## Packaged result after the tested locator correction — stopped on 503

Run: `tmp/console-first-run-acceptance-eJuby9`, existing 42391a3 archives/images.
Five installation checkpoints passed (extract, gateway install, engine install,
pair, source add); browser owner sign-in and project creation passed. Verification
returned HTTP 503 and the unchanged 120000 ms progress wait expired. No later
steps ran. Acceptance stopped as explicitly requested; no further run or product
fix. Final cloud archives/hashes are not released because acceptance failed.

Gateway call `064af475-aa49-4748-bfdf-d87a568776cc`, POST `/health`, attempt 1:

| Recorded UTC event | Time |
|---|---|
| Attempt started | 2026-11-05T17:42:54.664Z |
| DNS completed | 17:42:54.675Z |
| TCP connected; phase changes to TLS | 17:42:54.688Z |
| Failure, phase TLS, native code/reason ABORT_ERR, written=false | 17:43:05.932Z |
| Attempt completed | 17:43:06.015Z |
| engine.probe_refused (transport/TLS) | 17:43:06.196Z |
| engine.verification_refused (health) | 17:43:06.208Z |

Recorded phase durations: DNS 10.804 ms, TCP 12.416 ms, combined connect 23.221 ms,
TLS null (never recorded complete), total 11267.118 ms. No TLS-complete or
request-written record exists for this call. This is one failed TLS attempt,
not four TCP retries. The cause of the stalled handshake is not established.
A later gateway readiness_failed record names PostgreSQL at 17:43:09.760Z;
no causal relationship is established.

The engine log records ready at 17:39:31.269Z and paired trust loaded with event
time 17:39:48.391Z. Its retained 28 log lines contain no matching health/verify
request or handshake record in the failure window. Absence of such logging does
not prove the TCP connection never arrived. The ingress log was retained too;
it contains no access entry for this request. The browser's captured response
establishes POST /api/v1/projects/:project/engines/:engine/verify status 503.

Full gateway API, engine and ingress Docker logs were captured with timestamps
and mode 600 in the run directory, indexed by verify-log-capture.json. They remain
private. Safe projection: [transport.json](releases/42391a3-verify/transport.json);
[browser result](releases/42391a3-verify/browser-result.json). Capture and summary
scripts are committed with this record. The standard install wrapper exited 1
after its cleanup path. No cloud host was touched; no image was republished.

## Subsequent single authorized rerun — passed

The owner authorized another run from the start. It passed in
`tmp/console-first-run-acceptance-nj348q`: all 12 browser checkpoints, 6 rows in
the receipt, zero browser/console/HTTP errors, no deadline failure. Engine verify
passed. Final metadata-free archives and SHA-256s were then produced and checked
on Linux. See [final release report](releases/42391a3-passed.md). The previous
failure record above remains the evidence for that prior invocation.
