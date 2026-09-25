# Drawer disclosure buttons — 2026-09-22

The old implementation used two glyphs (`›` and `⌄`). It also inherited the parent navigation button’s active colour and font weight, making the open glyph brighter and heavier.

The label and disclosure are now sibling buttons. The disclosure uses one `›` rotated 90 degrees, fixed `var(--rule-2)` colour and font weight 500 in either state (including hover). No new CSS class was added; the master stylesheet owns the row, disclosure, rotation and collapsed visibility rules.

`useShellUi.sections` stores manual overrides per section. The active section is expanded by default unless overridden. Label clicks navigate; disclosure clicks, Enter and Space only toggle. Accessible names are Show/Hide sub-items of X, with aria-expanded and aria-controls. Collapsed drawers omit the disclosure controls and keep the original single-button layout.

## Changed snapshots

Every changed baseline is listed below; mobile, chooser, creation-form and kitchen-sink baselines remain byte-for-byte unchanged. No threshold or retry changes.

| Snapshot | Reason |
|---|---|
| [access-1440.png](../../e2e/access.spec.ts-snapshots/access-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [access-900.png](../../e2e/access.spec.ts-snapshots/access-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [catalog-1440.png](../../e2e/catalog.spec.ts-snapshots/catalog-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [catalog-900.png](../../e2e/catalog.spec.ts-snapshots/catalog-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [custody-observations-1440.png](../../e2e/filings.spec.ts-snapshots/custody-observations-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [custody-observations-900.png](../../e2e/filings.spec.ts-snapshots/custody-observations-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [filings-dashboard-1440.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [filings-dashboard-900.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [filings-expanded-1440.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [filings-expanded-900.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [filings-observations-1440.png](../../e2e/filings.spec.ts-snapshots/filings-observations-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [filings-observations-900.png](../../e2e/filings.spec.ts-snapshots/filings-observations-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [introspection-diff-1440.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [introspection-diff-900.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [introspection-history-1440.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [introspection-history-900.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [sources-empty-1440.png](../../e2e/sources.spec.ts-snapshots/sources-empty-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [sources-empty-900.png](../../e2e/sources.spec.ts-snapshots/sources-empty-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [sources-failed-1440.png](../../e2e/sources.spec.ts-snapshots/sources-failed-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [sources-failed-900.png](../../e2e/sources.spec.ts-snapshots/sources-failed-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [sources-ready-1440.png](../../e2e/sources.spec.ts-snapshots/sources-ready-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [sources-ready-900.png](../../e2e/sources.spec.ts-snapshots/sources-ready-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [sources-wizard-1440.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [sources-wizard-900.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [token-key-1440.png](../../e2e/token-key.spec.ts-snapshots/token-key-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [token-key-900.png](../../e2e/token-key.spec.ts-snapshots/token-key-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [token-key-confirm-1440.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-1440.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |
| [token-key-confirm-900.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-900.png) | Drawer chevrons now occupy separate sibling toggle buttons with fixed colour/weight and a single rotated glyph; the navigation highlight covers the label control. |

28 baselines changed.

## Validation

- Typecheck, lint and build passed; axe passed in the browser checks.
- Final navigation run: 20 passed, including keyboard toggling, unchanged URL,
  remembered overrides, sibling controls and computed icon colour/rotation.
- Snapshot verification: 35 passed on the first attempt; the 390px filings
  test passed on its single retry. Its first Observations diff was exactly the
  known 2826-pixel stripe, with no differences outside x=79–81, y=66–1007.
- The old combined 17-screen audit timed out during concurrent checks. It was
  split into individual cases with unchanged assertions and timeout; all passed.
- An artifact-bearing mobile capture from the update run was discarded. The
  final mobile baseline matches its pre-change SHA-256 hash exactly. No
  screenshot threshold or retry-policy changes were made.
