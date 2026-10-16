> Superseded 2026-10-16: pixel testing and broad browser scenarios are cancelled. This file retains the investigation record only. Current gate: [gate-tiers.md](gate-tiers.md).

# Production browser harness review

Version: 1.4 — 2026-10-15

Status: **full-suite reselection stopped before recapture**. Of 204 images, 186 match exactly and 18 differ: seventeen fit the two approved causes, but `override-created-no-default-1440.png` fits neither. No baseline update, launcher/baseline commit, adoption commit, gate or custody replay. The WIP checkpoint remains `e62ea7f`.

## Full-suite reselection — stopped before any baseline update

2026-10-15. One complete browser run with the unified launcher and prebuilt production bundle completed **370 passed, 10 snapshot failures, 0 flaky, 0 skipped**, **54/54 conformance routes and zero findings**, in **1194.135s suite / 1197.42s wall time**. Every failed scenario is an Access/tenancy screenshot comparison already observed with the unified policy; no functional failure occurred. Existing visual retry settings were unchanged; all ten failed scenarios also failed their configured retry. The exact audit uses only the **first attempt** for each image.

The recorded 23:24:02 EDT isolation check found no Node listeners and no Node processes in either validation container before invocation. Settled paint remained required; no warm pass ran. This is the requested full-suite baseline reselection, not the downstream completed-candidate gate.

All **204** baselines were compared: **186 exact matches, 18 differences**. The newly selected set includes `access-390.png` (approved override-removal cause) and `override-created-no-default-1440.png` (neither cause). It is not merely the old eighteen-image selection reused.

### Full differing set and cause mapping

| Image | Differing pixels | Cause | Last baseline commit |
|---|---:|---|---|
| access-390.png | 17403 | per-spec override removed | c9e04e9 |
| access-900.png | 18585 | per-spec override removed | edb077f |
| access-1440.png | 18571 | per-spec override removed | edb077f |
| override-created-no-default-1440.png | 1740 | UNEXPLAINED: neither approved cause | e42bdd7 |
| shared-patterns-900.png | 1246 | baseline predates 7133e82 | 8f07e28 |
| shared-patterns-1440.png | 1246 | baseline predates 7133e82 | 8f07e28 |
| sources-empty-390.png | 6104 | baseline predates 7133e82 | b422b88 |
| sources-wizard-390.png | 26940 | baseline predates 7133e82 | b422b88 |
| chooser-390.png | 2796 | per-spec override removed | 9d5ff1b |
| chooser-900.png | 4079 | per-spec override removed | 9d5ff1b |
| chooser-1440.png | 4079 | per-spec override removed | 9d5ff1b |
| create-project-390.png | 4058 | per-spec override removed | 9d5ff1b |
| create-project-900.png | 5151 | per-spec override removed | 9d5ff1b |
| create-project-1440.png | 5151 | per-spec override removed | 9d5ff1b |
| create-company-390.png | 4058 | per-spec override removed | 9d5ff1b |
| create-company-900.png | 5151 | per-spec override removed | 9d5ff1b |
| create-company-1440.png | 5151 | per-spec override removed | 9d5ff1b |
| type-observation-390.png | 4507 | baseline predates 7133e82 | c9e04e9 |

Twelve images map to **per-spec override removed**; five map to **baseline predates 7133e82**. The eighteenth maps to neither. All screenshot dimensions match their baselines.

### Stop condition: `override-created-no-default-1440.png`

Its last baseline commit is **e42bdd7, 2026-10-14 00:57:22 EDT**, after **7133e82, 2026-10-09 22:21:01 EDT**. Its `pool-row-access.spec.ts` scenario never had the Access/tenancy launch override. It therefore fits **neither authorized recapture cause**.

The exact diff contains **1740 pixels**, confined to the header breadcrumb rectangle **x277–620, y36–48**. The Row access decision and Agents table pixels do not differ. The same state was also captured as a companion state during the earlier focused runs. Its saved unified-dev and unified-production PNGs both match the committed baseline **byte-for-byte**, while this full-run PNG does not. Their DOM text and recorded visible-element geometry/styles are identical to this full-run capture. Earlier old-dev control and initial production-audit captures likewise match that baseline.

