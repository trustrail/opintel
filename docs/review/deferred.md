mkdir -p docs/review
cat > docs/review/deferred.md <<'EOF'
# Deferred from item 1.4

- withPlatform and withPlatformAdmin share the tenant pool..
- withPlatformAdmin does not write an audit entry; audit_entry arrives in 2.1.
- No call-graph test proving customer routes cannot reach withPlatformAdmin.
  Add when routes exist, item 2.3.
- No lint rule forbidding pool imports outside platform/db.
- migrate.ts uses a direct pg.Client. Deliberate: migrations run before any
  tenant exists. Needs an explicit exemption when the pool lint rule is added.
EOF

# Plan ordering corrections, found by foreign-key audit

- 2.1 and 2.5 merged: company/project reference industry, and
  vocabulary_term/synonym_candidate/embedding reference project. Mutual.
- 1.6 now depends on 2.1: pending_invite references company and project.
- 5.1 now depends on 1.6: pool_key.created_by references user_account.
- 5.1 moved to the top of P3: entitlement.pool_id references pool, so the
  governance phase cannot build before the pool table exists.

# From item 1.5a

- platform/http logs unhandled errors with console.error. §8.4 requires the
  structured logger with a field allowlist. Switch to platform/telemetry.
- Idempotency-Key (§2.4) is not implemented. Required on pool creation, key
  rotation, source deletion, bulk entitlement set and export creation.
  Needed by item 5.1.

# From item 1.5c

- No test for a path parameter that fails Zod validation. The happy path is
  covered; an invalid :id should return validation_failed in the envelope.

# From item 1.11

- src/shared/ui/styles.ts imports ../../../docs/opintel-master.css. Works in
  Vite; confirm the production build and any Docker image include docs/.

# From item 1.12

- Breadcrumb and project switcher show console demo data (Northwind Foods,
  Field Yield 2026). Replace with real project state at item 2.6.

# From item 1.12

- Breadcrumb, project switcher and account footer show console demo data
  (Northwind Foods, Field Yield 2026, Dara Okafor). Replace with real state
  at item 2.6 and item 1.13 respectively.
- docs/opintel-master.css corrected: .collapsed .dtoggle was display:none,
  so the console itself could not reopen the drawer. The reference
  implementation carried the defect.

# From item 1.10

- Resolved in 5.16: sso_enforced requires exactly one enabled company_idp.
  The company settings write and provider mutations are guarded by migration
  050 database triggers, serialized on the company row. /auth/providers retains
  its defensive ambiguity handling.

# Item 1.10 enforcement gap — corrected by 5.19

From 1.10 until 5.19, magic-link issuance and confirmation had no server-side
SSO enforcement check. Provider resolution hid the option and redirected, but
a direct POST to request-link still issued a link to a non-administrator.
Callback or device confirmation could create a magic-link session; the next
authenticated read revoked it. Hiding the option and revoking afterward did not
prevent issuance or sign-in.

Item 5.19 checks enforcement at issuance and both confirmation paths, applies
the administrator exemption at those same points, and retains session-read
revocation as defence in depth. Direct non-administrator POST coverage asserts
no token, mail-outbox entry or delivery, not merely later revocation.

The 5.19 audit also found independent issuance in
`PostgresInvitationRepository.create`. This is now changed under enforcement:
create the pending invitation, enqueue a company-provider sign-in URL, and issue
no magic-link token. Both methods reuse tenancy acceptance; OIDC acceptance
checks the invitation company against the pinned provider configuration.

The invitation list previously omitted expired rows, making an invitation that
never completed disappear. Item 5.19 retains and marks expired invitations in
the API. Item 5.19b owns the missing invitations UI with pending, expired and
revoked states and resend, including retaining revocation history. No reason for
incomplete sign-in is inferred from silence at the provider.

# From item 5.16 — SSO lockout safety

- The provider-count invariant does not prove that the provider can complete a
  sign-in. Enabling enforcement disables magic links and revokes existing
  magic-link sessions on the next authenticated read, including the enabling
  company administrator's session. There is therefore no window to correct a
  mistake from the settings screen that made it. This needs a gate before
  enforcement takes effect, not an undo after activation.
