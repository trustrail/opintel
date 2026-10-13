# Row access browser validation investigation — 2026-10-13

No full gate was rerun. No baseline changed. The Row access redesign remains uncommitted pending Rick's review. `cab221a` is the clean comparison revision; it was exported with `git archive`, not implemented by reverting the working tree.

## Findings

Host activity during the 1h18m gate is not established: the gate log contains child-command output and aggregate process timing, but no contemporaneous host process inventory or system-load samples identifying what else was running; a later inventory cannot reconstruct it.

The browser slowdown is real, but it is not concentrated in pool work. The previous browser run (`tmp/sealing-corrections-check-ui.log`) took 32.9 minutes; the redesign run took 56.7 minutes. The latter's full `check:ui` took 1h18m01s, including normal validation and container setup. The normal-suite stage fell from 1,198.01s to 1,097.08s. Four long Activity/Catalog cases explain approximately 1,300.4s of the browser increase; including Activity state transitions gives 1,312.3s. These logs show where time was spent, not the underlying cause of the stalls.

The 205-object fixture (200 inherited, three overrides, one missing filter, one unscoped) is a local in-memory array in `e2e/pool-row-access.spec.ts:8–13`. That file's nine scenarios invoke the local setup; the large page is exercised by its three inherited/picker scenarios. It is not in `e2e/fixtures.ts`, is not seeded in Postgres, and is not paid for by other browser scenarios. The shared `pools-fixture.ts` change merely adds four zero counts to its existing empty response. No fixture relocation is warranted by the proposed shared-fixture hypothesis.

Two of the five isolated scenarios also fail on `cab221a`: Activity cold-load geometry and Activity state transitions. No redesign-only failure was demonstrated. RED-015, DOMAIN-002 and custody Activity 900 passed all five repetitions on both revisions. Those passing repetitions do not explain or excuse the prior suite failures or the custody retry. Stop here on the pre-existing failures, as requested; no product change, wait change or timeout change was made.

## Duration comparison

Durations below are the list reporter's wall-clock values, summed over attempts, including the configured visual retries. Minute-formatted values are approximate. The full 374-scenario comparison is in `tmp/row-access-diagnosis/duration-comparison.md` and machine-readable `durations.json`.

| Scenario | Previous s | Current s | Increase s |
|---|---:|---:|---:|
| e2e/catalog.spec.ts — G-019: 5,000 elements stay virtualised while scrolling and keyboard navigation works  | 45.0 | 456.0 | 411.0 |
| e2e/activity.spec.ts — DOMAIN-002: past evidence displays its recorded assignment version and identifies legacy unknown versions  | 4.9 | 306.0 | 301.1 |
| e2e/activity-redesign.spec.ts — RED-015: evidence permalink shares sampled/retained honesty and no reconstruction of missing detail  | 3.5 | 300.0 | 296.5 |
| e2e/activity.spec.ts — Activity: measured positions survive initial resize across three cold loads  | 20.2 | 312.0 | 291.8 |
| e2e/declarations-live.spec.ts — DECL-001/006: console declarations and tokenized entitlement through real routes and source Engine  | 14.8 | 44.8 | 30.0 |
| e2e/catalog.spec.ts — G-020: purposeful empty, loading and error states, including an empty branch  | 5.1 | 17.4 | 12.3 |
| e2e/dashboard-layout.spec.ts — RED-020: metric controls do not collide, charts show history and treatment chips stay compact at 1440  | 3.8 | 15.8 | 12.0 |
| e2e/activity.spec.ts — 5.12 filters, cursor loading, empty, error, loading and incomplete states  | 19.6 | 31.5 | 11.9 |
| e2e/conformance-coverage.spec.ts — control coverage: project audit-log  | 1.3 | 11.5 | 10.2 |
| e2e/dashboard-layout.spec.ts — RED-019: Dashboard counts equal displayed Activity totals after following links on 2026-10-06  | 6.3 | 16.0 | 9.7 |
| e2e/entitlements.spec.ts — pool and filter navigation clears selections; loading, empty and error are purposeful  | 10.7 | 20.2 | 9.5 |
| e2e/conformance-coverage.spec.ts — control coverage: project source-of-truth  | 2.9 | 12.2 | 9.3 |
| e2e/dashboard-layout.spec.ts — RED-019: Dashboard counts equal displayed Activity totals after following links on 2026-10-08  | 4.4 | 11.9 | 7.5 |
| e2e/pool-row-access.spec.ts — ROW-SCALE inherited pagination and shared picker at 390 **(new)** | 0.0 | 7.5 | 7.5 |
| e2e/conformance-coverage.spec.ts — control coverage: project relationships  | 1.3 | 8.1 | 6.8 |
| e2e/activity-redesign.spec.ts — RED-015: agent identity fits and pool names replace key prefixes  | 12.9 | 19.6 | 6.7 |
| e2e/dashboard-redesign.spec.ts — RED-019: count links carry the destination scope; observation tabs exclude unrelated findings  | 8.2 | 14.8 | 6.6 |
| e2e/dashboard-layout.spec.ts — RED-020: metric controls do not collide, charts show history and treatment chips stay compact at 900  | 3.8 | 10.3 | 6.5 |
| e2e/engines.spec.ts — SET-004: engine list and assignment select geometry at 900  | 5.0 | 11.5 | 6.5 |
| e2e/pool-row-access.spec.ts — ROW-SCALE inherited pagination and shared picker at 900 **(new)** | 0.0 | 6.3 | 6.3 |

