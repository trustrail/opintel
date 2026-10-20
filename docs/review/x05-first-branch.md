# X-05 first branch — measurement and console legibility

Branch: `x-05-diagnostics-and-console-failures`, off main `2c2c574`.
The measurement was presented before landing validation. The reader then requested
the batching follow-up after this branch lands.
This branch implements no connection-sharing, configuration-cache, admission,
pool-sizing or evidence-write batching fix. X-05's connection strategy remains
for the reader to choose after seeing the measurements.

## Measurement contract

The application pool's opt-in `OPINTEL_DIAG=1` records now include server-generated
HTTP request IDs and unique acquisition IDs. Successful pool acquisition has its
own begin record, reconciled to the completed scope record; failed acquisitions
are separate. HTTP begin/end records retain bounded client/operation categories:
console, governed agent query, other agent transport/tool calls, receipt
observer and Engine receipts. Background scopes retain a null request ID.
No incoming correlation ID is trusted for authorization.

Async context wraps both browser/MCP HTTP and the separate pinned mutual-TLS
receipt listener. Scope observation leaves transaction boundaries, scope roles,
RLS bindings and connection release/rollback behavior unchanged. Database setup
statements (BEGIN, role and tenant binding, COMMIT/ROLLBACK) are excluded from
application read/write classification. Row locks are reads; advisory locks are
not table writes. Records distinguish committed and rolled-back scopes.

Read/write flags describe SQL activity attempted in an acquisition, not rows
returned or proof that a write committed. Static public view and SQL/PLpgSQL
function definitions are loaded once before the measurement, through a platform
scope, and expanded in memory. SQL text, bind values, function definitions and
response bodies are never emitted by this diagnostic path. Unknown/dynamic SQL
is explicit, rather than silently assumed read-only.

Read-table counts mean distinct referenced relations per acquisition, after
static expansion and normalization of the public schema. One acquisition may
reference several tables, so percentages do not sum to 100. These are logical
references, **not physical I/O or query-plan measurements**: branches that the
planner prunes can still be referenced. RLS policies, trigger internals, dynamic
SQL and source-database/Engine connection pools are outside this table observer.
The numbers are for the application's ten-connection pool.

Per-request statistics select HTTP requests started in the five-minute interval,
then count their entire acquisition lifecycle, including drain after the cutoff.
Global split/table counts select acquisitions begun during the same interval.
The required receipt observer has its own category; its reads are not relabelled
as Dashboard requests. Reconciliation reports have their own Engine category.

## Final five-minute result

Final interval: **2026-10-20 02:44:35.602–02:49:35.602 UTC**, exactly 300 seconds.
Existing demo, ten callers, two cedant pools, rate 750 ms, seed 1, custody enabled,
real Engine, and one signed-in Dashboard tab. No source seeding, credential
rotation or entitlement change was performed. The Dashboard was loaded before
the interval and remained open through drain.

| HTTP request class | Requests | Total acquisitions, including drain | Median | p95 | Worst |
|---|---:|---:|---:|---:|---:|
| Agent `opintel.query` | 345 | 7,992 | **23** | **32** | **36** |
| Console | 87 | 340 | **4** | **5** | **5** |
| Agent `opintel.explain`, separate call | 350 | 6,597 | 19 | 26 | 32 |
| Receipt observer | 692 | 2,768 | 4 | 4 | 4 |
| Other agent transport/tool calls | 651 | 3,087 | 6 | 6 | 7 |
| Engine reconciliation reports | 10 | 20 | 2 | 2 | 2 |

These count repeated pool checkouts, **not distinct database sockets**. Agent
query calls include answers and recorded refusals. Explain calls and receipt
verification are not folded into the query-call distribution. Median is the
ordinary sample median; p95 is nearest rank (`ceil(0.95*N)`).

**All 33,664 acquisitions begun in the interval:**

| Access | Acquisitions | Share |
|---|---:|---:|
| Read only | **30,817** | **91.54%** |
| Write only | **751** | **2.23%** |
| Both | **2,096** | **6.23%** |

There were **32,913 acquisitions with reads**. Dominant read references follow;
counts are distinct acquisitions referencing the relation, not returned rows:

| Relation | Read acquisitions | Share of acquisitions with reads |
|---|---:|---:|
| `project` | 12,377 | 37.61% |
| `pool` | 9,854 | 29.94% |
| `pool_key` | 8,508 | 25.85% |
| `engine` | 4,817 | 14.64% |
| `data_source` | 3,115 | 9.46% |
| `catalog_object` | 3,101 | 9.42% |
| `catalog_element` | 3,095 | 9.40% |
| `entitlement` | 3,095 | 9.40% |
| `agent_presence` | 2,092 | 6.36% |
| `user_account` | 1,556 | 4.73% |
| `pool_credential` | 1,441 | 4.38% |
| `query_run` | 1,395 | 4.24% |
| `pool_source_binding` | 1,059 | 3.22% |
| `industry` | 1,036 | 3.15% |
| `release_grant` | 998 | 3.03% |

The leading references are configuration and access-control relations, alongside
per-query state and evidence references such as agent_presence, query_run and
release_grant. This identifies frequency; it does **not** establish which reads
may safely be cached or what their invalidation rules would be.

**12,967 acquisitions (38.52%) were background work without an HTTP request.**
Their leading read references were project (5,923), pool_key (5,728), pool
(5,720), agent_presence (708) and release_grant (588). Existing
`McpHttpServer.refresh` polls session configuration every second; its
`PostgresMcpConfiguration.read` separately reads project settings and pool/key
state. This cadence was observed, not changed in this branch.