This demonstrates a capture variation under the same unified policy. It does **not** establish a new product layout defect, and it does not identify the Chromium paint-state cause. No new capture was run to investigate it: these comparisons use already-saved artifacts. The user’s explicit rule applies: **anything fitting neither approved cause stops recapture**. Accordingly no baseline file was updated, no launcher/baseline commit was made, no production-harness adoption commit was made, no gate was run, and no custody changes were replayed. All 204 original baseline hashes remain unchanged. The WIP checkpoint `e62ea7f` remains intact.

### Precise answer for the requested future commit message

The earlier fractional header measurement is **a real sub-pixel layout measurement change under the changed launch/raster policy, not rounding by the diagnostic**. The recorder stores `getBoundingClientRect().x/y/width/height` directly; it performs no rounding. Named elements in eight wide Access/tenancy states:

- Project-switcher label, `.projbtn .tx` (and its text children): width **154 → 153.59375px**.
- Project-switcher chevron, `.projbtn .cv`: x **227 → 226.59375px**, width **4 → 4.40625px**.
- Header `.search input`: x **548 → 547.96875px** at 900, or **1088 → 1087.96875px** at 1440; width **144.984375 → 145.015625px**.

No text changed; page dimensions and component structure did not change. An eventual message must name this real fractional exception rather than assert unqualified “layout unchanged.” The largest observed shift is **0.40625px**. This does not contradict the later result that dev and production have identical geometry **when both use the unified configuration**: the first comparison is old versus unified policy; the second is dev versus production under one policy. No commit was created while the separate full-run blocker remained unexplained.

### Artifacts

- `tmp/unified-full-isolation.json`, `tmp/unified-full-suite.log` — immediate isolation and full run.
- Candidate `tmp/unified-full-results.json`, `tmp/unified-full-first.jsonl` — results and all 204 first-attempt images with text/geometry.
- Candidate `tmp/unified-full-pixels.json`, `tmp/unified-full-diffs/` — exact differences and regions.
- `tmp/unified-full-classification.json` — per-image cause, commit/date, bounds and dimensions.
- `tmp/review/unified-full-index.html` — all 204 baseline/actual/diff comparisons, differing images first.

## Unified launcher correction — 2026-10-15

**All eighteen first-attempt dev/production image pairs are now pixel-identical.** Against the existing baselines, sixteen differ under both harnesses and two match. No baseline is replaced, no adoption commit or gate is made, and custody work is not replayed. This establishes equality for this controlled pair, not universal reproducibility across every future run.

### Mapping before the fix (including the imperfect overlap)

The ten production-only differences in the prior control split as follows.

Production-only **and** in a per-file override group:

- `access-900.png`
- `access-1440.png`
- `chooser-390.png`
- `chooser-1440.png`
- `create-project-900.png`
- `create-project-1440.png`
- `create-company-900.png`
- `create-company-1440.png`

Production-only but **not** in an override group:

- `override-no-default-editor-1440.png`
- `custody-activity-absent-1440.png`

In an override group but **not** production-only:

- `access-390.png` — exact in the full 204-image production audit; outside the disputed eighteen.
- `chooser-900.png` — differed under both harnesses.
- `create-project-390.png` — differed under both harnesses.
- `create-company-390.png` — differed under both harnesses.

The eight common differences' last-written baseline commits all predate **7133e82, 2026-10-09 22:21:01 EDT**:

- `shared-patterns-900.png` — `8f07e28`, 2026-10-07 10:50:55 EDT; before.
- `shared-patterns-1440.png` — `8f07e28`, 2026-10-07 10:50:55 EDT; before.
- `sources-empty-390.png` — `b422b88`, 2026-10-09 16:05:26 EDT; before.
- `sources-wizard-390.png` — `b422b88`, 2026-10-09 16:05:26 EDT; before.
- `type-observation-390.png` — `c9e04e9`, 2026-10-09 09:22:23 EDT; before.
- `chooser-900.png` — `9d5ff1b`, 2026-10-06 15:47:35 EDT; before.
- `create-project-390.png` — `9d5ff1b`, 2026-10-06 15:47:35 EDT; before.
- `create-company-390.png` — `9d5ff1b`, 2026-10-06 15:47:35 EDT; before.

