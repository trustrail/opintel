# X-06 second part: presence transitions and SSE lifecycle

Branch `x-06-presence-stream-lifecycle`, from main `5245596`.
The reader reviewed the measurement and authorized the final full gate and
commit/merge/push on green. Landing validation is recorded in
[x07-summary-statement-settings.md](x07-summary-statement-settings.md).

## Implemented behavior

`PostgresAgentPresence.observe` still writes every authenticated observation and
the credential's last-use timestamp in the existing tenant transaction. It now
publishes after commit only for a first observation or a presence state/deadline
transition. Comparison includes both the stored row and its read-time aged
state. That preserves an unswept idle/stale/disconnected return to active,
including a reconnect whose stored state was already active. The existing
per-agent lock serializes concurrent returns; only the first publishes.
Repeated active-to-active requests/heartbeats do not publish. Sweeping, timing,
authorization, persistence, disconnected-row retention and notification failure
handling remain intact.

HTTP stream diagnostics, enabled by `OPINTEL_DIAG=1`, record `sse_open`,
`sse_snapshot` and one `sse_close` with project/request IDs. Close reasons are
`client_close`, `backpressure_event`, `backpressure_keepalive`, `upstream_close`
and `error`. A server-initiated reason is retained through the unsubscribe
callback rather than overwritten as an upstream close. Snapshot counts are
frames accepted for writing, including buffered writes returning false; the
browser independently counts received snapshots. Close records include total
data frames, snapshot count and lifetime. No field values, headers, bodies,
credentials or new metric labels are recorded. Existing backpressure behavior
is measured, not changed.

## Method

Two sequential ten-minute workload windows use the existing demo, ten agents,
two cedant pools, rate 750 ms, seed 1, real Engine and custody certificates, and
one foreground 1440×1000 headless Chrome Dashboard tab. The existing harness
opens a primary and custody MCP client for each of the ten identities. The project has four
pools; complete presence pagination is retained. Browser probes run every
30 seconds. There are no manual refreshes, navigation or screen changes.

The baseline API loaded the original presence publisher plus lifecycle
instrumentation before the presence edit was made. It has no source watcher.
The candidate API was restarted after the edit. Both use the same lifecycle
instrumentation. Focused tests, typecheck and lint run outside the measured
windows. Existing append-only evidence and presence rows are retained, so the
second run is later against a larger history; this is not a randomized latency
experiment.

Each steady-load window starts at the soak's `type:start` marker and lasts
exactly 600 seconds. Dashboard cold load and initial stream open precede that
marker; the tab stays open through drain. Browser API request starts reconcile
to server request starts by endpoint. Response latency joins completed HTTP
records to requests started in the window, including completions afterward.
Long-lived SSE lifetime is excluded from response latency. A timed-out request
started in the window remains a failure even if its abort occurs after the
window. SSE lifetime totals include initial connection/snapshot and controlled
browser closure after drain; in-window lifecycle counts are reported separately.

Queue depth is sampled once per second. The reported queue peak is the highest
observed sample, not an exact continuous high-water mark. Acquisition waiting
uses each completed `db_acquire.waitMs` record. Missed sampling ticks are not
reported as zero waiting.

The retiring lifecycle credential's grace window was already expired. It is
reported NOT EXERCISED; no credentials are rotated/reseeded and this is not a
new lifecycle/custody proof.

## Measurement

Both windows ran on 20 October 2026 (UTC):

- Baseline: **20:24:59.046–20:34:59.046**.
- Candidate: **20:42:12.061–20:52:12.061**.

**The proposed reconnect feedback loop was not observed.** Each tab lifetime
had one connection, one server snapshot and one browser-received snapshot.
There were no backpressure closes or EventSource errors/reconnects. The only
close was the controlled client close after workload drain. During the actual
600-second load windows there were zero opens, closes or snapshots: the initial
connection remained open throughout. The sole project with a console stream was
`de000000-0000-4000-8000-000000000003`.

