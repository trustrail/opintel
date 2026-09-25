# Navigation snapshot changes — 2026-09-22

Each baseline below changed for the requested drawer, breadcrumb or company-filter UI. Screenshot thresholds and retry settings are unchanged. Kitchen-sink baselines are unchanged.

## Master stylesheet rules

No new CSS class was introduced. All added rules are in `docs/opintel-master.css`:

- `.dnav button[data-active="true"]`: highlight the active parent section with existing surface, plum and green tokens.
- `.dnav ul`, `ul[hidden]`, `.collapsed .dnav ul`: reset nested lists and hide inactive/collapsed sub-items.
- `.dnav li a`, `:hover`, `[aria-current="page"]`, `:focus-visible`: indent sub-items and provide hover, active and keyboard-focus states using existing tokens.
- `.crumbs ol`, `.crumbs li`: ordered-list layout without list markers; existing spacing and typography.
- `.crumbs a`, `:hover`, `:focus-visible`, `.crumbs .cur`: scope links, focus indicators and truncation.
- At the existing 820px breakpoint: hide nested drawer lists and all breadcrumb items except the parent; give the parent a back arrow. A root page with no parent has no back link.

## Changed baselines

| Snapshot | Reason |
|---|---|
| [access-1440.png](../../e2e/access.spec.ts-snapshots/access-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Manage token key link removed. Token key sub-item appears under Access. |
| [access-390.png](../../e2e/access.spec.ts-snapshots/access-390.png) | Parent-only back-link breadcrumb. Inline Manage token key link removed. |
| [access-900.png](../../e2e/access.spec.ts-snapshots/access-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Manage token key link removed. Token key sub-item appears under Access. |
| [catalog-1440.png](../../e2e/catalog.spec.ts-snapshots/catalog-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Data sources is the active drawer section. Explore schema sub-item and Data sources breadcrumb segment appear. |
| [catalog-390.png](../../e2e/catalog.spec.ts-snapshots/catalog-390.png) | Parent-only back-link breadcrumb. Data sources is the active drawer section. |
| [catalog-900.png](../../e2e/catalog.spec.ts-snapshots/catalog-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Data sources is the active drawer section. Explore schema sub-item and Data sources breadcrumb segment appear. |
| [custody-observations-1440.png](../../e2e/filings.spec.ts-snapshots/custody-observations-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. |
| [custody-observations-390.png](../../e2e/filings.spec.ts-snapshots/custody-observations-390.png) | Parent-only back-link breadcrumb. |
| [custody-observations-900.png](../../e2e/filings.spec.ts-snapshots/custody-observations-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. |
| [filings-dashboard-1440.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. |
| [filings-dashboard-390.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-390.png) | Parent-only back-link breadcrumb. |
| [filings-dashboard-900.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. |
| [filings-expanded-1440.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Explore schema link removed. Explore schema sub-item appears under Data sources. |
| [filings-expanded-390.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-390.png) | Parent-only back-link breadcrumb. Inline Explore schema link removed. |
| [filings-expanded-900.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Explore schema link removed. Explore schema sub-item appears under Data sources. |
| [filings-observations-1440.png](../../e2e/filings.spec.ts-snapshots/filings-observations-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. |
| [filings-observations-390.png](../../e2e/filings.spec.ts-snapshots/filings-observations-390.png) | Parent-only back-link breadcrumb. |
| [filings-observations-900.png](../../e2e/filings.spec.ts-snapshots/filings-observations-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. |
| [introspection-diff-1440.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Data sources is the breadcrumb parent. Explore schema sub-item appears in the active Data sources section. |
| [introspection-diff-390.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-390.png) | Parent-only back-link breadcrumb. Data sources is the breadcrumb parent. |
| [introspection-diff-900.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Data sources is the breadcrumb parent. Explore schema sub-item appears in the active Data sources section. |
| [introspection-history-1440.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Data sources is the breadcrumb parent. Explore schema sub-item appears in the active Data sources section. |
| [introspection-history-390.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-390.png) | Parent-only back-link breadcrumb. Data sources is the breadcrumb parent. |
| [introspection-history-900.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Data sources is the breadcrumb parent. Explore schema sub-item appears in the active Data sources section. |
| [sources-empty-1440.png](../../e2e/sources.spec.ts-snapshots/sources-empty-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Explore schema link removed. Explore schema sub-item appears under Data sources. |
| [sources-empty-390.png](../../e2e/sources.spec.ts-snapshots/sources-empty-390.png) | Parent-only back-link breadcrumb. Inline Explore schema link removed. |
| [sources-empty-900.png](../../e2e/sources.spec.ts-snapshots/sources-empty-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Explore schema link removed. Explore schema sub-item appears under Data sources. |
| [sources-failed-1440.png](../../e2e/sources.spec.ts-snapshots/sources-failed-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Explore schema link removed. Explore schema sub-item appears under Data sources. |
| [sources-failed-390.png](../../e2e/sources.spec.ts-snapshots/sources-failed-390.png) | Parent-only back-link breadcrumb. Inline Explore schema link removed. |
| [sources-failed-900.png](../../e2e/sources.spec.ts-snapshots/sources-failed-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Explore schema link removed. Explore schema sub-item appears under Data sources. |
| [sources-ready-1440.png](../../e2e/sources.spec.ts-snapshots/sources-ready-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Explore schema link removed. Explore schema sub-item appears under Data sources. |
| [sources-ready-390.png](../../e2e/sources.spec.ts-snapshots/sources-ready-390.png) | Parent-only back-link breadcrumb. Inline Explore schema link removed. |
| [sources-ready-900.png](../../e2e/sources.spec.ts-snapshots/sources-ready-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Explore schema link removed. Explore schema sub-item appears under Data sources. |
| [sources-wizard-1440.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Explore schema link removed. Explore schema sub-item appears under Data sources. |
| [sources-wizard-390.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-390.png) | Parent-only back-link breadcrumb. Inline Explore schema link removed. |
| [sources-wizard-900.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Inline Explore schema link removed. Explore schema sub-item appears under Data sources. |
| [chooser-1440.png](../../e2e/tenancy.spec.ts-snapshots/chooser-1440.png) | Company filter added above the project cards. |
| [chooser-390.png](../../e2e/tenancy.spec.ts-snapshots/chooser-390.png) | Company filter added above the project cards. Root has no parent back link at this width. |
| [chooser-900.png](../../e2e/tenancy.spec.ts-snapshots/chooser-900.png) | Company filter added above the project cards. |
| [create-company-1440.png](../../e2e/tenancy.spec.ts-snapshots/create-company-1440.png) | All projects ancestor link added to the ordered breadcrumb. |
| [create-company-390.png](../../e2e/tenancy.spec.ts-snapshots/create-company-390.png) | All projects parent back link. |
| [create-company-900.png](../../e2e/tenancy.spec.ts-snapshots/create-company-900.png) | All projects ancestor link added to the ordered breadcrumb. |
| [create-project-1440.png](../../e2e/tenancy.spec.ts-snapshots/create-project-1440.png) | All projects ancestor link added to the ordered breadcrumb. |
| [create-project-390.png](../../e2e/tenancy.spec.ts-snapshots/create-project-390.png) | All projects parent back link. |
| [create-project-900.png](../../e2e/tenancy.spec.ts-snapshots/create-project-900.png) | All projects ancestor link added to the ordered breadcrumb. |
| [token-key-1440.png](../../e2e/token-key.spec.ts-snapshots/token-key-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Access is the breadcrumb parent. Token key is highlighted under Access in the drawer. |
| [token-key-390.png](../../e2e/token-key.spec.ts-snapshots/token-key-390.png) | Parent-only back-link breadcrumb. Access is the breadcrumb parent. |
| [token-key-900.png](../../e2e/token-key.spec.ts-snapshots/token-key-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Access is the breadcrumb parent. Token key is highlighted under Access in the drawer. |
| [token-key-confirm-1440.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-1440.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Access is the breadcrumb parent. Token key is highlighted under Access in the drawer. |
| [token-key-confirm-390.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-390.png) | Parent-only back-link breadcrumb. Access is the breadcrumb parent. |
| [token-key-confirm-900.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-900.png) | Linked scope breadcrumb with ordered-list spacing and link typography. Access is the breadcrumb parent. Token key is highlighted under Access in the drawer. |

51 baselines changed. The known stripe rectangle (x=79–81, y=66–1007) contains no plum artifact in either updated 390px filings Dashboard or Observations capture.

## Validation

- Typecheck, lint and build passed.
- All 65 browser tests passed during the update run, including axe checks and
  the new keyboard, collapsed drawer, breadcrumb and company-filter tests.
- Verification without update mode: 35 visual tests passed; the 390px filings
  test failed on both attempts at the Observations snapshot. Both diffs contain
  only the known 2826-pixel stripe at x=79–81, y=66–1007. No retry-only passes.
  The clean baseline and retry policy remain unchanged; recurrence is recorded
  in `deferred.md`.