There are **no exceptions** in this eight-image date comparison. These are repository last-write timestamps, not recovered browser-process timestamps.

### Launcher diff and every removed override

`playwright.config.ts` is the single launch-policy source. Every checked-in suite config inherits it; scanning `e2e/` finds no remaining launch-option override. It retains the seven existing raster arguments and adds an explicit ANGLE/SwiftShader selection instead of relying on a runtime choice following `--disable-gpu`:

```diff
 launchOptions: { args: [
   '--disable-gpu',
+  '--use-gl=angle',
+  '--use-angle=swiftshader-webgl',
+  '--enable-unsafe-swiftshader',
   '--disable-partial-raster',
   '--disable-skia-runtime-opts',
   '--disable-lcd-text',
   '--font-render-hinting=none',
   '--force-color-profile=srgb',
   '--force-device-scale-factor=1',
 ] },
```

Removed the following entire override from **both** `e2e/access.spec.ts` and `e2e/tenancy.spec.ts`; there were no other override call sites:

```diff
-test.use({ launchOptions: { args: ['--disable-gpu'] } });
```

The selected policy is CPU page rasterisation (`--disable-gpu`) with explicitly selected ANGLE SwiftShader for the headless GL path. It does not turn on host GPU rasterisation. The complete patch is `tmp/review/unified-renderer.patch`. No application markup, stylesheet, font import or data fixture changed.

### Both harnesses with the one policy

Each harness ran the seventeen scenarios covering the eighteen disputed images. The old dev harness ran first; the production harness served the same already-built application bundle because the changes affect the test launcher only. No rebuild or warm pass was needed. Immediate isolation checks at **22:53:17 EDT** and **23:00:19 EDT** recorded no Node listeners and no other Node processes in the validation containers. Settled-paint preparation, assertions, timeouts, screenshot tolerance and configured retries were unchanged.

- Dev: **7 passed, 10 failed, 0 flaky/skipped**; 205.336s suite / **211.50s wall**.
- Production: **7 passed, 10 failed, 0 flaky/skipped**; 143.042s suite / **145.68s wall**.
- Both: partial conformance **12/54 routes, zero findings**.
- All twenty failed scenario results across the two runs (ten per run) are screenshot comparison failures in Access 900/1440, chooser 900/1440, create-project 390/900/1440 and create-company 390/900/1440. The unchanged visual project retried each failed scenario once; none recovered. The exact-pixel matrix below uses **only first attempts**, never selecting a better retry.

| Image | Dev vs baseline | Production vs baseline | Dev vs production |
|---|---:|---:|---:|
| access-900.png | 18585 | 18585 | 0 |
| access-1440.png | 18571 | 18571 | 0 |
| override-no-default-editor-1440.png | 0 | 0 | 0 |
| custody-activity-absent-1440.png | 0 | 0 | 0 |
| shared-patterns-900.png | 1246 | 1246 | 0 |
| shared-patterns-1440.png | 1246 | 1246 | 0 |
| sources-empty-390.png | 6104 | 6104 | 0 |
| sources-wizard-390.png | 26940 | 26940 | 0 |
| chooser-390.png | 2796 | 2796 | 0 |
| chooser-900.png | 4079 | 4079 | 0 |
| chooser-1440.png | 4079 | 4079 | 0 |
| create-project-390.png | 4058 | 4058 | 0 |
| create-project-900.png | 5151 | 5151 | 0 |
| create-project-1440.png | 5151 | 5151 | 0 |
| create-company-390.png | 4058 | 4058 | 0 |
| create-company-900.png | 5151 | 5151 | 0 |
| create-company-1440.png | 5151 | 5151 | 0 |
| type-observation-390.png | 4507 | 4507 | 0 |

### Explanation of the remaining sixteen

The remaining images separate exactly by recorded launch-policy history:

