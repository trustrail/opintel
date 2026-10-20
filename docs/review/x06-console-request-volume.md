# X-06 console request volume

Branch: `x-06-console-request-volume`, based on main `01d64b3`.

## Changes and observed starting point

The current main tip already puts the collapsed-row fields in `ActivityEntry`:
recorded object names, row count, outcome, agent, timestamp and delivered
treatment counts. Dashboard Recently reads five entries directly. Activity's
`InlineExpansion` mounts its detail consumer only when opened. There was no
remaining per-run fetch loop on this tip to remove. This change adds cold-load
regressions for both consumers, an explicit-expansion check, and a real-browser
count of `/api/v1/runs/<id>` calls. It does not substitute warm caching for an
embedded list response. Individual evidence navigation and expanded detail
retain their permission checks and zero-retention argument policy.

`GET /api/v1/projects/:id/runs/summary` now groups by recorded mode as well as
UTC day/outcome/treatment status and includes `days[].modes.{query,prompt}`.
Dashboard obtains total/query/prompt day counts from this single response,
replacing three seven-day summary requests. Existing filter/tab semantics,
permissions, custody summaries and row-scoping events remain. No route,
migration, CSS or evidence write was added. Dashboard refuses a populated
summary lacking the mode breakdown rather than presenting fabricated zeroes.

## Cadence, explicitly

| Reads | Can change within 30 seconds? | Implemented cadence |
|---|---|---|
| Pool membership/names/source bindings, source setup count | Through configuration/catalogue changes, not time alone | Entry, existing mutation and structural stream invalidation, manual Refresh; otherwise first poll after five minutes |
| Complete per-pool entitlement totals and undecided groups | Through entitlement/catalogue changes | Same five-minute fallback and invalidations; all cursor pages still traversed |
| Join-attempt annotations embedded in those groups | Yes, on query/explain attempts | Deliberately share the five-minute group refresh; the separate Suggestions count/attempts remain live |
| Per-pool agents | Yes, heartbeats, requests and deadline aging | Every 30 seconds |
| Open Observations and Suggestions collections | Yes, Engine/ingest/attempt events and decisions | Every 30 seconds, retaining complete pagination and custody permission gating |
| Current Dashboard feed findings | Yes, provider availability and source/row-scope state | Every 30 seconds |
| Seven-day Activity totals | Yes: today's traffic, late completion, lifecycle maintenance | One summary every 30 seconds; no assumption that older days are immutable |
| Five recent Activity entries | Yes | One list request every 30 seconds, no detail fan-out |

Configuration stays in a separate TanStack query under `project.stats`, so
existing configuration mutation invalidations still invalidate it. Explicit
Refresh invalidates configuration before rereading. A failed refresh is an
error; it does not silently retain a clean configuration. The displayed as-of
is the older configuration read time. Activity ranges are recomputed at every
live refresh, so midnight does not remain pinned to the configuration's date.

Presence and introspection-progress notifications no longer invalidate the
whole Dashboard on every event. Pool/agent screens still receive their existing
presence invalidations and progress still updates introspection caches.
Structural events and reconnect snapshots retain Dashboard invalidation.

## Revocation and as-of follow-up

Decision: keep credential/key and agent status on the **30-second fast cadence**,
independent of mutation origin. Dashboard agent pages already use that cadence;
its five-minute configuration now retains only pool id/name rather than unused
working-key/agent counts from PoolSummary. Dashboard renders no credential state.
Pools list, Pool detail (including credential/key state), agent pages and agent
twins now also poll every 30 seconds, with fresh reads on entry. A revoke from
another operator or API needs no local mutation or SSE to be observed by the
next successful fast refresh. Existing local revocation and presence SSE
invalidations still apply. These pool-screen polls do not run on Dashboard.
The regression changes remote credential/key state without a local mutation or
stream signal and checks that Pool detail, list working-key counts and twin key
status refresh together.

Observed presence remains separate from authorization: revocation immediately
invalidates the key server-side, but a historical active presence observation
ages on its existing heartbeat deadlines. It is not rewritten into a claim
that the agent disconnected. Pool/twin views expose the revoked credential/key
state alongside that observation.

