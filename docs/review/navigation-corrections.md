# Navigation corrections — 2026-09-22

## Removed screen return controls

| Screen | Removed control | Location |
|---|---|---|
| Explore schema | Data sources button | `src/app/catalog/screen.tsx`, filters |
| Token key | Back to Access link | `src/app/custody/screen.tsx`, introductory note |
| Introspection history | Data sources button | `src/app/introspection/screens.tsx`, below introduction |
| Introspection run | All source runs button | `src/app/introspection/screens.tsx`, status toolbar; now the breadcrumb parent, preserving the source id |
| Create project | Cancel navigation link to All projects | `src/app/tenancy/screens.tsx`, form footer |
| Create company | Cancel navigation link to All projects | `src/app/tenancy/screens.tsx`, form footer |
| Unavailable project dashboard | View projects link | `src/app/tenancy/screens.tsx`, unavailable-project empty state |

Operation cancellation and form dismissal remain. Source-row Runs links, failing-run links, and forward actions remain. Auth screens and shared error/empty components were also audited.

## Regression coverage

`e2e/fixtures.ts` checks every browser test’s open pages for links or buttons matching `/^(back|back to |. back)/i` outside Breadcrumb. `e2e/navigation.spec.ts` explicitly checks the screen audit, decorative disclosure directions and the mobile left chevron. Introspection tests navigate through the breadcrumb to the same source history.

No new CSS class: drawer chevrons reuse the existing label span styling and are aria-hidden; the master stylesheet changes the mobile breadcrumb prefix from an arrow to ‹.

## Changed snapshots

Relative to the preceding navigation change. Thresholds and retry settings are unchanged.

| Snapshot | Reason |
|---|---|
| [access-1440.png](../../e2e/access.spec.ts-snapshots/access-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [access-390.png](../../e2e/access.spec.ts-snapshots/access-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. |
| [access-900.png](../../e2e/access.spec.ts-snapshots/access-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [catalog-1440.png](../../e2e/catalog.spec.ts-snapshots/catalog-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. Removed the screen-level Data sources button from the filter row. |
| [catalog-390.png](../../e2e/catalog.spec.ts-snapshots/catalog-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. Removed the screen-level Data sources button from the filter row. |
| [catalog-900.png](../../e2e/catalog.spec.ts-snapshots/catalog-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. Removed the screen-level Data sources button from the filter row. |
| [custody-observations-1440.png](../../e2e/filings.spec.ts-snapshots/custody-observations-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [custody-observations-390.png](../../e2e/filings.spec.ts-snapshots/custody-observations-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. |
| [custody-observations-900.png](../../e2e/filings.spec.ts-snapshots/custody-observations-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [filings-dashboard-1440.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [filings-dashboard-390.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. |
| [filings-dashboard-900.png](../../e2e/filings.spec.ts-snapshots/filings-dashboard-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [filings-expanded-1440.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [filings-expanded-390.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. |
| [filings-expanded-900.png](../../e2e/filings.spec.ts-snapshots/filings-expanded-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [filings-observations-1440.png](../../e2e/filings.spec.ts-snapshots/filings-observations-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [filings-observations-390.png](../../e2e/filings.spec.ts-snapshots/filings-observations-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. |
| [filings-observations-900.png](../../e2e/filings.spec.ts-snapshots/filings-observations-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [introspection-diff-1440.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. Removed All source runs from the status toolbar; source history is now the breadcrumb parent. |
| [introspection-diff-390.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. Removed All source runs from the status toolbar; source history is now the breadcrumb parent. |
| [introspection-diff-900.png](../../e2e/introspection.spec.ts-snapshots/introspection-diff-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. Removed All source runs from the status toolbar; source history is now the breadcrumb parent. |
| [introspection-history-1440.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. Removed the screen-level Data sources button. |
| [introspection-history-390.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. Removed the screen-level Data sources button. |
| [introspection-history-900.png](../../e2e/introspection.spec.ts-snapshots/introspection-history-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. Removed the screen-level Data sources button. |
| [sources-empty-1440.png](../../e2e/sources.spec.ts-snapshots/sources-empty-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [sources-empty-390.png](../../e2e/sources.spec.ts-snapshots/sources-empty-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. |
| [sources-empty-900.png](../../e2e/sources.spec.ts-snapshots/sources-empty-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [sources-failed-1440.png](../../e2e/sources.spec.ts-snapshots/sources-failed-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [sources-failed-390.png](../../e2e/sources.spec.ts-snapshots/sources-failed-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. |
| [sources-failed-900.png](../../e2e/sources.spec.ts-snapshots/sources-failed-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [sources-ready-1440.png](../../e2e/sources.spec.ts-snapshots/sources-ready-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [sources-ready-390.png](../../e2e/sources.spec.ts-snapshots/sources-ready-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. |
| [sources-ready-900.png](../../e2e/sources.spec.ts-snapshots/sources-ready-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [sources-wizard-1440.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [sources-wizard-390.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. |
| [sources-wizard-900.png](../../e2e/sources.spec.ts-snapshots/sources-wizard-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. |
| [create-company-1440.png](../../e2e/tenancy.spec.ts-snapshots/create-company-1440.png) | Removed the navigation-only Cancel link from the form footer. |
| [create-company-390.png](../../e2e/tenancy.spec.ts-snapshots/create-company-390.png) | Removed the navigation-only Cancel link from the form footer. Mobile breadcrumb now uses a left chevron. |
| [create-company-900.png](../../e2e/tenancy.spec.ts-snapshots/create-company-900.png) | Removed the navigation-only Cancel link from the form footer. |
| [create-project-1440.png](../../e2e/tenancy.spec.ts-snapshots/create-project-1440.png) | Removed the navigation-only Cancel link from the form footer. |
| [create-project-390.png](../../e2e/tenancy.spec.ts-snapshots/create-project-390.png) | Removed the navigation-only Cancel link from the form footer. Mobile breadcrumb now uses a left chevron. |
| [create-project-900.png](../../e2e/tenancy.spec.ts-snapshots/create-project-900.png) | Removed the navigation-only Cancel link from the form footer. |
| [token-key-1440.png](../../e2e/token-key.spec.ts-snapshots/token-key-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. Removed Back to Access and its paragraph spacing. |
| [token-key-390.png](../../e2e/token-key.spec.ts-snapshots/token-key-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. Removed Back to Access and its paragraph spacing. |
| [token-key-900.png](../../e2e/token-key.spec.ts-snapshots/token-key-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. Removed Back to Access and its paragraph spacing. |
| [token-key-confirm-1440.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-1440.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. Removed Back to Access and its paragraph spacing. |
| [token-key-confirm-390.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-390.png) | Mobile breadcrumb prefix changes from arrow to left chevron. Removed Back to Access and its paragraph spacing. |
| [token-key-confirm-900.png](../../e2e/token-key.spec.ts-snapshots/token-key-confirm-900.png) | Decorative disclosure chevrons added to Data sources and Access drawer items. Removed Back to Access and its paragraph spacing. |

48 changed baselines. Chooser and kitchen-sink baselines are unchanged. Both 390px filings feed baselines are free of the known plum stripe.

## Validation

- Typecheck, lint and build passed.
- The update run passed all 66 browser tests, including axe and the global
  no-back-affordance checks.
- Verification without updates: 29 passed, one failed on both attempts.
  `filings-observations-390.png` differed only at x=79–81, y=66–1007:
  exactly 2826 pixels in each attempt. No retry-only passes. The clean baseline,
  threshold and retry policy were left intact.