- **Eleven Access/tenancy images:** the two Access images and all nine chooser/create-project/create-company images. Their baseline-era specs overrode the global policy with only `--disable-gpu`. Removing that override now applies the global raster/hinting/scale flags. The controlled change alters glyph and SVG edges and some fractional header metrics, identically in both harnesses. No application or font-file change occurred.
- **Five other images:** Shared Patterns 900/1440, Sources empty/wizard 390 and type-observation 390. Their baseline commits predate the global raster policy. They retain the exact same differing-pixel counts seen before this correction and are identical across the two newly unified harnesses. Their baseline mismatch was not introduced by production serving.
- **Two matches:** no-default override editor 1440 and custody Activity absent 1440. Both baseline commits follow the global policy, neither spec had the removed overrides, and both now match exactly. The earlier breadcrumb variation is absent in this pair; no separate breadcrumb product change was made.

All eighteen keep identical DOM text before/after the fix. Screenshot dimensions remain unchanged. The prior “all geometry identical” observation was about the earlier two-harness comparison, not this new policy change: eight wide Access/tenancy states now have six small header metric changes, including the drawer label width **154 → 153.59375px**, its chevron x **227 → 226.59375px**, and search input x differing by **0.03125px**. Maximum observed shift is **0.40625px**. The remaining ten states preserve recorded visible geometry/styles. Under the unified policy, **all eighteen dev/production pairs have identical recorded visible geometry/styles and identical PNG pixels**.

The established cause category is **mixed historical launch/raster policies**, now unified. The experiment does not isolate a single individual flag or Chromium-internal cache operation. The residual differences include real fractional metrics as well as glyph/curve pixels, so they must not be described as exclusively glyph antialiasing. Font loading, asset URLs and CSS ordering remain excluded from further investigation as previously directed. No baseline replacement follows this explanation; the user explicitly requested no recapture.

### Open item: intended webfonts are absent — no implementation in this change

The tested container has no loaded webfonts for the declared product stacks. It resolves them to **WenQuanYi Zen Hei and Zen Hei Mono**, a CJK fallback, from the same system font file recorded above. **The entire 204-baseline suite is being rendered and judged in that CJK fallback, not the intended product fonts.** Consequently these baselines do not validate the product's intended typography, glyph metrics or wrapping. Historical per-capture font manifests were not retained, so this is not a claim that every old image's exact font file hash has been recovered.

Track supplying the intended font files and reviewing their effects as a separate open item. Do not load fonts, change CSS, rebuild typography baselines or silently fold that work into this launcher fix. No action on it was taken here.

Typecheck passed (90.00s wall). Lint passed (48.71s wall; zero dependency violations). Runtime verification of the centralized arguments confirms `ANGLE_SWIFTSHADER`, software rasterisation and device pixel ratio 1; artifact `tmp/production-harness-adoption/tmp/unified-renderer-environment.json`. The diagnostic screenshot helpers were restored after the comparisons; only the central launcher, two override removals and review documentation remain changed. All 204 baseline hashes remain unchanged.

### Artifacts

- `tmp/unified-dev-isolation.json`, `tmp/unified-production-isolation.json` — immediate checks.
- `tmp/unified-{dev,production}-suite.log` and candidate `tmp/unified-{dev,production}-results.json` — complete scenario results.
- Candidate `tmp/unified-{dev,production,pair}-pixels.json` — eighteen-row exact comparison matrices; PNGs and diff regions in corresponding directories.
- `tmp/review/unified-renderer-index.html` — baseline/dev/production comparisons for all eighteen states.
- `tmp/review/unified-renderer.patch` — launcher and two override removals only.

## Same-code old-harness control — 2026-10-15

**Result: mixed, not either global binary outcome. Eight of the eighteen differ under both harnesses; ten match their committed baselines under the old dev harness.** Therefore production serving is innocent of the eight common differences, but it is not cleared for the other ten. This does not authorize an all-eighteen environment-drift recapture, and it does not prove that all ten remaining differences are deterministic production defects. Earlier saved dev controls already show variability in some of these pixels. No adoption commit, gate or custody replay follows.

The same `work/production-harness-before-custody` branch, source, browser container, dependencies, settled-paint preparation, assertions, tolerances and retry settings were used. Only the web-server configuration changed back to the old `npm run dev -- --host 127.0.0.1 --port 4173`, including its original startup/reuse settings under CI. The 22:27:13 EDT pre-run isolation check found no Node listeners or other Node processes in the validation containers. No warm-up pass ran.

