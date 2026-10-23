# Gate tiers
Version: 1.1 — 2026-10-16

`npm run check` is the sequential completed-tip gate. It stops at a failed tier, records each duration and total wall time in `test-results/gate.json`, and never retries. The ten-minute objective is not permission to reduce domain/integration coverage. The previous normal suite alone took 1,211.51 seconds, so that is the expected dominant cost until measured otherwise.

| Tier | Defect class | Existing concrete counterexample / caught defect |
|---|---|---|
| Dependency preflight (before tiers) | Expensive validation reaching a stopped development dependency late | The first image-build gate stopped at normal bootstrap because test PostgreSQL was offline; the next passed 1,986 normal tests but stopped at smoke setup because Redis was offline. Preflight starts only stopped dev Compose PostgreSQL/Redis services, then authenticates with SELECT 1/PING. Inspection is bounded to 5 seconds, startup to 5 seconds and parallel probes to 5 seconds; failures name the dependency before any tier. Regression controls cover stopped-service startup, one/both unavailable dependencies and killing a hung command. Stage 1 deployment documentation validation exposed a cold Compose inspection exceeding the former 2-second limit (zero tiers ran); a controlled 2.2-second inspection now passes within the 5-second bound, while inspection failure still names both services and never reaches tiers. |
| Strict typecheck | Invalid typed contracts | The three recorded dashboard-fixture missing-custody errors in the conformance project; normal strict typecheck catches the equivalent production contract mismatch. The production and conformance projects are checked separately. |
| Conformance typecheck (`typecheck:conformance`) | Invalid TypeScript contracts in conformance checks and their imported fixtures, outside the production tsc project | Three TS2741 assignments in `e2e/dashboard-fixture.ts` omitted the required output custody count. The fixture now explicitly records zero; this tier prevents the omission being invisible to a green gate. |
| Lint and boundaries | Forbidden dependency direction and unsafe implementation patterns | `test/module-boundary.test.mjs` catches domain→infrastructure and cross-module non-index imports with the real ESLint rule. During this change lint also rejected twelve undeclared Node globals in the new scripts; explicit imports fixed them. |
| Production artifact exclusion | Shipping review-only routes | The positive counterexample is an artifact containing either literal `/dev/kitchen-sink` or `/dev/shared-patterns`; the checker rejects it. Normal production must omit both. |
| 54-route conformance | Unclassified controls, broken disclosure semantics, navigation and identity-mark placement; missing route visits | Existing checker counterexamples reject five broken controls and a disclosure whose target visibility contradicts `aria-expanded`; the full-route reporter rejects missing visits. |
| Domain/integration | Incorrect composition, treatments, custody, refusal, evidence or isolation | CSV and NDJSON release-event omission (97a42b8 through b1da401), covered by the dedicated export regression replayed in this branch. All existing tests and Vitest configuration are unchanged. |
| One smoke path | Wiring failures between row-decision UI/API, real authenticated MCP/Engine query and persisted receipt rendering | The earlier ROW-003 regression asserts a saved decision governs returned rows and is recorded in evidence; this smoke extends that exact check through UI save and receipt rendering. During assembly it caught an invalid PostgreSQL-text timestamp in the receipt URL: the router refused it before rendering. The fixture now uses the persisted receipt’s canonical ISO timestamp. |

The conformance sweep asserts master control classification and disclosure contracts, mark placement and breadcrumb navigation, plus route coverage. **It does not assert AuthGuard coverage.** The two review routes pass because their controls conform; bypassing AuthGuard is outside this checker. The production artifact check, not conformance, prevents those routes shipping.

The normal `npm run build` uses Vite production mode. The harness uses `browser-test` for the review screens, and writes its output to `tmp/browser-build`, separate from deployment `dist`. The release command runs the artifact check against `dist`. Directly invoking Vite with arbitrary flags is not a protected deployment operation.

204 PNGs are preserved byte-for-byte under `archive/browser-baselines/2026-10-16`. There are no screenshot comparisons, tolerances, refresh commands or active snapshot projects. The old baseline investigation is cancelled. The central renderer policy remains; no test may override it.

The smoke uses fixture mail/session responses and pool header data. Row decisions go through the actual HTTP routes and SpiceDB permissions; a real pool credential authenticates the MCP client; the real Engine queries a synthetic Postgres source; the receipt is read back from Postgres and rendered. It is not a live mail-provider or XQ test. Existing identity, custody and provider-failure integration tests remain unchanged.

`make build` also runs an image-layer secret audit, outside the completed-tip gate.
Its defect class is credentials accidentally packaged in a final image, including
files deleted by a later layer. Its executable positive controls reject a nested
`.env`, `.xq` material, a key file, PEM private-key content under an innocent name,
and synthetic live-key/XQ credential values. The negative control permits ordinary
key-handling source code. The normal test suite runs these controls too; the build
audits every exported platform image and fails if layer coverage is incomplete.

## Change ledger
| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1.0 | 2026-10-16 | Retire pixel/scenario tiers; retain conformance and governance tests; add connected smoke. | No custody or query behavior changes. Review routes remain development/browser-test only and are excluded from normal production artifacts. |
| 1.1 | 2026-10-16 | Add conformance typecheck immediately after production typecheck as a separately timed, fail-fast gate tier. | No product behavior change; the gate now covers the conformance TypeScript project. |
