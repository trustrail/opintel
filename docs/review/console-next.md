# `/next` prototype review

Stage 3 is an opt-in console over the existing API. Set `VITE_CONSOLE_NEXT=true` when starting Vite, then open `/next/projects/<project-id>/home`. The six destinations are Home, Sources, Pools, Decisions, Activity and Settings. The flag defaults off; it is a UI rollout switch, not an authorization boundary. Existing authentication and API permissions still apply.

## Dependency and brand decisions

Home uses object lists. The current catalogue read contract has column counts, not per-object source row counts. No exposure ranking has been invented. The only product visual requiring visx is **Activity’s selected-receipt diagram**, built from recorded stages with `ParentSize`, `scalePoint`, `Group` and `Text`. The product pins `@visx/responsive`, `@visx/scale`, `@visx/group` and `@visx/text` to **4.0.0**. It has no direct d3 imports and does not install hierarchy or tooltip. Revisit those packages when the treemap has a scheduled count/coverage contract and Rick has approved the exposure ordering. Stage 2’s isolated specimen package is separate from the product bundle.

The bundle serves `/third-party-notices-next.txt`, including visx, its transitive dependencies and the three self-hosted font packages. Space Grotesk, IBM Plex Sans and IBM Plex Mono are pinned to Fontsource 5.3.0. Their private CSS family aliases prevent visiting the prototype from replacing a legacy font face.

The [brand rollout record](console-brand-rollout.md) lists the exact cost and all baseline filenames. **The submitted opt-in patch affects zero existing scenarios/images; global adoption has a review inventory of 126 scenarios / 204 PNGs.** Neither `docs/opintel-master.css` nor `docs/visual-language.html` is changed by Stage 3. Prototype composition and tokens live under `#opintel-app[data-language="next"]` and use the reviewed component language. This does not schedule the global rollout.

## Implemented interaction paths

- Home: source picker, paged catalogue-derived object list, compact pool rows, actual UTC-day counts and actionable notices only when present. Column counts are labelled as columns, never rows.
- Sources: compact list and selected source; existing connection/test/introspection mechanism; Schema’s cursor-paged object/column list and existing declarations/scope-tag editor; existing Suggestions view. The connection callback opens the connected source’s Schema view. Selecting a column makes Scope tags visible.
- Pools: list beside selected pool, existing credential issuance/rotation/revocation and `authenticatedWith` agent provenance, row-access counts and a cursor-bounded row per object. Default and override entry points retain pool context. The no-row-filter count opens the filtered Decisions catalogue.
- Decisions: Columns / Rows; By name / By table; explicit current member IDs at treatment selection, existing bulk mutation and invalidation; custody is disabled without a configured provider. Object selection opens only that object’s columns. Rows uses the shared object picker, including no-default objects, the existing preview/save path and typed controls. Scope-reference execution is not introduced.
- Activity: filter/list beside selected historical receipt, a measured receipt diagram and the existing evidence/revocation controls. Microsecond receipt timestamps survive URL encoding. Absent filters are omitted rather than serialized as `undefined`.
- Settings: the six existing project areas plus Users inspection and Token key. Existing forms, permission rules and writes remain authoritative.

Paths carry project/destination; search parameters carry pool, source, object, column, view, group, filters, cursor, panel, decision history, receipt/timestamp and document scroll. History Back returns to the launching entry, with the natural list/panel parent as fallback. Changing scope does not put draft values or secrets in a URL. Destination components stay mounted during same-session navigation; row, column-treatment, declaration and scope-tag drafts also retain their scoped stores. Leaving edited work asks Stay / Keep draft / Discard. Closing or refreshing the tab warns; drafts are not durable across reload or devices. Shown-once credential dialogs retain their stricter existing lifecycle.

Lists use one bounded page at a time through existing cursor contracts; page cursors are carried in the URL. By-table member lists open on demand. Whole-list APIs retain their fetch cost; visible source rows are capped at 20 and point to Schema’s complete source selector. The receipt diagram shows at most five recorded stages and points to the full evidence details. No new aggregation, tagging, permission or draft-service API is assumed.

## Validation and review boundary

The route-coverage inventory expands from 54 to 60, deriving the six prototype paths from the destination enum. The approved history-Back exception applies only to a flagged `/next` root. Legacy breadcrumb, control, disclosure, mark, accessibility and snapshot assertions remain active.

Review captures: `tmp/review/next/index.html` (six destinations at 390, 900 and 1440); Stage 2 component page: `docs/review/console-components/index.html` and `tmp/review/console-language/index.html`.

Completed-candidate record (2026-10-14, working tree based on `b1da401`):

- `npm run check:ui` ran once, with the development Node servers stopped and no Node listeners before launch. Exit 0; total **2,604.108s (43m24s)**.
- Its `check` stage passed lint, strict typecheck and **1,838 tests / 197 files**. Stage wall time **937.205s (15m37s)**; Vitest execution **868.02s**.
- Its pinned Docker browser stage passed **407/407 tests** (281 functional, including all 27 `/next` cases, and 126 existing visual scenarios), no retries or failures reported. Stage wall time including Docker setup **1,666.903s (27m47s)**; Playwright reports **27.1m**.
- Full control conformance: **60/60 screen routes, zero distinct findings**. Existing visual baselines passed unchanged. No failure classification is needed.
- The final 18 live-data review captures have zero axe violations, page errors, visible error alerts or document overflow. Visible text uses the five approved sizes (12/14/16/24/32px). At 1440×900, Home's summary ends at 267px and the pool Row access summary at 596px. Horizontally scrollable tables retain their labelled regions.
- Focused unit checks passed **27/27**; production build passed. Draft/history/typed-override browser checks were iterated before the single completed-candidate gate.

Post-run listener inspection found development Vite/API processes on 5173/3000/3101 that had started after the initial empty-listener check, approximately when the Docker browser stage began. They were not launched by this task and were left running. The record establishes a quiet preflight, not an assertion that the host remained listener-free throughout the run.

Local evidence: `tmp/review/next/check-ui.log`, `gate-record.json`, `capture-report.json` and the review index above. The initial capture attempt was blocked by the filesystem sandbox's Chrome process restrictions (SIGABRT/EPERM); the authorized browser capture completed outside that sandbox. This was capture setup, not a gate failure.

These are review captures, not approved visual baselines. No baseline regeneration, global brand patch, commit or push was performed. Stop here for Rick's review.
