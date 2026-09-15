mkdir -p docs/review
cat > docs/review/deferred.md <<'EOF'
# Deferred from item 1.4

- withPlatform and withPlatformAdmin share the tenant pool. Distinct roles
  arrive with item 2.4 role setup.
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
