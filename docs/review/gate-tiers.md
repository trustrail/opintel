# Gate tiers
Version: 1.0 — 2026-10-16

`npm run check` is the sequential completed-tip gate. It stops at a failed tier, records each duration and total wall time in `test-results/gate.json`, and never retries. The ten-minute objective is not permission to reduce domain/integration coverage. The previous normal suite alone took 1,211.51 seconds, so that is the expected dominant cost until measured otherwise.

| Tier | Defect class | Existing concrete counterexample / caught defect |
|---|---|---|
| Strict typecheck | Invalid typed contracts | The three recorded dashboard-fixture missing-custody errors in the conformance project; normal strict typecheck catches the equivalent production contract mismatch. Conformance typecheck remains separately available. |
| Lint and boundaries | Forbidden dependency direction and unsafe implementation patterns | `test/module-boundary.test.mjs` catches domain→infrastructure and cross-module non-index imports with the real ESLint rule. During this change lint also rejected twelve undeclared Node globals in the new scripts; explicit imports fixed them. |
| Production artifact exclusion | Shipping review-only routes | The positive counterexample is an artifact containing either literal `/dev/kitchen-sink` or `/dev/shared-patterns`; the checker rejects it. Normal production must omit both. |
| 54-route conformance | Unclassified controls, broken disclosure semantics, navigation and identity-mark placement; missing route visits | Existing checker counterexamples reject five broken controls and a disclosure whose target visibility contradicts `aria-expanded`; the full-route reporter rejects missing visits. |
| Domain/integration | Incorrect composition, treatments, custody, refusal, evidence or isolation | CSV and NDJSON release-event omission (97a42b8 through b1da401), covered by the dedicated export regression replayed in this branch. All existing tests and Vitest configuration are unchanged. |
| One smoke path | Wiring failures between row-decision UI/API, real authenticated MCP/Engine query and persisted receipt rendering | The earlier ROW-003 regression asserts a saved decision governs returned rows and is recorded in evidence; this smoke extends that exact check through UI save and receipt rendering. During assembly it caught an invalid PostgreSQL-text timestamp in the receipt URL: the router refused it before rendering. The fixture now uses the persisted receipt’s canonical ISO timestamp. |

The conformance sweep asserts master control classification and disclosure contracts, mark placement and breadcrumb navigation, plus route coverage. **It does not assert AuthGuard coverage.** The two review routes pass because their controls conform; bypassing AuthGuard is outside this checker. The production artifact check, not conformance, prevents those routes shipping.

The normal `npm run build` uses Vite production mode. The harness uses `browser-test` for the review screens, and writes its output to `tmp/browser-build`, separate from deployment `dist`. The release command runs the artifact check against `dist`. Directly invoking Vite with arbitrary flags is not a protected deployment operation.

204 PNGs are preserved byte-for-byte under `archive/browser-baselines/2026-10-16`. There are no screenshot comparisons, tolerances, refresh commands or active snapshot projects. The old baseline investigation is cancelled. The central renderer policy remains; no test may override it.

The smoke uses fixture mail/session responses and pool header data. Row decisions go through the actual HTTP routes and SpiceDB permissions; a real pool credential authenticates the MCP client; the real Engine queries a synthetic Postgres source; the receipt is read back from Postgres and rendered. It is not a live mail-provider or XQ test. Existing identity, custody and provider-failure integration tests remain unchanged.

## Change ledger
| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1.0 | 2026-10-16 | Retire pixel/scenario tiers; retain conformance and governance tests; add connected smoke. | No custody or query behavior changes. Review routes remain development/browser-test only and are excluded from normal production artifacts. |
