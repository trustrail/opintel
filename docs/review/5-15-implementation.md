# Item 5.15 implementation

The Dashboard now reads project metrics, a cursor-paged findings feed and
cursor-paged pool shields. It uses the existing console classes and navigation;
the master stylesheet is unchanged. Contextual links lead to the relevant pool,
entitlement selection or failed introspection. Token key custody uses its existing
permission-gated destination.

The approved definitions are recorded in §5.5:

- Project coverage and the spectrum count active bound pool–element pairs,
  including undecided, labelled “decisions across N pools”. Archived sources and
  removed catalogue objects/elements are excluded. Pool shields use the same
  denominator within their pool; no active elements means n/a.
- The ring shows decided coverage. The spectrum and shields state the clear
  ratio without judging it: the correct ratio depends on the data.
- Requests, refusals and incomplete runs use UTC today, explicitly labelled on
  screen. A header without a completion counts as incomplete. Connected and stale
  agents use the existing presence deadlines; disconnected twins remain in Pools.
- Findings consist of undecided decisions grouped by pool/source, current source
  introspection failures, quarantined filings and authorized custody failures.
  Quarantine exposes category and local resolution commands, never filename or
  detailed reason. The database projection selects only the permitted metadata.
- With no findings the feed is absent: no heading, placeholder or “no issues”
  card. Factual metrics and shields remain. This is the O-004 clean-state rule.

The new stats, dashboard/feed and dashboard/pools read routes declare
project#view, use tenant scopes and return no-store responses. Cursor tokens are
bound to project and collection; evidence arguments are never selected. Feed
pagination orders stable finding identifiers; shields order pool identifiers.
TanStack Query owns server state. Project SSE changes invalidate the project
stats family, including findings and shields; a 30-second refresh updates
time-dependent totals and presence even without an event. Explicit error states
prevent failed reads from presenting the project as clean.

## Verification

- Focused backend, cache, route-schema and shell/UI regression: five files,
  19 tests passed (22.48 seconds). Includes multi-pool denominators, UTC boundaries,
  incomplete evidence, quarantine metadata exclusion, current failure resolution,
  presence deadlines, project permission/isolation and cursor isolation.
- Linux Playwright dashboard and filings regression: 14 tests passed
  (1.6 minutes). O-001–O-004 cover loading, error/retry, purposeful setup, ready
  and clean states. Also covers custody permissions, contextual navigation,
  quarantine resolution instructions and feed removal after SSE refresh.
- Ready, clean and empty dashboard snapshots were captured at 390, 900 and
  1440 pixels. Axe and horizontal-overflow checks passed at each width; captures
  were visually inspected. Existing filings dashboard snapshots were updated.
- Final tenancy/navigation browser regression: six tests passed (17.4 seconds),
  including project creation landing on the Dashboard, switcher/breadcrumbs,
  loading, empty states and server errors with retry.
- Strict typecheck, lint/boundary checks, production build and diff whitespace
  checks passed. The build retains the >500 kB bundle warning (634.67 kB before
  gzip).
- No schema migrations, grants or external calls were added. Migration up/down
  is not applicable. Backend tests used the isolated test database.
- The full repository and bypass suites were not rerun for this screen item.

The first focused run caught a refusal fixture lacking its required validation
stage and a bound route method incompatible with the route-schema scanner's
proxy. The fixture now records the stage, and the route uses an explicit closure;
the scanner remains unchanged. Browser checks use the pinned Playwright container
because the host Chromium build does not support this machine's macOS version.
