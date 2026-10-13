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

# Wall-clock-sensitive validation: consolidated timing record

**Scroll traces (M-015 Activity / G-019 Catalog, 2026-10-06).** These
reproduced failures contain application work and must not be grouped with
unexplained wall-clock timeouts as environment failures. The pinned Linux
browser measured a 16.7 ms baseline in both. Scroll-only CDP capture produced
44 / 43 long intervals; median renderer CPU between their callback markers
was 27.3 / 27.9 ms, scripting 18.3 / 16.1 ms, and style/layout/paint 5.5 /
10.7 ms. Tracing raised failure counts above the original 9 / 7; even the
lighter capture perturbs execution. These are traces of reproduced failures,
not a reconstruction of the original failures or uninstrumented cost estimates.

Activity's scroll updates name `ActivityRecords` through React's
`updateSyncExternalStore()`. Across the scroll, React reports 119 renders
(median 12.9 ms), with median event handling 3.9 ms and commit 0.7 ms.
These phase medians cover the whole scroll, whereas the figures above cover
long intervals; nested phase/component durations must not be added together.
The store already suppresses updates within the same 116 px row. Only the
12-row window subscribes; the parent does not reflatten loaded pages on scroll.
The test has a million-record server dataset but loads 500 rows. Its roughly
eight-row jumps replace most of the window and rerender retained children.
Every row renders `Timestamp`, which constructs an `Intl.DateTimeFormat` and
formats parts anew. The trace contains 1,423 timed Timestamp executions with
median 0.3 ms and aggregate 658.9 ms, inside 1,905.3 ms of aggregate React
render time. This identifies real repeated formatting work, not exclusive
native formatter CPU or proof that it accounts for all scripting cost.

Catalog updates name `TreeWindow`; the parent query observers and flattened
5,000-element tree do not subscribe to scroll position. The window is bounded
at 36 rows, but this test jumps roughly 85 rows each frame, replacing the entire
window on most steps. Its rows contain grid/flex layouts, text, declaration
buttons and treatment badges. Layout events report 480 dirty layout objects
out of 693 on 116 steps, with `partialLayout: false` and `#document` as the
layout root. The longest Layout event is 16.8 ms. Thus layout is bounded by
the mounted DOM, not 5,000 mounted rows, but its scope reaches the document
root; unlike Activity, the viewport has no layout/paint containment.
The trace does not identify each dirty node, prove that every outside-screen
node was recalculated, or establish how much containment would save.

No production code, test assertion or threshold changed. Temporary diagnostic
copies were removed. Raw traces and the interval report remain in the ignored
`test-results/scroll-diagnostics/` directory. The traces distinguish active
work from an empty gap in these runs, but do not isolate every function's CPU
cost, prove a particular fix, or exclude additional scheduling delays.

**Authorised single-change comparison.** Reusing timestamp formatters by
locale/timezone reduced Activity's aggregate React Render time from 1,905.3
to 1,082.0 ms (119 renders in each capture), median Render from 12.9 to
7.7 ms, and long intervals from 44 to 10. Median scripting in long callback
intervals fell from 18.27 to 10.11 ms. Adding inline `contain: layout paint`
to Catalog's existing viewport did not improve its measurements: long
intervals 43 → 47, median style/layout/paint in long intervals 10.75 →
12.77 ms, aggregate Layout 450.73 → 624.68 ms, median Layout 2.34 →
4.18 ms. Layout events still name `#document`. Both traced tests failed
their unchanged threshold. No second performance change was attempted.
These single before/after captures used the same scroll-only tracing method
and both measured a 16.7 ms refresh baseline. They include run variation and
tracing overhead; they do not prove a universal regression from containment.
Long-interval medians cover different subsets, so whole-scroll aggregates
are retained too. The comparison and both sets of traces are retained in
`test-results/scroll-diagnostics/` (ignored artifacts).

One recurring pattern, several possible mechanisms: substantial external work
exceeds a wall-clock test budget in a combined run and passes unchanged in a
narrower run. This establishes unreliable headroom under observed conditions,
not a common root cause or a passing original run.

| Test / hook | Budget | Recorded observation |
|---|---|---|
| ING-17 large CSV | 60s | Repeated full-run timeouts and isolated passes; browser setup overlapped an earlier ING-17 failure. Now isolated in the performance project. Roughly 200 MB of generation, hashing, inspection and row streaming; no database. |
| tokenization-source afterAll | 30s | Failed during 5.20 validation, passed on rerun; connection close and temporary Postgres database teardown. No recorded wait diagnosis. |
| Activity: 5.12 filters, cursor loading, empty, error, loading and incomplete states | 30s | Combined Linux declarations/activity run: 13 passes, this test timed out during the error-state reload. Unchanged Activity-only rerun passed in 12.7s. All three-width snapshots passed. |
| DOMAIN-001/003: domain migrations append immutable versions, no-op stays put and revert restores tokens | 5s | Earlier focused RLS/history/grants failure coincided with typecheck/lint overlap. On 2026-10-06 it also timed out in a sequential full run and a three-file rerun with no validation overlap; history-only passed unchanged (body 3.853s, project 10.40s). Two complete MCP fixtures, declaration transactions and three staged queries. Overlap is therefore not necessary for this case to fail; its mechanism remains unmeasured. RLS-10 and grants remain unchanged. |
| Dashboard: O-004 findings and quiet states at 1440px | 30s | Relative-age baseline update timed out at the clean-state screenshot; the closed-page overlay error followed the timeout. Unchanged automatic retry passed in 15.7s. Validation commands were sequential; no concurrent validation command was running. Cause not measured; this is a retry-only pass, not a clean original run. |

These are now five distinct locations; the earlier inventory had four,
not six distinct named tests. Repeated
incidents do not create another test. An additional historical ING-17 XLSX
failure is recorded in test-timeout-headroom.md (20,000 compressed workbook
rows and a disk-backed shared-string index); it also passed in isolation.

Command overlap is the mechanism with recorded evidence of simultaneous work:
browser setup alongside ING-17, and typecheck/lint alongside domain history.
That coincidence has not established causality. CPU saturation, filesystem
pressure, database waits, cumulative leaked resources and browser scheduling
remain distinct possibilities. CSV/XLSX, Postgres teardown, browser navigation
and MCP execution do not share one specific dependency.

Vitest already serializes files and test cases; the Linux browser runner uses
one worker. CI steps run sequentially within each job, and parallel jobs have
separate GitHub-hosted runners. npm scripts did not launch competing gates:
independent local/tool command invocations introduced overlap. `npm run check`
now provides one sequential path; AGENTS.md and README require focused commands
and browser setup to follow the same rule. No per-test or job timeout changed.

Recorded successful functional runs grew from 937 tests / 281.79s to 1,357 /
479.57s; later reports exceed 1,470 tests without comparable elapsed timings.
Suite duration does not consume per-test budgets: those clocks restart. More
work may increase contention, resource accumulation or exposure to slow tails,
but elapsed suite time alone proves none of those. Runs lasting 3,259s and
1,713s involved host sleep and must not establish a performance trend.

At the next failure, capture concurrent commands and child processes, awake
elapsed time, CPU/run-queue and memory/swap pressure, filesystem I/O, Postgres
active queries/wait events/locks/connections, and test phase timings. For the
browser, retain navigation timing and a trace around the failing reload; for
teardown, identify the blocking operation and remaining sessions. Compare the
same test under sequential commands and controlled overlap, without changing
its timeout. That evidence would distinguish shared host contention from a
specific blocked dependency or cumulative resource leak. An isolated pass is
additional evidence, never a replacement for the failed combined result.


**5.25a source-reading authority.** Attempt-backed suggestions ship without value-overlap evidence, diff-time column analysis or a format-checking join preview. These require source reads that neither the query read plan nor sampling consent authorises. Before implementation, review who authorises such reads, the eligible columns, and execution/disclosure limits. Unrelated columns can overlap and related columns can be disjoint; overlap cannot establish the identity judgement. 5.25 records real attempted joins and leaves that judgement to an administrator.

**Catalog containment null result and row structure (2026-10-06).** The
inline containment was reverted after the same-method comparison above:
long intervals 43 → 47, median style/layout/paint 10.75 → 12.77 ms,
aggregate Layout 450.73 → 624.68 ms. It supplied no measured benefit;
do not reintroduce it on the assumption that document-root layout scope
explains the cost. Activity formatter caching remains. No test or threshold
changed, and no further rendering change was made.

**Scroll-performance investigation stopped (2026-10-06).** The investigations
covered Activity formatter caching, which measurably helped; Catalog layout
containment and markup simplification, both null; and an Activity list-level
clock subscription, null. Identical Activity code measured 23 and 40 long
intervals in consecutive captures. The shared-clock diagnostic measured 46
against a fresh baseline of 23, with no demonstrated benefit. The harness
cannot resolve changes of this magnitude against its run-to-run variance.
Relative age remains: it solved a real readability problem.

M-015 and G-019 remain failing honestly in the performance project. Revisit
only with a measurement method whose variance is smaller than the effect,
or if a person reports the console feeling slow. No threshold changes and
no further scroll-performance experiments are authorised by this finding.

