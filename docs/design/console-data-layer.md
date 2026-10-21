# Console data layer as implemented

This describes the checked-in console on 2026-10-20. It is an inventory of existing behavior, not a proposed architecture. Paths below use `P` for a project ID, `Q` for a pool ID, and other capital letters for the indicated object IDs. Endpoint tables list reads; writes are covered separately where their callbacks cause reads.

**The core shape is push-signal-pull-data by design.** The stream tells the browser which authorized HTTP reads to repeat. This is explicit in [technical documentation §5.4](../slice1-technical-documentation.md#54-sse-into-the-cache): the snapshot names families to refetch, avoiding a second implementation of list endpoints and their authorization. The exact current mixture has evolved incrementally: identifier-only presence notifications, direct introspection progress patches, screen-specific polling, and the X-06 Dashboard cadence split coexist. It is not a uniform push data model or a single centrally configured refresh policy.

## Transport, cache, and what a cadence means

[src/main.tsx](../../src/main.tsx) creates one `new QueryClient()` with no application-wide default overrides. Components use TanStack Query for server data; local Zustand stores hold filters, selections, disclosures and drafts. [The HTTP client](../../src/shared/api/client.ts) uses relative same-origin fetches, defaults to GET, validates JSON with the supplied Zod schema and returns an error envelope as `AppError`. Its 30-second request timeout is not a polling interval.

In the tables, **on demand** means on mounting/enabling the observer, changing its query key, explicit retry/refresh, or invalidation. A cached fresh query need not fetch on mount. The unmodified TanStack defaults also refetch stale active queries on browser focus/visibility return and network reconnect. Unless a hook specifies otherwise, stale time is zero. Stale time is an eligibility threshold, not a timer: becoming stale does not itself fetch. Polls apply to mounted, enabled observers; background interval fetching is not enabled. These are not promises of wall-clock freshness while a tab is hidden or offline.

`invalidateQueries` uses prefix matching here. It marks all matching cached queries stale and normally refetches active matching queries; inactive matches wait until used. It does not fetch every endpoint in a family regardless of which screen is open. Infinite-query refetches refresh their retained pages; some other hooks explicitly walk all cursors within one query function. Changing a filter/cursor can fetch a new key without invalidating the old key.

## Every HTTP read used by the mounted console

All paths include their actual `/api/v1` prefix. Pagination and filters are query parameters, not additional endpoints.

### Identity, shell, tenancy, and settings

| GET endpoint | Consumer and cadence |
|---|---|
| `/api/v1/auth/providers[?email=…]` | Sign-in `useQuery`; on demand, keyed by valid email (or empty email), disabled while a nonempty email is invalid. No poll; previous provider data is placeholder data. |
| `/api/v1/auth/me` | `AuthGuard`; on demand, no poll, `retry:false`. |
| `/api/v1/projects` | `useProjects`: chooser, shell/navigation and screens needing project metadata/roles; walks all cursors on demand, no poll. Project names/industry/role normally come from this list, not a project-detail GET. |
| `/api/v1/companies` | `useCompanies`: tenancy and company settings; all cursors on demand, no poll. |
| `/api/v1/industries` | `useIndustries`: create/settings forms; one-hour stale time, no poll. |
| `/api/v1/projects/P/members` | Access `useMembers`; all cursors on demand, no poll. |
| `/api/v1/projects/P/permissions/U/explain` | Selected Access member; on demand, no poll. |
| `/api/v1/me/settings` | Shell `DisplayPreferences` and Personal settings share `usePersonalSettings`; on demand, no poll. |
| `/api/v1/companies/C/settings` | Company settings when company ID is present; on demand, no poll. |
| `/api/v1/projects/P/settings` | Project settings; on demand, no poll. |
| `/api/v1/projects/P/custody-provider` | Custody provider settings/status; on demand, no poll. |

Sources: [auth screens](../../src/app/auth-screens.tsx), [guard](../../src/app/guard.tsx), [tenancy data](../../src/app/tenancy/data.ts), [Access data](../../src/app/access/data.ts), [settings data](../../src/app/settings/data.ts), [preferences](../../src/app/settings/preferences.tsx), [provider data](../../src/app/settings/custody-data.ts).

The sign-in flow also reads command responses from POST `/api/v1/auth/request-link`, `/api/v1/auth/callback`, and `/api/v1/auth/confirm-device` when submitting the corresponding flow; these do not poll or invalidate query families. Provider sign-in navigates to the API-supplied `startPath`, with device nonce and return-path parameters; that is a browser authentication redirect rather than a console data query.

### Sources, catalogue, filings, observations, and suggestions

| GET endpoint | Consumer and cadence |
|---|---|
| `/api/v1/projects/P/sources` | `useSources` across sources, catalogue, Entitlements, Engines, etc.; all cursors, 60-second stale time. Polls every **5 seconds only while its cached list contains `pending` or `testing`**; otherwise no interval. |
| `/api/v1/industries/I/demo-sources?projectId=P` | Connect-source demo options, enabled with industry ID; one-hour stale time, no poll. |
| `/api/v1/projects/P/type-observations` | Source type findings; all cursors on demand, no poll. |
| `/api/v1/projects/P/sources/S/introspections` | Introspection history; cursor-based infinite query, 5-second stale time, **no poll**. |
| `/api/v1/projects/P/introspections/R` | Run screen and shell breadcrumb for that run; 5-second stale time, **no poll**, enabled only where needed. Progress arrives through SSE. |
| `/api/v1/projects/P/catalog` | Schema explorer; requested source/parent/filter/cursor branches only, five-minute stale time, no poll. |
| `/api/v1/projects/P/catalog/elements/E/declarations` | Element declaration panel on demand, no poll. |
| `/api/v1/projects/P/catalog/sources/S/schemas/N/declarations` | Schema declaration panel on demand, no poll; schema name is URL encoded. |
| `/api/v1/elements/E/scope-tags?projectId=P` | Column tags editor, enabled only when open; on demand, no poll. |
| `/api/v1/projects/P/filings` | Filings screen; walks all cursors and sorts locally; stale immediately, **30-second poll**. |
| `/api/v1/projects/P/observations?view=…` | Observation groups; all cursors, **30-second poll**, stale immediately. Also read by Dashboard as described below. |
| `/api/v1/projects/P/custody-observations?view=…` | Permission-gated custody observation groups; same cadence as ordinary groups. |
| `/api/v1/projects/P/observations/members?group=…&view=…` | Expanded ordinary observation group; all cursors, enabled/polled every **30 seconds only while open**. Also read on demand to prepare an operator packet. |
| `/api/v1/projects/P/custody-observations/members?group=…&view=…` | Expanded custody group; same open-only cadence and pagination. |
| `/api/v1/projects/P/suggestions` | Suggestions screen with optional element/pool/view filters; all cursors, **30-second poll**. Dashboard separately reads open suggestions. |
| `/api/v1/projects/P/suggestions/domains` | Domain choices; all cursors on demand, no poll. |
| `/api/v1/projects/P/suggestions/J/attempts` | Suggestion attempt detail; all cursors on demand, stale time and GC time zero, **no poll**. |

Sources: [sources](../../src/app/sources/data.ts), [introspection](../../src/app/introspection/data.ts), [catalogue](../../src/app/catalog/data.ts), [declarations](../../src/app/catalog/declaration-data.ts), [tags](../../src/app/catalog/column-tags.tsx), [filings](../../src/app/filings/data.ts), [observations](../../src/app/observations/data.ts), [observation screen](../../src/app/observations/screen.tsx), [suggestions](../../src/app/relationships/data.ts).

### Pools, entitlements, Activity, custody, and engines

| GET endpoint | Consumer and cadence |
|---|---|
| `/api/v1/projects/P/pools` | Pools screen `usePoolList`: cursor-based infinite query, stale immediately, **30-second poll**. Entitlements/Activity pool choices use a separate `usePools` key: walk all cursors, 60-second stale time, no poll. Dashboard has a third, composed configuration cache described below. |
| `/api/v1/pools/Q?projectId=P` | Pool detail and relevant shell breadcrumb; stale immediately, **30-second poll**. |
| `/api/v1/pools/Q/agents?projectId=P` | Pool Agents `useAgents`: cursor-based infinite query, stale immediately, **30-second poll**. Dashboard separately walks every page. |
| `/api/v1/pools/Q/agents/A?projectId=P` | Selected agent twin; stale immediately, **30-second poll**; agent ID is URL encoded. |
| `/api/v1/pools/Q/keys/K/affected-agents?projectId=P` | Key-impact confirmation, enabled with key ID; on demand, stale time and GC time zero, no poll. |
| `/api/v1/pools/Q/entitlements?projectId=P&…` | Entitlements tree branches/filter/cursor scope; 60-second stale time, no poll. |
| `/api/v1/pools/Q/entitlement-groups?projectId=P&…` | Grouped Entitlements; infinite query, 60-second stale time, no poll. Dashboard also reads this endpoint on its configuration cadence. |
| `/api/v1/pools/Q/entitlement-members?projectId=P&…` | Expanded group members; infinite query, 60-second stale time, no poll. Group/undecided selection also reads all matching pages with `limit=500` in a mutation function to collect explicit IDs. |
| `/api/v1/pools/Q/row-entitlements?projectId=P&status=…&search=…` | Pool row-access list and open object picker; filter/cursor-keyed demand reads, no poll; picker query enabled only while open. |
| `/api/v1/pools/Q/row-entitlements/O?projectId=P` | Row editor current/default/override read; on demand, no poll. |
| `/api/v1/pools/Q/row-entitlements/O/history?projectId=P` | Row history, cursor-keyed; enabled while history is open, no poll. |
| `/api/v1/row-decisions/D?projectId=P` | Linked historical row decision, enabled with decision ID; on demand, no poll. |
| `/api/v1/projects/P/runs?…` | Activity filters/list; infinite query on demand, stale time and GC time zero, **no poll**. Dashboard separately reads `limit=5`. |
| `/api/v1/projects/P/runs/summary?…` | Activity summary using the same filters; demand reads, stale time and GC time zero, **no poll**. Dashboard separately reads a seven-day range. |
| `/api/v1/runs/R?projectId=P&startedAt=…` | Explicit Activity expansion or evidence permalink; demand reads, stale time and GC time zero, no poll. Collapsed rows and Dashboard Recently do not fetch this detail. |
| `/api/v1/projects/P/token-key` | Token custody screen; enabled/permission-gated, **30-second poll**. |
| `/api/v1/projects/P/engines` | Engines settings; walks all cursors, **30-second poll**. |

Sources: [pool data and keys](../../src/app/pools/data.ts), [entitlements](../../src/app/entitlements/data.ts), [group selection](../../src/app/entitlements/grouped.tsx), [row list/picker](../../src/app/pools/row-entitlements.tsx), [row editor](../../src/app/entitlements/row-editor.tsx), [Activity](../../src/app/activity/data.ts), [token custody](../../src/app/custody/data.ts), [engines](../../src/app/engines/data.ts). Row preview is a user-triggered POST `/api/v1/pools/Q/row-entitlements/O/preview`, not a recurring GET.

### Dashboard: one observed query, many HTTP reads

The mounted screen uses `useDashboardModel`, not the older `useDashboard`, `useDashboardFeed`, or `useShields` hooks. [dashboard/data.ts](../../src/app/dashboard/data.ts) and [dashboard/read-model.ts](../../src/app/dashboard/read-model.ts) implement two layers:

| Layer | Reads and cadence |
|---|---|
| Configuration, key `['project', P, 'stats', 'configuration']` | GET `/api/v1/projects/P/stats`; every page of `/api/v1/projects/P/pools`; for each pool, `/api/v1/pools/Q/entitlement-groups` with `mode=name`, empty prefix, `decision=all`, `limit=1` for totals, then `decision=undecided`, `limit=25`, traversing all undecided pages. `fetchQuery` reuses this result for **300,000 ms** unless invalidated. |
| Overview, key `['project', P, 'stats', 'overview', admin]` | Mount and **30-second poll**: obtains the configuration above, then reads every page of `/observations?view=open`, `/suggestions?view=open`, `/dashboard/feed`, and (administrators only) `/custody-observations?view=open`, all under `/api/v1/projects/P`. Also reads `/api/v1/projects/P/runs/summary` for seven UTC calendar days, `/api/v1/projects/P/runs?limit=5`, and all `/api/v1/pools/Q/agents?projectId=P` pages for every configured pool. |

The five-minute refresh is the first overview fetch after configuration becomes stale, not a separate five-minute interval. Configuration is read before the live read fan-out. Summary `days[].modes` supplies query/prompt counts without separate mode-summary requests. Feed rows are filtered to `source_failure`, `custody_provider`, and `row_scope_missing`. Configuration holds source setup count, pool membership and decision totals, including entitlement-group attempt annotations; these can be older than live findings, requests and presence.

These nested HTTP calls do **not** populate the ordinary Observation, Suggestions, Activity, Pool or Agents query keys. They live inside the Dashboard composition. Invalidating one of those ordinary families does not automatically refetch the overview. Invalidating `projectKeys.stats(P)` does match both Dashboard layers. Manual Dashboard Refresh first invalidates configuration with `refetchType:'none'`, then refetches overview, forcing configuration to be read too. `asOf` remains the configuration timestamp; Activity range/link cutoffs come from the live read. This is a multi-endpoint composition, not one transactional snapshot; failed/contradictory pagination errors the read rather than supplying clean partial totals.

The older three exported Dashboard hooks still specify 30-second intervals but have no mounted callers. In particular `/api/v1/projects/P/dashboard/pools` is present in the API client and `useShields`, **not read by the current screen**. Similarly, client definitions for evidence exports/status and view-definition do not establish console reads: no mounted console caller uses them. `projectKeys.detail` and `vocabularyKeys.effective` are invalidation targets, but no current console query function reads a project-detail or effective-vocabulary endpoint.

## The project stream and its sole browser subscriber

[AppShell](../../src/app/shell.tsx) calls [useProjectStream](../../src/app/project-stream.ts) with the project ID parsed from the pathname. It opens one native `EventSource('/api/v1/projects/P/stream')` per mounted project shell/tab. Screen components do not open their own streams or subscribe independently. Screens receive Query cache updates. Non-project paths open none; project changes/unmount close the connection and dispose its consumer. Moving within the same project keeps it open.

[The route](../../src/platform/sse/routes.ts) requires `project#view`. [RedisProjectHub](../../src/platform/sse/redis-hub.ts) uses project channels `sse:P:events` and an atomic increment/publish sequence at `sse:P:sequence`. It subscribes before capturing the sequence, briefly buffers concurrent arrivals, sends a snapshot, then delivers newer changes. Every connection/reconnection gets a fresh snapshot; no retained replay log or Last-Event-ID replay exists. Redis subscriber loss closes the HTTP stream; native EventSource reconnects. The browser hook has only `onmessage`, with no custom `onopen`/`onerror` refetch handler. The HTTP server sends comment keepalives every 15 seconds; those do not invalidate anything. Backpressure closes the connection instead of accumulating events indefinitely.

With `OPINTEL_DIAG=1`, the HTTP server records `sse_open`, `sse_snapshot` and exactly one `sse_close` per accepted stream. Records include project/request identifiers for local counting. Close reasons distinguish `client_close`, `backpressure_event`, `backpressure_keepalive`, `upstream_close` and `error`; the first server-initiated cause survives the subsequent upstream unsubscribe callback. Snapshot records count frames accepted by `response.write` (including buffered frames when it returns false), not proof that a browser received them. Close records include total data frames, snapshots and connection lifetime. These are opt-in diagnostic records, not metric labels containing project IDs.

[Wire schemas](../../src/shared/api/stream.ts) allow only the following payloads:

| `type` | Fields in addition to `type` and project `sequence` |
|---|---|
| `snapshot` | `at`, `invalidate` family-name array; **no list data**. Current families: `introspection`, `catalogElement`, `dataSource`, `filing`, `agentPresence`. |
| `introspection.progress` | `sourceId`, `runId`, state `queued/connecting/reading/diffing`, `objects`, nullable `total`. |
| `introspection.finished` | `sourceId`, `runId`, terminal state `complete/failed/cancelled`. |
| `catalog.changed` | `sourceId`. |
| `source.changed` | `sourceId`. |
| `filing.arrived` | `sourceId`, `filingId`. |
| `agent.presence` | `poolId`, self-declared `agentId`; **no presence state, timestamps or credentials**. |

There is no `run.created`, query-result, evidence-created, entitlement-changed, or general settings event in this union. The illustrative `run.created` and presence-upsert example in older §5.4 prose is not the implemented wire contract.

## Every stream-triggered invalidation

[projectStreamCache](../../src/app/stream-cache.ts) validates incoming messages, drops malformed ones and ignores non-snapshot events at or below its last sequence. It does not detect a sequence gap and independently fetch; reconnect recovery uses the snapshot. Snapshots reset the sequence. Invalidations are coalesced for 50 ms, with duplicate/covered prefixes removed.

Names in the tables below are the actual key-factory functions, not endpoint names. `P` is implicit unless another argument is shown. `projectKeys.stats` includes every Dashboard composition key.

| Signal | Invalidated keys |
|---|---|
| Every snapshot | `projectKeys.stats`, plus the families named by the snapshot as expanded below. |
| Snapshot `introspection` | `introspectionKeys.all`, `observationKeys.all`. |
| Snapshot `catalogElement` | `elementKeys.all`, `sourceKeys.lists`. |
| Snapshot `dataSource` | `observationKeys.all`, `sourceKeys.typeObservations`, `sourceKeys.lists`, `sourceKeys.details`. |
| Snapshot `filing` | `observationKeys.all`, `filingKeys.list`. **This family alone does not invalidate source lists**; current full snapshots also include the other families that do. |
| Snapshot `agentPresence` | `agentKeys.presence`, `poolKeys.lists`, `poolKeys.details`. |
| `introspection.finished` | `projectKeys.stats`, `observationKeys.all`, `sourceKeys.typeObservations`, `sourceKeys.lists`, `introspectionKeys.detail(P, runId)`, `introspectionKeys.lists`. |
| `catalog.changed` | `projectKeys.stats`, `elementKeys.all`, `sourceKeys.lists`. |
| `source.changed` | `projectKeys.stats`, `observationKeys.all`, `sourceKeys.typeObservations`, `introspectionKeys.lists`, `sourceKeys.lists`, `sourceKeys.detail(P, sourceId)`. |
| `agent.presence` | `agentKeys.pool(P, poolId)` (both agent list and twins), `poolKeys.lists`, `poolKeys.detail(P, poolId)`. **Does not invalidate Dashboard.** |
| `filing.arrived` | `projectKeys.stats`, `observationKeys.all`, `filingKeys.list`, `sourceKeys.lists`. |

`introspection.progress` causes **no invalidation/refetch**: it patches an existing active matching run's state/progress in cached run detail and retained infinite-list pages. It does not create missing run cache entries or advance fetch-age metadata. It does not invalidate Dashboard. Completion, catalogue and source notifications are separate event types: a finished event alone does not invalidate Entitlements or catalogue queries, despite the broader older specification matrix. The table above follows executable handlers.

## Other client callbacks that cause reads

Mutation callbacks mostly invalidate instead of installing their response as complete query state. This table covers all explicit non-stream invalidations in `src/app`; successful callbacks run only on success unless marked settled (success or failure).

| Callback | Invalidated keys |
|---|---|
| Create project | `projectKeys.lists()`, `companyKeys.lists()`. |
| Create company | `companyKeys.lists()`, `authKeys.currentUser()`. |
| Connect source / connect demo | `sourceKeys.lists`, `projectKeys.stats`. Demo also patches its cached template's `connected` flag. |
| Retry source introspection | `sourceKeys.lists`, `projectKeys.stats`; also patches the returned source in an existing source list. |
| Cancel introspection | `introspectionKeys.detail(P, runId)`, `introspectionKeys.lists`, `sourceKeys.lists`. |
| Create pool | `poolKeys.lists`, `projectKeys.stats`, `sourceKeys.lists`, `elementKeys.lists`. |
| Issue credential or rotate key | `poolKeys.detail(P, poolId)` only. |
| Revoke key | Pool detail, `poolKeys.lists`, `agentKeys.presence`. |
| Revoke credential | Same as revoke key, plus `activityKeys.all`. |
| Bulk entitlement decision | `entitlementKeys.all`, `sourceKeys.lists`, `poolKeys.lists`, `elementKeys.lists`, `elementKeys.declarations`, `projectKeys.stats`. |
| Save element/schema declarations | `elementKeys.lists`, `elementKeys.declarations`, `entitlementKeys.all`, `projectKeys.stats`. |
| Save scope tags | Only `elementKeys.tags(P, elementId)`. |
| Save row decision | `entitlementKeys.all`, `projectKeys.stats`, `activityKeys.all`; first removes cached entitlement queries whose last key segment is `preview-count`. |
| Row preview | `activityKeys.all`; when previewing the unchanged pool override expression, also installs a local cached preview count keyed by decision ID. |
| Suggestion decision, **settled** | `suggestionKeys.all` (lists, domains and attempts), `elementKeys.lists`, `elementKeys.declarations`, `entitlementKeys.all`, `projectKeys.stats`. |
| Token-key rotate/restore/rehearse, **settled** | `custodyKeys.status`, `observationKeys.all`; success also installs the returned token-key status before invalidating. A refused check can have recorded a failed verification. |
| Engine action, **settled** | `engineKeys.list`, `sourceKeys.lists`, `projectKeys.stats`, `custodyKeys.status`. |
| Revoke release | The current `activityKeys.detail(P, receipt, startedAt)` and `activityKeys.summaries`; not the whole Activity list or Dashboard family. |
| Rename project | `projectKeys.lists()`, `projectKeys.detail`. |
| Migrate industry | `projectKeys.detail`, `vocabularyKeys.effective`; also patches industry metadata in the project list. |
| Save personal settings | `settingsKeys.personal()`, `authKeys.currentUser()`. |
| Save company settings | `settingsKeys.company(C)`, `companyKeys.lists()`, `projectKeys.lists()`, `authKeys.currentUser()`. |
| Save project settings | Always `settingsKeys.project`, `projectKeys.detail`, `projectKeys.stats`. If body has `custody`: provider status and Activity all. If `evidence`: Activity all and suggestion attempt lists. If `query`: Entitlements all. If either agent heartbeat/disconnect timing is present: presence all, pool lists and pool details. Otherwise, if pool key grace is present: pool details. |
| Custody provider check or signing rotate | `custodyProviderKeys.status`, `projectKeys.stats` for **both** actions. Older prose describing rotate as provider-only does not match this hook. |

The source links in the endpoint sections contain these callbacks; additional inline callbacks are in [project settings](../../src/app/settings/screens.tsx) and [row editor](../../src/app/entitlements/row-editor.tsx).

Explicit UI handlers also fetch without family invalidation:

- Dashboard Refresh and its error retry force both composition layers as described above. Activity Refresh explicitly refetches its current list, then its current summary.
- Error/retry buttons refetch their attached observer: auth providers/session, projects/companies/industries, sources/demo templates, catalogue/tree branches, declaration panels, Entitlements pools/groups/members/branches, current row decision/object picker, Access members/permission explanation, introspection list/detail, filings, observations/groups/members, suggestions/domains/attempts, pool list/detail/agents/twin and key-impact confirmation, token-key/provider status, engines, Activity list/summary/detail, and personal/company/project settings. Access also exposes member/permission refresh in its empty states. Some screen-level error handlers refetch several dependencies together (for example declarations plus projects; Engines plus projects plus sources). These call `refetch`, not a wider invalidation policy.
- Load-more/next-page handlers call `fetchNextPage` for infinite lists or change cursor keys for paged lists; tree expansion mounts the needed branch query. Searches, filters, selected member/object and disclosures similarly enable/change queries; they do not globally invalidate data. Observation packet preparation calls `readObservationMembers` directly for the selected scope.
- Access's project selector and the shell project switch explicitly remove `projectKeys.scope(oldProject)` before navigating to a different project; they do not refetch that old scope. The next project's stream connection snapshot then invalidates its families.

There is no other application-level browser event bus that refetches data. TanStack's focus/network listeners provide the default stale-query refreshes described above. Query-cache subscriptions in [query-fetched-at.ts](../../src/app/query-fetched-at.ts) and [freshness.tsx](../../src/app/freshness.tsx) only record successful full-fetch times and render freshness; they do not invalidate or fetch. [timestamp-clock.ts](../../src/app/settings/timestamp-clock.ts) ticks every minute and on visibility return solely to rerender relative timestamps. Media-query, resize, scroll, outside-click, keyboard and auth `pageshow` handlers manage layout/disclosure/auth UI state, not server refetches.

## Where the five-minute and thirty-second values live

There is no shared refresh setting for these cadences.

| Value | Actual configuration |
|---|---|
| Dashboard configuration freshness, five minutes | `staleTime:300_000` on the nested `cache.fetchQuery` in [dashboard/data.ts](../../src/app/dashboard/data.ts), `useDashboardModel`. |
| Catalogue freshness, five minutes | `staleTime:5 * 60_000` in [catalog/data.ts](../../src/app/catalog/data.ts), `catalogOptions`; no timer. |
| Dashboard live cadence, thirty seconds | `refetchInterval:30000` on `useDashboardModel` in Dashboard data; also present on the three unused older hooks. |
| Other thirty-second polling | Local `refetchInterval:30000` or `30_000` in [pools/data.ts](../../src/app/pools/data.ts) (list, detail, agents, twin), [observations/data.ts](../../src/app/observations/data.ts) (groups and open members), [relationships/data.ts](../../src/app/relationships/data.ts) (suggestions only), [filings/data.ts](../../src/app/filings/data.ts), [engines/data.ts](../../src/app/engines/data.ts), [custody/data.ts](../../src/app/custody/data.ts) (token key). |

The API timeout's `30_000`, the server completion-delivery job's 30 seconds, TanStack's default inactive-cache GC window, and agent disconnect grace's default 300 seconds are different mechanisms, not a common console refresh configuration.

## How presence reaches the client

1. The authenticated MCP transport supplies the resolved pool/key separately from the claimed agent ID. [MCP HTTP](../../src/modules/mcp/infrastructure/http.ts) classifies initialize as `connect`, ping/transport heartbeat as `heartbeat`, and other requests as `request`; an outgoing ping alone is not liveness, only its authenticated response is. [McpAccess](../../src/modules/mcp/application/access.ts) calls `AgentPresenceService.observeAuthenticated`.
2. [PostgresAgentPresence](../../src/modules/pools/infrastructure/presence.ts) validates the key and writes the presence observation and credential last-use time in tenant scope on every authenticated signal. It publishes `agent.presence` with identifiers only after a transition: first observation, changed persisted state/stale deadline, or return from a different read-time aged state. Repeated active-to-active requests/heartbeats update timestamps without publishing. Comparing both persisted and aged state preserves notifications when a request returns from idle/stale/disconnected before a sweep has persisted that state. All claimed identities remain `verified:false`; presence is not authorization. Failed notification publication is logged rather than turning an already committed change into a failed command.
3. A guarded sweep started in [HTTP startup](../../src/platform/http/start.ts) runs every **5 seconds**. It persists age transitions and publishes the same signal for changed rows. Reads also age rows at read time. [Presence rules](../../src/modules/pools/domain/presence.ts) mark active agents idle after 60 seconds without a request, stale after three missed heartbeat intervals, and disconnected after the configured grace from the stale deadline. Defaults in [project-settings.ts](../../src/shared/project-settings.ts) are heartbeat **20 seconds** and disconnect grace **300 seconds**; these are not the client's polling cadence.
4. Redis fans the identifier signal out through the project SSE connection. The consumer invalidates affected pool Agents list/twins, pool list and pool detail. Those active observers pull their authorized JSON again; no presence record is upserted from SSE. Their own 30-second polls also refresh status/credential information without a signal.
5. Dashboard does **not** refetch on a presence delta. Its next 30-second overview read traverses presence pages for every cached configured pool. A reconnect snapshot does invalidate the whole Dashboard family. Thus the same presence observation can appear sooner on an open Pool screen than on Dashboard.

## Existing unevenness

The old general cache-policy table says agents are written by SSE and not polled, and introspection polls while active. The current code does the opposite transport choices described here: presence signals refetch plus polling, and introspection progress patches without polling. The later presence/X-06 prose records those changes. Suggestion **lists** poll; an already open attempt-detail query does not, despite the Dashboard prose's broader reference to live Suggestions attempts.

The stream does not cover all reads, and invalidation keys are not a dependency graph. Ordinary Observation/Suggestions/Activity reads and their Dashboard copies have different keys and lifetimes. Several mutation callbacks target families without a mounted reader. Structural stream handlers invalidate broad Dashboard composition keys while narrower presence/progress handlers deliberately do not. Some successful commands both patch and refetch. These are properties of the existing system, not guarantees of a tidy universal refresh rule.
