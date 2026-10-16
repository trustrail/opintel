# Brand rollout scheduling record

The submitted Stage 2 patch is not applied by Stage 3. Its CSS is opt-in under `#opintel-app[data-language="next"]`; the reference HTML embeds the review specimen. No existing screenshot fixture sets that attribute or captures `docs/visual-language.html`. **Applying that exact patch requires regenerating zero existing images in zero scenarios.** No visual assertion changes are required for those legacy screens; master-selector existence checks still find all their existing selectors.

Stage 3 imports isolated prototype styles only inside `/next`. This is not a global font/token rollout. It adds review captures for six destinations × three widths = 18 captures, not approved baselines. Existing baseline comparisons remain unchanged.

A separate global adoption that changes the legacy root/tokens/fonts would require reviewing and regenerating the following **126 visual scenarios / 204 committed PNG images**, then exact recaptures. Counts come from Playwright's visual-snapshots `--list` inventory and the committed snapshot directory inventory at b1da401; multiple images are produced by some scenarios. Rick schedules this separately. Not all 204 necessarily differ, but the whole affected inventory must be reviewed; only approved changed images regenerate.

| Suite | Visual scenarios | Baseline images |
|---|---:|---:|
| access.spec.ts | 3 | 3 |
| activity.spec.ts | 6 | 12 |
| catalog.spec.ts | 3 | 3 |
| dashboard.spec.ts | 3 | 9 |
| declarations.spec.ts | 3 | 3 |
| engines.spec.ts | 3 | 3 |
| entitlements.spec.ts | 6 | 6 |
| filings.spec.ts | 6 | 12 |
| grouped-entitlements.spec.ts | 3 | 3 |
| introspection.spec.ts | 9 | 12 |
| kitchen-sink.spec.ts | 3 | 3 |
| pool-agent-credentials.spec.ts | 3 | 6 |
| pool-row-access.spec.ts | 12 | 30 |
| pools.spec.ts | 3 | 15 |
| release-custody-visual.spec.ts | 6 | 21 |
| settings.spec.ts | 21 | 21 |
| shared-patterns.spec.ts | 3 | 3 |
| sources.spec.ts | 9 | 15 |
| sso-recovery.spec.ts | 3 | 3 |
| suggestions.spec.ts | 3 | 3 |
| tenancy.spec.ts | 9 | 9 |
| token-key.spec.ts | 3 | 6 |
| type-observations.spec.ts | 3 | 3 |

## Assertions and rollout cost

- `control-conformance.spec.ts` and `conformance/checker.ts`: keep master control classification, disclosure linkage/visibility, disabled/busy contrast contracts. The Stage 2 specimen's native `details` is not a product-approved disclosure; `/next` uses the existing labelled button/aria-controls pattern. No guard weakening.
- `conformance/mark-placement.ts`, VIS-003/VIS-005: preserve passive marks, uniform-list rules, and exactly one identity mark per navigation destination. `/next` uses the existing navigation marks with text; decorative marks do not become icon-only actions.
- `data-sources-redesign.spec.ts` DS-005 currently asserts 13.5px/560 text and 10px select insets. Those assertions do not change for isolated `/next`; a global rollout must explicitly approve new expected typography and spacing, not merely refresh PNGs.
- Other geometry/placement, disabled/busy, focus, accessibility and contrast checks remain assertions, not baseline files. A global rollout must audit the hard-coded computed-style expectations before running its candidate, update only approved contracts, and retain negative checker counterexamples. Tokens or snapshots do not waive them.
- All global typography changes affect wrapping, virtualised measurements, dialogs over page backgrounds and three-width captures. Keep the settled-font/paint precondition; no tolerance changes.

The sole prototype navigation assertion exception is in `e2e/fixtures.ts`: a flagged `/next` root must have exactly one shell history Back button, as approved in Stage 1. Legacy routes retain the breadcrumb-only prohibition. Treatment, control and mark assertions are unchanged. Route coverage expands from 54 to 60 destinations, deriving the six `/next` paths from their destination enum; a single visit cannot stand in for all six.