A pinned Chromium DOMSnapshot of the uncontained, loaded Catalog window
reports 36 element rows, each contributing 12 DOM-backed layout-tree nodes
(432 in total), plus four text boxes per row. One row comprises a grid root
(1 node); the left name/declaration group (6: flex container, flex label
wrapper, name span/text, button/text); and the right type/state group
(5: flex container, type span/text, flex badge/text). Thus it introduces one
grid and four flex formatting containers; the declaration button itself is
computed block, not another flex container. The two sides contribute 11 of
12 exposed nodes. The label wrapper adds a flex context despite holding
only one label for element rows; the badge adds another around one text.
All 36 measured element rows have the same shape. The long-jump test replaces
them on most steps, so it repeatedly constructs and lays out this structure.

These are measured DOM-backed layout nodes, not a count of every internal
Blink layout object: DOMSnapshot does not expose all anonymous layout boxes.
The earlier 480 dirty objects must not be divided by 36 and presented as an
exact row count. The structural breakdown identifies where the nodes and
formatting contexts are; neither snapshot nor existing traces attributes
exclusive layout milliseconds to individual row children. It identifies row
structure as a possible cost, but cannot prove which wrapper is the
largest time consumer. Snapshot and representative HTML were captured in
`test-results/catalog-layout/`; temporary diagnostic test removed.

**Catalog label-wrapper diagnostic (2026-10-06).** Same pinned browser and
scroll-only CDP categories/markers as earlier captures, with a fresh baseline
and a temporary variant removing only the single-child label flex wrapper
from element rows. Snapshot confirms 12 → 11 DOM-backed layout nodes per
row. Both baseline refreshes were 16.7 ms. Aggregate Layout across the
scroll was 260.77 → 308.65 ms; median Layout 1.734 → 2.087 ms;
aggregate style/layout/paint 618.13 → 756.33 ms; long intervals 14 → 39.
Both unchanged zero-missed-frame assertions failed. The simpler markup
provided no measured improvement and was restored; no permanent row change
or second diagnostic simplification was added. The fresh baseline differs
substantially from earlier captures, underscoring run variation and tracing
perturbation. This single comparison does not establish a universal regression
from removing the wrapper, but supplies no evidence to justify that change.
It also does not establish that the separate badge flex context is free.
Artifacts are in ignored `test-results/row-diagnostics/` and copied to
`/tmp/opintel-row-diagnostics/` to survive browser output cleanup.

**Catalog optimisation stopped by decision (2026-10-06).** Catalog's scroll
performance costs real application work inside the virtualised window;
escaping layout scope did not explain a removable cost. Containment and
label-wrapper simplification both measured null: neither supplied evidence
of an improvement. Captures of the unchanged row markup produced **14, 43
and 47 long intervals** (14 and 43 without containment; 47 with the temporary
containment property). That spread exceeds the effect these experiments
were trying to resolve. Tracing overhead also increased failure counts, so
the harness cannot resolve an optimisation of this magnitude reliably.

Each element row contributes 12 DOM-backed layout nodes, and the long-jump
test replaces the 36-row window on most steps. Repeated row layout is the
likely cost, not an established attribution to a particular child. Further
experiments with this measurement would be guessing. Revisit only with a
measurement method whose variance is smaller than the effect, or if a person
reports that the explorer feels slow. G-019 stays failing honestly in the
performance project; its assertion and threshold are not accommodated.
Containment and the diagnostic markup change remain reverted.

**Catalog column names at 390px: pre-existing defect exposed by 5.27
(2026-10-06).** The baseline before visual identity already truncated a
column name to one character. That was wrong before this item. Adding the
treatment mark consumed the remaining space and made the name disappear;
the defect is the row's width allocation, not the mark's geometry. Do not
attribute the layout correction to 5.27 or accept the hidden name in a
regenerated baseline. The approved narrow layout gives the name its own
full-width first line, then shows exposed type, an accessibly named treatment
mark and the Declarations button without extra tree indentation. The visible
treatment label gives way at narrow widths; the type and mark remain.
The responsive master rule was shown and approved before addition: 820px
breakpoint, 76px element rows, 46px structural rows, with matching virtualiser
offsets. This is a readability correction, not a scroll-performance claim.

**Audit log drawer placeholder (2026-10-06).** The drawer's Audit log item led
to `/projects/<projectId>/audit-log`, which renders only a heading. Item 5.10
and migration 046 built append-only `audit_entry` storage; later settings
(5.16) and identity recovery (5.19) write audit entries. There is no audit-list
API or React audit screen. This is an unbuilt screen explicitly deferred to
Slice 3 by §5.6, not a completed screen missing navigation.

Decision: hide the Audit log drawer item until its screen exists. Offering a
heading with nothing behind it teaches people that the console is unfinished.
The route label and direct placeholder remain for existing route coverage;
they do not constitute an audit reader. Restore the drawer item when Slice 3
provides the permission-gated reader and screen, with loading, empty, error
and ready states.


### Treatment-history reader (separate from the coordinated redesign)

The five-screen structural redesign deliberately excludes treatment-change History and its Dashboard event. Current entitlement rows are overwritten, and bulk_decision records count/treatment but not complete membership and prior treatments. A faithful before/after reader needs its own capture and historical contract. Do not invent past events from current values. Recent request links go to immutable evidence records; domain-assignment and suggestion review histories already exist and remain available.


### Validation invocation correction (2026-10-06)

The npm test wrapper appended the broad `test` filter even when files were supplied. Vitest combines positional filters with OR, so supposed focused wrapper calls selected the normal suite. Repository scripts/docs contain no stored `npm test -- <file>` commands. Recorded ad-hoc calls affected: Engine registry; HTTP server/exception logging; Engine registration help; query pre-filter/SQL treatments/evidence writer; declarations/canonicalisers/evidence/bulk entitlements; and UI/visual identity. Direct `npx vitest run <file>` calls were unaffected. The performance npm script also used the wrapper: its project include prevented ordinary tests from entering, but a file selection could not narrow that performance project.

The wrapper now passes arguments unchanged; the normal Vitest configuration owns the `test/` include. Full browser validation shares conformance observation across functional and screenshot scenarios rather than replaying both. Diagnostic selections record partial route coverage explicitly; they cannot establish the full route gate. The approved iteration schedule is in implementation-plan §6.6 and AGENTS.md. No test assertion, timeout or performance threshold changes.

**Validation of the invocation correction.** Strict and conformance typechecks, lint and build pass. `npm test -- test/conformance-reporting.test.ts` ran exactly one file/four tests (1.92s). Focused conformance ran nine scenarios (44.7s), reported partial 1/53 route coverage and zero findings, and passed without claiming full coverage. The combined unrestricted browser gate ran 226 scenarios once each in 15.4 minutes: 139 functional plus 87 visual, full 53/53 route coverage, zero findings, no retries and unchanged screenshots. Previously the three invocations executed 452 scenarios in total.

The normal full Vitest run preserved selection: 164 files/1,583 tests, the prior 1,579 plus four reporter tests. It failed 18 tests in 937.12s (1,565 passed): R-002's 50,000-element body hit 30s; two subsequent catalog cases and 14 tenancy-list cases hit the shared database-reset hook's 10s budget; DOMAIN-001/003 hit its 5s test budget. The token-query refusal observed during the latter is not evidence of an independently established resource-classification defect: the reported failure is the test timeout. Commands were sequential. A post-failure scoped PostgreSQL wait-state read returned no rows; its timing and visibility do not establish what blocked the reset hooks at failure.

The three-file rerun ran exactly 24 tests in 45.49s: all catalog and tenancy cases passed; token history still failed. History alone then passed all three tests in 10.40s, with the affected body at 3.853s. These passes do not repair the failed full gate or identify its cause; order, accumulated state and timing remain possible mechanisms. No further full gate was run, no timeout/assertion was changed, and no completed-item commit was made. Measuring the bulk insert and reset separately, with lock/wait and resource observations at failure, is needed before attributing the hook failures.

### SpiceDB datastore accumulation — E-016 comparison (2026-10-11)

The long-lived service uses the **memory datastore**, not the application Postgres. A consistent enumeration of every schema object type at the datastore's returned revision found **34,814 live relationships**: company 2,845, datasource 6,502, pool 3,021, project 22,446, user 0. Snapshot revision: `Gh8KEzE3OTE2ODg3MTI1ODg5NTUxMDkSCGY5Zjk5ZTZm`. Exposed Go runtime metrics showed 3,012 GC cycles and 344,416,984 live heap bytes; these are runtime GC facts, not verification of datastore revision-history collection. The older 101.337 ms run did not record relationship count then: 34,814 is the later direct observation, not a retroactive measurement.

One isolated container using the identical image (`sha256:aa96009a0477f8a759149823407d47ad16d1a74390bae3102b3b0b7143502764`) was observed empty (0 relationships), then populated with **only E-016's 251 tuples**. A steady-state empty lookup warmed its channel before fixture construction; no extra graph was created. The datastore was enumerated again before the timer: company 1, project 250, all other types 0, revision `Gh8KEzE3OTE2ODk0MzY2MTA2NzY4MjASCDg4ODdjZGM5`. Exactly one timed fully consistent lookup returned the expected 150 projects in **13.758 ms**, versus **101.337 ms** in the prior warm run and retained green measurements 63.2 / 73.1 ms. Process age 2,588.092 ms; load 5.313 / 3.270 / 3.584. Resetting the accumulated service state restores substantial headroom; this comparison does not separate live tuple count from retained revision history or other long-lived server state. No budget, consistency, schema or fixture cardinality changed. Initial diagnostic setup failed before timing because the SDK's insecure-localhost mode does not accept the 127.0.0.1 spelling; that was corrected, not retried as a measurement.

