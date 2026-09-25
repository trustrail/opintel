# Linux visual baseline migration — 2026-09-25

## Environment and CI

Before this change, the Foundation job used ubuntu-latest, installed Chrome,
and ran `npm run test:visual` (both projects), followed by the isolated G-019
performance test. There was no Linux-specific snapshot set or normalization.
No historical CI results were available to establish that Mac baselines passed.

Local and CI runs now use `npm run test:visual:docker`, selecting the official
`mcr.microsoft.com/playwright:v1.63.0-noble` image from package-lock.json.
The image launched Chromium **153.0.8010.12**. The runner pins linux/amd64 and uses one browser worker,
a repository bind mount, and a disposable volume for Linux node_modules.
Functional and isolated performance gates remain in CI using the same runner.

## Differences beyond selects

All **54 snapshots** changed beyond native select controls. The application names
Manrope and IBM Plex Mono but does not load those fonts. A Chromium DevTools
`CSS.getPlatformFontsForNode` probe inside this image reported system fallbacks
**WenQuanYi Zen Hei** and **WenQuanYi Zen Hei Mono**, both non-custom fonts.

Consequences visible in the captures:

- Different glyph shapes, weights and rasterization throughout headings, body
  copy, tables, labels and badges.
- Changed glyph metrics alter wrapping, breadcrumb truncation, drawer row heights,
  card/table heights and some full-page image heights.
- Unicode drawer icons use different fallback glyphs; some have coloured glyph
  rendering. This is not a change to the CSS colour tokens.
- Native form controls (including select arrows and radio buttons) use Linux
  rendering. Adjacent controls can move because intrinsic widths changed.

No application markup, stylesheet, content, screenshot threshold or existing assertion was
changed for this migration. These are platform changes, not new navigation layout
requirements. Every affected image is listed below, including its old/new size.

## Snapshot inventory

All entries have the typography/fallback changes above. Shell screens additionally
have the drawer icon and row-metric changes; forms also have native-control changes.