- Plan item 5.18 requires the enabling company administrator to have signed in
  through the exact provider and configuration being enforced, verified at write
  time. Configuration changes invalidate the proof, including changes to client
  id, secret reference, issuer or scope.
- Plan item 5.19 separately retains magic links for company administrators under
  enforcement, across provider resolution, issuance, confirmation and session
  acceptance. The exception is stated on the enforcement screen and every use is
  audited; non-administrators cannot use it.
- Item 5.18 refuses direct provider configuration changes while enforcement is
  on. Item 5.18a owns two-phase rotation: an administrator supplies a replacement
  and signs in through that exact configuration before it atomically becomes
  enforced. The old configuration remains in force throughout verification;
  failed or abandoned flows change nothing. This is required maintenance for
  expiring client secrets, not a break-glass mechanism.
- Both items are **required for Slice 1a**. Item 5.18 implements the gate;
  5.19 now implements administrator recovery across all four layers. Provider
  existence alone does not make enforcement safe, and a customer who cannot sign
  in has no product.

# From item 1.13a

- Added the API composition root omitted by the original plan. It registers
  the existing identity routes, is started by `dev:api`, and Vite proxies
  `/api` to it in development. Future routes must be registered there.

# From item 1.13

- No route creates the first user_account. request-link only sends mail for
  a known account or pending invitation, so a fresh database has no way in.
  Company creation is 2.6 and invitations are 2.7; the very first account
  has no owner. Currently inserted by hand.
- .fld.err reuses --held, the withheld-treatment colour, for invalid input.
  Acceptable since forms and treatment badges never share a screen, but
  worth revisiting when the entitlements screen lands.

# From item 1.14

- Resolved 2026-09-25: local and CI visual tests now use the same official
  Linux Playwright image via `npm run test:visual:docker`. Its exact version
  tag is derived from package-lock.json. Mac-generated baselines are no longer
  the reference for Linux CI; baseline migration is reviewed separately.

- --ink-3 was #8B7E9B, 3.78:1 on white, failing WCAG AA. The first
  correction to #756784 was measured against white and surface-2 only and
  still failed on green-bg (4.44) and surface-3 (4.33). Now #675878, which
  clears 5.38:1 against all nine backgrounds in the palette.
- Lesson: a text token must be measured against every surface it can appear
  on, not the common ones. Worth a script rather than judgement.
- Second defect found in the reference implementation, after
  .collapsed .dtoggle. Anything the console was never measured against is
  suspect: contrast, keyboard order, focus visibility.

# From the test database separation

- Resolved: database-writing suites register their table roots with
  `test/database-fixture.ts`, whose shared beforeEach truncates them and their
  dependents. Industry-writing suites restore the two migration seed packs.
  Vitest serializes files and test cases sharing the database, so one reset
  cannot erase another test's live fixtures. Concurrency inside a test is
  unchanged, preserving the outbox and transaction concurrency checks.
- The second collision was between magic-link and invitation suites:
  overlapping truncations deleted users, tokens, invitations and memberships;
  whole-table reads and outbox batches also saw the other suite's rows.
- New database-writing suites must register every root they touch before
  fixture-building hooks. Do not add per-test truncation or weaken assertions.
  These tests deliberately commit across multiple application scopes, so an
  outer rollback transaction cannot isolate their real after-commit behavior.

# Working practice

- A long Codex session degrades: it completes single-file instructions but
  abandons multi-file ones, reporting nothing substantive as blocking. A
  fresh session completed the same task in one turn. Restart the session
  every few items rather than running one indefinitely.
- The module boundary rule had never been exercised: relationship-outbox.ts
  is the first genuine cross-module import. Its fixtures used extensionless
  paths the codebase never writes. Fixture tests must match real usage.

# From item 2.6b

- Partially resolved: migration 021 adds the reinsurance pack's filing-party
  subject label and filing-kind parameter. Its inherited term count is now two
  before deployment additions. The broader reinsurance vocabulary remains a
  content exercise; it is not implemented by the platform rename.

# From item 3.7

- Resolved in item 3.10: the filing register takes over the sidecar's existing durable arrival
  history, including filing IDs, SHA-256 hashes, duplicate/restatement links and
  quarantine reasons. Identification consults that authority; the watcher delegates to it, preserving
  existing history rather than introducing a second record.