Coverage checks: **zero failed acquisitions, zero unfinished acquisition
records, zero unmatched selected HTTP requests, zero non-null database request
IDs without an HTTP record, zero unknown access records, zero opaque dynamic
function references in the interval**. All 33,664 scope records committed.
The receipt listener's ten reconciliation requests are correlated explicitly.
Browser initiation and API arrival have different timestamps: the browser began
92 requests in the interval, while 87 arrived at the API in it; the five boundary
requests arrived after the cutoff. They are not presented as lost or zero-cost
API requests. Quantiles use the documented server-arrival window.

**Soak PASSED**, exit 0: zero invariant breaches, zero operational errors, zero
skipped receipt checks. Scenario coverage was **46/85**, not complete release
coverage. Whole-process outcomes, including drain, were 307 successes, 10
`dependency_unavailable`, 19 `unsupported_on_aggregate_only`, and 14
`element_withheld`. Refusals are retained, not suppressed to make a success claim.
No Dashboard HTTP errors were observed.

The initial calibration capture also passed, but revealed missing context on the
separate mutual-TLS listener and conservative `DO UPDATE` classification. Both
were fixed before this final run. The figures above all come from the fresh
final capture; no request attribution was patched or scopes discarded.

Local raw artifacts (ignored by Git):

- `tmp/diag/2026-10-20T02-44-08.769Z.jsonl`
- `tmp/soak/2026-10-20T02-44-30.342Z-19604.jsonl`
- `tmp/x05/measurement-final.json`, `tmp/x05/coverage-final.json`
- `tmp/x05/browser-final.json`, `tmp/x05/analyse-final.py`
- `tmp/x05/run-final.mjs`, `tmp/x05/soak-final.log`
- `tmp/x05/dashboard-final-narrow.png`, `tmp/x05/dashboard-final-wide.png`

## Client failures (console half of E-07)

The client preserves valid API error envelopes and their human messages. Four
client failures now have separate actionable messages and `details.failure`:

| Failure | Operator action |
|---|---|
| `network` (fetch or response-body transport) | Check network/VPN and retry |
| `invalid_json` | Retry; if persistent, inspect API/proxy response handling |
| `unexpected_error` (non-success HTTP response lacks the documented envelope) | Inspect API/proxy with HTTP status and request ID |
| `schema_mismatch` (successful JSON fails the expected schema) | Reload; verify console/API version compatibility |

Every request has a **30,000 ms** application deadline covering fetch and body
read, with a positive `timeoutMs` override. The underlying fetch receives an
AbortSignal; caller cancellation is accepted through `ApiRequest.signal` or a
client-bound signal. Dashboard's TanStack signals propagate to its live and
configuration reads. Timeout and cancellation are separate from network failure;
cancellation is not retryable. Timers and listeners are removed on completion.
The deadline also settles a non-cooperating fetcher/body promise.

For transport, timeout or response-contract failures on a mutation, the console
says that the change may still have completed and asks the reader to check before
resubmitting. Browser cancellation is not proof of server rollback. No automatic
retry is introduced. Known response request IDs survive body/timeout failures.
Failure diagnostics contain only kind, HTTP status, request ID and timestamp;
response-body excerpts were removed. Valid governance refusals are not logged
as browser errors. Backend refusal taxonomy is unchanged by this console work.

## Fetch time and refresh visibility

The shell shows the oldest successfully fetched data used by the current scope,
with absolute time, relative age and a visible **Refreshing…** state for automatic
as well as manual refreshes. Initial loading has no invented timestamp. A failed
refresh retains the previous fetch time and says the refresh failed. Inactive,
disabled and other-project queries do not advance the displayed time.

Successful network fetches record query-lifetime metadata. Partial stream and
optimistic cache patches cannot masquerade as a new fetch. Existing hydrated
query timestamps retain their age. On Dashboard, the older configuration as-of
is included even though its dependency query has no active observer; a live
Activity/presence poll cannot make five-minute-old collections look current.
The duplicate Dashboard subtitle stamp is replaced by this common indicator.

Per D-05, the console is a periodic view, not the timely-detection channel.
A visible age of several minutes is correct behavior. This branch introduces no
alert delivery/channel behavior. The common minute clock is retained; newly
fetched timestamps use current render time so a stale clock tick does not make
them look future-dated. No master stylesheet change or new CSS class.

## Validation and artifacts

Focused validation: **66 tests passed in 7 files**, covering the API client,
Dashboard request/cancellation integration, fetch-time display, SQL diagnostics,
HTTP boundaries, observer session behavior and shared timestamp presentation.
Strict typecheck and unchanged lint/module boundaries passed. The final focused
log is `tmp/x05/focused-final.log`. An initial SQL observer test caught the
INSERT-column-list/function ambiguity and was corrected before final capture;
no test or soak assertion was weakened. The stale startup lock was preserved
under a backup name only after its old PID was confirmed absent.

Narrow (390px) and wide (1440px) final diagnostic screenshots were inspected.
They show the common timestamp without a duplicate Dashboard subtitle stamp;
no retired screenshot baseline was captured or regenerated. Human layout
review remains available through those artifacts. The owned browser closed,
measurement services were stopped, and the temporary observer-cookie copy was
removed. Existing Docker services and recorded evidence were left in place.

Landing validation: the full gate passed once in **1197.83 seconds**: strict
production/conformance typechecks, lint, production-artifact exclusion, all 59
conformance checks (54/54 routes, zero findings), **1,923 tests in 211 files**,
and the one browser/MCP smoke path. No tier was retried.

The reader selected batching only for the second branch. The tenant wrapper and
its acquisition/release lifecycle must remain unchanged there. Connection reuse
and pool resizing are not part of that authorization.
