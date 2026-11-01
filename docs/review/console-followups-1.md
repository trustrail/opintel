# Console follow-ups 1 — stopped at targeted validation

Branch: `feat/console-followups-1`, based on main `ac91c4c51ab6d9a63aeb3f000bcb0ae68f565de8`.
Worktree: `/private/tmp/opintel-console-followups-1`. The VERIFY-01 checkout and
its local documentation were left untouched. This is a work in progress,
**not a completed or gate-green candidate**. No merge.

## Changes prepared

1. **Logo:** BrandMark renders the three existing PNGs with srcset. Their bytes
   are unchanged. Decorative uses have empty alt; the nondecorative default is
   `Opintel`. Source inspection confirms `scripts/build-consoles.mjs` copies
   public assets into dist and the console runtime policy already lists all three
   `work/dist` paths. **Packaged image serving and screenshots are not verified.**
2. **Saved-source schemas (revised decision):** pre-save `/sources/test` remains
   unchanged and makes no connection. Creating a source with empty schemas queues
   no introspection. After applied egress policy, its list status is
   `choose_schemas` (shown as “choose schemas”). The new pinned-mTLS `/schemas`
   engine operation reads namespace names with schema USAGE, excluding system and
   temporary namespaces. Public GET/PUT `/api/v1/sources/:id/schemas` require the
   existing `bind_source` permission, like introspection. They take no host/port.
   PUT validates the selection against available schemas and enqueues exactly it.
   One shared Checkbox picker is used in the saved-source dialog and source panel,
   including later changes. Migration **092_source_schema_listing** adds one
   nullable diagnostic column; selection remains in existing scan records.
3. **Compound rules:** PoolRowRule retains All rows and the scalar condition;
   adds one unnested AND/OR group of 2–16 conditions. The existing typed predicate
   parser validates each condition; table edits refuse unknown/incompatible
   columns by name. Compound creation also rejects invalid columns. Legacy shared
   single-condition creation still leaves unmatched tables with no rows, as before.
   The shared editor adds/removes conditions and exposes one AND/OR control.
   Table lists can display stored expression text, and history/receipt UI retains
   its existing immutable-decision lookup rather than modifying any receipt.
4. **Per-table creation:** the shared rule remains the default; per-table mode
   uses that same editor for each table. Existing create/add-table endpoints save
   one rule per table. Partial failures retain the created pool and pending work;
   retry does not create a second pool or expose the initial key prematurely.
5. **Column labels:** shared-name groups precede partial-name groups; options
   include type and selected table names (or coverage counts). Shared Radix Select
   now preserves optgroup labels using existing control patterns.
6. **Custody:** Signing key has the exact requested explanation in its row,
   without changing its status, value or actions. No CSS file or class was added.
   Visual fit remains unverified.

The existing standard browser scripts were updated for the revised schema flow
and PNG brand mark; no alternate sign-in/HTTP/TLS harness was created. These
script changes are committed with this report, **not claimed as executed**.

## Recorded commands and evidence

- Standard OpenAPI generator: `npm run sidecar:openapi` — completed; generated
  `sidecar/openapi.json` includes `/schemas`. The first sandboxed attempt was
  blocked on tsx IPC; the same command ran with the required execution permission.
- Standard test migration CLI: `npm run migrate:up`, with
  `MIGRATION_DATABASE_URL` scoped to the configured test URL — applied **092**.
  Development data and the env file were not changed.
- `npm run console:test` — **136 passed, 13 files**, exit **0**, 42.76 seconds.
  Raw local log: `/private/tmp/console-followups-console-tests.log`. Socket-reset
  and AbortError teardown messages were emitted; a passing DOM suite is not used
  as evidence of actual asset serving or visual layout.
- `npm test -- FILES` — **185 passed, 10 failed; 45 files passed, 6 failed**,
  exit **1**, 268.18 seconds. Exact 51-file selection is committed in
  [targeted-files.txt](console-followups-1/targeted-files.txt). It includes every
  filename containing migration and every test calling the migration fixture or
  up/down runner, plus source/engine/pool/receipt/grant/packaging contracts.
  Raw local log: `/private/tmp/console-followups-backend-targeted.log`.

The new migration up/down test, table grants, DEP-008, compound table input/storage
contract tests PT-011/PT-012 and saved-source lifecycle test F-010 passed. F-010
covers no scan/contact before policy, filtered metadata, exact scan selections,
subsequent selection changes, empty-selection refusal and non-admin refusal.
**Not every migration test passed:** ROW-007 failed at its prerequisite query.

## Failures — evidence

| Location | Exact failure |
|---|---|
| `test/engine-egress.test.ts:57` | Expected one queued source ID; received `[]`. This case saves `includeSchemas: []`. |
| `test/pool-row-access.test.ts:45` | QueryOutput expected an object; received undefined structuredContent. |
| `test/row-entitlement-migration.test.ts:19` | Expected the prerequisite query's isError not to be true; received true, before migration assertions. |
| `test/row-entitlements-console.test.ts:14` | Catalogue-tags query: expected object, received undefined. |
| `test/row-entitlements-console.test.ts:20` | Composition query: expected object, received undefined. |
| `test/row-entitlements-console.test.ts:35` | Missing-pool query: expected object, received undefined. |
| `test/row-entitlements-console.test.ts:61` | New compound read-plan/receipt test: first query returned no structuredContent; no AND/OR row-count or receipt success is claimed. |
| `test/sidecar-http.test.ts:222` | Explicit OpenAPI route list lacks new `/schemas`; actual list contains it. |
| `test/sidecar-http.test.ts:244` | Expected `Opintel Engine ready.`; received `Opintel Engine startup failed: query engine readiness: Error: The configured signed PostgreSQL scanner could not be loaded.` |
| `test/source-registration.test.ts:98` | New listing-error test expected HTTP 503, received 500. Subsequent persistence assertions were not reached. |

The worktree has no `tmp/duckdb-extensions/postgres_scanner.duckdb_extension`.
No scanner preparation, test edit, code fix or rerun was made after the failure.

## Interpretation — separate from evidence

The empty-schema queue expectation conflicts with the newly approved no-scan
behavior and needs updating deliberately. The sidecar explicit route contract
needs the new operation added while keeping its exact-list assertion. The
missing scanner is consistent with the explicit startup failure. It is plausible
that the other read-path failures share that prerequisite, but their individual
root causes have **not** been established by isolated diagnostic runs. The new
500/503 mismatch also remains unresolved; its test did not retain the response
body, so this report does not claim that diagnostic persistence was verified.

## Stop state

Per the standing stop rule, validation stopped after this one targeted invocation.
Final strict typecheck, lint, packaged build/acceptance, screenshots and the full
gate were **not run**. No styling was added to hide a visual problem and no
substitute standard step was written. The current scripts, code, tests and this
red result are preserved together in a WIP commit and pushed immediately, as
required. No native release command is presented as validated; this phase is
unfinished.