# From item 3.8 — extraction declaration rollout

- Migration 018 is an expand-only migration: locale and sheet declarations remain
  nullable for existing filing parties/rules. Extraction refuses incomplete declarations.
- Complete and verify the explicit per-deployment backfill in
  [extraction-backfill.md](extraction-backfill.md), then release a later migration
  setting filing_party.decimal_separator/date_format NOT NULL and requiring exactly one
  of filing_party_rule.sheet/sheet_index. Do not queue that migration before the
  backfill: the normal migration runner would apply it immediately after 018.
- No assumption is made that deployments have empty filing party tables.

# From item 3.9

- Resolved in item 3.10: the register reconciles the arrival history's `landing` state with
  customer-local transactional commit receipts and the application's
  `landing_receipt` delivery inbox. Do not introduce another arrival authority.
  In particular, landed-but-unregistered filings must remain visible with their
  registration error; a refused receipt never rolls back committed customer rows.
- ING-24's persisted evidence assertion belongs to item 5.11. Item 3.9 retains
  the strategy on the source and every landing receipt for that writer to consume.

# From the filing_party rename

- sidecar/ingest/watch.ts parses version-1 state with cedantId, and
  postgres-landing.ts renames cedant_id in the customer database on first
  contact. Both are upgrade shims for sidecars that ran before the rename.
  Nothing outside local development has. Remove them before first
  deployment rather than carrying them forward.

# Test suite timing

- A 3259s suite run was largely macOS sleeping mid-run: 1783s confirmed
  sleep. Use caffeinate for long runs. A slow suite is not evidence of a
  slow test until sleep is ruled out.
- Two genuine defects surfaced alongside it: the sidecar ignored SIGTERM and
  needed SIGKILL, and dev:up started a second sidecar on an occupied port.
  Both fixed.

# From the first end-to-end demo run

Getting the pipeline to run once surfaced six defects that tests had not:
- OPINTEL_SECRET_DEMO_POSTGRES was never set by dev:up or documented
- reconciliation retried 10x/second with no backoff
- telemetry stripped every identifying field, making the sidecar
  undiagnosable
- errors were discarded at four layers, violating §2.2
- POST /sources/:id/introspect was specified but never registered
- failed provisioning had no resume path

All fixed. The lesson: a passing suite does not establish that the
deployed arrangement starts. Run the thing.

# Visual rendering artifact — retry policy restored coverage 2026-09-22

- `filings-observations-390.png` was quarantined on 2026-09-20 and restored
  on 2026-09-22. All widths and axe checks are active. No baseline or threshold
  was changed.
- Reproduction captured four failures and two passes in six runs. The failure
  is a solid plum stripe at x=79-81, y=66-1007: exactly 2826 pixels. It persisted
  in a second screenshot requested 501ms later without navigation.
- The four failed hypotheses were a focus ring, drawer state, a scrollbar,
  and an element in the tree. Passing and failing captures had identical DOM,
  bounding boxes and computed styles for every element overlapping the stripe,
  including pseudo-element styles. No element was identified as painting it.
- Evidence points to a headless Chromium compositor artifact, rather than an
  application layout change. Revisit on a Chromium upgrade without regenerating
  baselines to absorb the stripe.
- 2026-09-22, during 4.3d regression checks: `filings-dashboard-390.png`
  also differed only by the 2826-pixel drawer-edge stripe. Its isolated rerun
  passed without changes. The Dashboard assertion remains active and its
  baseline is unchanged; no new DOM comparison was performed for this capture.
- Snapshot tests carry `@visual` and run only in Playwright's `visual-snapshots`
  project with one retry. Functional tests run in `functional` with zero retries;
  the separate performance config also retains zero retries. The explicit `list`
  reporter names every retry-only pass as **flaky** in the final run summary,
  keeping recurrences visible. A failure on both attempts still fails the run.
