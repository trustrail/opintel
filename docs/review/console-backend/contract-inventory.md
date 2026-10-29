# Branch contract inventory

Baseline: `037c682b8a078d687c4790936153a7d08e408d32`. Each file below is
run separately through the normal test launcher, sequentially against an
isolated migrated test database. This covers explicit table/grant/policy and
column inventories; migration-chain and packaged migration lists; bundled
artifacts, runtime allowlists, packaging commands; route schemas and plaintext
exceptions; audit payloads; and permission matrices affected by this branch.

- `test/table-grants.test.ts`
- `test/row-level-security.test.ts`
- `test/pool-schema.test.ts`
- `test/catalog-schema.test.ts`
- `test/pool-migration.test.ts`
- `test/pool-binding-migration.test.ts`
- `test/pool-key-migration.test.ts`
- `test/pool-credential-migration.test.ts`
- `test/gate-database.test.mjs`
- `test/migrate.test.ts`
- `test/packaged-migrations.test.mjs`
- `test/development-migrations.test.ts`
- `test/provisioning-runtime.test.mjs`
- `test/image-build.test.ts`
- `test/image-build-plan.test.mjs`
- `test/image-console.test.mjs`
- `test/deployment-packages.test.mjs`
- `test/customer-install.test.mjs`
- `test/customer-command.test.mjs`
- `test/engine-sources-command.test.mjs`
- `test/first-hour-contract.test.mjs`
- `test/packaged-soak-workflow.test.ts`
- `test/pool-key-route-schemas.test.ts`
- `test/http-server.test.ts`
- `test/permission-explanation.test.ts`
- `test/authz-spicedb.test.ts`
- `test/needs-you.test.ts`
- `test/pool-tables.test.ts`
- `test/pool-budgets.test.ts`
- `test/pool-keys.test.ts`
- `test/pool-credentials.test.ts`
- `test/settings-contract.test.tsx`
- `test/mcp-session-sweep-migration.test.ts`
- `test/evidence-migration.test.ts`
- `test/release-custody-migration.test.ts`
- `test/token-join-candidate-migration.test.ts`
- `test/row-entitlement-migration.test.ts`
- `test/policy-version-migration.test.ts`
- `test/evidence-lifecycle-migration.test.ts`
- `test/contributor-key-migration.test.ts`

Additional candidate regression: `test/pool-table-policies-migration.test.ts`
checks the new forward migration up/down/up with identical grants, predicates,
role scope, forced RLS and primary key. PT-010 in `test/pool-tables.test.ts`
checks a shared object in two pools, duplicate refusal inside one pool, and all
unique constraints/indexes.

The closest grant contract is `pool_source_binding` (migration 027). Migration
086 already grants exactly SELECT/INSERT/UPDATE/DELETE to opintel_app, none to
opintel_platform, and SELECT/INSERT/UPDATE/DELETE/TRUNCATE to
opintel_platform_admin. No grant changes are needed or introduced.

Migration 086 remains byte-for-byte unchanged. Migration 087 splits its
app-role-only tenant_access policy into the existing named tenant_read and
tenant_write contract with the same predicates. No exclusion, policy assertion
or privilege assertion is weakened.

## Results before the full gate

All 40 baseline files ran separately on the exact 037c682 snapshot. Two code
failures were found: table-grants omitted pool_table_binding, and RLS-10 found
only tenant_access instead of tenant_read/tenant_write. The credential file's
first run lacked the signed scanner at tmp/duckdb-extensions in the snapshot;
providing the existing scanner made all four tests pass without a source or
environment-variable change. The other 37 baseline files passed initially.

The repaired grant/RLS contracts, PT-010, new migration round-trip, fresh-ledger
bootstrap, and all affected migration-chain files then ran individually on the
candidate: 14 files passed. The new migration regression initially treated
PostgreSQL name[] as a decoded JS array; explicitly casting the catalogue roles
to text[] corrected the test query, and its rerun passed. Both initial failures
and corrected runs are retained in [the execution record](contract-results.json).

| File | Baseline final | Candidate after repairs |
|---|---|---|
| `test/table-grants.test.ts` | Fail: repaired | Pass |
| `test/row-level-security.test.ts` | Fail: repaired | Pass |
| `test/pool-schema.test.ts` | Pass | Unchanged; baseline passed |
| `test/catalog-schema.test.ts` | Pass | Unchanged; baseline passed |
| `test/pool-migration.test.ts` | Pass | Unchanged; baseline passed |
| `test/pool-binding-migration.test.ts` | Pass | Unchanged; baseline passed |
| `test/pool-key-migration.test.ts` | Pass | Unchanged; baseline passed |
| `test/pool-credential-migration.test.ts` | Pass | Pass |
| `test/gate-database.test.mjs` | Pass | Pass |
| `test/migrate.test.ts` | Pass | Unchanged; baseline passed |
| `test/packaged-migrations.test.mjs` | Pass | Unchanged; baseline passed |
| `test/development-migrations.test.ts` | Pass | Unchanged; baseline passed |
| `test/provisioning-runtime.test.mjs` | Pass | Unchanged; baseline passed |
| `test/image-build.test.ts` | Pass | Unchanged; baseline passed |
| `test/image-build-plan.test.mjs` | Pass | Unchanged; baseline passed |
| `test/image-console.test.mjs` | Pass | Unchanged; baseline passed |
| `test/deployment-packages.test.mjs` | Pass | Unchanged; baseline passed |
| `test/customer-install.test.mjs` | Pass | Unchanged; baseline passed |
| `test/customer-command.test.mjs` | Pass | Unchanged; baseline passed |
| `test/engine-sources-command.test.mjs` | Pass | Unchanged; baseline passed |
| `test/first-hour-contract.test.mjs` | Pass | Unchanged; baseline passed |
| `test/packaged-soak-workflow.test.ts` | Pass | Unchanged; baseline passed |
| `test/pool-key-route-schemas.test.ts` | Pass | Unchanged; baseline passed |
| `test/http-server.test.ts` | Pass | Unchanged; baseline passed |
| `test/permission-explanation.test.ts` | Pass | Unchanged; baseline passed |
| `test/authz-spicedb.test.ts` | Pass | Unchanged; baseline passed |
| `test/needs-you.test.ts` | Pass | Unchanged; baseline passed |
| `test/pool-tables.test.ts` | Pass | Pass |
| `test/pool-budgets.test.ts` | Pass | Unchanged; baseline passed |
| `test/pool-keys.test.ts` | Pass | Unchanged; baseline passed |
| `test/pool-credentials.test.ts` | Pass | Unchanged; baseline passed |
| `test/settings-contract.test.tsx` | Pass | Unchanged; baseline passed |
| `test/mcp-session-sweep-migration.test.ts` | Pass | Pass |
| `test/evidence-migration.test.ts` | Pass | Pass |
| `test/release-custody-migration.test.ts` | Pass | Pass |
| `test/token-join-candidate-migration.test.ts` | Pass | Pass |
| `test/row-entitlement-migration.test.ts` | Pass | Pass |
| `test/policy-version-migration.test.ts` | Pass | Pass |
| `test/evidence-lifecycle-migration.test.ts` | Pass | Pass |
| `test/contributor-key-migration.test.ts` | Pass | Pass |
| `test/pool-table-policies-migration.test.ts` | New regression | Pass |