| Snapshot | Mac size | Linux size |
|---|---|---|
| [access-1440.png](../../e2e/access.spec.ts-snapshots/access-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [access-390.png](../../e2e/access.spec.ts-snapshots/access-390.png) | 390 × 1218 | 390 × 1236 |
| [access-900.png](../../e2e/access.spec.ts-snapshots/access-900.png) | 900 × 1016 | 900 × 1016 |
| [catalog-1440.png](../../e2e/catalog.spec.ts-snapshots/catalog-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [catalog-390.png](../../e2e/catalog.spec.ts-snapshots/catalog-390.png) | 390 × 1016 | 390 × 1016 |
| [catalog-900.png](../../e2e/catalog.spec.ts-snapshots/catalog-900.png) | 900 × 1016 | 900 × 1016 |
| [custody-observations-1440.png](../../e2e/filings.spec.ts-snapshots/custody-observations-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [custody-observations-390.png](../../e2e/filings.spec.ts-snapshots/custody-observations-390.png) | 390 × 1283 | 390 × 1240 |
| [custody-observations-900.png](../../e2e/filings.spec.ts-snapshots/custody-observations-900.png) | 900 × 1016 | 900 × 1016 |
| [filings-dashboard-1440.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [filings-dashboard-390.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-390.png) | 390 × 1306 | 390 × 1289 |
| [filings-dashboard-900.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-900.png) | 900 × 1016 | 900 × 1016 |
| [filings-expanded-1440.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-1440.png) | 1440 × 1177 | 1440 × 1203 |
| [filings-expanded-390.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-390.png) | 390 × 1670 | 390 × 1671 |
| [filings-expanded-900.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-900.png) | 900 × 1334 | 900 × 1353 |
| [filings-observations-1440.png](../../e2e/filings.spec.ts-snapshots/filings-observations-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [filings-observations-390.png](../../e2e/filings.spec.ts-snapshots/filings-observations-390.png) | 390 × 1016 | 390 × 1016 |
| [filings-observations-900.png](../../e2e/filings.spec.ts-snapshots/filings-observations-900.png) | 900 × 1016 | 900 × 1016 |
| [introspection-diff-1440.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [introspection-diff-390.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-390.png) | 390 × 1270 | 390 × 1296 |
| [introspection-diff-900.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-900.png) | 900 × 1050 | 900 × 1068 |
| [introspection-history-1440.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [introspection-history-390.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-390.png) | 390 × 1016 | 390 × 1016 |
| [introspection-history-900.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-900.png) | 900 × 1016 | 900 × 1016 |
| [kitchen-sink-1440.png](../../e2e/kitchen-sink.spec.ts-snapshots/kitchen-sink-1440.png) | 1440 × 1371 | 1440 × 1397 |
| [kitchen-sink-390.png](../../e2e/kitchen-sink.spec.ts-snapshots/kitchen-sink-390.png) | 390 × 2781 | 390 × 2791 |
| [kitchen-sink-900.png](../../e2e/kitchen-sink.spec.ts-snapshots/kitchen-sink-900.png) | 900 × 1428 | 900 × 1442 |
| [sources-empty-1440.png](../../e2e/sources.spec.ts-snapshots/sources-empty-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [sources-empty-390.png](../../e2e/sources.spec.ts-snapshots/sources-empty-390.png) | 390 × 1104 | 390 × 1094 |
| [sources-empty-900.png](../../e2e/sources.spec.ts-snapshots/sources-empty-900.png) | 900 × 1016 | 900 × 1016 |
| [sources-failed-1440.png](../../e2e/sources.spec.ts-snapshots/sources-failed-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [sources-failed-390.png](../../e2e/sources.spec.ts-snapshots/sources-failed-390.png) | 390 × 1308 | 390 × 1306 |
| [sources-failed-900.png](../../e2e/sources.spec.ts-snapshots/sources-failed-900.png) | 900 × 1016 | 900 × 1016 |
| [sources-ready-1440.png](../../e2e/sources.spec.ts-snapshots/sources-ready-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [sources-ready-390.png](../../e2e/sources.spec.ts-snapshots/sources-ready-390.png) | 390 × 1064 | 390 × 1056 |
| [sources-ready-900.png](../../e2e/sources.spec.ts-snapshots/sources-ready-900.png) | 900 × 1016 | 900 × 1016 |
| [sources-wizard-1440.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-1440.png) | 1440 × 1061 | 1440 × 1087 |
| [sources-wizard-390.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-390.png) | 390 × 1639 | 390 × 1585 |
| [sources-wizard-900.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-900.png) | 900 × 1153 | 900 × 1179 |
| [chooser-1440.png](../../e2e/tenancy.spec.ts-snapshots/chooser-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [chooser-390.png](../../e2e/tenancy.spec.ts-snapshots/chooser-390.png) | 390 × 1016 | 390 × 1016 |
| [chooser-900.png](../../e2e/tenancy.spec.ts-snapshots/chooser-900.png) | 900 × 1016 | 900 × 1016 |
| [create-company-1440.png](../../e2e/tenancy.spec.ts-snapshots/create-company-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [create-company-390.png](../../e2e/tenancy.spec.ts-snapshots/create-company-390.png) | 390 × 1034 | 390 × 1021 |
| [create-company-900.png](../../e2e/tenancy.spec.ts-snapshots/create-company-900.png) | 900 × 1016 | 900 × 1016 |
| [create-project-1440.png](../../e2e/tenancy.spec.ts-snapshots/create-project-1440.png) | 1440 × 1016 | 1440 × 1016 |
| [create-project-390.png](../../e2e/tenancy.spec.ts-snapshots/create-project-390.png) | 390 × 1064 | 390 × 1053 |
| [create-project-900.png](../../e2e/tenancy.spec.ts-snapshots/create-project-900.png) | 900 × 1016 | 900 × 1016 |
| [token-key-1440.png](../../e2e/token-key.spec.ts-snapshots/token-key-1440.png) | 1440 × 1046 | 1440 × 1077 |
| [token-key-390.png](../../e2e/token-key.spec.ts-snapshots/token-key-390.png) | 390 × 1564 | 390 × 1590 |
| [token-key-900.png](../../e2e/token-key.spec.ts-snapshots/token-key-900.png) | 900 × 1131 | 900 × 1176 |
| [token-key-confirm-1440.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-1440.png) | 1440 × 1405 | 1440 × 1453 |
| [token-key-confirm-390.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-390.png) | 390 × 1995 | 390 × 2050 |
| [token-key-confirm-900.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-900.png) | 900 × 1508 | 900 × 1573 |

## Validation

- Typecheck and lint passed for the runner/configuration changes.
- The initial two-worker runs were stopped after setup/page/axe timeouts under
  local resource contention. Assertion timeouts were not raised.
- Full single-worker regeneration: **36 passed**, including the associated axe
  and keyboard checks, with no retry-only passes.
- First comparison against the regenerated set: 35 passed; Access 900 failed
  on both attempts with 1,606 differing pixels limited to an 8px top-bar shift.
  A subsequent isolated probe passed the same baseline, measuring scrollY=0
  and header top=8 before/after reset. That probe did not establish the original
  cause. Access now explicitly resets/asserts scrollY=0 before capture, matching
  the tenancy suite's declared capture origin; no baseline was changed to absorb
  the top-bar mismatch.
- Final normal CI visual command (updates disabled): **36 passed in 2.9m**,
  including axe and keyboard checks; no test passed only on retry. All 54 saved
  Linux baselines were exercised.