- 2026-09-22 navigation change: the clean baseline was updated for the requested
  parent-only breadcrumb (see `navigation-snapshots.md`). Subsequent verification
  failed on both attempts for `filings-observations-390.png`. Pixel-by-pixel PNG
  comparison found exactly 2826 changed pixels, bounded by x=79–81, y=66–1007,
  on each attempt and no changes elsewhere. One retry does not eliminate every
  recurrence. The clean baseline, threshold and retry count were left intact.
- The same exact stripe recurred on both verification attempts for the subsequent
  disclosure/back-affordance corrections; see `navigation-corrections.md`.

# Swallowed errors

- Third instance of an exception discarded into a generic message:
  source-registration.ts ("Source preparation failed"), the sidecar client
  ("Sidecar request failed"), and provision.ts:107 ("Demo delivery could not
  finish"). Each cost a debugging cycle because the message named places to
  look rather than what failed.
- A catch block that replaces the error with a generic message is a defect
  unless it maps known causes to specific safe messages first.
- Sidecar startup now names the failed check and a safe cause (TLS component,
  listener, landing directory, rule snapshot, state/lock, or database), preserving
  recovery instructions and the original failure through cleanup. `dev:up`
  surfaces the current child's startup diagnostic from its log.
- Development bootstrap checks each landing zone's project and source before
  launching the sidecar. A connected source or a reserved demo deployment in
  `demo_source_template.deployment_ref` is valid (pre-Connect, §4.3 / E2-013).
  Missing identity names the zone and both IDs, with removal of `tmp/sidecar`
  and rerunning `dev:up` as development recovery after a database reset.
  The standalone sidecar does not depend on the application or its database.

# From item 3.15 — introspection progress

- Resolved by item 3.16: project SSE snapshots/deltas replace the five-second
  polling fallback for run history and detail.
- Completion invalidates the catalogue family and source detail. Entitlement
  invalidation and persisted decision deletion attach when item 4.1 introduces
  that entity; this screen displays the recorded type-family invalidation.

# Before item 4.4: ordering on tokenized columns

- Tokens preserve equality only, never order. On a tokenized column, <, >,
  BETWEEN, ORDER BY, MIN and MAX return confident but arbitrary answers
  rather than failing.
- Add to algorithm specifications B.4: the query inspector refuses ordering
  operations on tokenized columns, with a message saying tokens preserve
  equality only. Permitted: =, <>, IN, joins, GROUP BY, COUNT(DISTINCT).
- Add tests for each refused and each permitted operation.
- Draft this with the B.3 and C.1 rewrites for the read boundary, before any
  4.4 code is written.

# Item 4.3 — tokenization integration boundaries

- Key generation, escrow, backup gating, rotation and restore remain 4.3a:
  TOK-16 and TOK-27–TOK-29. No fallback or development-only generated key.
- Resolved by 4.3b and 4.3c: temporal declarations, canonicaliser registration,
  reviewed-code lint/determinism/vector checks, and typed version confirmation
  (TOK-24/TOK-25). Read-plan integration remains 4.4.
- TOK-30 belongs to 5.11 evidence writing. TOK-38 belongs to S2/S4: no DuckDB
  executor exists here. That executor must consume only treated read-boundary
  rows and discard partial staging on any refusal.
- TOK-33 checks identifiers at execution now; item 4.7 must reject invalid
  domains/canonicaliser IDs while setting persisted entitlements as specified.
- Unicode folding is pinned to 16.0.0, matching the implementation runtime.
  Startup records the running Unicode and folding versions; upgrade review
  must check tokens for newly assigned characters before changing the table.

# Visual baseline policy — 2026-09-25

- The visual suite must use Playwright's bundled Chromium, pinned by the
  Playwright version in package-lock.json, never auto-updating installed Chrome.
  Run `npm run test:visual:docker`; the runner derives the official Noble image
  tag from the lockfile and installs Linux dependencies in an isolated volume.
- Test startup reports the resolved browser version. Browser upgrades require
  inspection of every image difference before accepting new baselines.
- Regenerate baselines only in isolated, baseline-only commits whose messages
  name the cause (including the browser version when it changes). Configuration,
  application code and documentation changes belong in separate commits.
- The macOS 13 bundled-browser installation blocker is resolved by running
  inside the Linux image, rather than using a different browser on the host.

# From item 4.3

- src/modules/entitlements/application/treatments.ts still holds the five
  treatment strategies, with an optional TokenizerPort nothing implements.
  Under the read-boundary design (A.6) tokenized and masked treatments run
  in the sidecar. Item 4.4 emits only a read plan and does not invoke these
  strategies or hold a key. Retire the legacy application execution helpers
  when S2 consumes the read plan at the sidecar read boundary.

# Item 4.3a — custody implementation boundaries

- K7's key-management screen is implemented in 4.3d; evidence version persistence
  remains 5.11. The key screen and Observations share custody status and failures.
- Development primary and escrow adapters are separate resolved directories,
  not separate disaster domains. Production custody adapters are deployment work.
- Custody operation intents form the rotation/restore audit trail until general
  audit infrastructure exists; they contain references and sentinels, never keys.
- An unclean process exit may leave a custody lock. Recovery instructions in
  sidecar/tokenize/README.md require stopping all writers before removing the
  lock. Missing version history never causes automatic reinitialization.

# Item 4.4 — source ordinals and UUID ordering (2026-09-25)

- **Open: ordinal NOT NULL.** Migration 037 deliberately leaves existing
  `catalog_element.ordinal` NULL and does no backfill. Application startup
  queues normal introspection for active sources with unknown active ordinals;
  snapshots fill them and the compiler refuses until they are known. Failed
  source contact leaves the guard in place. Archived sources and retained removed
  elements cannot be repaired by a current snapshot. Once there are no unknown
  ordinals, add NOT NULL by a later migration. Historical removed rows need an
  explicit disposition before that migration; do not manufacture their order.
- **Open: UUID v7 is not insertion order.** `UuidV7IdFactory` has a millisecond
  timestamp and a random suffix, without a monotonic counter. IDs allocated
  within one millisecond sort randomly. The test factory increments its clock
  per ID, so it does not reproduce this property. Never infer discovery, source
  column or insertion order from IDs, anywhere in the codebase.
- Audit: introspection history (`sources/infrastructure/introspection-query.ts`)
  orders by ID descending and therefore does not strictly preserve chronological
  order within a millisecond. Correct its ordering and cursor together in a
  separate change. Source latest-run queries use `created_at, id`; IDs there are
  tie-breakers only. Tenancy/source/catalogue/invitation/member cursor lists and
  filing-rule snapshots use IDs as a stable total order, not insertion order.
  Mail dispatch orders by `created_at`; the relationship outbox uses bigint
  IDs, so this UUID issue does not apply. No additional source-ordinal backfill
  by ID was found.
- Compiler cache/session assertions VC-17/VC-18 await S2 with 4.9. Query
  inspection VC-10–VC-14 and VC-23–VC-30 await 4.5; resolver assertions
  VC-19–VC-22 await 4.5a. No session, resolver or treatment execution was added.

# Two-session verification: what went wrong at 4.4

- The plan was: one session writes the implementation, a second writes an
  independent suite from the spec. The first session shipped no tests
  calling compileViews, so the independent suite became the only compiler
  coverage and the two derivations collapsed into one. Three VC ids had
  nothing behind them.
- When using this arrangement again, in particular for S2's bypass suite,
  confirm the implementation session's own tests exist and pass before the
  second session starts.

# S2 — parse and binding

- DuckDB's `json_serialize_sql` carries no binding: nonexistent tables and
  columns serialise successfully. Verified against v1.4.3. The JSON is a
  syntax tree, not a resolved statement, so C.3.1's binding requirement
  needs another route.
- Three candidates: use `PREPARE` to prove identifiers resolve, then catalogue
  inspection to learn what they resolved to; rely on the agent session
  containing only the pool's staged tables, so syntax-level resolution is
  binding; or use DuckDB's binder through the extension interface.
- The second makes the bypass suite load-bearing for binding as well as
  isolation. That is an argument for it rather than against: both rest on
  the same proof.
- Decide at S2, with the bypass suite written first. Item 4.5 remains the
  application's refusal-only pre-filter and does not settle this decision.

- Native select rendering is the recurring source of small visual flakes:
  first the Chrome 154 width and arrow change, now 125 pixels inside the
  entitlements treatment selector's option text. Tree rows and layout match.
  Accepted as flaky under the retry policy rather than rebaselined.


# S2e — streaming optimisation

C.1.1's streaming execution path is deferred until after the staged path ships.
The staged path remains the default. Streaming requires the complete conservative
eligibility check and the same bypass suite against that distinct path before
it can be enabled. S2e does not implement the alternative source attachment in
the agent session; that alternative also requires its own review.

## Query evidence and reduction (5.7)

Query is unavailable in production until 5.10 and 5.11 land. Item 5.7 uses
EvidenceWriterPort and a test-only stub; the production adapter refuses with
dependency_unavailable naming item 5.10 before parsing, source contact or execution.
Startup rejects a test stub in every non-test build. No fabricated evidence id
substitutes for a durable record. I-009's model-readable reduction text belongs
to handwritten item 5.8; 5.7 returns the structured query result only.

# From item 5.10

- Evidence partitions exist for one month either side of installation, and
  ensure_evidence_month is owner-only. Nothing provisions future months, so
  evidence writes fail closed roughly two months after deployment. Item 5.17
  owns retention; it should own forward provisioning too, or an operational
  runbook must.
  **Resolved by 5.17:** API startup provisions through UTC month +3 before
  accepting requests; an independent hourly job repeats provisioning, with its
  own non-overlap guard separate from redaction and retention. Missing
  partitions still fail closed.

# S5 — production process supervision

- No production supervisor configuration exists. Nothing currently establishes
  who keeps the API process running or restarts it after failure. The development
  `dev:api` watch command is not a production supervision contract.
- Evidence forward provisioning runs at API startup and hourly inside that
  process. If the process is down, the timer is down too. Startup provisions
  before accepting requests, but a timer is not a supervisor.
- S5 packaging must supply the production process supervisor and its restart
  configuration, and establish operational ownership of the process.

# Jurisdiction in industry packs

- The same concept carries different names and different statutory content
  by jurisdiction: Ontario condominium corporation, BC strata corporation,
  US homeowners association. That is vocabulary, not project.region, which
  is a data residency fact.
- Two open questions for the vocabulary items: whether jurisdiction is a
  dimension within one pack or separate packs, and whether it attaches to
  the project or to the filing party. A platform holding several provinces
  at once suggests the latter, which is a different shape from industry.

# Opintel Engine fleet mapping

- Opintel Engine is the customer-network data plane. One project maps to many
  Engines; each source maps to exactly one Engine, and the application routes
  by source. A project's sources can therefore be hosted by Engines in separate
  customer network segments while the application selects the Engine
  responsible for each source.
- Three drivers require this mapping: sources can live in separate network
  segments; ingest must remain pinned to a host with that source's local
  landing register while query execution need not be pinned; and deployments
  need to scale or route around an unavailable Engine.
- The token key remains per project. Every Engine serving any source in that
  project must resolve the same key, or identical values read through
  different sources produce different tokens and cease to join. This is
  shared state even though requests route by source; routing does not partition
  key custody.
- This mapping is the deployment target. Slice 1 retains the single-deployment
  assumption: one application and one Engine, configured in files. The mapping
  itself is settled; 5.20 implements its registry for single-tenant deployment. Item **5.20** in `docs/implementation-plan.md` records the Engine
  registry, source-to-Engine binding, contract-version refusal and Settings
  visibility. The production supervisor remains packaging work.

## Item 5.20 — former registry gap (closed for single-tenant deployment)

Item 5.20 sits in the sidecar track after S5 as deployment and operations work.
It depends on S5's packaging, Settings (5.16) and the reachability decision. The
single deployment suffices to build and prove Slice 1's claims, but cannot serve
a second customer or a customer with sources in two network segments. The
registry is a prerequisite for a first deployment, not for Slice 1.

Before 5.20, one client configuration points at one Engine. Nothing mapped a source to
an Engine, the console could not name which Engine serves a filing, and §8's Engine
fleet health metric assumed a fleet the system cannot enumerate. Item 5.20 closes
these gaps with project-scoped Engine records containing address, pinned
certificate, contract version and last-seen health; each `data_source` names its
serving Engine. Settings lists Engines, their health and their sources. A source
without an Engine is refused for introspection and query, with the source named;
an Engine reporting a different contract version is refused.

The single-tenant decision is now explicit: internal application-to-engine routing, operator registration in Settings, and verification before assignment. The considered multi-tenant proposal remains deferred below; no relay or token enrollment is implemented.

# Reachability is part of done

Passing tests has repeatedly failed to establish that an implementation is
reachable: the mail adapter (1.7), project creation route (2.6b), receipt listener
(3.9), and OIDC service/start/callback routes (1.9) were built without complete
composition-root wiring. An item touching a route or adapter needs a reachability
check before it is called done: follow the production root through construction,
route/listener registration and the caller's transport path, then exercise that
path with infrastructure substitutes only at external boundaries. Unit tests of
an unregistered handler or unconstructed service do not establish delivery.

## Composition-root audit: unconstructed runtime paths

Audit scope: the API and sidecar start files, their imported runtime factories,
module exports, constructors and factory calls; development scripts and tests
were checked separately. An export or import alone does not establish a call.
These were administrator controls with implementations but no reachable runtime
write path at the audit. Item 5.22 closes the three declaration paths below through
the schema explorer, with permissioned production routes and atomic element writes.
The OIDC repair did not wire them incidentally; pool/source binding remains open.

- **Temporal declarations — item 4.3b; closed by 5.22.** Element timezone/epoch
  and schema timezone administration are mounted in production and exposed in
  Data sources → Explore schema. Confirmation compares effective tokenization,
  including a first epoch assignment, rather than non-null storage transitions.
- **Token declarations — item 4.4; closed by 5.22.** Token domain and case folding
  are administered in the element declaration panel. Stored values and defaults
  are separate. Entitlements links to this panel rather than owning another editor.
- **Canonicaliser assignment — item 4.3c; closed by 5.22.** The atomic declaration
  command uses the source's registered Engine for pinned canonicaliser discovery.
  Conflicting epoch edits preserve an explicit canonicaliser and refuse; a
  deliberate compatible joint change is validated before one atomic write.

- **Pool/source binding management — item 5.3.** `PoolBindingService` and
  `PostgresPoolBindings` are constructed by `scripts/dev-demo.ts`, but not by the
  API, and have no registered management route. **5.3 completion owns wiring**
  the binding API, with controls in 5.14's pool detail. Source binding is enforced
  by the query path; what is missing is the ordinary administrator's way to
  change it.

## Composition-root audit: unused helpers with production replacements

These are cleanup candidates, not evidence that the corresponding runtime
control is absent. Remove or consolidate them with their tests deliberately;
none was removed during the OIDC repair.

- `TreatmentStrategies` (4.2), including its optional `TokenizerPort`, is never
  constructed in production. `compileViews` supplies the treatment-aware read
  plan and the live sidecar `PostgresStagingSource` applies `maskValue` and
  `SidecarTokenizer`; omission and aggregate restrictions are enforced by the
  compiler and inspected execution path.
- `PostgresEntitlements` (4.1) is not constructed in production. Administrator
  writes use `BulkEntitlementService` / `PostgresBulkEntitlements` (4.7), including
  one-element selections, and reads use `PostgresEntitlementReader`. Its absence
  does not mean entitlement editing is unreachable.
- `PostgresPolicyVersions` / `PolicyVersionReader` (4.9) are unused. Database
  triggers advance the version and the live entitlement/query readers load it
  with their snapshots. This unused reader does not remove version enforcement.
- `PoolElementResolver` and `InfoPoolAccessRefusals` (5.3) are unused. MCP access
  verifies pool keys; describe/query readers restrict by local binding and
  entitlement, and the services perform SpiceDB source-reachability checks.
  Query refusals use the live evidence writer. This is separate from the missing
  binding-management path above.
- `TokenizedSourceReader` (4.3) is an unused early read-boundary helper. The staged
  production executor constructs `PostgresStagingSource`, which performs typed
  source reads and tokenization before handing treated values to DuckDB.

`DevelopmentFileKeyStore` and `DevelopmentFileKeyEscrow` are **not** missing:
sidecar startup calls their static `open` factories. Runtime factories also
construct other adapters transitively. A search for `new` in start files alone
would incorrectly report those as absent.


### Invitation acceptance committed before authoritative access (1.7–5.19)

This defect was live since 1.7 on both magic-link and OIDC acceptance paths.
Acceptance committed a member row, accepted_at and a pending relationship-outbox
entry before awaiting SpiceDB. A dispatch failure left a member and an accepted
invitation with no relationship: on signing in, the person failed every
permission check. Moving session creation before acceptance alone did not fix it.

5.19 now awaits the relationship write inside the acceptance transaction.
Failure rolls back membership, accepted_at and the outbox entry, revokes the
prepared session and leaves the invitation pending. A consumed magic-link token
is never restored. The refusal asks for a new link; request-link must issue one
attached to the pending invitation. OIDC uses a fresh provider flow, never a
replayed callback.

This ordering cannot make Postgres and SpiceDB one atomic system. A successful
remote write followed by a lost acknowledgement or failed Postgres commit can
leave the opposite divergence. Acceptance still fails closed; a fresh attempt
uses an idempotent touch. The existing reconciliation requirement remains.

- Use `caffeinate -i npm test` for full runs. Twice now a slow suite has
  been machine sleep rather than a code problem: 3,259s and 1,713s against
  a real 491s. Rule out sleep before investigating a slow suite.


### Multi-tenant reachability and enrollment — considered, not chosen (5.20)

5.20 implements only single-tenant direct application-to-engine routing and
operator registration by private address and certificate pin. The considered
multi-tenant design uses a customer-side connector dialing an explicitly
declared hosted HTTPS gateway, forwarding application-to-engine mutual TLS
without terminating it. A settings operator creates a pending engine and a
short-lived, single-use enrollment token bound to that project and engine;
proof of private-key possession and operator approval activate its pin. No
relay, connection identity, enrollment token or network tunnel is implemented.
This requires reviewed gateway/connector data handling and customer approval
of persistent outbound access; receipt delivery is not reverse reachability.

### Multi-engine key distribution (5.21)

Distribution is customer-owned provisioning until its own key-management item.
5.20 routes custody to one designated verified engine, compares other engines'
current primary sentinel/version before tokenized-source assignment and tokenized execution,
and refuses stale or unprovisioned engines after rotation. It does not copy
keys or repair a mismatch. An execution-side sentinel check protects against
a primary-key change between application attestation and use.

5.20 closes the former single-client-file limitation: engines are enumerable
per project, sources identify their engine, and the console can name each
engine's sources and last-seen health. This supplies the fleet enumeration
previously assumed by §8; it does not add a background fleet-health exporter.

- Two unexplained timeouts during 5.20 validation: ING-17's large CSV
  (60s) and tokenization-source's afterAll cleanup (30s). Both passed on
  rerun; neither cause was established. Both involve a fixture database
  teardown or a large stream under concurrent load.

# Token domain friction

- A token domain is currently required with no default, so every tokenized
  element needs an explicit declaration. For a source with thirty
  identifiers that is thirty decisions, most of which carry no judgement.
- Proposal, after 5.22: default an element's domain to one derived from its
  own exposed name. Safe, since a column then joins only to itself and no
  false join is possible, and it covers the common case where tokenization
  conceals rather than joins. An administrator widens the domain only where
  a cross-column join is actually wanted, which is where the judgement is.
- Also worth considering: pattern rules declaring a domain alongside a
  treatment, which would turn thirty decisions into three rules.
- 5.22's panel accommodates either, since it already distinguishes a stored
  declaration from an effective value with its provenance.

# Whole-view staging cost

A measured one-column query stages seven entitled columns and performs tokenization on entitled tokenized columns the query does not return. Source rows read follow the supported pushed-down predicates, not projection width; tokenization and staging memory cover the whole view. Statement-specific column pruning is a known optimisation, deferred because whole-view materialisation makes the view the enforcement point and keeps its staged shape stable across statements.

- No administrator control over the exposed schema. Element exposed names
  can be aliased; the schema segment is derived from the physical schema and
  cannot be changed. A customer whose physical schema is prod_warehouse_v3
  or dbo has agents carrying that in every three-part name, with no remedy.
  Source aliases cover the catalog segment only.
