# Production browser harness review

Version: 1.0 — 2026-10-15

Status: implemented as an **uncommitted harness candidate**, after custody commits `dafe698` and `4660868`. No baseline regeneration and no custody-gate rerun. Adoption and any baseline commits remain separate. This experiment isolates committed custody code from unrelated uncommitted `/next` work.

## Change and cost

`playwright.config.ts` builds once before starting Vite preview. Compilation and server startup are outside scenario deadlines. The startup-only allowance is 120 seconds; scenario deadlines, screenshot tolerances, retries, settled-paint readiness and conformance assertions are unchanged. `reuseExistingServer: false` prevents accidentally measuring an unrelated development server. The root working tree retains its pre-existing `/next` flag; the isolated candidate does not include `/next`.

The first ordinary production build took **20.42s inside Vite / 46.26s wall time**. It exposed a real harness coverage gap: `/dev/kitchen-sink` and `/dev/shared-patterns` were compiled out by `import.meta.env.DEV`. Nine functional and six visual scenarios depend on those review routes. They must not be skipped or exposed in ordinary release builds.

The corrected build uses explicit `browser-test` mode, with the same production optimization and `NODE_ENV=production`, to include just those existing review routes. Their declaration and shell exemption use the same `componentReviewEnabled` condition. Ordinary production mode still excludes them. The corrected build took **15.12s inside Vite / 19.10s wall time**. Both builds produced the identical stylesheet asset `index-C1Derg32.css` (122.59 kB). This is a second experimental build after a discovered harness defect, not another custody gate or a baseline update.

## Validation and scope

The first full browser experiment against ordinary production completed **362 passed / 18 failed / 0 flaky / 0 skipped**, 1552.549s suite time / 1568.75s command time. Control conformance visited 52/54 routes, zero findings on visited routes. The unvisited routes are exactly the two review pages.

Failures: nine functional plus six visual review-route scenarios, caused by those routes being absent; and the three custody Activity scenarios whose existing baselines carry the old wording. Product functional routes passed. This is not a green full-suite result.

After the explicit test-mode correction, **29/29 affected checks passed**, including all fifteen review-route scenarios plus fourteen focused comparison scenarios (139.74s command time). Partial conformance visited 10/54 routes with zero findings. This focused correction does not turn the earlier full-run result into a green full run. Typecheck passed; lint result is recorded below when complete.

The audit-only instrumentation retained actual PNGs and DOM text after stabilized screenshot comparisons. Screenshot mismatches remained failures but were soft assertions in this diagnostic run so later states could also be captured. These instrumentation changes are confined to the scratch checkout and are excluded from adoption. They are not changes to the gate matcher.

## All 204 images, without regeneration

The initial full production pass yielded 201 unique comparisons: 178 exact matches, 23 differences, and three uncaptured shared-patterns images. The three kitchen-sink comparisons depicted the absent route and were invalid substitutes for the review page.

Complete accounting uses the first production capture for each of the 198 product states, plus the six corrected optimized test-mode review-page captures. **182 images are pixel-identical; 22 differ; none are missing.** This is a combined experiment record, not a claim that all 204 were captured in one invocation. All original baseline hashes are unchanged.

Interactive index: `tmp/review/production-harness-audit.html`. Machine-readable per-image record: `tmp/custody-candidate/tmp/complete-204-audit.json`. Every nonzero comparison has a diff image and bounding box.

| Image | Differing RGBA pixels | Classification |
|---|---:|---|
| access-1440.png | 46 | Raster-edge variance; no baseline update |
| access-900.png | 46 | Raster-edge variance; no baseline update |
| chooser-1440.png | 30 | Raster-edge variance; no baseline update |
| chooser-900.png | 30 | Raster-edge variance; no baseline update |
| create-company-1440.png | 30 | Raster-edge variance; no baseline update |
| create-company-390.png | 37 | Raster-edge variance; no baseline update |
| create-company-900.png | 30 | Raster-edge variance; no baseline update |
| create-project-1440.png | 30 | Raster-edge variance; no baseline update |
| create-project-390.png | 37 | Raster-edge variance; no baseline update |
| create-project-900.png | 30 | Raster-edge variance; no baseline update |
| custody-activity-present-1440.png | 234722 | Custody wording |
| custody-activity-present-390.png | 100189 | Custody wording |
| custody-activity-present-900.png | 148969 | Custody wording |
| custody-receipt-granted-1440.png | 1770 | Custody wording |
| custody-receipt-granted-390.png | 1998 | Custody wording |
| custody-receipt-granted-900.png | 1790 | Custody wording |
| personal-900.png | 729 | Raster-edge variance; no baseline update |
| shared-patterns-1440.png | 1246 | Raster-edge variance; no baseline update |
| shared-patterns-900.png | 1246 | Raster-edge variance; no baseline update |
| sources-empty-390.png | 6104 | Raster-edge variance; no baseline update |
| sources-wizard-390.png | 26940 | Raster-edge variance; no baseline update |
| type-observation-390.png | 4507 | Raster-edge variance; no baseline update |

