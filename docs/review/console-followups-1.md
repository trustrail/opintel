# Console follow-ups 1 — validation record

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

## Follow-on correction and unchanged-main comparison

The revised standing rule supersedes the earlier stop interpretation: failures
in targeted development tests are fixed; a full gate, packaged check or blocker
outside the task is a stop. This round implements the three explicitly requested
follow-on corrections, then stops at the requested baseline environmental finding.

### Corrections and focused validation

- The empty-schema destination recovery test now expects **no queued scan**, no
  introspection record, and `choose_schemas` with an empty selection. The separate
  selected-schema policy/queue assertions remain unchanged.
- The sidecar's exact OpenAPI route-list assertion includes `/schemas`; its
  pinned application-certificate requirement is also asserted.
- A source-unavailable error from schema listing becomes the standard HTTP
  dependency failure (**503**), preserving the engine's message and details.
  F-011 asserts status, `dependency_unavailable`, the exact engine reason and
  retryability, then verifies the reason is saved on the source and no scan exists.
  No scanner, read-plan, timeout or startup behavior changed for these corrections.

Final focused command:

```sh
npm test -- test/engine-egress.test.ts test/source-registration.test.ts test/sidecar-http.test.ts -t 'DEP-006|policy|unresolvable destinations|applied heartbeat|reassignment waits|F-011|bounds request bodies'
```

**11 passed, 29 skipped, three files passed**, exit 0, 17.94 seconds. Includes
F-001, F-010 and F-011. Local log:
`/private/tmp/console-followups-corrections-final.log`. An earlier focused
three-case development invocation had two passes and a failure because the test
edit matched the wrong occurrence; that edit was corrected and the untouched
selected-schema assertions restored before the final selection above. This was
a targeted development correction, not a gate or packaged-check retry.

### Baseline evidence — no branch code copied into main

A new detached worktree was created at
`/private/tmp/opintel-followups-baseline-ac91c4c` with exact HEAD
**ac91c4c51ab6d9a63aeb3f000bcb0ae68f565de8**. Before and after the comparison,
`git status --porcelain` produced no output and `git diff --exit-code ac91c4c -- .`
returned 0. Dependencies/configuration were provided as ignored local environment
inputs; no tracked baseline file was changed and no scanner was prepared.

The following standard command ran **once** on that unchanged checkout:

```sh
npm test -- test/pool-row-access.test.ts test/row-entitlement-migration.test.ts test/row-entitlements-console.test.ts test/sidecar-http.test.ts -t 'ROW-SCALE no-default override|ROW-007|ROW-2B catalogue tags|ROW-2B composition, default|ROW-2B existing override|SIGTERM to the real sidecar process'
```

**Six failed, 21 skipped, four files failed**, exit 1, 29.09 seconds. Local log:
`/private/tmp/console-followups-main-scanner-comparison.log:780–868`.

| Existing failing case | Feature branch, previous run | Unchanged main | Main evidence |
|---|---|---|---|
| ROW-SCALE no-default override | Fail | **Fail** | `pool-row-access.test.ts:45`: expected object, received undefined structuredContent |
| ROW-007 seeded forward/revert | Fail | **Fail** | `row-entitlement-migration.test.ts:19`: prerequisite query isError true, before migration assertions |
| ROW-2B catalogue tags | Fail | **Fail** | `row-entitlements-console.test.ts:14`: expected object, received undefined |
| ROW-2B composition/default inheritance | Fail | **Fail** | `row-entitlements-console.test.ts:20`: expected object, received undefined |
| ROW-2B missing pool stays scoped | Fail | **Fail** | `row-entitlements-console.test.ts:35`: expected object, received undefined |
| SIGTERM real sidecar process | Fail | **Fail** | `sidecar-http.test.ts:244`: process never reaches ready; scanner load failure below |

The new compound read-plan/receipt test is **not found on main**. It was not
copied there or presented as an unchanged-main test. Its individual result is
not inferred from the six baseline cases.

The baseline startup test reported exactly:

```
Opintel Engine startup failed: query engine readiness: Error: The configured signed PostgreSQL scanner could not be loaded.
```

Expected extension locations are explicit in the unchanged code:

- `test/fixtures/query/fixture.ts:95` passes
  `resolve('tmp/duckdb-extensions/postgres_scanner.duckdb_extension')` to the query
  engine.
- `test/sidecar-http.test.ts:239` sets the same resolved file as postgresExtension
  for its spawned engine.
- `sidecar/session/infrastructure/duckdb.ts:32–33` loads the configured extension
  when opening the privileged session; `sidecar/readiness.ts:24–27` classifies
  the startup load failure.
- The existing preparation script writes the file at
  `scripts/prepare-duckdb-scanner.ts:23–27`, including a native LOAD verification.