The 17 scenarios producing the disputed eighteen images passed **17/17, zero failed/flaky/skipped**, **126.666s suite / 129.51s wall time**, with partial conformance **12/54 routes and zero findings**. They also produce six other screenshot states; those were retained as ordinary scenario output, not selected as additional scenarios. All eighteen target images were compared exactly. All 204 committed baseline hashes remain unchanged. The existing tolerant matcher passes; exact baseline reproducibility is what fails for the eight common cases. Do not describe this as every commit failing the current matcher.

All eighteen dev/production pairs have identical DOM text and identical recorded visible-element geometry/style fields. The eight common mismatches are byte-identical PNGs between dev and production. Dimensions are unchanged in every pair.

| Image | Production vs baseline pixels | Old dev vs baseline pixels | Binary result for this image |
|---|---:|---:|---|
| access-900.png | 46 | 0 | Matches old dev; production investigation remains open |
| access-1440.png | 46 | 0 | Matches old dev; production investigation remains open |
| override-no-default-editor-1440.png | 1740 | 0 | Matches old dev; production investigation remains open |
| custody-activity-absent-1440.png | 83 | 0 | Matches old dev; production investigation remains open |
| shared-patterns-900.png | 1246 | 1246 | Differs under both; not introduced by production harness |
| shared-patterns-1440.png | 1246 | 1246 | Differs under both; not introduced by production harness |
| sources-empty-390.png | 6104 | 6104 | Differs under both; not introduced by production harness |
| sources-wizard-390.png | 26940 | 26940 | Differs under both; not introduced by production harness |
| type-observation-390.png | 4507 | 4507 | Differs under both; not introduced by production harness |
| chooser-390.png | 37 | 0 | Matches old dev; production investigation remains open |
| chooser-900.png | 30 | 30 | Differs under both; not introduced by production harness |
| chooser-1440.png | 30 | 0 | Matches old dev; production investigation remains open |
| create-project-390.png | 37 | 37 | Differs under both; not introduced by production harness |
| create-project-900.png | 30 | 0 | Matches old dev; production investigation remains open |
| create-project-1440.png | 30 | 0 | Matches old dev; production investigation remains open |
| create-company-390.png | 37 | 37 | Differs under both; not introduced by production harness |
| create-company-900.png | 30 | 0 | Matches old dev; production investigation remains open |
| create-company-1440.png | 30 | 0 | Matches old dev; production investigation remains open |

### Rendering environment, now and at baseline commits

Host: **macOS 13.7.8, build 22H730**. Installation history records the 13.7.8 update on **2025-09-04**, before all seven baseline commits (2026-10-06 through 2026-10-14); no later macOS update is recorded. Rendering itself occurs in the Linux Docker container, **Ubuntu 24.04.4 LTS**, not the macOS font rasteriser.

Current Playwright: **1.63.0**. Each baseline commit's own `package-lock.json` pins `@playwright/test` and `playwright-core` to **1.63.0**, and the `playwright-core` integrity matches today's lockfile. The matching package's `browsers.json` maps this to **Chromium 153.0.8010.12, revision 1243**; current runtime reports that same version. This is the lockfile-derived bundled browser identity, not a claim that historical runtime GPU/font manifests were retained.

| Baseline commit | Images in this control | Lockfile Playwright | Global project raster args at that commit |
|---|---|---|---|
| 8f07e28 | shared-patterns-900.png, shared-patterns-1440.png | 1.63.0 | None; Playwright defaults, plus any per-file override |
| 9d5ff1b | chooser-390.png, chooser-900.png, chooser-1440.png, create-project-390.png, create-project-900.png, create-project-1440.png, create-company-390.png, create-company-900.png, create-company-1440.png | 1.63.0 | None; Playwright defaults, plus any per-file override |
| 9f2e3d9 | custody-activity-absent-1440.png | 1.63.0 | Seven explicit flags listed below |
| b422b88 | sources-empty-390.png, sources-wizard-390.png | 1.63.0 | None; Playwright defaults, plus any per-file override |
| c9e04e9 | type-observation-390.png | 1.63.0 | None; Playwright defaults, plus any per-file override |
| e42bdd7 | override-no-default-editor-1440.png | 1.63.0 | Seven explicit flags listed below |
| edb077f | access-900.png, access-1440.png | 1.63.0 | None; Playwright defaults, plus any per-file override |

