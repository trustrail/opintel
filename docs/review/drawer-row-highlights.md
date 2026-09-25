# Unified drawer row highlights — 2026-09-22

The label and chevron were already inside the same row. Separate button hover backgrounds and a label-only active background caused the split.

The existing row now owns hover, focus-within and active backgrounds, the active border, and label emphasis. Both sibling controls stay transparent; the chevron has no hover background and retains its fixed colour. Keyboard focus rings remain on the focused control. Navigation, toggling and drawer state are unchanged. No CSS class was added; all styling changes are in the master stylesheet.

## Changed snapshots

Each baseline below extends the active section background behind its chevron. Mobile and all other baselines remain byte-for-byte unchanged from the start of this change. No thresholds or retry settings changed.

| Snapshot | Reason |
|---|---|
| [access-1440.png](../../e2e/access.spec.ts-snapshots/access-1440.png) | The active Access row background now spans both label and chevron. |
| [access-900.png](../../e2e/access.spec.ts-snapshots/access-900.png) | The active Access row background now spans both label and chevron. |
| [catalog-1440.png](../../e2e/catalog.spec.ts-snapshots/catalog-1440.png) | The active Data sources row background now spans both label and chevron. |
| [catalog-900.png](../../e2e/catalog.spec.ts-snapshots/catalog-900.png) | The active Data sources row background now spans both label and chevron. |
| [filings-expanded-1440.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-1440.png) | The active Data sources row background now spans both label and chevron. |
| [filings-expanded-900.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-900.png) | The active Data sources row background now spans both label and chevron. |
| [introspection-diff-1440.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-1440.png) | The active Data sources row background now spans both label and chevron. |
| [introspection-diff-900.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-900.png) | The active Data sources row background now spans both label and chevron. |
| [introspection-history-1440.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-1440.png) | The active Data sources row background now spans both label and chevron. |
| [introspection-history-900.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-900.png) | The active Data sources row background now spans both label and chevron. |
| [sources-empty-1440.png](../../e2e/sources.spec.ts-snapshots/sources-empty-1440.png) | The active Data sources row background now spans both label and chevron. |
| [sources-empty-900.png](../../e2e/sources.spec.ts-snapshots/sources-empty-900.png) | The active Data sources row background now spans both label and chevron. |
| [sources-failed-1440.png](../../e2e/sources.spec.ts-snapshots/sources-failed-1440.png) | The active Data sources row background now spans both label and chevron. |
| [sources-failed-900.png](../../e2e/sources.spec.ts-snapshots/sources-failed-900.png) | The active Data sources row background now spans both label and chevron. |
| [sources-ready-1440.png](../../e2e/sources.spec.ts-snapshots/sources-ready-1440.png) | The active Data sources row background now spans both label and chevron. |
| [sources-ready-900.png](../../e2e/sources.spec.ts-snapshots/sources-ready-900.png) | The active Data sources row background now spans both label and chevron. |
| [sources-wizard-1440.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-1440.png) | The active Data sources row background now spans both label and chevron. |
| [sources-wizard-900.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-900.png) | The active Data sources row background now spans both label and chevron. |
| [token-key-1440.png](../../e2e/token-key.spec.ts-snapshots/token-key-1440.png) | The active Access row background now spans both label and chevron. |
| [token-key-900.png](../../e2e/token-key.spec.ts-snapshots/token-key-900.png) | The active Access row background now spans both label and chevron. |
| [token-key-confirm-1440.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-1440.png) | The active Access row background now spans both label and chevron. |
| [token-key-confirm-900.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-900.png) | The active Access row background now spans both label and chevron. |

22 baselines changed.

## Validation

- Typecheck and lint passed.
- Three focused navigation tests passed, including axe, independent navigation/toggling, unified hover and focus-within, and control-local focus rings.
- Final visual verification: 14 tests passed, including axe; none needed a retry.
- Every changed image differs by exactly 1,116 pixels in the chevron background: x=218–253, y=393–423 for Data sources or y=636–666 for Access. No content or layout pixels changed elsewhere.
