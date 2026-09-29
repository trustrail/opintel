# Item 5.12 implementation

Activity is a project drawer destination with shareable mode, pool, outcome,
agent and UTC range filters. Requests page through a descending timestamp/id
cursor; the list renders at most twelve rows. A contextual link opens the
record, with Activity as its breadcrumb parent. No screen-specific back button,
new CSS class or stylesheet change was introduced.

The record reads immutable headers and left-joins completion. A header with no
completion is incomplete, with unknown delivery and key usage, rather than
missing. The detail retains database timestamp microseconds and shows recorded
element states/treatments, historical object references, policy version,
catalogue generation, vocabulary version, selected/used token key versions,
source freshness/landing strategy, synthetic provenance and stages. It does not
join today's catalogue or decisions to explain yesterday's answer.

Both API routes declare project#view and execute evidence reads with tenant
scope. The API separately checks project#view_unredacted. Without it, or under
aggressive policy, arguments are absent from both response bodies. Under none,
authorised readers get recorded text. Under allowlist, sql must be named and
constants are replaced in C.3's parsed statement before printing. Comments are
discarded by parsing. Unsupported/malformed SQL and unqualified file references
are hidden. Prompt prose has no structured stripping path in this slice and
stays hidden under allowlist. Arbitrary stage, CIL and source-plan JSON is not
returned; only declared metadata crosses the read boundary.

Redaction remains read-time only, as approved. Stored redaction belongs to 5.17.
The mutable authorised projection uses no-store responses and drops inactive
client query data. §4.6 documents this exception to immutable-entity caching.
Migration 048 adds pool/range and project/order indexes without changing any
evidence records. No export, retention, prompt execution or settings screen was
implemented.

## Verification

- M-013/M-014: real HTTP and scoped database tests cover viewer/aggressive
  redaction in list and detail, explicit raw mode, parsed literal stripping,
  unknown syntax, nested JSON suppression, cross-project access, stored version
  history, incomplete records, filters and microsecond cursors.
- M-007: one million actual database headers; five pool/range reads of 51 rows
  each all passed the 500 ms limit. Isolated run: one test, 101.44 seconds
  including seeding and setup.
- Migration 048 down/up twice passes in a rollback-only transaction. Applied
  only to the isolated test database; the development database was not migrated.
- Browser tests cover both screens' loading, empty, error and ready states,
  incomplete records, filters, pagination, breadcrumbs and axe. Six snapshots
  cover 390, 900 and 1440 px. The pinned browser requires the Docker runner on
  this host because its macOS version is unsupported by current Playwright.

- Full `npm test`: 125 files, 1,304 tests passed (444.21 seconds).
- Final focused API/migration run, including raw-versus-allowlisted prompt
  coverage: two files, five tests passed (6.47 seconds).
- Final functional/accessibility/snapshot run: four tests passed (26.6 seconds),
  with all six new snapshots generated and visually reviewed.
- M-015 final isolated Docker run: one test passed (8.3 seconds). Against a
  million-record paged fixture, it loads ten pages and measures 120 scrolling
  frames: 16.7 ms measured refresh, 16.8 ms maximum interval, zero missed frames,
  twelve rendered rows. Early probes reported missed frames, including a run
  contaminated by a Vite hot reload. The final measurement freezes source files
  and runs without competing verification jobs. The no-missed-frame assertion
  was not relaxed. Scroll updates now stay within the list, avoid per-row router
  subscriptions and contain layout/painting within the viewport.
- Strict typecheck, lint including boundaries, production build and
  `git diff --check` passed. Build reports a bundle-size warning.
