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

- Tests share one database and do not all truncate. A test asserting on a
  count that includes other tests' rows passes or fails depending on file
  order. The mail-outbox concurrency case hit this: dispatchPending claims a
  batch of up to 100, so it swept a leftover row. Consider a transaction per
  test with rollback, or truncation in a shared beforeEach, before many more
  integration tests exist.

# Working practice

- A long Codex session degrades: it completes single-file instructions but
  abandons multi-file ones, reporting nothing substantive as blocking. A
  fresh session completed the same task in one turn. Restart the session
  every few items rather than running one indefinitely.
- The module boundary rule had never been exercised: relationship-outbox.ts
  is the first genuine cross-module import. Its fixtures used extensionless
  paths the codebase never writes. Fixture tests must match real usage.

# From item 2.6b

- No vocabulary_term rows exist. Migration 003 seeds the reinsurance
  industry but no terms, so inheritedTermCount is always 0 and the
  "nothing is copied at creation" property is unfalsifiable. Seeding the
  reinsurance pack is a content exercise; item 2.1 created the schema only.