Current global launcher flags: `--disable-gpu`, `--disable-partial-raster`, `--disable-skia-runtime-opts`, `--disable-lcd-text`, `--font-render-hinting=none`, `--force-color-profile=srgb`, `--force-device-scale-factor=1`. Commit **7133e82 (2026-10-09 22:21 EDT)** added this configuration. The five older baseline commits predate it. Access and tenancy each replace that argument list with just `--disable-gpu`, both in their baseline-era files and now. This is a concrete capture-configuration drift for the other older baselines, not a demonstrated explanation for every mismatch. The Shared Patterns and custody-visual spec files themselves are absent at their baseline-only commits, so those commits cannot prove their then-uncommitted per-file settings.

No `deviceScaleFactor` context override is present in these baseline-era or current configs. The desktop context default is 1; current runtime confirms `devicePixelRatio = 1` for both launch profiles. The global profile additionally forces scale factor 1 on the command line.

Current runtime for both profiles reports **ANGLE SwiftShader (SwANGLE 5.0.0)** with `gpu_compositing: disabled_software`, `rasterization: disabled_software`, `hardwareSupportsVulkan: false`. The runtime command line includes the configured flags plus Playwright/headless defaults, including `--headless`, `--enable-unsafe-swiftshader`, `--use-gl=angle`, `--use-angle=swiftshader-webgl` and `--ozone-platform=headless`. This is software, not host hardware rasterisation. No historical runtime renderer or immutable Docker-image digest was retained at the baseline commits, so a hardware/software transition at capture time cannot be confirmed from the lockfile alone. Current image identity and runtime command lines are saved in the artifacts.

**Fonts:** this tested pre-`/next` console has no `@font-face`, webfont stylesheet link or font-file import. `styles.ts` imports the master stylesheet then theme CSS in both harnesses. The master declares Manrope and IBM Plex Mono stacks but does not supply those webfonts. Both harnesses use the same files from the same container font installation. Runtime resolution of the actual declared sans/mono stacks is **WenQuanYi Zen Hei / WenQuanYi Zen Hei Mono**, `isCustomFont: false`; the FontFaceSet is empty and loaded. The source file is `/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc`, SHA-256 `79c18ebe7b811951e8311bad7103ebeae8c337ed9988ea69e8a78a66cfe029b9`. The font-file manifest is saved. The reference HTML's Google Fonts links are not imported by this product build. This records current fallback behavior, not a font change made in this work; historical font-file hashes are unavailable.

**Excluded from further investigation, per the review decision:** font loading, asset URLs and CSS ordering. All 204 dimensions were unchanged; all eighteen controlled states additionally have identical visible geometry and recorded computed styles. The dev and production harnesses use the same system font files and source stylesheet import order. These exclusions narrow the next investigation to rendering/capture state; they do not establish a particular raster-cache mechanism.

### Diagnostic validity and artifacts

An initial instrumentation attempt was stopped after its new environment probe threw `Browser.getBrowserCommandLine: Command line not returned because --enable-automation not set`. It wrote no audit JSONL and is not the control result. Its aborted log and isolation record are preserved under `tmp/harness-control-probe-failed-*` (76.43s). The probe was removed from the test path before the completed control. Environment facts were collected separately afterward with caught protocol errors; `SystemInfo.getInfo.commandLine` supplied the actual command line. Product assertions, screenshot preparation and configured retries were never relaxed. No gate ran or was rerun.

- `tmp/harness-control-suite.log`, `tmp/harness-control-isolation.json`: completed control and immediate isolation record.
- `tmp/production-harness-adoption/tmp/dev-control-results.json`, `dev-control-18.jsonl`, `dev-control-pixels.json`, `dev-control-diffs/`: scenario results, text/geometry and exact pixels.
- `tmp/review/harness-control-index.html`: all eighteen baseline/production/dev/diff comparisons.
- `tmp/harness-control-baseline-history.json`, `tmp/harness-control-historical-environment.json`: per-image last-capture commits, lockfile metadata and historical launcher settings.
- `tmp/harness-control-install-history.json`, `tmp/harness-control-container-image.txt`, `tmp/harness-control-font-files.txt`: host installation history, container identity and font hashes.
- `tmp/production-harness-adoption/tmp/environment-facts.json`: runtime browser, scale, software renderer, command line and platform fonts.

