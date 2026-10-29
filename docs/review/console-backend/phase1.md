# Console Home: Phase 1

The new Home is in `src/console-next`, private package `@opintel/console-next`.
Run `npm run console:dev` and open `http://localhost:5174` after signing in on
the current console using the same hostname. `npm run console:build` produces
an independent `dist/console-next`. The current `src/app`, shared UI styles,
master stylesheet and reference console are unchanged. No other screen or
production deployment is included.

The Phase 1 stack is React, Radix primitives, Phosphor regular, Motion and visx.
The shared token file defines spacing, five type sizes, three radii, two shadows
and both themes. Markup uses semantic elements/data attributes; no new CSS
classes were added. Treatment marks and the ring are shared components. Focus,
pressed, hover and disabled styles are defined; motion is limited to state
changes and respects reduced motion. Text contrast pairs are tested at AA.

## Backend and wiring

- Added project-view GET `/api/v1/projects/:id/health` with one five-kind shape:
  engine, sources, custody, TLS and token key. Reasons summarize saved facts;
  timestamps are nullable. Known setup/check findings warn; unavailable checks
  remain unknown. TLS consumes the existing
  deployment flag and makes no certificate-expiry claim. Mail is omitted;
  CONSOLE-HEALTH-MAIL records the required console mail-test/status contract.
- The evidence writer publishes strict `run.completed` after its transaction
  commits. Only run ID, pool ID, outcome and time are carried besides the stream
  envelope. Publication failure preserves the committed query outcome.
- Home reads the paged needs-you endpoint without adding missing findings.
  All/Decisions/Running it and the viewer's role reorder the same queue. Expanding
  an item reveals its effect and the link to the existing resolving screen.
  Collapsed rows show no effect line. Every item remains in the internal scroll
  viewport; pages are read through the terminal cursor.
- Requests/refusals/custody use `/runs/summary`; connected agents use `/stats`.
  Custody means receipts with grants, not decrypted values. Numbers open their
  filtered existing list or a Home drill-down of actual API records. The custody
  drill-down includes only receipts with a granted event.
- Exposure uses the existing dashboard stats spectrum. Its marks open a
  treatment-filtered member list using existing pool/member endpoints, without
  inventing a treatment filter on the old router. Each row links to the existing
  column decision. Agent drill-down reads fresh presence per pool.
- The 30-minute strip uses a complete cursor read of recent runs and actual
  minute buckets. It is hidden if the bounded read is incomplete. No random bars
  or source values are used. Zero known Exposure decisions hide that element.
- Completion events and reconnect snapshots refresh the project facts. Bursts
  coalesce and duplicate sequences are ignored. Stream loss turns the indicator
  grey and enables 15-second polling. Old subscriptions close on project switch.

## Comparison with the approved images

The layout follows 02-HomeLight and 03-HomeMobile: desktop rail, project switcher,
health/order header, four numbers, queue/height-filling ring, then the strip;
phone header, queue, stacked two-by-two numbers, health list and fixed bottom
navigation. The queue has fixed-height rows with an internal scroll area.

Intentional differences dictated by available backend facts:

1. Five health kinds, not six: mail is absent. An unavailable TLS deployment flag
   displays unknown rather than an invented certificate warning. Other saved
   checks similarly preserve unknown; these fixture captures are not a claim of
   production engine/XQ/TLS health.
2. Queue contents, names and numbers are real fixture API results, not the sample
   values in the designs. Unsupported evidence-retention/TLS queue items are
   absent. Decision items now include real structured pool/table/column context;
   pool badges abbreviate the actual name rather than inventing a stored code.
3. The strip shows actual requests/refusals in 30 one-minute buckets. A complete
   per-minute custody delivery series is not present in the existing Activity
   list contract, so it is omitted. The fixture's requests occurred in one
   minute; the strip is sparse rather than filled with illustrative activity.
4. Dark is the same layout with the new dark tokens; only light reference images
   were supplied. Phone search finds an item within the one existing queue;
   global search is outside Home scope. Theme switching is in the appearance/
   project menus. A small phone live dot is added to preserve disconnect state.

## Screenshots

Captured at 1440 × 1000 and 390 × 1500. These use an isolated test database,
real HTTP projections, real Engine queries and Redis SSE; authentication is the
fixture identity. No frontend API responses or displayed counts were mocked.
The capture also executes another request and checks the band changes from 7 to
8 through the stream, then checks the disconnected polling state.

| | Light | Dark |
|---|---|---|
| 1440 px | [Desktop light](phase1-screenshots/home-1440-light.png) | [Desktop dark](phase1-screenshots/home-1440-dark.png) |
| 390 px | [Phone light](phase1-screenshots/home-390-light.png) | [Phone dark](phase1-screenshots/home-390-dark.png) |

[Capture metadata](phase1-screenshots/capture.json) records viewport sizes,
actual API response statuses, live-check counts and browser page errors.

## Validation

- `npm run console:test`: 14 tests passed (including light/dark AA text pairs).
- `npm run typecheck`: passed, strict.
- `npm run lint`: passed; no dependency violations.
- Targeted backend/contract suite: 43 tests passed across health, completion,
  evidence writer, SSE, HTTP and needs-you files. The Home-fix needs-you/health recheck
  passed all 10 tests, including the new structured-name contract.
- Manual review capture: passed, including all four viewports/themes, 44 px
  phone tab targets within the viewport, no horizontal overflow, effect and
  Exposure drill-downs, real completion refresh and stream-loss polling.
- `npm run console:build`: passed. Vite emitted its large-chunk advisory
  (810 kB minified / 247 kB gzip); no bundle budget was changed.

The local test database was missing existing migration 087. It was applied using
`migrateUp` before the backend suite; no migration file, applied checksum or
application environment file was changed. The screenshot browser ran in Docker
because native Playwright Chromium does not support this Mac's OS version.

No full gate or merge was run. The Home review follow-up authorizes a commit
and push to `feat/console-home-fixes`; the final handoff records its commit.


## Home review confirmations

- **Rule 13:** Requests opens UTC-today Activity; Refused adds the refusal filter;
  Custody opens only granted receipts; Agents opens only fresh connected
  presence. Exposure counts open the treatment-filtered column list. No custody
  decryption or value count is inferred.
- **Rule 14:** pool, table/view and column names use the shared kind icons, whose
  tooltips name the kind. Pool badges show the full pool name on hover. Row
  separators are `·`; tables/views retain their actual kind.
- **Keyboard focus:** the queue is a focusable region, every row remains
  reachable, and focused rows have a visible inset token-blue outline. Browser
  checks reach the last row at both widths and assert `:focus-visible` plus its
  solid outline. No row is sliced out of the DOM.
- **Reduced motion:** Motion layout/fades are disabled for the reduced-motion
  preference. Captures verify zero animations on expanded effects; the normal
  200 ms state transition also runs without browser errors.
- **Attention and health:** Data/Pools dots use column/row needs; Settings uses
  settings/check needs, independently of health warning totals. Header icons
  use the status colour and expose the actual reason on hover. Known actionable
  findings warn; only unavailable checks are unknown.