**Control adopted:** the performance launcher resolves the locally installed SpiceDB image to an immutable ID and starts an isolated fresh memory datastore per invocation, loads the schema and verifies zero relationships before fixtures. This setup precedes K-007 cold; the single unmeasured warm-up follows cold as before. It never resets the application's development datastore. Fixture lifecycle teardown deletes relationships created by each test and suite, preserving enclosing fixtures, and verifies that additions are gone. Cleanup failures stay hard failures. E-016 logs total live relationship count and the actual datastore revision before every measurement. Live fixture tuples must be deleted; running GC is not a substitute for fixture ownership. A two-case lifecycle check passed, proving body cleanup between cases and preservation of beforeAll tuples; suite cleanup then removed the five enclosing/warm-up tuples. The launcher removed its container. Readiness/schema startup corrections were verified by this focused check; no second timed E-016 measurement or full data gate was run. Private observations: `/private/tmp/e016-accumulated-datastore.json`, `/private/tmp/e016-fresh-datastore.json`, `/private/tmp/e016-fresh-metrics.txt`.

**Before a customer deployment — design position required.** E-016's observed lookup cost was about **7× higher** in the accumulated datastore: 101.337 ms versus 13.758 ms fresh, with 34,814 versus 251 live relationships observed. The larger count was recorded after the older timing, so this is a comparison of datastore states, not a measured growth curve or proof that tuple count alone accounts for the difference. Production stores grow with projects and credentials. SpiceDB datastore/GC configuration, revision retention, and relationship cleanup when projects, credentials or other owning records are deleted require a reviewed design position before a customer deployment. A fresh test datastore controls validation; it does not solve production growth.

### Database reset cost — measured, deferred separately (2026-10-07)

The instrumented full run measured **422 TRUNCATE statements taking
289.078 seconds in aggregate**, with a **657.919 ms median**, 1,150.442 ms
p95 and 4,397.505 ms maximum. This is the largest single measured cost in
the suite: about **35% of its 827.02-second wall time**, roughly a third.
The company CASCADE graph reaches 74 table relations including partitioned
parents; TRUNCATE recreates **354 physical relations**: 70 tables, 217
indexes including TOAST indexes, and 67 TOAST relations. Sampled waits
were principally filesystem synchronization, not sampled lock blockers in
that run. Faster reset is a separate item; no reset implementation or test
budget is changed here.

This passing diagnostic run (164 files / 1,583 tests) does not clear the
failed full gate: instrumentation, cache and ordering differ. The separate
controlled reproduction proves that a Vitest timeout can leave a transaction
running while subsequent resets queue behind it. The original run's logs
also show database work surviving callers' deadlines, but do not identify
the original blocking statement or lock graph. **R-002's initiating
30-second overrun remains unexplained.** Its 50,000-element INSERT took
16.500 seconds in the passing instrumented run; that is not a measurement
of where the original failed body spent its time. The cascade and the
initial slow test are distinct findings. Private measurements and the
controlled reproduction are retained in
`test-results/reset-diagnostics/report.md`.

**Approved controls implemented.** A test-only runner cancels owned SQL
on abort, waits for verified backend removal before allowing another test,
sets server statement timeouts from the remaining phase budget, and stops
the whole run after unconfirmed cleanup or a reset blocked for one second.
Cleanup has a separate five-second overall bound and private diagnostic
capture; production scopes and existing test budgets are unchanged. Six
positive-control tests pass, including intentional child-run failures that
prove the next test cannot run when cleanup is unconfirmed. R-002's
50,000-element case remains in the performance project (14.095s measured,
30s unchanged); its functional companion uses 1,001 elements and retains
all pagination, limit and scope assertions.

An initial full run stopped at an Explain case whose cleanup was
unconfirmed, after an unexplained 1,013-second body. The subsequently added
overall cleanup bound and private phase/cause capture address the unbounded
barrier; they do not establish the original stall's cause. Explain then
passed all 13 cases, including in the next full run. That full run completed
in 740.83s: 1,590 passed, one failed, and no reset cascade. The failure was
the unchanged grants check detecting a leftover diagnostic fixture table.
The fixture had recorded its ownership only in afterAll, so an aborted
child could omit that record. Ownership is now recorded before creation;
the confirmed leftover was removed without CASCADE. The controls and grants
check then passed together (seven tests). None of these isolated passes
substitutes for a clean full gate.

The final isolated normal run is clean: **166 files / 1,591 tests passed in
768.33s**, including the unchanged grants check and all cancellation
controls. No reset cascade occurred. The functional paging body took 863ms
in this run. This establishes the current gate; it does not retrospectively
identify the original R-002 overrun or the initial Explain stall.
Bypass also passes: 97 checks, no open checks or regressions. Strict
typecheck and lint pass. Validation commands did not overlap either full
test run. No existing timeout, assertion or performance threshold changed.


### 5.31 — quarantine history erased by the latest-notice feed (closed)

The filing feed kept only the latest arrival notice. A successful retry erased
the quarantine from view, so nobody could see that a filing had ever been set
aside. Item 5.31 retains safe quarantine revision metadata and derives resolution
from recorded landings, not an acknowledge action. Open and Resolved are separate
read views; history is never erased to clear the screen.

The migration cannot recover quarantine revisions or custody outcomes already
overwritten before it lands. It baselines current failures and durable type-run
findings and records future lifecycle facts. Earlier missing facts remain a
known history-coverage limit, rather than being fabricated.

## Type Observations narrow snapshot variability — 2026-10-08

During regeneration of the reader-approved screen baselines, the 390px type-observation capture shifted content left inside the cause card; the existing baseline was retained rather than accepting an unexplained displacement. The subsequent full Linux visual project reported 86 clean passes and one flaky case in 7.4 minutes: the first type-observation capture differed by 10,996 pixels (3%), with captured heights alternating between 1174px and 1180px, and the unchanged retry matched the existing baseline. The difference is within the cause card; the surrounding screen is unchanged. Horizontal scrolling/focus is a possible mechanism, not an established cause. The 900px and 1440px cases passed unchanged. No baseline or threshold was changed for this case, and no untouched screen differed.

**Measured and corrected 2026-10-08.** Diagnostic captures identified the cause card at 702.5px before capture and 696.5px after screenshot preparation; its header changed 326px to 324px. The remediation body stayed 244.5px. Timestamp inline boxes changed from 16–17px to 15px while their text stayed unchanged; no animation was active at these measured samples. A separate capture retained 1180px page height across 20 layout frames, with the clipped cause card horizontally scrolled by 21px after Details; another capture had scrollLeft 0. This does not establish a relative-age refresh or disclosure animation as the cause. The test now waits for the screen entrance animation before clicking Details, then waits for unchanged card/header geometry and scroll position over successive animation frames before capture. All nine visual cases (three repetitions at each width) passed without retries against the existing baselines. No baseline, threshold or tolerance changed. The underlying screenshot-preparation metric change is reported separately from the observed focus/scroll state; a timing correction is not a production layout fix.

**Separate production overflow corrected 2026-10-08.** A descendant-by-descendant 390px measurement located the 21px excess in the cause-card header, not the disclosure body: the oldest-date `time.audw` was 186.265625px wide in a 122.5px identity cell, extending 20.265625px past the card. The 228px bordered card had a 226px client width and 247px scroll width. Its outer timestamp inherited `white-space: nowrap`, joining two already-unbreakable spans into one overflowing line. The scoped Observations header rule now lets the outer time wrap between absolute time and relative age while keeping each existing span unbreakable. Nine focused functional cases passed (three repetitions), including UTC/Toronto at 390px, exact client/scroll-width equality, zero horizontal scroll after Details, focus and History, intact timestamp parts, axe and partial control/placement conformance (1/53 routes, zero findings). The earlier settle wait is committed separately as 8623835; it did not fix this production overflow. No baseline regeneration was performed for the layout correction; it is ready for reader review.

**Shared timestamp rule and remaining bypass audit (2026-10-08).** Timestamp now marks its outer time and its absolute/relative spans, with the master enforcing a wrap between intact parts for all three appearances. The redundant Activity and Observations wrapping overrides are removed. The console audit found two event-timestamp bypasses: Data sources (`src/app/sources/screen.tsx`) slices `lastIntrospectedAt` to 16 characters and replaces `T`, omitting the zone, relative age and display preferences. The other is a broken renderer: `KeyFacts` in `src/app/pools/screens.tsx` interpolates `stamp(record.graceUntil)` (a React element) into a template string, producing `[object Object]` on the Agent twin when a key has a grace expiry. Reported separately rather than silently repairing an unrelated field. Other event timestamps use Timestamp directly or through a React-returning wrapper. Activity day strips and Suggestions/Dashboard day buckets are intentionally UTC calendar dates. The copyable/downloadable operator packet formats ISO timestamps as plain text; it cannot use a React component. No further event timestamp renderer outside the shared component was found in src/app or shared UI. The initial inventory missed the source-table ISO-string slice; the expanded slicing/formatting audit corrected that omission.

**Timestamp bypasses corrected (2026-10-08).** Data sources now renders Last introspected with Timestamp inside its existing introspection-history link; null retains Runs. Agent twin KeyFacts now renders Grace ends as JSX with Timestamp instead of interpolating a React element into a string. Git history places the `[object Object]` defect at 39b299d (5.16, 2026-09-29 16:09 -0400), nine calendar days before this fix. The 5.14 screen had the same template interpolation, but its formatter returned a string then; the initial screen commit was 7be5328, labelled 5.15 while containing the 5.14 screens. Every twin fixture used a null graceUntil, including the snapshot fixture. I-016 supplied a non-null grace date only to the Pool detail key, not to the twin metadata; therefore it never tested the broken renderer. New cases explicitly populate twin graceUntil and verify its shared timestamp, zone and relative age. Calendar-day Activity strips and UTC attempt/count buckets remain exempt, as does the operator packet’s portable ISO text; the exception is recorded in §5.5.
# Activity timestamp geometry and virtualiser offset — resolved (2026-10-08)

