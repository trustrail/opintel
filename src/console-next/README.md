# @opintel/console-next

The packaged console. Routes, settings sections and tabs are declared in `routing.ts`; shared tokens and components implement the approved console designs.
Run `npm run console:dev` from the repository root, then open
`http://localhost:5174/?project=PROJECT_ID`. Sign in through the current console
first (same host, existing session cookie). `?theme=dark` selects dark mode;
the shared rail account menu switches themes on every screen, including phones.

- `npm run console:test`: isolated console unit tests, no databases.
- `npm run console:build`: independent Vite output in `dist/console-next`.
- `npm run typecheck` and `npm run lint`: repository strict checks.
- Backend target files: `test/project-health.test.ts`,
  `test/run-completed.test.ts`, `test/evidence-writer.test.ts`,
  `test/sse.test.ts`, `test/http-server.test.ts`, `test/needs-you.test.ts`.

The separate Vite server redirects existing destination paths to `APP_BASE_URL`
(or the current console at localhost:5173). It does not replace the current
console router or implement another destination screen. API requests proxy to
`API_PORT` (default 3000). No production deployment or package switch is included.

Tokens live in `tokens.css`; layout uses semantic elements and data attributes,
without adding classes to or changing `docs/opintel-master.css`. Primitives are
Radix, icons are Phosphor regular, state-change animation uses Motion (200 ms,
reduced-motion aware), and both charts use visx. TanStack Query owns server
facts; the adjacent Zustand store owns the order/theme preferences.

Needs-you reads every page to the terminal cursor without inventing items; role and order switches reorder the
same queue. Report counts come from the specified summary/stats contracts.
Custody counts are receipts with grants, not cells or decryption evidence.
Exposure drill-down reads actual entitlement members and filters them locally
because the current destination router has no treatment filter. Connected-agent
drill-down reads fresh per-pool presence. No authorization uses agent identity.

The stream refreshes on completion and reconnect snapshots. It coalesces bursts,
deduplicates sequence numbers, closes subscriptions when changing project, and
polls at 15 seconds while disconnected. Grey means stream loss, not agents down.
The 30-minute request strip is omitted if its bounded paged read is incomplete;
it never invents values for missing buckets. Exposure is omitted at zero known
column decisions. Every list has loading, empty, error and ready states.

Manual review screenshots use `test/review/console-next.config.ts`, not the full
gate or retired pixel tiers. Start an isolated Playwright 1.63 browser server on
localhost:9324, then run:

```sh
npm test -- --config test/review/console-next.config.ts
```

This uses normal isolated test services and real HTTP projections, executes real
Engine requests, and validates live completion delivery. Authentication is a
fixture identity. No API responses or rendered numbers are mocked for captures.
Artifacts go to `docs/review/console-backend/phase1-screenshots/`.


Review corrections: desktop keeps the entire queue in a fixed-height scroll
viewport. Phones show five items plus an exact “N more” disclosure; expanding
reveals the rest in the page without internal scrolling. Decision labels use API-provided pool/table/column
context and shared kind icons; effects appear only on expansion. Area dots use
needs-you items rather than health counts. Known setup/check findings warn;
unknown means an unavailable check. Header hover includes the actual reason.
The custody number opens only granted receipts, not all custody summary states.


Data lives in `data/`, selected by `?project=PROJECT_ID&screen=data`. Optional
`source`, `table` and `tab=sources|suggestions` parameters select scope/view.
Data shares the Pools scope picker, report band and fixed-list wrappers, plus
Home/Pools kind icons, treatment marks and visx ring. Lists read every page and
refresh every 15 seconds. Actual per-pool members own decision counts. Unknown
estimates stay unknown; no source row counts run. Writes use the existing bulk
entitlement and source/suggestion flows. The current source test reports that
connection testing happens after assignment; the form displays that exact
result, then offers Save and assign. Engine reference inventory remains outside
this phase. Read `docs/review/console-backend/data.md` for review differences and
six screenshot links. Manual capture config is
`test/review/console-next-data.config.ts` (requires the browser server above).

Data completion fixes and the compact phone band are reviewed in `docs/review/console-backend/data-fixes.md`.

Activity lives in `activity/`, selected by `?project=PROJECT_ID&screen=activity`
(with optional `pool` and `outcome=refused`). It reads every page for today's UTC
scope, displays 50 fixed rows at a time with an exact remaining disclosure, and
fetches a selected receipt with its original full-precision startedAt. It reuses
the project stream refresh/fallback and shared account/scope/ring/mark/chip
components. The optional bounded 15-minute summary supplies the Today chart.
Receipts display current credential names as current, and retrieve immutable
recorded row decision ids only for authorized roles. Missing detail never becomes
zero. Four manual capture links and every design difference are documented in
`docs/review/console-backend/activity.md`. No full gate or merge for this phase.