The **as-of display from X-05 is now more necessary, not less**. Collections can
legitimately be five minutes behind. A screen that looks live while being five
minutes old is worse than one that says how old it is. Keep the displayed as-of
anchored to the older configuration read; fast Activity/presence refreshes must
not advance it and imply that collections were refreshed. This change preserves
that display and its manual Refresh path.

## Measurement

Measured with `OPINTEL_DIAG=1`, one isolated headless Chrome tab, real demo
sign-in/API/database, admin role, four pools, four sources and 21,945 stored runs.
No agent workload was started for this idle-console measurement. The historical
18 October baseline is a comparison, not a replay of that workload.

UTC interval: **2026-10-20 01:07:19.534–01:12:19.535** (300.001 seconds).
Counting begins at cold Dashboard navigation, including initial load and shell
requests; there were no interactions during the interval.

**113 total API requests / 300 seconds = 0.3767 requests/second**, versus the
reported **3.8/second** baseline: **90.09% lower**. Individual
`/api/v1/runs/<id>` requests: **0**. HTTP errors: **0**.

| Request family | Count |
|---|---:|
| Auth, project list, preferences, SSE connection | 4 |
| Configuration: stats, pool list, entitlement group pages | 10 |
| Agent presence pages | 45 |
| Open observations, custody observations, suggestions, Dashboard feed | 36 |
| Seven-day Activity summary | 9 |
| Recent runs list | 9 |
| **Total** | **113** |

There were nine live refresh cycles. Presence needs five pages across the four
pools; the largest pool uses two pages. Configuration was read once in this
window. The focused timer test separately exercises its five-minute fallback.

Browser-initiated requests reconcile exactly, by path and total, to **113**
HTTP diagnostics, all status **200**. Reconciliation reconstructs request start
as diagnostic timestamp minus duration, so the long-lived stream is counted
in its opening window after it closes. The API recorded 299 pool samples:
maximum total connections **6**, maximum sampled waiting **0**. Summary responses
took **3.59–6.93 seconds**; this is request-volume evidence, not a claim that
X-07 summary latency is resolved.

Local raw artifacts (ignored by Git):
`tmp/x06/measurement.json`, `tmp/x06/diagnostic-reconciliation.json`,
`tmp/x06/measure.mjs`, and
`tmp/diag/2026-10-20T01-03-36.134Z.jsonl`.

## Focused validation

- Strict typecheck passed; unchanged lint and module-boundary checks passed.
- All 29 focused checks pass across the endpoint/integration run and corrected
  polling-test rerun before the authorized full gate.
- Activity endpoint suite: 9 passed, including combined query/prompt breakdown,
  UTC boundary, mode/outcome/pool scopes and project-view denial. Existing tests
  cover list metadata, SQL redaction and historical delivery counts.
- Dashboard read-model integration: 1 passed, including real destination readers,
  complete pagination, one summary and zero individual detail calls.
- Existing Dashboard endpoint suite: 6 passed.
- Existing SSE suite: 7 passed; pool UI invalidation suite: 3 passed.
- New cold-list/polling/SSE regressions: 3 passed after correcting an incomplete
  mock response and installing fake timers before the polling timer. An
  intervening sandbox-only launch failed to create the tsx IPC socket; the
  focused rerun was made outside that sandbox. The final run includes the
  additional mutation-invalidation assertion and passes all 3 checks.

## Completed-candidate gate

The reader authorized the revocation/as-of follow-up and landing conditional on
one full-gate pass. `npm run check` passed on the completed candidate without a
retry: **1123.61 seconds (18m 44s)**. Production and conformance strict typechecks,
unchanged lint/boundaries and production-artifact exclusion passed. Browser
conformance passed **59 checks**, covering **54/54 screen routes** with **zero
findings**. The normal suite passed **1,905 tests in 209 files**. The real
browser/MCP smoke path passed **1/1**.

The gate also includes the remote-revocation regression and updated Dashboard
summary fixture. No screenshot baseline capture or regeneration was performed.
Local gate artifacts: `tmp/x06/full-gate.log` and
`tmp/x06/full-gate.json`. The gate metadata identifies base HEAD `01d64b3`
because the requested workflow validates the working candidate before commit.