The shared Timestamp review exposed two existing Activity defects. At 1440px,
before and after that change, closed request rows measured 52px: the timestamp
cell inherited a 16px line box, giving two lines 42px plus 10px row padding.
The removed Activity override contained only whitespace; it changed no leading
or margin. Separately, the day strip measured 46px but an initial viewport resize
could discard its recorded height, leaving the 52px estimate and moving every
request down 6px. Diagnostic logging established the measurement/resize order;
this was not a change in request-row height.

Resize now preserves measurements; ResizeObserver updates entries whose actual
height changes. The timestamp cell uses 10.5px text sizing and 1.4 line-height.
Three cold browser contexts at 1440px measured identical first-row tops of
383.84375px, 42px closed rows, 46px day strips, and 14.6875px timestamp cells
with computed 14.7px line-height. The fixture fits on one line with that sizing;
the shared intact-parts wrapping contract remains. Exact tests cover the initial
measurement race and the three-load geometry; no tolerance or threshold changed.
Both state tests and all 15 affected functional cases pass, including axe and
partial conformance. Typecheck and lint pass. Baselines were inspected by eye,
regenerated by cause, then checked in a fresh comparison-only visual run:
87/87 passed in 7.7 minutes without retries. Activity images are grouped under
the two geometry fixes; other changed images name the shared Timestamp cause.


### Recorded-failing scroll measurements (2026-10-09 decision)

M-015, G-019 and H-016 now run and report in the performance project without their frame verdicts failing the build. Raw intervals, measured refresh and the unchanged 1.5-times-refresh comparison remain visible in attachments and console output, including when a capture passes. Pagination, selection, navigation and mounted-row bounds still gate. This supersedes the earlier decision to leave frame verdicts gating; it does not retract the traces showing real application work. The investigation remains stopped: run-to-run variance exceeds the effects the harness can resolve, with mostly 33ms intervals and environmental spikes in the latest failing set.

The existing failing capture recorded M-015 at 117/120 long intervals (16.7ms baseline, 366.7ms maximum), G-019 at 68/120 (16.7ms baseline, 266.7ms maximum), and H-016 at **55/120** (16.7ms baseline, **133.4ms maximum**). H-016 passed before the grouped Entitlements rebuild and is newly in this set. The rebuilt rows carry treatment marks and a signal column and cost more than the flat rows did; the fixture uses 42px branch rows and 38px member rows. This comparison is recorded without a new investigation or a claim that these intervals isolate individual markup costs.

Reinstate frame gating only with a measurement method whose variance is smaller than the effect, or if a person reports the console feeling slow. No threshold or timeout changes.

Reporting verification, one run after this decision: M-015 103/120, G-019 67/120 and H-016 80/120 long intervals, each explicitly reported as a failed non-gating frame verdict. All remaining functional assertions completed and the command exited 0 (three cases, 1.3 minutes). Typecheck and lint passed. These are verification results, not a resumed performance investigation.

### Personal settings 1440: unresolved capture paint, 2026-10-09

Five captures of the same page with Chrome paint tracing were complete,
incomplete, incomplete, complete, incomplete. Incomplete captures omit
foreground in the drawer and top header (navigation text/marks, project
switcher and header controls), while backgrounds and the Settings form remain.
Geometry is unchanged; sampled document animations are empty, fonts loaded,
and the logo complete. The 15 drawer SVGs are inline DOM geometry, not pending
icon downloads. Subsequent paints include #document, ASIDE#application-drawer
and HEADER.top with differing clips. This establishes neither the compositor
cause nor a correct wait. No tolerance, retry or speculative wait was added.
Under the reader's explicit one-round exception, the old Personal 1440 image
is retained; 56 explained images were regenerated in five cause-specific
baseline-only commits. Diagnostic artifacts are outside the repository at
/private/tmp/opintel-5.34-5.35-review/paint-diagnostic. See the full diagnostic
in 5.34-settings-design.md.

**Deadline reporting correction (2026-10-09).** The original recorded-failing helper covered only the frame assertion. G-019's separate functional pagination/virtualisation case exhausted its 60-second deadline during its final scrolling capture; it never produced a frame verdict. By reviewed decision, deadlines for M-015, G-019 and H-016 are also non-gating, in both browser projects. The reporter preserves the timeout and error details and explicitly reports incomplete coverage: unfinished functional assertions are not proved, and no frame verdict is invented. Assertion failures, infrastructure failures, interruption and conformance failures remain gating. Deadlines and frame thresholds are unchanged. The same reinstatement condition applies.


### Baseline provenance and exact reproduction, 2026-10-09

The Activity investigation did not identify a later non-chevron regression. Using Playwright's stabilized matcher, the list at its own baseline commit (63f497a) differs from its committed image by 129 edge pixels; HEAD has exactly the same residual. The record matches at its baseline commit (5b38e11) and at HEAD outside the intentional Settings chevron removal. Newly captured 63f497a and HEAD images differ only in the 20 chevron pixels. Direct page.screenshot captures were not equivalent to the stabilized matcher: even at 63f497a they produced a 1137px list, while the matcher produced 1135px. The earlier direct-capture height cannot establish a source regression.

Three further stabilized baseline self-checks also failed exact reproduction: Personal 1440 at 9d5ff1b differs by 30 pixels (1440×1016 in both); Settings 1440 at 3fa270e differs by 875,552 pixels (committed 1440×1192, recaptured 1440×1016); declarations 390 at 18a4160 differs by 438,320 pixels (committed 390×2075, recaptured 390×1784). Historical scenarios were preserved, including the settings navigation sequence. The latter two image commits precede a430ded's implementation; their images therefore do not describe the frontend committed alongside them. This is a baseline-provenance mismatch, distinct from the small same-code raster residual. The Personal residual does not establish the compositor cause of the earlier incomplete-paint captures.

By explicit approval, groups 2, 5 and 6 are regenerated from HEAD with the stabilized matcher and must reproduce pixel-for-pixel on a second unchanged capture before the baseline commit. The new AGENTS.md rule requires identical dimensions and zero differing pixels after every regeneration, in the same pinned browser environment. A screenshot matcher pass alone is insufficient because its normal comparison can accept small pixel differences. No tolerances, retries, thresholds or production rendering changes are used to obtain reproduction. Historical diagnostics remain at /private/tmp/opintel-settings-selfcheck and /private/tmp/opintel-activity-bisect.


**HEAD regenerate–recapture result.** Six selected scenarios passed on each of two sequential runs (retries disabled), producing eight stabilized images. Exact comparison reproduced record 900, rollup list 1440, rollup record 1440, Personal 1440, Settings 1440 and type observations 1440 with zero differing pixels. Activity list 900 differed by 54 pixels between captures (both 900×1135); declarations 390 differed by 25 pixels (both 390×2075). Thus the proposed exact-reproduction prerequisite is not met for the whole authorized group. No extra attempts, tolerance changes or production fixes were made. The candidate baselines remain uncommitted; the final browser gate and push are withheld under the known-defect scheduling rule. First/second captures and exact counts are retained at /private/tmp/opintel-head-baseline-reproduction. This demonstrates small same-code raster variation even with the stabilized matcher; it does not identify the rendering cause.


**Explicit capture-precondition experiment.** A shared snapshot helper now moves the mouse to (0,0), awaits document.fonts.ready, waits for document.getAnimations().length === 0, resets scroll to zero and waits for scrollY === 0; it attaches those four values before the stabilized matcher. Five repetitions, one worker, pinned Chromium 153.0.8010.12 and no retries, passed these preconditions on all fifteen images. Against capture 1, Activity list 900 differed by 57, 45, 57 and 57 pixels (all 900×1135); its record was identical across all five (900×1604). Declaration panel 390 differed by 0, 0, 9 and 0 pixels (all 390×2075). Activity differences are rounded toolbar-picker and treatment-badge border fragments; declaration differences are two project-switcher border fragments, not the declaration body. These preconditions do not establish exact raster reproducibility. Per the explicit stop condition, there is no further regeneration, commit, full browser gate or push. The helper and its call-site changes remain uncommitted for review. Captures, DOM mappings, counts and all region boxes/selectors are retained at /private/tmp/opintel-capture-preconditions.


**Deterministic-raster follow-up.** With the same capture preconditions, the reviewed Chromium launch flags (--disable-gpu, --disable-partial-raster, --disable-skia-runtime-opts, --disable-lcd-text, --font-render-hinting=none, --force-color-profile=srgb, --force-device-scale-factor=1) produced five pixel-identical captures of each of Activity list 900 (900×1135), Activity record 900 (900×1604) and declarations 390 (390×2075). All twelve comparisons against each sequence's first capture are exactly zero; no retries or tolerance changes. This establishes reproducibility for these measured sequences, not a general explanation of Chromium's raster internals. The flags are shared through the base Playwright launch configuration; snapshot scenarios use the shared precondition/metadata helper. The earlier stop is superseded by this explicit reviewed experiment. Regeneration of groups 2, 5 and 6 is now permitted, still subject to exact recapture before the baseline-only commit. Artifacts: /private/tmp/opintel-raster-five/results.json and the fifteen PNGs.