| Metric | Original publisher | Transition-only publisher |
|---|---:|---:|
| Console API requests started during load | 142 | 154 |
| Console requests/second | **0.2367** | **0.2567** |
| Browser/server count reconciliation | 142/142, exact by endpoint | 154/154, exact by endpoint |
| API requests over entire tab lifetime, including cold load | 168 | 180 |
| Browser-received presence messages over tab lifetime | **2,348** | **40** |
| Stream opens / snapshots, per project over tab lifetime | 1 / 1 | 1 / 1 |
| Client closes, controlled after drain | 1 | 1 |
| Event / keepalive backpressure closes | 0 / 0 | 0 / 0 |
| Upstream / error closes | 0 / 0 | 0 / 0 |
| EventSource errors / reconnects | 0 / 0 | 0 / 0 |
| Console request aborts attributable to loaded requests | 1 | 0 |
| Dashboard probes passing | 21/22 | **22/22** |
| Agent outcomes | 567 | 705 |
| Agent operational errors / invariant breaches | 0 / 0 | 0 / 0 |

Presence notifications fell **98.30%** across the tab lifetimes. The candidate's
forty notifications arrived during client startup; the count then stayed flat
throughout continuing agent requests. It did not reduce the Dashboard's pull
request volume: the candidate completed twelve live refresh cycles versus
eleven in the baseline. Both made one additional configuration refresh during
load. Each cold Dashboard load made 26 requests before the workload marker.
The low baseline rate is not a clean success: its final summary request timed
out, and the final post-drain probe displayed a failed refresh.

The MCP sweep saw twenty sessions in all 575 baseline and 580 candidate samples
within the windows (two clients per agent), with zero new MCP initializations
inside either window. No agent transport operational error was reported. Both
soaks passed their exercised assertions and receipt checks with zero skipped
receipt checks. Scenario coverage was 72/85 and 84/85 respectively; unexercised
scenarios remain recorded in the raw summaries. These are workload results,
not a claim that every release-proof scenario was exercised.

### Response time and database waiting

HTTP timings below are server-observed milliseconds for requests started during
load, not the soak's end-to-end custody/decryption latency. Percentiles use the
nearest-rank sample. All matching completed responses were available.

| Responses | Baseline p95 | Baseline maximum | Candidate p95 | Candidate maximum |
|---|---:|---:|---:|---:|
| Console, excluding stream lifetime | 22,948.50 | 30,168.83 | **18,685.41** | **22,382.73** |
| Activity summary endpoint alone | 30,168.83 | 30,168.83 | 22,382.73 | 22,382.73 |
| All agent tool HTTP responses | 5,952.60 | 9,590.54 | 4,261.11 | 7,767.93 |
| Agent query HTTP responses | 7,250.89 | 9,590.54 | 5,223.52 | 7,767.93 |

The baseline abort was `/api/v1/projects/P/runs/summary` at
**20:35:00.604 UTC**, just after the measurement window, for a request started
inside it. It remains counted as a failure. Browser/server HTTP status errors
were zero; a server-side 200 does not establish that the browser received the
timed-out response. There were no browser page errors in either run.

Summary latency remains material: the candidate's worst non-summary console
response was 1,663.88 ms, while its summaries reached 22,382.73 ms. This change
does not fix X-07 summary cost. The sequential runs show better observed latency
and throughput in the candidate, but do not isolate every cause of that change.

| Pool measure | Baseline | Candidate |
|---|---:|---:|
| Pool samples | 576 | 581 |
| Samples with waiting acquisitions | 120 | 78 |
| **Sampled peak waiting queue** | **21** | **11** |
| Sampled peak pool connections | 10 | 10 |
| Completed acquisition samples | 28,225 | 34,066 |
| Acquisition wait p95, ms | 108.25 | 37.66 |
| Acquisition wait maximum, ms | 892.27 | 522.74 |

### Console request breakdown by endpoint

All entries are GETs. Counts include every cursor page started inside each
600-second workload window. `P` is the project above. Pool labels are:

- Q1: `384f01f7-df62-45d5-95c9-088bec8eb13a`.
- Q2: `3972364d-f276-4dd9-b37c-0bb229f250a0`.
- Q3: `85eb3b4b-923f-494a-a003-2b332d17cec1`.
- Q4: `bdf0f023-40e5-465a-9186-30a73dccaefd`.

