# Rendered control conformance

## Changes authorized and written

The preceding markup work was already on disk: Observations and Migrate industry
use `.toolchip` buttons with `aria-expanded` and `aria-controls`; migration uses
`.sheetb`, `.fld` and an `.inp` select. Their state is in adjacent Zustand files.
The earlier change added the approved disabled/busy `.btn` rules to the master,
scoped ING-29's loading locator to the Needs a decision region, and added the
checker. A follow-up replaces the Access and Dashboard native disclosures with
the existing `.toolchip` pattern, adds the missing controlled targets for
Entitlements' View DDL and Data Sources' filing rows, and adds focused ARIA
assertions for those controls.

## How the gate works

Run `npm run test:conformance`. `playwright.conformance.config.ts` runs the full
non-performance browser suite, including visual-tagged scenarios, without
comparing or rewriting screenshots. Normal visual tests remain unchanged.

`e2e/conformance/checker.ts` classifies rendered buttons, inputs, selects,
textareas and interactive roles against explicit master patterns. It also rejects
native disclosures. A known utility class does not qualify. Ancestor patterns
qualify only their intended control kind: `.fld input` does not authorize an
unstyled select or checkbox. Every registered pattern is checked against the
parsed master stylesheet. An unclassified control fails the test.

The shared fixture observes committed DOM changes, including loading/pending
states, dialogs, hidden-panel controls, removed controls and closed pages.
Findings carry the screen path, control name, structural markup and reason.
Input values are not collected. While navigation replaces an outgoing screen,
findings remain attributed to its content rather than immediately adopting the
new history URL. Every application browser test must use the shared fixture;
only the checker counterexamples use the base fixture.

Disclosures require state, a valid controlled target and matching visibility.
The drawer is a documented distinct pattern: collapsing it preserves the icons,
so `.dtoggle` is checked against `.shell.collapsed`, not whether the whole drawer
is hidden. A dedicated positive/negative proof covers this distinction.

The reporter derives required paths from router literals, explicit screen
branches and drawer destinations. It fails if any screen is unvisited, including
retained placeholder/legacy routes. This is route coverage, not a claim to have
exhausted every data combination. Feature browser fixtures exercise their
loading, empty, error, ready and interactive states. The report includes the
observed states. Performance runs do not install the observer.

Counterexamples reproduce the original unstyled native disclosures and migration
select, plus a utility-only button and raw range input. Valid ancestor selectors,
checkboxes, radios and button disclosures must pass. Missing state/targets and
visibility mismatches must fail. Computed-style assertions verify disabled and
busy buttons for primary, green and ghost variants, including hover, and disabled
checkbox/radio accent contrast without opacity reduction.

This is a conformance gate, not a screenshot replacement. It cannot establish
that spacing, clipping or alignment is correct. New control patterns must be
reviewed against the master; an unknown kind never passes automatically.

## Findings and verification

The initial all-screen report is generated at `test-results/control-conformance.json`.
Initial audit run (2026-10-03): **50/50 screen-route patterns visited**, including
legacy/placeholder destinations; no coverage omissions. **176 scenarios: 110
passed, 64 failed only on conformance, and 2 failed on separate existing navigation
assertions/fixtures.** The gate is red; findings are not suppressed or allowlisted.
There are 22 distinct control/state reports, not 22 distinct implementation sites:
`details` and `summary` each report, View DDL reports both states, and repeated
filing/choice controls report their concrete instances.

| Screen | Finding | Implementation site |
|---|---|---|
| Access | Native Authorization trace `details` / `summary` — fixed with `.toolchip` disclosure | `src/app/access/screen.tsx` |
| Dashboard | Native Local resolution instructions and per-source treatment-count disclosures — fixed with `.toolchip` disclosures | `src/app/dashboard/screen.tsx` |
| Entitlements | View DDL lacked `aria-controls` — now names its persistent controlled target | `src/app/entitlements/screen.tsx` |
| Data sources | Filing buttons named targets absent while collapsed — collapsed rows now remain present and hidden | `src/app/sources/screen.tsx` |
| Data sources | Source-wizard schema, sampling and receives-landings checkboxes had no matching master pattern — fixed by the approved native checkbox rule | `src/app/sources/screen.tsx` |
| Company settings | Enforce SSO was an unclassified native checkbox — fixed by the approved native checkbox rule | `src/app/settings/screens.tsx`, `CompanyForm` |
| Personal settings | Reduce motion was an unclassified native checkbox — fixed by the approved native checkbox rule | `src/app/settings/screens.tsx`, `PersonalForm` |
| Create project | Industry choices were unclassified native radios; `.dcard` did not style them — fixed by the approved native radio rule | `src/app/tenancy/screens.tsx` |
| Create company | Industry choices, including No default industry, were unclassified native radios — fixed by the approved native radio rule | `src/app/tenancy/screens.tsx` |

The changed Observations disclosure and Migrate industry form had no conformance
findings in the initial audit.

The two navigation failures were not styling failures. Both are now corrected:

1. `drawer destinations, keyboard order, collapsed state and scoped breadcrumbs`
   expects the company breadcrumb to open `/projects?companyId=…`. The current
   shell opens `/companies/:id/settings`, matching §5.5's company-scope contract.
   The expectation predated 5.16, when company settings became the company-scope
   destination. The test now checks `/companies/:id/settings`, then separately
   visits the company-filtered project chooser for its filter assertions.
2. `screens have no ad-hoc back links or buttons outside Breadcrumb: settings`
   supplies the generic `{items: [], nextCursor: null}` response for the project
   settings endpoint. That does not satisfy `{settings: ...}`, so the screen
   renders a read error rather than the heading the test expects. The API,
   repository and screen agree on `{settings: ...}`: the route declares
   `ProjectSettingsView`, the repository parses the `settings` column into that
   view, and the screen validates `ProjectSettingsView`. The fixture now returns
   that shape instead of a generic paginated list.

Independent verification: **5/5 passed** — the scoped ING-29 loading/error/retry
test plus the four checker/style/coverage-fixture proofs, under the ordinary
functional project with output isolated from the full audit. Strict application
typecheck, strict checker typecheck, lint, production build and `git diff --check`
pass. The build retains its existing large-chunk warning. No screenshots were
updated by this work; the conformance command explicitly leaves screenshot
comparison to the normal visual gate.

Follow-up verification (2026-10-03): the focused Access, Dashboard,
Entitlements, Data Sources and filing functional suites pass **23/23 tests**.
After the group 2 and 3 changes, the focused navigation and control-conformance
suites pass **25/25 tests**. The final full conformance run passes **176/176
scenarios**, visits **50/50 screen routes**, and reports **0 distinct findings**.
Typecheck, lint and `git diff --check` pass. The master now
has checkbox and radio rules using existing tokens, including disabled
`--ink-3` accent colour without opacity reduction, and the checker classifies
both input kinds against those rules. The stale breadcrumb expectation and
malformed Settings fixture are fixed. The initial full-run attempt exposed a
checker defect: comma-grouped stylesheet selectors were compared as one string.
The checker now registers each selector from the group independently. The
successful final audit has no suppression entries.