**Encrypted secret storage — separate security design.** 5.36 uses operator-provisioned environment credentials and an environment signing master key. A database-backed secret store with envelope encryption under a key held outside the database (environment or KMS) is needed for per-project provider credentials or multi-tenant deployments. It requires its own security review and is not a sub-decision of custody release. Design position: [encrypted-secret-store-design-position.md](encrypted-secret-store-design-position.md).

### 5.36 validation: demo recovery recorded-failing deadlines (2026-10-10)

The normal suite's failed-demo-provisioning recovery cases in `test/source-registration.test.ts` exceeded their unchanged 5,000 ms body deadlines. The `connect` case reported **7,994 ms** and the `retry` case **8,375 ms** (Vitest case durations, including its surrounding lifecycle rather than a claim that the body budget was that long). Both are recorded-failing in this run; neither completed its recovery assertions, so this run does not prove those assertions. No budget, assertion or fixture is changed to accommodate them. These are distinct from the six custody contract/setup failures approved for correction. No claim is made here about the cause of the deadlines.

**What the five-second budget was set against.** These cases were introduced in `58250d9` (2026-09-20). Neither the individual tests nor that commit's Vitest configuration specifies a timeout: 5,000 ms is Vitest's default body deadline, not a measured recovery-performance target. The timed body creates a deliberately failed demo provisioning attempt, preserves its failed introspection record and a quarantine arrival, retries through connect or introspect, checks concurrent/in-progress responses, resumes provisioning and introspection, then verifies source identity, original run and filing history, and idempotent completion. The separate fixture hooks set up the project, permissions, pinned Engine and HTTP server outside that body deadline. No measurement establishing five seconds as sufficient was found in the introducing commit. The 7,994/8,375 ms case durations therefore need their own investigation; they are not evidence that the body was intentionally budgeted for that amount of work. Budget and assertions remain unchanged.

**Follow-through validation.** The approved custody corrections passed all 23 focused tests; typecheck and lint passed. The remainder of the data gate was run sequentially: code performance 13/14 passed in 320.75 s; K-007 measured 2,286.28727 ms against its unchanged 2,000 ms assertion (cause not established; not reclassified as a pass). Token collision passed in 120.42 s. Full shipping-image ephemerality passed 14/14 in 2,174.83 s, with every scan case reporting VERIFIED, no failures and no incomplete coverage. Artifacts: `test-results/ephemerality/2026-10-11T00-09-46.132Z/`. Custody redeemed/expired/revoked post-response memory matches were 258/243/243 respectively; those residuals remain visible, not suppressed. The data gate is not green. The normal suite was not rerun wholesale after the focused corrections; its original two demo-recovery deadlines remain recorded failures, not proved assertions. No timeout or performance threshold changed.


### Performance-first data gate and K-007 cold observations (5.36)

By decision, `check:data` starts code-performance in a separate process before normal checks, collision and ephemerality. K-007 runs first in an isolated fork: one cold authenticated query, then one identical warm query, no retries. Warm retains 2,000 ms. Cold remains recorded-failing/nonblocking without a budget until three separate data-gate occasions supply timings; correctness and confirmed cleanup remain required. Every performance case and explicit timed measurement logs process age and load averages. See [the K-007 report](5.36-k007-profile.md) for the observation ledger.

Occasion 1 (2026-10-11 03:01 UTC): cold 1,280.908 ms, warm 601.788 ms. Performance 13 passed / 2 failed, 335.44 s; data command 340.799 s. M-007's first read was 609.258 ms against 500 ms, then 49.344 / 53.633 / 34.631 / 32.566 ms; load at the first measurement was 12.377 / 6.495 / 4.089. E-016 was 347.937 ms against 100 ms; load 5.979 / 6.725 / 4.650. These readings are attribution evidence, not an established cause or grounds to suppress either failure. Vite/API development processes were paused and resumed, no other validation overlapped. No rerun or budget change. The command stopped before check/collision/ephemerality; check:ui was not run and baselines did not move. Two future cold occasions remain before proposing its budget.


### F-004 isolated timing investigation (2026-10-11, 5.36)

F-004 registers ordinary and landed Postgres sources through HTTP and the real Engine connector, waits for both introspections, verifies separate catalogue counts and cursor pagination. Its unchanged body deadline is 5,000 ms. The prior data/UI runs reported 4,149 / 6,912 ms overall; the latter failed the body deadline. Vitest's overall duration includes per-test setup and teardown and is not the timed body alone.

Three isolated profiles, once each, with unchanged assertions/deadline and an ignored diagnostic runner separating hooks from body:

| Condition | Body ms | afterEach ms | Per-test setup ms | Vitest total ms | File teardown ms |
|---|---:|---:|---:|---:|---:|
| Cold worker | 2350.081 | 0.678 | 1799.611 | 4157 | 45.900 |
| After performance suite | 2084.362 | 0.638 | 1396.059 | 3485 | 37.353 |
| After full normal suite | 2022.791 | 0.653 | 1365.064 | 3394 | 51.624 |

All passed. Neither conditioning suite slowed the subsequent isolated case. The normal conditioning suite passed 1,645 tests in 934.15 s; F-004 within it took 2,207 ms overall. SpiceDB held 36,692 relationships at the same revision before cold and post-performance profiles, then 37,318 before post-normal; F-004 uses a stubbed authorization port rather than a SpiceDB lookup. This does not support accumulation as its cause. No blocker was captured during the latter two isolated bodies (100 ms pg_stat_activity/pg_blocking_pids sampling; no observer during the cold body). Setup, not teardown, explains the large difference between body and overall duration. The rewritten advisory-lock diagnostic is a separate test; the measured F-004 cleanup is negligible. No cleanup change is justified by these results.

Limitations: these are fresh JavaScript workers, not a physically cold host. Development servers were paused and validation commands sequenced, but the host was not otherwise idle: Chrome renderer/GPU processes and Docker's VM consumed CPU. Performance conditioning had two fixture deadline failures (M-008 and M-007); load average rose from about 5 to 23. Its final leak check also correctly flagged the diagnostic observer, which had started after the launcher's connection baseline: an instrumentation mistake, not a product leak. The observer was stopped before the UI gate. Raw phase logs: /private/tmp/f004-{cold,after-performance,after-normal}-phases.jsonl; conditioning logs use the same prefix. No diagnostic code enters production or changes the test contract.

**Cause remains unresolved.** These passing profiles cannot explain the earlier timeout or prove an environmental cause. Do not turn it into a recorded failure, split cold/warm, exclude cleanup, or raise the deadline on this evidence. If it recurs, body subphase timings and contemporaneous waits/load on the failing run are needed; another isolated pass is insufficient. No retry or deadline change was made.

The requested subsequent **single check:ui** finished red in **1,011.427 s** (16m 51s). Lint/typecheck passed; normal tests **1,643 passed / 2 failed**, 923.77 s. **F-004 passed at 2,510 ms overall** with its deadline unchanged. JOIN-004 received `validation_failed / unclassified` instead of `unsupported_on_token / unsatisfiable_token_join`; M-011 read `outcome: null` instead of its recorded `element_withheld` refusal. These are assertion failures, not reset timeouts; no reset-blocker snapshot occurred. The browser stage did not run because check:ui sequences it after the normal check. No rerun, implementation fix or baseline change followed. Development processes resumed. Log: `/private/tmp/opintel-f004-check-ui-20261011.log`.



### Shared normal-suite state and changing order: JOIN-004 / M-011 / F-004 (2026-10-11)

Investigated as one cross-run consistency problem, not three independent latency/classification fixes. No gate was rerun. Six isolated commands ran sequentially, three per case, then one normal suite with state snapshots before/after. Development servers were paused and resumed. Diagnostic instrumentation was restored byte-for-byte afterwards; assertions, budgets and production code were unchanged.

| Isolated run | JOIN-004 | M-011 |
|---|---|---|
| 1 | PASS, 2454 ms | PASS, 1591 ms |
| 2 | PASS, 2161 ms | PASS, 1398 ms |
| 3 | PASS, 2329 ms | PASS, 1583 ms |

All six JOIN-004 responses (application and independent Engine paths in each run) returned the expected `unsupported_on_token / unsatisfiable_token_join`. All M-011 records contained `{kind:"refused",code:"element_withheld",stage:"validate",element:"field_5"}`. In the failed UI run, JOIN-004 instead returned `validation_failed / unclassified`; M-011 had a durable query_run header but no joined run_completion outcome, where that withheld refusal should have been. These are not three reproduced defects with separately established causes.

**Measured state.** Before the isolated commands, SpiceDB held 37,944 relationships and Postgres 249 rows across 64 logical tables. After the six isolated commands/before the normal run: 37,974 and 588. After the normal run: 38,600 and 294. Postgres counts include public tables plus the three empty _opintel_landing tables; partition roots counted once, child partitions not double-counted. SpiceDB counts enumerate actual relationships at its reported exact revision, not fixture assumptions. Before normal revision: `Gh8KEzE3OTE3Mzk5NDM2NDc2OTE4OTgSCGY5Zjk5ZTZm`; after: `Gh8KEzE3OTE3NDA2NDc0ODg2MDgyMDkSCGY5Zjk5ZTZm`.

All changing Postgres table counts follow; the other 41 tables were unchanged:

| Table | Before normal | After normal |
|---|---:|---:|
| `agent_presence` | 6 | 1 |
| `catalog_element` | 66 | 12 |
| `catalog_object` | 18 | 11 |
| `company` | 15 | 11 |
| `data_source` | 18 | 11 |
| `entitlement` | 51 | 6 |
| `evidence_redaction` | 9 | 0 |
| `industry` | 4 | 2 |
| `pool` | 21 | 13 |
| `pool_key` | 6 | 2 |
| `pool_key_request` | 7 | 3 |
| `pool_source_binding` | 24 | 11 |
| `project` | 15 | 11 |
| `project_member` | 0 | 2 |
| `query_run` | 11 | 2 |
| `relationship_outbox` | 28 | 1 |
| `run_completion` | 10 | 1 |
| `run_element` | 18 | 0 |
| `run_stage` | 24 | 0 |
| `token_domain_assignment` | 69 | 12 |
| `token_join_candidate` | 6 | 0 |
| `user_account` | 58 | 80 |
| `vocabulary_term` | 4 | 2 |

The normal launcher (`scripts/test.ts`) performs readiness checks, not datastore reset. `test/global-setup.ts` manages diagnostic and migration-test resources but creates no fresh SpiceDB and performs no run-level Postgres reset. Some files register `resetDatabaseBeforeEach`, whose selected TRUNCATE roots differ; queryFixture/bulkFixture create random tenant fixtures without deleting their metadata or SpiceDB relationships at close. Performance differs: `scripts/test-performance.ts` owns a fresh SpiceDB and its runner deletes fixture-added relationships. Normal-suite accumulation is **observed**, even though resets make the final Postgres total lower. The increasing user_account count and leftover metadata must not be described as a pristine database.

**Order evidence.** In the failing UI log, the evidence-writer file ran after exactly three completed files: introspection-job, mcp-query, bulk-entitlements. These construct catalogue/domain/entitlement state; bulk-entitlements also writes bulk decisions and idempotency receipts. JOIN-004 was first within evidence-writer; M-011 sixth, after DOMAIN-002/DECL-008 (domain migration/history), Q-037 (settings), and two successful-answer/receipt cases. Later tests which mock writer.close ran after M-011. Join-review decisions in relationship-suggestions ran later, not before these failures. File execution is serial (`fileParallelism:false`, `maxConcurrency:1`), and mocks are restored in afterEach. The default report contains order but no complete worker assignment; worker-PID cleanup artifacts are partial and cannot establish a historical test-to-worker map.

In this diagnostic normal run, evidence-writer ran after 77 completed files; both target cases ran in PID 15645 and passed (JOIN-004 2391 ms, M-011 882 ms). F-004 also passed, 2211 ms. Vitest 4.1.11's BaseSequencer sorts failed files first, then by cached duration. Focused runs update the same normal-project cache under node_modules/.vite/vitest, so selecting these tests changed the later full-run order without a code change. This is an observed reproducibility confounder, not proof that a particular preceding file poisons them.

The normal run took 736.99 s (741.489 s command), 1642 passed / 3 failed: evidence-export redaction expected `[redacted]` in an empty string, page-boundary checking expected an id but received undefined, and spreadsheet-formula neutralization expected a record but received an empty array. No retry. No evidence-close failure was captured in the diagnostic writer. The clock hypothesis was also sampled: PostgreSQL opening and application completion use different clocks, but the contemporaneous samples do not establish a harmful skew; the original failed run had no such samples. Do not name that as the cause.

**Conclusion and proposed isolation, not applied.** Shared external state accumulation and cache-dependent file ordering are established; their causal link to the intermittent assertion failures remains unexplained. Passing with more accumulated state rules out a simple claim that a particular relationship-count threshold always causes the failures. For approval: reuse the performance launcher's owned fresh SpiceDB for each normal-suite invocation, and establish one explicit, freshly seeded Postgres fixture baseline before that invocation (including user accounts and outbox roots). Preserve existing per-test resets and assertions. This removes known cross-run state, but is a proposed isolation control, not a proven fix. Record/replay file order independently for any controlled comparison; do not infer identical order from identical code. No isolation, timeout, assertion, baseline or gate change was applied.

Artifacts: `/private/tmp/state-{JOIN-004,M-011}-{1,2,3}.log`, private response JSONL files alongside them, `/private/tmp/state-before-normal.json`, `/private/tmp/state-after-normal.json`, `/private/tmp/state-normal.log`, and clock samples `/private/tmp/state-clock.jsonl`. The six isolated diagnostics and normal run were the only test commands for this investigation.


**Approved isolation and ordering follow-through.** Three normal runs of the same implementation produced three different failing sets: F-004; JOIN-004 and M-011; and three evidence-export assertions. Every case subsequently passed in isolation. Order changes and datastore accumulation are demonstrated confounders; they are not a proven causal explanation for each failure.

By decision, each normal `npm test` invocation now owns a fresh in-memory SpiceDB (schema loaded, actual zero-relationship snapshot verified) and resets/reseeds Postgres before Vitest starts. The migration ledger stays unchanged; the declared seed is two industries, two filing vocabulary terms and one demo template, with every other fixture table verified empty. A session advisory lock prevents two normal invocations sharing the test database during a reset/run; reset blockers retain the existing literal-stripped diagnostic. Existing per-test resets and assertions remain. Performance's owned datastore and warm-up path are preserved, not replaced by normal setup.

Normal files now sort by project name then repository-relative path using codepoint lexical comparison, shuffle explicitly off, one worker and serial files. The sequencer never calls Vitest's cache sorter; cached failures/durations cannot reorder it. Each invocation writes `test-results/normal/<run-id>/run.json` (baseline counts and image identity, no credentials) and `order.json` (selected ordered file list, shuffle=false, cacheOrdering=false). Readiness/seed/schema failure stops before collection; child completion closes the baseline lock connection and removes the owned container.

The focused ordering/metadata test passed. The three evidence-export assertions were run in isolation **once**, unchanged, and all passed: download-time redaction/CSV escaping, page-boundary permission/redaction/cancellation, and spreadsheet-formula neutralization/synthetic exclusion. They therefore belong to this recorded cross-run finding; no timeout, assertion or baseline was changed. This removes observed shared-state/order confounders without claiming the original failures' root cause has been established. The subsequent requested `check:ui` ran once: 2,889.881 seconds overall. Lint and typecheck passed; normal tests passed 1,646/1,646 across 176 files in 929.10 seconds, with completed file order exactly matching the recorded list. F-004 took 2,636 ms, JOIN-004 3,780 ms and M-011 913 ms; all seven export tests passed. Browser validation reported 289 passed, 52 failed and one flaky in 29.8 minutes: eleven functional checks retain pre-custody option/legend counts, and 41 visual scenarios differ; Declaration panel 1440 passed only on its configured retry and is reported flaky. The seven custody browser checks passed. Full conformance visited 54/54 routes with zero findings. Visual differences were not attributed or regenerated in this run. No separate gate rerun, assertion change or baseline change was made; development processes paused for validation were resumed on exit.


### Steady-state performance contract and explicit warm-up

M-007 times five 51-row evidence-reader pages filtered by pool and range from one million records; the maximum is budgeted at 500 ms. Its first read in occasion 1 was the first EvidenceReader.list call in its forked process. E-016 times a fully consistent LookupResources request across 200 projects and checks the exact 150-project result, budgeted at 100 ms. It was the first LookupResources request on that client and in its worker.

The accepted diagnosis is hidden dependence on earlier warm-up, now replaced by an explicit steady-state contract. The narrower observation is that the first calls missed while subsequent M-007 calls passed: earlier suites warming these processes is **not established**, since occasion 1 used distinct isolated fork PIDs (51203 / 51275 / 51560 for K-007 / M-007 / E-016). A separate-process functional suite cannot warm JavaScript, native bindings or client channels in the later performance process; it can warm external services and database caches. Do not report that mechanism as proven.

The suite now uses one serial worker with module isolation disabled so one warm-up can actually persist. K-007 cold runs first. Before the first budgeted case, one unmeasured phase opens Engine sessions and connection pools, performs one authenticated query through a durable evidence writer, reads the evidence once, and performs LookupResources on the channel reused by E-016. Timings are discarded. The header states that budgets are steady-state budgets. New fixtures/data and normal per-request session construction remain part of measured work; warming never excludes those costs or repeats a failed measurement. Budgets and existing measurement counts remain unchanged. Focused runs omit K-007 cold unless selected but still warm once before their budgeted cases.


**Explicit warm-up run (2026-10-11 03:14 UTC).** `check:data` invoked once, exit 1 after 272.585 s. Performance: 14 passed / 1 failed, 267.81 s. Header, one warm-up start/completion, and measurement metadata confirm one serial process (PID 51958), with cold before warm-up. K-007 cold 780.262 ms (occasion 2 of 3, still no budget); K-007 warm 565.784 ms / 2,000 ms passed. M-007's five reads were 312.028 / 43.523 / 43.420 / 70.158 / 62.346 ms, all under 500 ms; first read at process age 87,871.887 ms and load 6.064 / 4.410 / 4.148. E-016 still failed at 101.337 ms / 100 ms, on the warm-up's reused LookupResources client at process age 89,230.909 ms and the same load averages. A warm-up does not guarantee a pass; this miss remains red. No retries, tolerances or budget changes. Normal check, collision, ephemerality and check:ui did not execute after the failed performance stage. Dev processes were resumed. No baselines changed. Typecheck and lint passed before this invocation.