| Endpoint | Baseline | Candidate |
|---|---:|---:|
| `/api/v1/pools/Q1/agents?projectId=P` | 22 | 24 |
| `/api/v1/pools/Q2/agents?projectId=P` | 22 | 24 |
| `/api/v1/pools/Q3/agents?projectId=P` | 11 | 12 |
| `/api/v1/pools/Q4/agents?projectId=P` | 11 | 12 |
| `/api/v1/pools/Q1/entitlement-groups?projectId=P&…` | 2 | 2 |
| `/api/v1/pools/Q2/entitlement-groups?projectId=P&…` | 2 | 2 |
| `/api/v1/pools/Q3/entitlement-groups?projectId=P&…` | 2 | 2 |
| `/api/v1/pools/Q4/entitlement-groups?projectId=P&…` | 2 | 2 |
| `/api/v1/projects/P/custody-observations?view=open` | 11 | 12 |
| `/api/v1/projects/P/dashboard/feed` | 11 | 12 |
| `/api/v1/projects/P/observations?view=open` | 11 | 12 |
| `/api/v1/projects/P/pools` | 1 | 1 |
| `/api/v1/projects/P/runs?limit=5` | 11 | 12 |
| `/api/v1/projects/P/runs/summary?…` | 11 | 12 |
| `/api/v1/projects/P/stats` | 1 | 1 |
| `/api/v1/projects/P/suggestions?view=open` | 11 | 12 |
| **Total** | **142** | **154** |

Auth/session, project list, preferences and the initial stream GET are outside
the steady-load windows. No individual evidence-detail GET was made by the tab.
Per-endpoint response distributions and all raw counts are retained in each
`measurement.json`.

### Decision on invalidation breadth

**No narrowing.** The measured Dashboard makes no active Pool list/detail or
Agents family queries: its composed presence reads have their own Dashboard
key. Presence deltas already exclude `projectKeys.stats`. Narrowing those three
ordinary families cannot explain or remove the measured Dashboard summary
latency, and there is no measured reconnect loop to break. Transition-only
publication removes the redundant signals while retaining existing pool-screen
transition updates and thirty-second polls. The ordinary invalidation targets
remain unchanged.

### Local artifacts

- Baseline: `tmp/x06-presence/baseline/{browser,measurement}.json`,
  `tmp/diag/2026-10-20T20-22-12.457Z.jsonl`,
  `tmp/soak/2026-10-20T20-24-53.826Z-7868.jsonl`.
- Candidate: `tmp/x06-presence/candidate/{browser,measurement}.json`,
  `tmp/diag/2026-10-20T20-40-19.529Z.jsonl`,
  `tmp/soak/2026-10-20T20-42-06.680Z-8480.jsonl`.
- Harness and analysis: `tmp/x06-presence/run.mjs`, `analyse.py`; each phase
  also has `soak.log`, `progress.json` and `analysis.log`.

## Historical reconnect evidence

The retained 20 October diagnostics contain seven process logs with a stream
record. No such log has more than one stream start or more than one completed
stream. The thirty-minute loaded run at
`tmp/diag/2026-10-20T05-35-40.862Z.jsonl` has one open and one completion,
lasting 1,826,231 ms. The idle X-06 measurement has one completed stream lasting
297,829 ms; that older format did not log starts. The 16:38 process log has one
start with no completion and is incomplete for close accounting.

These logs do not show a repeated reconnect/snapshot loop. They lack historical
close reasons and snapshot records, so they cannot identify why an individual
old connection closed. The new loaded measurements supply those missing counts;
they do not retroactively invent close reasons for the older logs. Local
inventory: `tmp/x06-presence/historical-sse.json`.

## Focused validation

All 44 tests pass in five files: agent presence (15), SSE lifecycle (5), existing
SSE/cache behavior (7), Dashboard requests (3), and HTTP boundaries (14).
The new tests verify unchanged persisted observation/credential times, suppressed
unchanged signals, heartbeat idleness, concurrent returns, unchanged sweeps,
unswept aged returns, each close reason and snapshot/close counts. Both strict
production typecheck and unchanged lint/boundary rules pass. The full gate has
not run. No commit or push has been made.

Local validation artifacts: `tmp/x06-presence/focused-tests.log`,
`typecheck.log`, `lint.log`, and the earlier instrumentation-only
`sse-tests.log` (12 tests passed).