## Exact baseline file inventory for global scheduling

- `e2e/access.spec.ts-snapshots/access-1440.png`
- `e2e/access.spec.ts-snapshots/access-390.png`
- `e2e/access.spec.ts-snapshots/access-900.png`
- `e2e/activity.spec.ts-snapshots/activity-1440.png`
- `e2e/activity.spec.ts-snapshots/activity-390.png`
- `e2e/activity.spec.ts-snapshots/activity-900.png`
- `e2e/activity.spec.ts-snapshots/record-1440.png`
- `e2e/activity.spec.ts-snapshots/record-390.png`
- `e2e/activity.spec.ts-snapshots/record-900.png`
- `e2e/activity.spec.ts-snapshots/rollup-list-1440.png`
- `e2e/activity.spec.ts-snapshots/rollup-list-390.png`
- `e2e/activity.spec.ts-snapshots/rollup-list-900.png`
- `e2e/activity.spec.ts-snapshots/rollup-record-1440.png`
- `e2e/activity.spec.ts-snapshots/rollup-record-390.png`
- `e2e/activity.spec.ts-snapshots/rollup-record-900.png`
- `e2e/catalog.spec.ts-snapshots/catalog-1440.png`
- `e2e/catalog.spec.ts-snapshots/catalog-390.png`
- `e2e/catalog.spec.ts-snapshots/catalog-900.png`
- `e2e/dashboard.spec.ts-snapshots/dashboard-clean-1440.png`
- `e2e/dashboard.spec.ts-snapshots/dashboard-clean-390.png`
- `e2e/dashboard.spec.ts-snapshots/dashboard-clean-900.png`
- `e2e/dashboard.spec.ts-snapshots/dashboard-empty-1440.png`
- `e2e/dashboard.spec.ts-snapshots/dashboard-empty-390.png`
- `e2e/dashboard.spec.ts-snapshots/dashboard-empty-900.png`
- `e2e/dashboard.spec.ts-snapshots/dashboard-ready-1440.png`
- `e2e/dashboard.spec.ts-snapshots/dashboard-ready-390.png`
- `e2e/dashboard.spec.ts-snapshots/dashboard-ready-900.png`
- `e2e/declarations.spec.ts-snapshots/declarations-1440.png`
- `e2e/declarations.spec.ts-snapshots/declarations-390.png`
- `e2e/declarations.spec.ts-snapshots/declarations-900.png`
- `e2e/engines.spec.ts-snapshots/engines-1440.png`
- `e2e/engines.spec.ts-snapshots/engines-390.png`
- `e2e/engines.spec.ts-snapshots/engines-900.png`
- `e2e/entitlements.spec.ts-snapshots/entitlements-1440.png`
- `e2e/entitlements.spec.ts-snapshots/entitlements-390.png`
- `e2e/entitlements.spec.ts-snapshots/entitlements-900.png`
- `e2e/entitlements.spec.ts-snapshots/money-type-diagnostics-1440.png`
- `e2e/entitlements.spec.ts-snapshots/money-type-diagnostics-390.png`
- `e2e/entitlements.spec.ts-snapshots/money-type-diagnostics-900.png`
- `e2e/filings.spec.ts-snapshots/custody-observations-1440.png`
- `e2e/filings.spec.ts-snapshots/custody-observations-390.png`
- `e2e/filings.spec.ts-snapshots/custody-observations-900.png`
- `e2e/filings.spec.ts-snapshots/filings-dashboard-1440.png`
- `e2e/filings.spec.ts-snapshots/filings-dashboard-390.png`
- `e2e/filings.spec.ts-snapshots/filings-dashboard-900.png`
- `e2e/filings.spec.ts-snapshots/filings-expanded-1440.png`
- `e2e/filings.spec.ts-snapshots/filings-expanded-390.png`
- `e2e/filings.spec.ts-snapshots/filings-expanded-900.png`
- `e2e/filings.spec.ts-snapshots/filings-observations-1440.png`
- `e2e/filings.spec.ts-snapshots/filings-observations-390.png`
- `e2e/filings.spec.ts-snapshots/filings-observations-900.png`
- `e2e/grouped-entitlements.spec.ts-snapshots/grouped-entitlements-1440.png`
- `e2e/grouped-entitlements.spec.ts-snapshots/grouped-entitlements-390.png`
- `e2e/grouped-entitlements.spec.ts-snapshots/grouped-entitlements-900.png`
- `e2e/introspection.spec.ts-snapshots/introspection-diff-1440.png`
- `e2e/introspection.spec.ts-snapshots/introspection-diff-390.png`
- `e2e/introspection.spec.ts-snapshots/introspection-diff-900.png`
- `e2e/introspection.spec.ts-snapshots/introspection-history-1440.png`
- `e2e/introspection.spec.ts-snapshots/introspection-history-390.png`
- `e2e/introspection.spec.ts-snapshots/introspection-history-900.png`
- `e2e/introspection.spec.ts-snapshots/mapping-repair-1440.png`
- `e2e/introspection.spec.ts-snapshots/mapping-repair-390.png`
- `e2e/introspection.spec.ts-snapshots/mapping-repair-900.png`
- `e2e/introspection.spec.ts-snapshots/unsupported-types-1440.png`
- `e2e/introspection.spec.ts-snapshots/unsupported-types-390.png`
- `e2e/introspection.spec.ts-snapshots/unsupported-types-900.png`
- `e2e/kitchen-sink.spec.ts-snapshots/kitchen-sink-1440.png`
- `e2e/kitchen-sink.spec.ts-snapshots/kitchen-sink-390.png`
- `e2e/kitchen-sink.spec.ts-snapshots/kitchen-sink-900.png`
- `e2e/pool-agent-credentials.spec.ts-snapshots/agents-credential-and-legacy-1440.png`
- `e2e/pool-agent-credentials.spec.ts-snapshots/agents-credential-and-legacy-390.png`
- `e2e/pool-agent-credentials.spec.ts-snapshots/agents-credential-and-legacy-900.png`
- `e2e/pool-agent-credentials.spec.ts-snapshots/agents-credential-expanded-1440.png`
- `e2e/pool-agent-credentials.spec.ts-snapshots/agents-credential-expanded-390.png`
- `e2e/pool-agent-credentials.spec.ts-snapshots/agents-credential-expanded-900.png`
- `e2e/pool-row-access.spec.ts-snapshots/object-two-overridden-twenty-inherited-1440.png`
- `e2e/pool-row-access.spec.ts-snapshots/object-two-overridden-twenty-inherited-390.png`
- `e2e/pool-row-access.spec.ts-snapshots/object-two-overridden-twenty-inherited-900.png`
- `e2e/pool-row-access.spec.ts-snapshots/override-created-no-default-1440.png`
- `e2e/pool-row-access.spec.ts-snapshots/override-created-no-default-390.png`
- `e2e/pool-row-access.spec.ts-snapshots/override-created-no-default-900.png`
- `e2e/pool-row-access.spec.ts-snapshots/override-no-default-editor-1440.png`
- `e2e/pool-row-access.spec.ts-snapshots/override-no-default-editor-390.png`
- `e2e/pool-row-access.spec.ts-snapshots/override-no-default-editor-900.png`
- `e2e/pool-row-access.spec.ts-snapshots/picker-no-default-object-1440.png`
- `e2e/pool-row-access.spec.ts-snapshots/picker-no-default-object-390.png`
- `e2e/pool-row-access.spec.ts-snapshots/picker-no-default-object-900.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-all-unscoped-empty-1440.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-all-unscoped-empty-390.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-all-unscoped-empty-900.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-empty-1440.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-empty-390.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-empty-900.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-inherited-200-1440.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-inherited-200-390.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-inherited-200-900.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-missing-filters-1440.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-missing-filters-390.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-missing-filters-900.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-three-overrides-1440.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-three-overrides-390.png`
- `e2e/pool-row-access.spec.ts-snapshots/pool-row-three-overrides-900.png`
- `e2e/pool-row-access.spec.ts-snapshots/shared-object-picker-1440.png`
- `e2e/pool-row-access.spec.ts-snapshots/shared-object-picker-390.png`
- `e2e/pool-row-access.spec.ts-snapshots/shared-object-picker-900.png`
- `e2e/pools.spec.ts-snapshots/agent-twin-1440.png`
- `e2e/pools.spec.ts-snapshots/agent-twin-390.png`
- `e2e/pools.spec.ts-snapshots/agent-twin-900.png`
- `e2e/pools.spec.ts-snapshots/pool-detail-1440.png`
- `e2e/pools.spec.ts-snapshots/pool-detail-390.png`
- `e2e/pools.spec.ts-snapshots/pool-detail-900.png`
- `e2e/pools.spec.ts-snapshots/pools-1440.png`
- `e2e/pools.spec.ts-snapshots/pools-390.png`
- `e2e/pools.spec.ts-snapshots/pools-900.png`
- `e2e/pools.spec.ts-snapshots/revoke-1440.png`
- `e2e/pools.spec.ts-snapshots/revoke-390.png`
- `e2e/pools.spec.ts-snapshots/revoke-900.png`
- `e2e/pools.spec.ts-snapshots/shown-once-1440.png`
- `e2e/pools.spec.ts-snapshots/shown-once-390.png`
- `e2e/pools.spec.ts-snapshots/shown-once-900.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-activity-absent-1440.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-activity-absent-390.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-activity-absent-900.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-activity-present-1440.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-activity-present-390.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-activity-present-900.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-receipt-granted-1440.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-receipt-granted-390.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-receipt-granted-900.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-failed-1440.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-failed-390.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-failed-900.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-passed-1440.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-passed-390.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-passed-900.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-set-1440.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-set-390.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-set-900.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-unset-1440.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-unset-390.png`
- `e2e/release-custody-visual.spec.ts-snapshots/custody-settings-unset-900.png`
- `e2e/settings.spec.ts-snapshots/company-1440.png`
- `e2e/settings.spec.ts-snapshots/company-390.png`
- `e2e/settings.spec.ts-snapshots/company-900.png`
- `e2e/settings.spec.ts-snapshots/personal-1440.png`
- `e2e/settings.spec.ts-snapshots/personal-390.png`
- `e2e/settings.spec.ts-snapshots/personal-900.png`
- `e2e/settings.spec.ts-snapshots/settings-1440.png`
- `e2e/settings.spec.ts-snapshots/settings-390.png`
- `e2e/settings.spec.ts-snapshots/settings-900.png`
- `e2e/settings.spec.ts-snapshots/settings-agents-1440.png`
- `e2e/settings.spec.ts-snapshots/settings-agents-390.png`
- `e2e/settings.spec.ts-snapshots/settings-agents-900.png`
- `e2e/settings.spec.ts-snapshots/settings-discovery-1440.png`
- `e2e/settings.spec.ts-snapshots/settings-discovery-390.png`
- `e2e/settings.spec.ts-snapshots/settings-discovery-900.png`
- `e2e/settings.spec.ts-snapshots/settings-evidence-1440.png`
- `e2e/settings.spec.ts-snapshots/settings-evidence-390.png`
- `e2e/settings.spec.ts-snapshots/settings-evidence-900.png`
- `e2e/settings.spec.ts-snapshots/settings-query-1440.png`
- `e2e/settings.spec.ts-snapshots/settings-query-390.png`
- `e2e/settings.spec.ts-snapshots/settings-query-900.png`
- `e2e/shared-patterns.spec.ts-snapshots/shared-patterns-1440.png`
- `e2e/shared-patterns.spec.ts-snapshots/shared-patterns-390.png`
- `e2e/shared-patterns.spec.ts-snapshots/shared-patterns-900.png`
- `e2e/sources.spec.ts-snapshots/sources-active-conflict-1440.png`
- `e2e/sources.spec.ts-snapshots/sources-active-conflict-390.png`
- `e2e/sources.spec.ts-snapshots/sources-active-conflict-900.png`
- `e2e/sources.spec.ts-snapshots/sources-empty-1440.png`
- `e2e/sources.spec.ts-snapshots/sources-empty-390.png`
- `e2e/sources.spec.ts-snapshots/sources-empty-900.png`
- `e2e/sources.spec.ts-snapshots/sources-failed-1440.png`
- `e2e/sources.spec.ts-snapshots/sources-failed-390.png`
- `e2e/sources.spec.ts-snapshots/sources-failed-900.png`
- `e2e/sources.spec.ts-snapshots/sources-ready-1440.png`
- `e2e/sources.spec.ts-snapshots/sources-ready-390.png`
- `e2e/sources.spec.ts-snapshots/sources-ready-900.png`
- `e2e/sources.spec.ts-snapshots/sources-wizard-1440.png`
- `e2e/sources.spec.ts-snapshots/sources-wizard-390.png`
- `e2e/sources.spec.ts-snapshots/sources-wizard-900.png`
- `e2e/sso-recovery.spec.ts-snapshots/sso-recovery-1440.png`
- `e2e/sso-recovery.spec.ts-snapshots/sso-recovery-390.png`
- `e2e/sso-recovery.spec.ts-snapshots/sso-recovery-900.png`
- `e2e/suggestions.spec.ts-snapshots/suggestions-1440.png`
- `e2e/suggestions.spec.ts-snapshots/suggestions-390.png`
- `e2e/suggestions.spec.ts-snapshots/suggestions-900.png`
- `e2e/tenancy.spec.ts-snapshots/chooser-1440.png`
- `e2e/tenancy.spec.ts-snapshots/chooser-390.png`
- `e2e/tenancy.spec.ts-snapshots/chooser-900.png`
- `e2e/tenancy.spec.ts-snapshots/create-company-1440.png`
- `e2e/tenancy.spec.ts-snapshots/create-company-390.png`
- `e2e/tenancy.spec.ts-snapshots/create-company-900.png`
- `e2e/tenancy.spec.ts-snapshots/create-project-1440.png`
- `e2e/tenancy.spec.ts-snapshots/create-project-390.png`
- `e2e/tenancy.spec.ts-snapshots/create-project-900.png`
- `e2e/token-key.spec.ts-snapshots/token-key-1440.png`
- `e2e/token-key.spec.ts-snapshots/token-key-390.png`
- `e2e/token-key.spec.ts-snapshots/token-key-900.png`
- `e2e/token-key.spec.ts-snapshots/token-key-confirm-1440.png`
- `e2e/token-key.spec.ts-snapshots/token-key-confirm-390.png`
- `e2e/token-key.spec.ts-snapshots/token-key-confirm-900.png`
- `e2e/type-observations.spec.ts-snapshots/type-observation-1440.png`
- `e2e/type-observations.spec.ts-snapshots/type-observation-390.png`
- `e2e/type-observations.spec.ts-snapshots/type-observation-900.png`