### Cause: custody wording (six images)

The three Activity summaries add the approved release wording and non-claim. Their wrapping adds 60/40/20 pixels at 390/900/1440 and moves the Requests section below. The three granted-receipt states replace the old redemption terminology with precise Opintel-share wording. These are custody content changes, not production-harness rendering changes. Any baseline commit must name custody relabelling, independently of the export defect or harness adoption.

### Finding: existing raster differences and variability (sixteen images)

The remaining differences are in SVG/corner edges or text glyph rasters: Access/tenancy drawer marks and rounded controls, Personal settings breadcrumbs, Sources mono notes/wizard labels, the narrow type-observation card and shared-patterns mono values. Dimensions match. Inspected diff images do not show changed text or a shifted component block. The fourteen product-image DOM texts match the recorded dev gate exactly; the two shared-patterns images are reviewed separately below.

A focused dev-server control passed 14/14 scenarios (139.70s command time), retaining 16 images. Direct dev-versus-production comparison gave nine exact matches and seven small differences. In particular, both Access images, both narrow Sources images, the narrow type-observation image, both narrow creation forms and create-company-1440 were exactly equal across dev and production while differing from the old baseline. Production compilation cannot explain those baseline differences.

Personal-900 and several 30-pixel tenancy drawer differences vary between captures; a later optimized test-mode run made Personal-900 and create-project-390 match their baselines while chooser-390 acquired a 37-pixel difference. This is observed raster variability, not a deterministic production-only redesign. It has the glyph/edge signature previously recorded in `row-entitlements-console-position.md`, but this experiment does not establish a particular Chromium cache implementation or prove a new capture fix. Shared-patterns-900/1440 each differ by 1246 pixels in mono labels/values, with the same dimensions; further dev comparison is pending.

**No tolerance change and no baseline regeneration are proposed as a cure for variable captures.** These differences need a reproducible capture cause before a zero-diff baseline commit can be made. There is currently no demonstrated production-only visual change requiring a harness baseline commit.

## 390 remeasurement and context check

Full production-run measurements (same desktop Chromium 153.0.8010.12, fresh contexts, no mobile emulation, zero touch points, no storage-state override):

| Width | First navigation to load | HTML responseEnd | Scenario total | Redirects |
|---:|---:|---:|---:|---:|
| 390 | 216.9ms | 12.2ms | 1.918s | 0 |
| 900 | 221.8ms | 9.1ms | 1.957s | 0 |
| 1440 | 238.1ms | 10.5ms | 2.020s | 0 |

These full-run observations were collected while the user-started host dev stack was active; they are not isolated measurements. The subsequent authorized isolated runs and full shutdown inventory follow.

### Follow-up: isolated production timing and required listener precondition

A timing or baseline run requires **no other listener on the dev ports**, verified immediately before the invocation and recorded in its report, alongside the settled-paint precondition. A run that cannot assert this is **not a measurement**. For these isolated runs the stronger check was used: no host Node listener on any port, and no Node process in the test container before each invocation. Ports 3000, 3100, 3101, 5173 and the test server's 4173 were clear. The test runner then started its own production preview server and cleaned it up after its single scenario. No assertion, scenario timeout, screenshot tolerance or retry count changed. No gate was rerun.

On 2026-10-15, with the user's explicit authorization, the following stack was recorded before SIGTERM. Launchers have no listening port. Commands below are the recorded full commands; nothing was restarted afterward.