`ls -l` reports **No such file or directory** for both:

```
/private/tmp/opintel-followups-baseline-ac91c4c/tmp/duckdb-extensions/postgres_scanner.duckdb_extension
/private/tmp/opintel-console-followups-1/tmp/duckdb-extensions/postgres_scanner.duckdb_extension
```

### Conclusion and stop

The existing scanner/read-path failures reproduce on unchanged main: this is an
**environmental blocker**, not a failure unique to the feature branch. The signed
PostgreSQL scanner file required by both fixtures is absent. No product change
was made to bypass or compensate for it; the extension was not downloaded,
replaced or prepared in this round.

Per the explicit conditional instruction, work stops here. Final strict
typecheck, lint, full gate, packaged check and screenshots remain **not run**;
no native release command is represented as validated. The three corrected
contracts/status behavior and this comparison are committed together and pushed
immediately. No merge.


## Standard scanner setup and completed-candidate checks (2026-11-01)

The user identified the missing scanner as worktree setup and authorized the
standard setup command. `npm run sidecar:prepare-scanner` completed with exit 0
in the feature worktree, downloading the pinned signed extension and successfully
performing the script's native DuckDB `LOAD` verification. No product workaround
was applied. Log: `/private/tmp/console-followups-prepare-scanner.log`.

The six prior scanner/read-path failures plus the new compound test were rerun:

```sh
npm test -- test/pool-row-access.test.ts test/row-entitlement-migration.test.ts test/row-entitlements-console.test.ts test/sidecar-http.test.ts -t 'ROW-SCALE no-default override|ROW-007|ROW-2B catalogue tags|ROW-2B composition, default|ROW-2B existing override|SIGTERM to the real sidecar process|compound pool rules enforce AND/OR'
```

**7 passed, 21 skipped, 4 files passed**, exit 0, 28.28 s.
Log: `/private/tmp/console-followups-scanner-seven.log`.
This resolves every scanner-related failure in the original 51-file selection,
including ROW-007 and the new compound read-plan/immutable-receipt regression.
Together with the focused correction run above, every original targeted failure
has now passed. This does not claim the entire 51-file selection was run again.

`npm run typecheck` passed (strict, exit 0). Lint's first run found two unused
test bindings; those bindings were removed. The console suite then passed again:
**136 tests, 13 files**, exit 0. Log:
`/private/tmp/console-followups-console-final.log`.

The existing packaged first-run browser script now captures sign-in and rail
logos, the saved-source schema picker, AND and OR rules, and separate table
editors. It checks all three PNG URLs return 200 and the rendered image decodes.
Its real first-agent assertion still requires six returned rows; the compound
rule `id >= 5 AND id <= 10` has the same six permitted fixture rows. Per-table
editor inspection opens a second dialog without saving another pool. These
captures are not claimed as executed until the packaged acceptance result below.
The script passes `node --check`. No ad-hoc acceptance client or CSS was added.

The scanner-worktree setup item was added to `docs/master-backlog.md`.

Final lint: `npm run lint` — exit 0, no dependency violations (578 modules,
1,915 dependencies). Log: `/private/tmp/console-followups-lint-final.log`.
Packaging targets rerun after the acceptance-script extension:
`npm test -- test/provisioning-runtime.test.mjs test/first-hour-contract.test.mjs test/image-console.test.mjs`
— **8 passed, 3 files**, exit 0, 13.44 s. Log:
`/private/tmp/console-followups-packaging-contracts.log`.


## Single completed-candidate gate — stopped in preflight

Candidate: `1efa8ee5afb3a881a6fe54338d5b3afeac26286f` (already pushed).
Command: `npm run check`, once. Exit **1**, wall time **133.36 s**.
Log: `/private/tmp/console-followups-full-gate-1efa8ee.log`.
The structured result is retained in
[gate-1efa8ee.json](console-followups-1/gate-1efa8ee.json).

```text
Gate memory preflight: 2.24 GiB available RAM; minimum 1 GiB.
Docker info: 9.420s elapsed; timeout 30s.
Docker memory: 7.75 GiB; minimum 7 GiB usable.
Gate failed: Image mcr.microsoft.com/playwright:v1.63.0-noble missing and could not be pulled; run docker pull mcr.microsoft.com/playwright:v1.63.0-noble
```

Evidence: the gate result has `tiers: []`, `complete: false`, preflight exit 1,
and cleanup exit 0 with zero containers removed. A process snapshot during the
run showed the standard preflight's `docker pull` for that exact image still
running at 1 minute 52 seconds. The preflight bounds its image pull at 120 s.
No retained command output establishes why the registry pull did not finish;
network failure, registry availability and disk pressure are **not established**.