## Totals

| Group | Previous s | Current s | Increase s |
|---|---:|---:|---:|
| Pool-page scenarios, including nine new scenarios | 163.7 | 164.6 | 0.9 |
| All other scenarios | 1697.1 | 3142.8 | 1445.7 |
| All logged scenario attempts | 1860.8 | 3307.4 | 1446.6 |

New nine Row access scenarios: 48.1s. Existing pool-page scenarios therefore decreased by 47.2s. The narrower pool-file-only subtotal is 146.3s → 149.7s. Browser elapsed: 32.9m → 56.7m. Current check:ui elapsed 1h18m includes its normal-suite prerequisite and browser/container setup. These are not all browser time.

## Five isolated repetitions per scenario and revision

Same pinned Playwright 1.63.0 / Chromium 153.0.8010.12, raster flags, conformance observers, one worker, trace enabled on every run, and retries disabled. Only the five named scenarios were selected; no normal suite or other browser scenarios warmed them first. Five repetitions used fresh test contexts/workers under Playwright repeat-each, in the same order on both revisions. Each revision used a fresh container and Vite server. The first temporary-config launch failed before any test ran and was corrected; it is not a measurement.

Seconds are Playwright's per-test wall-clock durations, including fixture work, excluding container install/global setup and separate worker cleanup. **F** means deadline failure. Tracing was enabled identically on both revisions and can itself add cost; these are diagnostic timings, not new budgets.

| Scenario | Revision | Passes | Run 1 s | Run 2 s | Run 3 s | Run 4 s | Run 5 s |
|---|---|---:|---:|---:|---:|---:|---:|
| RED-015: evidence permalink shares sampled/retained honesty and no reconstruction of missing detail | Redesign | 5/5 | 16.80 | 3.46 | 3.92 | 3.33 | 4.02 |
| RED-015: evidence permalink shares sampled/retained honesty and no reconstruction of missing detail | cab221a | 5/5 | 9.31 | 9.41 | 5.80 | 5.10 | 6.93 |
| Activity: measured positions survive initial resize across three cold loads | Redesign | 4/5 | 30.28 **F** | 26.01 | 18.07 | 16.69 | 15.43 |
| Activity: measured positions survive initial resize across three cold loads | cab221a | 3/5 | 30.32 **F** | 30.39 **F** | 24.44 | 20.62 | 20.12 |
| 5.12 filters, cursor loading, empty, error, loading and incomplete states | Redesign | 5/5 | 26.24 | 21.51 | 16.92 | 16.88 | 16.85 |
| 5.12 filters, cursor loading, empty, error, loading and incomplete states | cab221a | 4/5 | 34.45 **F** | 29.71 | 27.88 | 23.71 | 21.65 |
| DOMAIN-002: past evidence displays its recorded assignment version and identifies legacy unknown versions | Redesign | 5/5 | 6.81 | 6.59 | 6.10 | 5.06 | 6.81 |
| DOMAIN-002: past evidence displays its recorded assignment version and identifies legacy unknown versions | cab221a | 5/5 | 13.51 | 10.12 | 8.14 | 7.80 | 6.86 |
| 5.36 custody Activity rollup and receipt 900 | Redesign | 5/5 | 12.37 | 13.57 | 15.19 | 13.08 | 13.69 |
| 5.36 custody Activity rollup and receipt 900 | cab221a | 5/5 | 16.77 | 16.05 | 15.46 | 16.47 | 15.54 |

