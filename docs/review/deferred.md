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