Per the stop rule, no fix, image-pull retry, full-gate rerun, fresh archive build
or packaged screenshot run followed. The screenshot script is committed, but
there are **no new screenshots and no verified packaged logo result**. This is
not a gate-green candidate. All feature commits and this result are pushed to
`feat/console-followups-1`; no merge.

MacBook Air follow-up, after checking out the final report revision reported in
chat: `scripts/release/native.sh REVISION`. This command has not been run here
and does not represent a passing release verification.


## Authorized gate invocation on 4c15cce (2026-11-01 UTC)

The user confirmed the missing Playwright image had been pulled and authorized
one gate invocation on `4c15cce343e8ef9866ba0b8f37b9f8145ac70ce5`.
Before starting, local `docker image inspect` confirmed
`mcr.microsoft.com/playwright:v1.63.0-noble` was present with image ID
`sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`.

`npm run check` ran once and exited **1**, wall time **12.95 s**:

```text
Gate memory preflight: 1.81 GiB available RAM; minimum 1 GiB.
Docker info: 2.570s elapsed; timeout 30s.
Docker memory: 7.75 GiB; minimum 7 GiB usable.
Gate failed: PostgreSQL did not accept connections within 5 seconds; Redis did not accept connections within 5 seconds
```

Log: `/private/tmp/console-followups-full-gate-4c15cce.log`.
[Structured result](console-followups-1/gate-4c15cce.json).
No test tier ran (`tiers: []`). The underlying cause of the readiness failures
was not established by this run. Per the full-gate stop rule, there was no
retry, fix, packaged acceptance or screenshot run. No merge. This result was
committed and pushed; the feature code is unchanged from the tested candidate.


## Gate with the running development Compose project (2026-11-01 UTC)

Before acting, `docker compose ls --all` reported:

```text
opintel                       running(2)   /Users/rzarita/opintel/docker-compose.yml
opintel-console-followups-1    created(2)   /private/tmp/opintel-console-followups-1/docker-compose.yml
```

`docker ps -a` with project/service labels confirmed:

```text
opintel-postgres-1                     Up 25 hours (healthy)  opintel                     postgres
opintel-redis-1                        Up 25 hours (healthy)  opintel                     redis
opintel-console-followups-1-postgres-1  Created                opintel-console-followups-1  postgres
opintel-console-followups-1-redis-1     Created                opintel-console-followups-1  redis
```

No development service was restarted. As authorized, the gate ran once on
`dbd8188f7c64d9982ab4c5975632b7ea618a819a` using:

```sh
COMPOSE_PROJECT_NAME=opintel npm run check
```

Log: `/private/tmp/console-followups-full-gate-dbd8188-opintel.log`.
[Structured result](console-followups-1/gate-dbd8188-opintel.json).
Preflight passed with `started: []`, PostgreSQL/Redis reachable and fresh isolated
database `opintel_test_gate_9f8099d42100_6523ab50e994`, migrated from zero.
Docker: 7.75 GiB; `docker info` took 4.045 s. The gate still used isolated data.

| Tier | Exit | Seconds |
|---|---:|---:|
| Strict typecheck | 0 | 60.31 |
| Conformance typecheck | 0 | 8.11 |
| Lint | 0 | 25.24 |
| Production artifact | 0 | 6.44 |
| UI/control conformance | 0 | 419.99 |
| Normal tests | 1 | 28.35 |
| Browser/MCP smoke | Not run | — |

Conformance: **36 passed**, **28/28 routes**, **0 distinct findings**.
The normal test tier failed during Vitest startup, before any test ran:

```text
Error: Cannot find native binding. npm has a bug related to optional dependencies ...
cause: Error: Cannot find module '@rolldown/binding-wasm32-wasi'
cause: Error: Cannot find module './rolldown-binding.wasi.cjs'
```

Observed dependency state after failure: the feature worktree's `node_modules`
is now an ordinary directory (owner rzarita:wheel), whereas it was an untracked
symlink before the gate. `ls node_modules/@rolldown` reports only
`binding-linux-x64-gnu`, `binding-linux-x64-musl`, and `pluginutils`. The main
checkout's node_modules remains a separate directory. The conformance log
contains `npm warn reify Removing non-directory /work/node_modules`.
The standard `scripts/visual-docker.mjs` bind-mounts the worktree, mounts an
anonymous `/work/node_modules` volume, and runs `npm ci` before Playwright.
These observations establish an unusable native dependency setup for host
Vitest; the mount/symlink interaction was not repaired or rerun in this round.

Overall gate exit **1**, **569.46 s**. Cleanup succeeded and removed its isolated
database. Per the full-gate stop rule: no fix, no rerun, no packaged image build
or screenshots, no merge. A separate disk-space warning was raised while the
gate ran (the image build requires at least 4 GiB); no cleanup or guard bypass
was performed. The requested Compose-project/start-timeout backlog item was
added. This result and backlog are committed and pushed.