### What the traces establish

The first cold-load failure ends at `activity.spec.ts:32` closing a context on both revisions, after the 30-second test deadline. Its navigation-contract teardown took 101.9ms on the redesign and 151.0ms on `cab221a`; total after-hooks were 623.7ms and 1,375.8ms. The traces show navigation/accessibility work consuming the body, not a reproduced multi-minute navigation-contract teardown. There are no Row access API calls in these captures (Vite module fetches are not API calls). The baseline state-transition failure is at the same `activity.spec.ts:51` wait for “Evidence is temporarily unavailable.” as the failed gate.

These results do not establish an open handle, picker debounce, pending pagination fetch, or unresolved navigation introduced by Row access. They also do not establish the machine as the cause. The full-run RED-015/DOMAIN-002 teardown stalls and the custody first-attempt visual difference remain unexplained. No further investigation or speculative product fix follows this report.

Artifacts: `tmp/row-access-diagnosis/working-isolation.json`, `cab-isolation.json`, `isolation-summary.json`, both isolation logs, and `cold-load-trace-summary.json`. Full traces remain under `results/` and the clean export's `tmp/row-access-diagnosis/results/`.

## G-019 reporting defect and correction

The original gate printed:

> [recorded-failing] G-019: 5,000 elements stay virtualised while scrolling and keyboard navigation works: deadline exhausted; incomplete, no frame verdict or completed functional proof. Non-gating. Reinstate when measurement variance is smaller than the effect, or a person reports the console slow.

The decision recorded in `deferred.md` explicitly covers deadlines in both browser projects. The implementation was wrong: `RecordedPerformanceReporter.onEnd` returned a passed status only when **every** unexpected test was a recorded deadline. With seven other failures, that branch did not execute; G-019 retained its unexpected status and appeared among the eight failures. It was not the sole reason the gate was red, but “Non-gating” was inconsistent with the per-test classification.

The existing reporter now sets the allowed deadline's expected status to `timedOut` in `onTestEnd`, before the runner counts unexpected tests. Its actual result remains `timedOut`, its errors remain in the JSON artifact, and an annotation states that it is incomplete and proves no unfinished assertions. The reporter runs before the list/JSON reporters. The whole-run status override is removed. Other IDs, assertions, interrupted attempts and infrastructure errors retain normal runner behavior. No threshold or deadline changed; no second timeout mechanism was added.

Changed files for this investigation only:

- `e2e/recorded-performance-reporter.ts`
- `playwright.config.ts`
- `playwright.gates.config.ts`
- `playwright.performance.config.ts`
- `test/recorded-performance-reporter.test.ts`
- this report and the corresponding `deferred.md` note

Focused regression verification: `npm test -- test/recorded-performance-reporter.test.ts` passed (one integration test, 6.9s body). Its child Playwright runs verify mixed failures remain red, the recorded deadline retains raw `timedOut` status, ordinary deadlines still block, G-019 assertion failures still block, and the recorded deadline alone does not block.

Focused strict TypeScript checking of the reporter and regression test passed. `git diff --check` passed. No full gate, browser rerun, threshold change or baseline change followed.
