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

- sso_enforced requires exactly one enabled company_idp. There is no company
  settings route in Slice 1, so nothing enforces this at write time. Item
  5.16 owns it. Until then /auth/providers handles the ambiguity defensively.

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