## Exact scenario inventory

- access.spec.ts — E-009: Access keyboard, axe and snapshot at 390
- access.spec.ts — E-009: Access keyboard, axe and snapshot at 900
- access.spec.ts — E-009: Access keyboard, axe and snapshot at 1440
- activity.spec.ts — 5.12 Activity and record at 390
- activity.spec.ts — 5.12 Activity and record at 900
- activity.spec.ts — 5.12 Activity and record at 1440
- activity.spec.ts — 5.17 rollup and stored redaction at 390
- activity.spec.ts — 5.17 rollup and stored redaction at 900
- activity.spec.ts — 5.17 rollup and stored redaction at 1440
- catalog.spec.ts — schema explorer states, types and aliases at 390
- catalog.spec.ts — schema explorer states, types and aliases at 900
- catalog.spec.ts — schema explorer states, types and aliases at 1440
- dashboard.spec.ts — O-004 dashboard findings and quiet states at 390
- dashboard.spec.ts — O-004 dashboard findings and quiet states at 900
- dashboard.spec.ts — O-004 dashboard findings and quiet states at 1440
- declarations.spec.ts — DECL-009: declaration panel at 390
- declarations.spec.ts — DECL-009: declaration panel at 900
- declarations.spec.ts — DECL-009: declaration panel at 1440
- engines.spec.ts — ENG-007 engines at 390
- engines.spec.ts — ENG-007 engines at 900
- engines.spec.ts — ENG-007 engines at 1440
- entitlements.spec.ts — Entitlements tree and bulk bar at 390
- entitlements.spec.ts — Entitlements tree and bulk bar at 900
- entitlements.spec.ts — Entitlements tree and bulk bar at 1440
- entitlements.spec.ts — Money locale and unsupported diagnosis at 390
- entitlements.spec.ts — Money locale and unsupported diagnosis at 900
- entitlements.spec.ts — Money locale and unsupported diagnosis at 1440
- filings.spec.ts — ING-27/29: source filings and quarantine surfaces at 390
- filings.spec.ts — ING-27/29: source filings and quarantine surfaces at 900
- filings.spec.ts — ING-27/29: source filings and quarantine surfaces at 1440
- filings.spec.ts — TOK-28: custody observations at 390
- filings.spec.ts — TOK-28: custody observations at 900
- filings.spec.ts — TOK-28: custody observations at 1440
- grouped-entitlements.spec.ts — Grouped entitlements at 390
- grouped-entitlements.spec.ts — Grouped entitlements at 900
- grouped-entitlements.spec.ts — Grouped entitlements at 1440
- introspection.spec.ts — G-003 to G-009: run diff and history at 390
- introspection.spec.ts — G-003 to G-009: run diff and history at 900
- introspection.spec.ts — G-003 to G-009: run diff and history at 1440
- introspection.spec.ts — Mapping repair diff at 390
- introspection.spec.ts — Mapping repair diff at 900
- introspection.spec.ts — Mapping repair diff at 1440
- introspection.spec.ts — unsupported types are distinct findings at 390
- introspection.spec.ts — unsupported types are distinct findings at 900
- introspection.spec.ts — unsupported types are distinct findings at 1440
- kitchen-sink.spec.ts — O-009: kitchen sink visual snapshot at 390px
- kitchen-sink.spec.ts — O-009: kitchen sink visual snapshot at 900px
- kitchen-sink.spec.ts — O-009: kitchen sink visual snapshot at 1440px
- pool-agent-credentials.spec.ts — CRED-008 agents credential and legacy provenance at 390
- pool-agent-credentials.spec.ts — CRED-008 agents credential and legacy provenance at 900
- pool-agent-credentials.spec.ts — CRED-008 agents credential and legacy provenance at 1440
- pool-row-access.spec.ts — ROW-SCALE empty, overrides and missing filters at 390
- pool-row-access.spec.ts — ROW-SCALE inherited pagination and shared picker at 390
- pool-row-access.spec.ts — ROW-SCALE object pool statuses at 390
- pool-row-access.spec.ts — ROW-SCALE empty, overrides and missing filters at 900
- pool-row-access.spec.ts — ROW-SCALE inherited pagination and shared picker at 900
- pool-row-access.spec.ts — ROW-SCALE object pool statuses at 900
- pool-row-access.spec.ts — ROW-SCALE empty, overrides and missing filters at 1440
- pool-row-access.spec.ts — ROW-SCALE inherited pagination and shared picker at 1440
- pool-row-access.spec.ts — ROW-SCALE object pool statuses at 1440
- pool-row-access.spec.ts — ROW-SCALE no row filter discovery and no-default override at 390
- pool-row-access.spec.ts — ROW-SCALE no row filter discovery and no-default override at 900
- pool-row-access.spec.ts — ROW-SCALE no row filter discovery and no-default override at 1440
- pools.spec.ts — 5.14 Pools, detail, twin and key dialogs at 390
- pools.spec.ts — 5.14 Pools, detail, twin and key dialogs at 900
- pools.spec.ts — 5.14 Pools, detail, twin and key dialogs at 1440
- release-custody-visual.spec.ts — 5.36 custody Settings states 390
- release-custody-visual.spec.ts — 5.36 custody Activity rollup and receipt 390
- release-custody-visual.spec.ts — 5.36 custody Settings states 900
- release-custody-visual.spec.ts — 5.36 custody Activity rollup and receipt 900
- release-custody-visual.spec.ts — 5.36 custody Settings states 1440
- release-custody-visual.spec.ts — 5.36 custody Activity rollup and receipt 1440
- settings.spec.ts — Q-038 settings surface at 390
- settings.spec.ts — Q-038 settings-discovery surface at 390
- settings.spec.ts — Q-038 settings-query surface at 390
- settings.spec.ts — Q-038 settings-evidence surface at 390
- settings.spec.ts — Q-038 settings-agents surface at 390
- settings.spec.ts — Q-038 company surface at 390
- settings.spec.ts — Q-038 personal surface at 390
- settings.spec.ts — Q-038 settings surface at 900
- settings.spec.ts — Q-038 settings-discovery surface at 900
- settings.spec.ts — Q-038 settings-query surface at 900
- settings.spec.ts — Q-038 settings-evidence surface at 900
- settings.spec.ts — Q-038 settings-agents surface at 900
- settings.spec.ts — Q-038 company surface at 900
- settings.spec.ts — Q-038 personal surface at 900
- settings.spec.ts — Q-038 settings surface at 1440
- settings.spec.ts — Q-038 settings-discovery surface at 1440
- settings.spec.ts — Q-038 settings-query surface at 1440
- settings.spec.ts — Q-038 settings-evidence surface at 1440
- settings.spec.ts — Q-038 settings-agents surface at 1440
- settings.spec.ts — Q-038 company surface at 1440
- settings.spec.ts — Q-038 personal surface at 1440
- shared-patterns.spec.ts — RED-004: shared patterns snapshot at 390px
- shared-patterns.spec.ts — RED-004: shared patterns snapshot at 900px
- shared-patterns.spec.ts — RED-004: shared patterns snapshot at 1440px
- sources.spec.ts — Data sources ready, empty and wizard at 390
- sources.spec.ts — Data sources ready, empty and wizard at 900
- sources.spec.ts — Data sources ready, empty and wizard at 1440
- sources.spec.ts — renders the persisted safe provisioning failure unchanged at 390
- sources.spec.ts — renders the persisted safe provisioning failure unchanged at 900
- sources.spec.ts — renders the persisted safe provisioning failure unchanged at 1440
- sources.spec.ts — active-run refusal names and links the run at 390
- sources.spec.ts — active-run refusal names and links the run at 900
- sources.spec.ts — active-run refusal names and links the run at 1440
- sso-recovery.spec.ts — 5.19 administrator recovery at 390
- sso-recovery.spec.ts — 5.19 administrator recovery at 900
- sso-recovery.spec.ts — 5.19 administrator recovery at 1440
- suggestions.spec.ts — @visual SUG-006: suggestion review 390
- suggestions.spec.ts — @visual SUG-006: suggestion review 900
- suggestions.spec.ts — @visual SUG-006: suggestion review 1440
- tenancy.spec.ts — E2-022: chooser keyboard, axe and snapshot at 390
- tenancy.spec.ts — E2-022: chooser keyboard, axe and snapshot at 900
- tenancy.spec.ts — E2-022: chooser keyboard, axe and snapshot at 1440
- tenancy.spec.ts — E2-022: create-project keyboard, axe and snapshot at 390
- tenancy.spec.ts — E2-022: create-project keyboard, axe and snapshot at 900
- tenancy.spec.ts — E2-022: create-project keyboard, axe and snapshot at 1440
- tenancy.spec.ts — E2-022: create-company keyboard, axe and snapshot at 390
- tenancy.spec.ts — E2-022: create-company keyboard, axe and snapshot at 900
- tenancy.spec.ts — E2-022: create-company keyboard, axe and snapshot at 1440
- token-key.spec.ts — K7: token key and confirmation at 390
- token-key.spec.ts — K7: token key and confirmation at 900
- token-key.spec.ts — K7: token key and confirmation at 1440
- type-observations.spec.ts — unmapped source observation at 390
- type-observations.spec.ts — unmapped source observation at 900
- type-observations.spec.ts — unmapped source observation at 1440
