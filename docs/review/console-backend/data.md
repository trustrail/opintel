# Parallel console Data review

Data is implemented in `src/console-next/data` in `@opintel/console-next`,
opened with `?project=PROJECT_ID&screen=data`. The current console is unchanged.
This delivery is a feature branch for review; it does not merge or deploy it.

## Wiring and scope

The shared Home/Pools Ring, kind icons and treatment marks are reused. Scope
picker, report band and fixed lists now have shared wrappers used by Pools and
Data. All charts are visx; primitives are Radix, icons Phosphor regular, and the
existing Motion reduced-motion configuration remains in force. No UI kit,
CSS class or master stylesheet change was introduced.

| Feature | Existing endpoint or new projection |
| --- | --- |
| Catalogue/table columns | `GET /api/v1/projects/:id/catalog`, including every cursor page |
| Stored estimates | New nullable `rowEstimate` on object nodes in both catalogue paths, and on `opintel.describe` objects |
| Per-pool treatments and table membership | `GET /api/v1/pools/:id/entitlement-members`, `/tables`, and pool details |
| Treatment picker | `POST /api/v1/pools/:id/entitlements/bulk`, one element, fresh idempotency key |
| Sources | `GET /api/v1/projects/:id/sources` |
| Rescan | `POST /api/v1/sources/:id/introspect` with project id |
| Connect | Existing project `/engines`, `/sources/test`, then `/sources` registration |
| Suggestions | Project `/suggestions?view=open`, `/suggestions/domains`, and `/:suggestionId/decisions` |

Every list reads through the terminal cursor. Data and suggestions refresh every
15 seconds. The selected source scopes the band, table list, grid, source list
and pending suggestions (either candidate side). Band counts filter actual
facts. Decided is counted per pool/member; source bindings alone do not create
imaginary table decisions. Tables sort needing-decision first, then descending
estimate, unknown last. Grid columns needing any pool decision come first.

Estimate reads project the existing stored value in the existing tenant scope;
no migration or source count query was added. Null is unknown; zero is ~0.
A sum containing an unknown is unknown, with known pie slices explicitly marked
partial. The screenshot fixture reads pg_class.reltuples after ANALYZE.

Clear still requires justification, Mask requires a mask kind, and all six
choices retain the existing declaration/type checks. Errors appear unchanged,
with a link to the current declaration editor when needed. Suggestions retain
project-name confirmation, latest-attempt guard, existing domain member versions
and backend confirmation blocks. Viewer/operator information stays visible;
admin-only mutations follow existing permissions. No evidence or treatment reset
operation was added.

## Differences from images 12–15

- Names, counts, treatment distributions, pool codes and source statuses come
  from the real review fixture: Warehouse, records, six fields and two pools,
  rather than illustrative reinsurance rows. Suggestions is the actual empty
  state. No sample candidates, timestamps or values were inserted.
- The shared foundation retains its existing 8 px spacing/type scale, button
  sizes, corner radii, regular Phosphor glyphs and treatment marks. Header/band
  and row heights therefore differ from the design pixels (64 px table/column
  rows; 88 px source rows). The ring band is taller than the supplied image.
- The table header explicitly names the To decide column. Phone rows become
  fixed-height lists with source, labelled rows/columns and one pool bar per
  line. The phone band is a two-by-two grid with scrollable, touchable legends.
  No 390 px Data reference was supplied; these use the shared phone foundations.
- Table/view kind icons are shown only when the existing needs-you context
  supplies the kind. The catalogue API does not otherwise expose object kind;
  a missing icon is hidden instead of guessing a table icon for a view. All
  known kinds use the shared icon and its hover name. Pool codes use the shared
  pool-kind hover label, keeping the code-only badge.
- The final grid column says Token domain and shows actual declared domains.
  It does not invent comparison partners from a shared domain name. Unknown
  source types/domains are absent. At phone widths type/domain sit under the
  name; pool cells stay in a horizontally scrollable Radix grid if needed.
- Clear/Mask expose the backend-required justification/mask controls after
  selection; incompatible declarations return the existing human error and
  link to the current console. They cannot silently apply the sample choice.
- Sources has an explicit Rescan action rather than the image's trailing
  chevron. A source name selects its scope; pool badges open Pools. Actual
  source status/error is shown and last-scan text appears only when supplied.
- Connect uses a typed stored reference from `./sources add`, verified-engine
  selection and explicit included schemas. There is no reference inventory
  picker in this phase. The existing test endpoint returns “Save and assign
  the source first. Connection testing runs automatically after the engine
  applies its network policy.” The form displays this exact result and then
  offers Save and assign; it does not claim a successful connection test.
- The picker retains the shared theme action and search/empty states. It uses
  exact open-decision count badges on source options instead of the design
  status dots; it has no aggregate amber dot in its header. Navigation attention
  remains needs-based. Unavailable statistics/health are hidden.

## Verification and captures

Lint, strict typecheck, 47 console tests, 19 targeted catalogue/MCP tests,
9 artifact/soak contract tests (including DEP-008), and the real-browser capture
check pass. No full gate is run for this scope. Targeted backend checks cover both catalogue object paths and
actual MCP output for positive, zero and null estimates, existing omission and
binding checks, and producer/consumer contracts. Console tests cover estimate
propagation, per-pool counts, cursor completeness, filtering/sorting, picker,
mutation guards, source flow, suggestion guards, empty/error/read-only states
and shared foundations. Strict typecheck and lint use unchanged rules.

The manual browser capture uses real PostgreSQL/SpiceDB/HTTP projections and a
real bulk Withhold command. It checks no page/API errors, viewport containment,
visible keyboard focus, source scoping and band filtering. Authentication is a
fixture identity; scanning/registration is not executed in the capture (the
command wiring has console unit coverage). Reduced motion is enabled; rings
have no independent loading animation. These are fresh review artifacts,
separate from the retired historical pixel tier.

| Reference/view | Screenshot |
| --- | --- |
| 12 · Entitlements, 1440 light | [PNG](data-screenshots/data-entitlements-1440-light.png) |
| 13 · Column grid/picker, 1440 light | [PNG](data-screenshots/data-columns-1440-light.png) |
| 14 · Sources/picker, 1440 light | [PNG](data-screenshots/data-sources-1440-light.png) |
| 15 · Suggestions, 1440 light | [PNG](data-screenshots/data-suggestions-1440-light.png) |
| Entitlements, 390 light | [PNG](data-screenshots/data-entitlements-390-light.png) |
| Column grid/picker, 390 light | [PNG](data-screenshots/data-columns-390-light.png) |

[Browser evidence](data-screenshots/capture.json).