**Fresh-datastore data gate (2026-10-11).** One `check:data` invocation stopped red after **229.228 s** (performance stage 220.19 s). E-016 passed at **14.498 ms / 100 ms**, with **251 live relationships** read from the datastore immediately before timing, and all 251 fixture relationships removed at teardown. K-007 cold **666.992 ms** was recorded without a budget (third occasion); warm **613.431 ms / 2,000 ms** and M-007 max **143.714 ms / 500 ms** passed. R-002 failed in its reset hook before the volume insert: the one-second reset lock cap triggered the safety stop. The cleanup artifact confirms cancellation and cleanup, but does not identify the blocker or retain the native lock exception. Remaining tests were cancelled rather than allowed to cascade. No retry; normal check, collision, ephemerality and UI did not execute. No baseline changes. Log: `/private/tmp/opintel-custody-fresh-spicedb-check-data.log`.


### Reset blocker diagnostics and performance-worker ownership (2026-10-11)

Reset lock failures now log the blocked PID and blocker PID, application name, state, backend start, query start and literal-stripped current SQL through the same projection as evidence. Unsupported SQL is explicitly withheld. A separate bounded control connection samples `pg_stat_activity` joined through `pg_blocking_pids` while TRUNCATE is pending, and checks again after timeout: the lock request has disappeared by then, so an empty post-timeout result alone would lose the cause. The last observed wait is timestamped. A real-lock positive test verifies retention after timeout and absence of the sentinel literal. Observer failure reports incomplete coverage rather than an empty blocker finding.

Resource audit: K-007's file `afterAll` closes its MCP/HTTP/Engine fixture; warm-up closes its fixture in `finally`. Engine two-session construction closes both native sessions in `finally`, and source connections close per operation. The durable evidence writer is stateless: its `close` appends a receipt, not a resource destructor; it borrows the handwritten scope's shared pool. Performance-worker cleanup now explicitly closes tracked pools and the shared LookupResources channel. The launcher confirms new test-database sessions disappear after worker exit (bounded EOF-processing wait) and removes its owned SpiceDB container. No production scope implementation was changed.

The requested single `check:data` invocation was stopped red after **61.194 s** because the first implementation incorrectly used Vitest's per-file `onAfterRunFiles` hook for worker teardown. That closed the shared pool after K-007 and invalidated later files. This was an implementation mistake, not evidence of a product or latency regression. It was corrected to `onCleanupWorkerContext`; a focused **non-latency** two-file lifecycle check passed **3/3**, logged teardown once after both files, and verified **zero remaining database sessions**. The gate was not rerun. Later data stages and UI did not run; no thresholds, budgets or baselines changed. Gate log: `/private/tmp/opintel-custody-blocker-check-data.log`.

During the stopped gate, an external observer took **118** test-database session snapshots, from 03:55:23 to 03:56:26 UTC, plus local socket inventories. Initial and final snapshots were empty; intervening application names were the gate observer and test/sidecar sessions, with no development or psql session observed. Development API processes were paused throughout and their PostgreSQL sockets did not appear in this database. This establishes the observed run, not the previous gate: that earlier run retained no such snapshot, and its blocker remains unknown. Observation artifact: `/private/tmp/opintel-gate-test-connections.jsonl`.


### Diagnostic residue cleanup and completed gates (2026-10-11)

Removed `public.reset_diagnostic_245b6c38b88446cfaaec97be38413ea8`, left by the first aborted blocker diagnostic. The positive diagnostic now uses transaction-scoped advisory locks, creates no persistent relation, and attempts rollback and socket close for both sessions on every setup/assertion exit path. The blocker-retention and literal-redaction assertions remain; focused diagnostic plus unchanged table grants passed 5/5.

The inventory also found eight old generated schemas (one cancellation, one query and three source/landed pairs), traced to their fixture constructors. Their known tables/views and empty schemas were removed without CASCADE. Public-table grant discovery then passed; no additional public table or generated schema remained. The product `_opintel_landing` schema was retained, with zero sources. Four old cluster-wide `read_<uuid>` roles and two separate `migration_<uuid>_<uuid>` databases were observed outside the test database and left unchanged; this is not a claim that the whole Postgres cluster is residue-free.

One `check:data` invocation passed in **4,391.534 s (73m 11.5s)**: performance 18/18 (256.74 s), lint/typecheck, normal tests 1,645/1,645 (940.79 s), collision and shipping-image ephemerality 14/14. No reset blocked. Performance-worker teardown verified zero remaining database sessions. Proof coverage was verified without suppressed residuals: post-response memory matches include clear 627,068; treated 1,066,809; aggregate 100,673; application 103,492; custody redeemed/expired/revoked 244/240/240. These are residual observations, not proof of immediate managed-heap erasure. Artifacts: `test-results/ephemerality/2026-10-11T14-45-08.083Z/`; log: `/private/tmp/opintel-custody-clean-check-data-20261011.log`.

The conditional single `check:ui` invocation stopped red in its normal-suite prerequisite after **1,033.581 s (17m 13.6s)**: 1,644 passed, one failed, 174/175 files passed. **F-004** (`source-registration.test.ts`, ordinary/landed source connection and independent catalogue) exceeded its unchanged 5,000 ms body deadline, with case duration **6,912 ms including cleanup**; the same case passed at **4,149 ms** in the preceding data gate. The exact failure is `Test timed out in 5000ms.` Neither a cause nor a latency allowance is inferred from these two runs. Both demo-recovery cases passed in this invocation. Browser validation did not run. No retries, timeout changes or baseline regeneration. Development processes resumed. A final read-only inventory again found only product landing metadata outside public/system schemas, with zero landing sources. UI log: `/private/tmp/opintel-custody-clean-check-ui-20261011.log`.


### Development console port ownership and gate teardown

Two repository Vite sessions occupied localhost:5173 (PID 9500, started October 6) and localhost:5174 (PID 90133, started October 7); both predated today’s isolation change and browser gate. The API’s magic-link APP_BASE_URL was localhost:5173. Development now explicitly requires port 5173 with Vite strictPort: a conflict fails loudly rather than silently moving to 5174. The duplicate sessions were stopped. Gates must not leave development servers behind. The browser gate uses a Docker-owned Playwright webServer on 4173 with CI=1 (reuseExistingServer=false), Playwright teardown, and docker run --rm --init. After gate exit no 4173 listener or browser container remained; only the three persistent dev service containers ran. These two stale sessions were previous dev sessions, not gate-owned servers.

The Dashboard feed and custody status failure was independently an unapplied dev deployment: schema_migration ended at 066, while availability queried project.custody_check (Postgres 42703, column does not exist). Both requests returned 500 after successful console authentication, not an origin refusal. Applying 067–071 and restarting the API was the minimal correction. Dev Postgres remains localhost:5432/opintel, dev SpiceDB localhost:50051; test isolation changes neither. ReadSchema definitions match the checked-in schema after canonical ordering/formatting is accounted for.

After the deployment correction, authenticated requests through restored localhost:5173 returned dashboard/feed 200 (four findings) and custody-provider 200 (provider_not_configured, zero affected columns). Full retained/sanitised logs and separately reproduced native SQL error: [dev-console-2026-10-11.md](dev-console-2026-10-11.md). No 5.36 code patched.

## Strict comparison masked pre-raster baselines (5.36 closeout)

Activity list 390, stored-redaction rollup 390, revoke dialog 390, Company settings 390 and Personal settings 390 each produced three identical captures under the current raster flags, but differed from their old baselines by 7,564 / 6,504 / 5,346 / 1,781 / 1,656 pixels respectively. Removing only the raster flags from `7133e82`, with preconditions retained, reproduced the first four baselines exactly and eliminated every original Personal mismatch (the control introduced eight separate pixels at the date-select border). Their baseline commits precede the raster flags. The ordinary matcher's tolerance masked these pre-flag baselines; this is not a toolbar or badge-layout change.

**Proposal, not applied:** after all remaining causes are resolved and approved baselines reproduce exactly, add an exact decoded-RGBA comparison of the stabilized matcher image (equal dimensions and zero differing pixels) to the visual gate. Setting `maxDiffPixels: 0` alone is insufficient if the comparator still ignores antialiasing or permits per-pixel colour differences. Retain capture preconditions and the pinned browser; keep failure artifacts. First report any existing residuals rather than widening tolerance or mass-regenerating them. The deterministic captures support reviewing this policy, not silently changing the gate. No comparator, threshold or tolerance changed in this work.

**5.36 closeout, five-capture check:** the pre-data-ready rollup candidate was invalidated by decision and replaced provisionally. New independent captures still exposed one non-reproducible result: custody Activity present at900, repetition4 versus0–3, 11,769 differing pixels in the first three request-row text bands, both900×1184. Rollup and toolbar pixels remain identical. The other37 named captures (190 total images across five repeats) are exact. Thus intermediate API loading alone is insufficient to establish deterministic row paint/placement; no cause is asserted. Baseline commits and the full UI gate were withheld rather than accepting a tolerance pass. See `5.36-browser-review.md` for regions and artifacts.

## Integer rollup line boxes: known 1px variance remains

The reviewed layout change uses a 20px line-height and minimum height for the custody rollup (60px when wrapped at390;20px at900/1440). A 20px rollup alone did not make the request origin integral: preceding subtitle lines were20.925px and toolbar note lines18.7px. Scoped whole-pixel line-heights (subtitle21px, toolbar note20px) apply only while a custody rollup exists; no-custody layout is unchanged. No new class or palette value was added.

Coordinates were measured after Playwright's stabilized matcher, using the existing raster flags and capture preconditions. Twenty independent scenario executions, retries disabled: ten at900 and five each at390/1440, yielding60 captures including absent rollup, present rollup and receipt.