**Stop:** no baseline updates, adoption commit, gate or custody replay. Eight shared mismatches do not justify labelling all eighteen environment drift. The ten old-dev matches keep the production/capture-state investigation open. Scenario 390 remains closed as not reproducible in production; its earlier dev-server penalty remains unexplained.

## Harness-only adoption trial

Build once with `npm run build -- --mode browser-test`, then serve the completed bundle with Vite preview. The build took **5.33s reported by Vite / 8.53s wall time**. Compilation stays outside scenario deadlines. The existing review routes are included only in development or explicit browser-test mode. Normal release builds still exclude them. No assertion, scenario timeout, retry configuration, screenshot tolerance or settled-paint precondition changes.

**No warm pass.** The earlier warm-pass workaround is withdrawn. The two required preconditions are settled paint and a recorded isolation check immediately before the run; a run without that record is not a measurement. The 21:28:48 EDT check recorded zero host Node listeners, clear dev ports and no Node processes in either validation container. Only the suite's own preview server and its test-managed services were started thereafter. No user dev service was restarted.

One full invocation against this build completed **380 passed, 0 failed, 0 flaky, 0 skipped**, **54/54 conformance routes, 0 findings**, in **1315.298s suite time / 1322.24s wall time**. This is the harness adoption experiment, not the subsequent completed-candidate gate. Audit-only soft screenshot assertions retain failures while allowing later screenshot states to be inventoried; none failed in this invocation. The diagnostic instrumentation is removed after analysis and is not proposed for adoption.

### Exact pixels: all 204, one invocation, no baseline regeneration

**186 pixel-identical; 18 different; 0 missing.** All dimensions match; all 204 committed baseline hashes remain unchanged. The matcher passes are not an exact-equality claim. The actuals come from the same pinned Chromium 153.0.8010.12 environment and settled-paint preparation. No recapture or baseline update follows this audit.

Grouped findings (these describe regions, not diagnosed causes):

- **11 drawer-edge images:** Access at 900/1440, and chooser/create-project/create-company at 390/900/1440. Differences are 30–46 pixels in SVG/rounded edges. Six are byte-identical to saved dev-server controls; five differ from those controls. Why those edge pixels vary remains unestablished.
- **5 monospace/SVG images:** Shared Patterns at 900/1440, Sources empty/wizard at 390 and type-observation at 390. Each is byte-identical to its saved dev-server control, so production compilation cannot explain its difference from the baseline. The cause of the baseline mismatch remains unresolved.
- **2 breadcrumb images:** no-default override editor at 1440 (1740 pixels) and custody Activity without a rollup at 1440 (83 pixels). Diffs are confined to header breadcrumb glyphs; no custody summary, row editor or Agent table pixels differ. Cause unresolved; no equivalent saved direct dev control is claimed for these two states.

The sixteen states with saved dev controls have identical DOM text between control and this trial; eleven also have byte-identical PNGs. Shared Patterns' visible element geometry and computed styles match the control; the dev DOM adds only one zero-size script. These controls are prior evidence, not additional captures made after this run.

**Candidate causes:** settled-paint metadata confirms fonts were loaded before captures; that alone does not prove historical glyph raster equality. The production stylesheet remains `index-C1Derg32.css`, matching the preceding production experiment; neither CSS import order nor the stylesheet source changed in this harness diff. Built JS/CSS asset URLs resolve to the generated files, and all routes render and pass their checks. This is evidence against missing assets or a general CSS-order regression, not a demonstrated explanation for the remaining pixels. No particular font-loading, raster-cache or CSS-order mechanism is asserted. **Unexplained differences block adoption; do not recapture them or proceed to the gate.**