| PID | Port(s) | Command |
|---:|---|---|
| 14775 | — (launcher) | `npm run dev:sidecar` |
| 14796 | — (launcher) | `node /Users/rzarita/opintel/node_modules/.bin/tsx sidecar/start.ts` |
| 14797 | 3100 | `/Users/rzarita/.nvm/versions/node/v20.19.3/bin/node --require /Users/rzarita/opintel/node_modules/tsx/dist/preflight.cjs --import file:///Users/rzarita/opintel/node_modules/tsx/dist/loader.mjs sidecar/start.ts` |
| 14709 | — (launcher) | `npm run dev` |
| 14724 | 5173 | `node /Users/rzarita/opintel/node_modules/.bin/vite` |
| 14841 | — (launcher) | `npm run dev:api` |
| 14855 | — (launcher) | `node /Users/rzarita/opintel/node_modules/.bin/tsx --watch src/platform/http/start.ts` |
| 14856 | — (launcher) | `/Users/rzarita/.nvm/versions/node/v20.19.3/bin/node --require /Users/rzarita/opintel/node_modules/tsx/dist/preflight.cjs --import file:///Users/rzarita/opintel/node_modules/tsx/dist/loader.mjs --watch src/platform/http/start.ts` |
| 14857 | 3000, 3101 | `/Users/rzarita/.nvm/versions/node/v20.19.3/bin/node --require /Users/rzarita/opintel/node_modules/tsx/dist/preflight.cjs --import file:///Users/rzarita/opintel/node_modules/tsx/dist/loader.mjs src/platform/http/start.ts` |

Reverse-order isolated runs used the same already-built optimized browser-test bundle, pinned Chromium 153.0.8010.12, desktop contexts and settled-paint preparation. All had zero redirects, zero touch points, no storage-state override and retry index zero. Each scenario is `5.36 custody receipt, revocation and accessibility at <width>` in `e2e/release-custody.spec.ts`.

| Order / width | First navigation to load | HTML responseEnd | Scenario duration | Whole invocation | Result |
|---|---:|---:|---:|---:|---|
| 1 / 1440 | 879.3ms | 70.8ms | 7.795s | 24.45s | Passed |
| 2 / 900 | 334.9ms | 20.2ms | 3.862s | 12.32s | Passed |
| 3 / 390 | 476.9ms | 39.2ms | 3.707s | 13.79s | Passed |

First-navigation timing is the browser PerformanceNavigationTiming duration through load; scenario duration is Playwright's test result, and whole invocation includes server/runner startup and teardown. Listener checks were saved immediately before invocation at 21:04:32, 21:06:28 and 21:07:49 EDT respectively. All three recorded empty Node-listener lists. Final verification also found no Node listeners; the user's stack remains stopped.

The earlier ~2.3× narrow-width penalty and 3.444s HTML response do not persist: 390 is 0.96× the 900 scenario duration and is the fastest scenario, while the first run (1440) is slowest. This supports a development compilation/serving or run-order cost rather than an established narrow custody rendering defect. The first-navigation durations are not strictly monotonic (390 exceeds 900), so this does not prove run order is the only remaining timing variable. No application fix or deadline relaxation is justified by these results. Earlier full-production observations made with the user's stack active are not isolated measurements under this rule.

Artifacts: `tmp/custody-dev-stack-stopped.json`; `tmp/production-isolated-{1440,900,390}-precondition.json`; `tmp/production-isolated-{1440,900,390}.log`; `tmp/production-isolated-summary.json`; per-run JSON and navigation attachments under `tmp/custody-candidate/tmp/production-isolated-<width>.json`. These are follow-up harness measurements, not another gate record.

## Artifacts and next action

- `tmp/custody-production-build.log`, `tmp/custody-production-testmode-build.log` — timed builds.
- `tmp/custody-production-suite.log`, `tmp/custody-candidate/tmp/production-results.json` — full experiment, including first-navigation attachments.
- `tmp/custody-production-testmode-focused.log` — corrected review-route coverage.
- `tmp/custody-production-pixels.log`, `tmp/custody-testmode-pixels.log`, `tmp/custody-dev-vs-production-pixels.log` — exact pixel accounting and controls.
- `tmp/production-harness-typecheck.log`, `tmp/production-harness-lint.log` — candidate checks.

The isolated width measurements are complete and the stack remains stopped. Review the cause groups before any baseline capture, as requested. No harness or baseline commit has been made.

## Change ledger

| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1.0 | 2026-10-15 | Record production-build experiment, review-route coverage correction, all-204 audit and width timing evidence. | No custody mechanism or evidence semantics changed. Proposed harness moves compilation outside scenario deadlines; normal release builds keep review routes excluded. No baseline changed. |