| Viewport | First request row y | Rollup y / height | Exact reproduction |
|---|---|---|---|
|390|765px in all five|558px /60px|all five identical|
|900|542px in repetitions0–8;543px in repetition9|433px /20px in all ten|tenth present-rollup capture differs|
|1440|402px in all five|293px /20px|all five identical|

All measured row origins are integers. The tenth900 present-rollup image nevertheless differs by **11,769 pixels** from the first nine; both are900×1188. Differences are confined to the first three request-row text regions: x319,y554,width233,height157 (4,124 pixels); x319,y731,width233,height157 (4,124); x319,y908,width233,height119 (3,521). The request-row boxes are also1px lower in the tenth capture, so the evidence is not solely a raster change with fixed DOM geometry. The rollup's text, box and pixels are unchanged, and there are no differences in the toolbar or elsewhere. Both captures report successful rows/summary, zero pending API requests, fonts loaded, no active finite animations and scrollY0. Other59 captures match their corresponding first image exactly.

Record this as the **known1px text-snap variance on the custody rollup900 scenario**, without claiming the fractional rollup line-height was its cause. The layout change remains uncommitted for review; no baseline regeneration/commit, full check:ui invocation, implementation commit or push follows this failed reproduction condition. The temporary browser container was removed. The decision whether the gate's existing tolerance is the appropriate judge is reserved for the reader. Evidence: `tmp/review/integer-rollup/verification.json`, `metadata-9-custody-activity-present-900.png.json`, `differing-regions.json`, and `images/`.

## Bounded band hunt and reviewed tolerance exception

The requested instrumented hunt stopped at its **third capture**, the first odd rendering (two at first-row y542, one at543). Every element in the band was logged. **No visible element in the band changed height**: rollup bottom453, Requests header, day strip and separators are unchanged. Fonts were loaded and scrollbar width0 in all three. The first request's absolute `top` changed32→33px, its enclosing list height10169→10170px, and the request moved542→543px; its own height176.578125px is unchanged. This establishes a virtual-list positioned offset difference, not a changing rollup/header height. Its cause was not identified as a clear layout correction; the hunt stopped rather than widening into another investigation. Artifacts: `tmp/review/rollup-band/capture-{0,1,2}.json`.

By explicit reader decision, this **known1px band variance at900 on the custody rollup scenario is covered by the gate's existing tolerance**. No tolerance, budget or retry setting was changed. The majority rendering (first row542, nine of ten captures in the prior controlled run) is used for the baseline. Integer line boxes remain:20px rollup and toolbar note,21px subtitle, scoped to custody presence. The390 and1440 rollup images reproduced five times exactly. The other baseline groups (five390 pre-raster images and eight credential-alias images) reproduced five times exactly. Three differences in each cause group were inspected by eye before commit. Activity's existing1440 toolbar images are already exact after the complete-text-node correction, so there is no image change and no empty baseline commit for that group; the code correction stays in the implementation commit.


### 5.37 credential migration timing and functional hang guards (2026-10-12)

Disposable databases on the test Postgres instance, with the existing seeded industry rows and one existing pool containing current and retiring keys: migration 072 forward including backfill **83.202 ms**, revert **41.451 ms**; the isolated identity/key/last-use backfill block **3.415 ms**. Full clean chain 001–071 **2,149.490 ms**, versus 001–073 **1,973.949 ms**. These are single diagnostic measurements, not budgets or proof of a speedup; they do not support the new migration accounting for the multi-second domain-history test. The backfill uses set-based SQL, has no application per-row update loop and makes no provider calls. No migration bytes were changed. Diagnostics cleaned up their disposable databases.

DOMAIN-001/003's three isolated runs took **5,381.9 ms (deadline)**, **5,326.3 ms (deadline)** and **4,261.5 ms (pass)** including cleanup. This is not established as normal-suite contention. That combined case exercises domain assignment, query fixtures, token changes and reversion, not a full schema-chain replay; DOMAIN-003 separately round-trips the schema migration. Both are functional assertions. Migration round-trip cases now carry an explicit **60-second hang guard** with a reason comment; the normal suite's default remains unchanged. The five explicit behavioural timing assertions remain unchanged (200-table introspection, Postgres cancellation, HTTP cancellation and two stalled endpoint cases).

The subsequent close-out instruction includes a **30-second normal-suite default hang guard**. It is now explicit in `vitest.config.ts`; migration round trips retain their 60-second guards. This changes no explicit behavioural timing assertion or performance budget.

### Declaration panel 1440: one pass-on-retry observation (5.37 close-out)

In the credential migration slice's `check:ui` run, Declaration panel at 1440 failed its first visual capture and passed on retry. The first attempt reported an expected 1440×1609 image and a 1440×1016 capture, with intermediate capture heights of 1616 and 1609. This is one flaky observation; the cause was not investigated. No assertion, tolerance, timeout or Declaration-panel baseline was changed. All 241 functional checks passed; the three separate Pools-list differences were the approved per-agent-credential subtitle change.


### Custody sealing boundary differs from the stated Engine architecture (5.37 step 2b audit)

Recorded separately from 2b; neither resolution is chosen. The reader identifies an architecture promise that all treatments, including sealing, happen in the Engine at the read boundary so custody plaintext never enters the Application. The implementation does not meet that boundary:

| Treatment | Actual location and code |
|---|---|
| Tokenization | Engine source reader prepares tokenizers at `sidecar/execution/infrastructure/postgres-source.ts:126–134` and applies them to raw values at lines 113–116 before consuming treated rows |
| Masking | Engine source reader selects `maskValue` at `sidecar/execution/infrastructure/postgres-source.ts:124` and applies it at lines 113–116 before staging |
| Aggregate-only | Engine SQL inspection rejects direct row access at `sidecar/sql/application/treatments.ts:45–54`; `sidecar/sql/application/execute.ts:58–77` establishes the cardinality check and lines 98–103 execute and enforce observed group counts before release. Aggregation is performed over staged scoped rows, not as a scalar source-reader transform |
| Sealing | **Application**, after execution. Engine returns result rows plus `custodyIndices` at `sidecar/sql/application/execute.ts:107`; the Application HTTPS client buffers and parses them at `src/modules/mcp/infrastructure/execution-client.ts:30–34`. `src/modules/mcp/application/query.ts:64–65` then invokes sealing and replaces the result rows. `src/modules/release-custody/infrastructure/query-release.ts:20–25` seals, escrows K1 and issues the grant; AES-GCM is implemented in the shared `src/shared/infrastructure/sealed-cell.ts:9–14` helper |

**Custody plaintext therefore transits the Application**, inside the TLS-protected Engine response and then decoded Application memory, before sealing. TLS protects transport; it does not make the payload sealed to the Application. This finding does not assert that plaintext is persisted. Withheld and undecided columns are omitted during read-plan compilation (`src/modules/entitlements/application/compile.ts:146–150`), apart from the separately authorised filter-only inputs consumed within the Engine.

Two possible resolutions, requiring a separate decision:

1. Move sealing into the Engine beside tokenization, matching the documented architecture boundary.
2. Amend the architecture document and partner brief to state that custody plaintext reaches the Application and is sealed there, describing that trust boundary accurately.

Do not resolve this inside 2b. The superseding preview decision uses a temporary key generated and destroyed in the Engine, with no shares or grant. It does not change the ordinary query path audited here. The repository's `docs/review/xq-integration-brief.md` describes K1/K2 provider operations but does not specify the sealing boundary; an architecture/partner artifact outside these checked-in passages must also be reconciled by the chosen follow-up, rather than assuming the current brief establishes the stronger promise.

### Declaration editors reset on refreshed values (5.37 step 2b close-out)

The 1440 capture again moved from open editors (1661/1652px) to all editors closed (1016px), matching Sunday's credential-slice pass-on-retry observation above. Treat this as a product-state defect, not a snapshot tolerance issue. Ten unforced instrumented captures did not reproduce it: no post-open refetch, remount or reset occurred. A controlled background refetch with changed stored declarations did reproduce the defect: all five open states were true; the declarations GET completed; the data-derived React key changed; the form unmounted and mounted with an empty open-state map; all five editors became closed. This establishes the reset mechanism, but the earlier captures have no network/component trace proving what initiated their reset. Scope tags and the 9px height change are not established triggers.

The component now uses project/element identity, with one form store for that identity. A refresh updates pristine fields and the discard baseline while retaining dirty fields and disclosure state; a successful save accepts the returned values without closing editors. DECL-010 exercises a real focus-triggered query refetch at 390/900/1440, checking all five open editors, a retained draft, a refreshed pristine field and discard against the new baseline. The existing four declaration functional scenarios and all three new refetch scenarios passed. Temporary diagnostic logging is not production code.

### Pools 900: post-capture accessibility deadline during 2b baseline recapture

The focused three-width revoke-baseline verification completed all three strict zero-diff revoke screenshot comparisons. The 900 scenario then timed out at **30.3 seconds** in `accessible()` / `page.evaluate(axe.run())` at `e2e/pools.spec.ts:12`, on the subsequent shown-once-key dialog. The 390 and 1440 scenarios finished in 20.2s and 14.0s. The full gate's functional checks had passed; its Pools visual scenarios stopped earlier at the now-approved revoke-background mismatch. This is one observed deadline, not an established cause or a passing retry. No rerun, threshold, assertion or timeout change was made. The screenshot-reproduction requirement was satisfied before the timeout; the whole focused invocation was not green.