| Image | Different pixels | Diff region / status | Byte-identical to saved dev capture |
|---|---:|---|---|
| access-900.png | 46 | Drawer SVG/rounded-edge raster; cause unresolved | Yes |
| access-1440.png | 46 | Drawer SVG/rounded-edge raster; cause unresolved | Yes |
| override-no-default-editor-1440.png | 1740 | Breadcrumb glyph raster; cause unresolved | No control claimed |
| custody-activity-absent-1440.png | 83 | Breadcrumb glyph raster; cause unresolved | No control claimed |
| shared-patterns-900.png | 1246 | Monospace glyphs and/or SVG raster; cause unresolved | Yes |
| shared-patterns-1440.png | 1246 | Monospace glyphs and/or SVG raster; cause unresolved | Yes |
| sources-empty-390.png | 6104 | Monospace glyphs and/or SVG raster; cause unresolved | Yes |
| sources-wizard-390.png | 26940 | Monospace glyphs and/or SVG raster; cause unresolved | Yes |
| type-observation-390.png | 4507 | Monospace glyphs and/or SVG raster; cause unresolved | Yes |
| chooser-390.png | 37 | Drawer SVG/rounded-edge raster; cause unresolved | Yes |
| chooser-900.png | 30 | Drawer SVG/rounded-edge raster; cause unresolved | No |
| chooser-1440.png | 30 | Drawer SVG/rounded-edge raster; cause unresolved | No |
| create-project-390.png | 37 | Drawer SVG/rounded-edge raster; cause unresolved | Yes |
| create-project-900.png | 30 | Drawer SVG/rounded-edge raster; cause unresolved | No |
| create-project-1440.png | 30 | Drawer SVG/rounded-edge raster; cause unresolved | No |
| create-company-390.png | 37 | Drawer SVG/rounded-edge raster; cause unresolved | Yes |
| create-company-900.png | 30 | Drawer SVG/rounded-edge raster; cause unresolved | No |
| create-company-1440.png | 30 | Drawer SVG/rounded-edge raster; cause unresolved | Yes |

### Artifacts and stopping point

- `tmp/harness-adoption-build.log`, `tmp/harness-adoption-suite.log` — timed commands.
- `tmp/harness-adoption-isolation.json` — immediate pre-run host/container inventory.
- `tmp/production-harness-adoption/tmp/adoption-results.json` — full suite record.
- `tmp/production-harness-adoption/tmp/adoption-audit.jsonl` — all 204 actuals, DOM text and geometry.
- `tmp/production-harness-adoption/tmp/adoption-pixels.json` and `adoption-diffs/` — exact pixel counts, bounds and diffs.
- `tmp/review/harness-adoption-index.html` — all-204 baseline/actual/diff review index.
- `tmp/harness-adoption-baselines-before.json` — unchanged baseline hash manifest.

Stage 1 is complete. Stage 2 is blocked by unexplained differences, despite the passing suite. No harness or baseline adoption commit was made. Stage 3 has not begun: no new gate, no custody replay or commits. The existing custody commits are preserved behind the WIP checkpoint.

Scenario 390 is closed as **not reproducible against the production build**. The dev-server penalty was **never explained**; no narrow-viewport custody defect was established. It is not recorded as diagnosed.

## Historical experiment (before the ordered adoption trial)

The record below describes the earlier custody-bearing experiment and is not the harness-only result above. Its warm-pass references are historical, not current requirements.

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
| 1.0 | 2026-10-15 | Record initial production-build experiment and isolated timing evidence. | No custody mechanism or evidence semantics changed; no baseline changed. |
| 1.1 | 2026-10-15 | Record WIP checkpoint and one full harness-only run: 380 pass; 204 exact comparisons, 18 unexplained differences. Withdraw warm-pass requirement and stop adoption. | No product behavior or baseline changed. Production-harness adoption and the subsequent custody gate remain blocked. |
| 1.2 | 2026-10-15 | Same-code old-dev control: eight common mismatches, ten exact old-dev matches; record versions, renderer, scale and fonts. | No product or baseline changes. Mixed evidence keeps adoption and custody work blocked; no gate. |
| 1.3 | 2026-10-15 | Remove both per-file launch overrides, pin ANGLE/SwiftShader centrally, and compare eighteen states under both harnesses. Record missing webfonts separately. | Test launch policy only; no application, font or baseline change. All eighteen harness pairs match; sixteen old-policy baseline differences remain. |
| 1.4 | 2026-10-15 | Reselect across all 204: 186 exact, 17 classified differences and one unexplained breadcrumb-raster difference. Record real fractional header metrics precisely. | No baseline or product change. User stop condition blocks commits, adoption and gate. |
