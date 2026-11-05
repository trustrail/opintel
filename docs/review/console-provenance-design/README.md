# CONSOLE-04b — provenance and custody presentation

Branch: `fix/console-provenance-design`. No backend, migration, permission,
receipt-write or provenance-API changes.

## Evidence

The committed capture harness uses isolated database fixtures, real receipt,
provenance, pool, catalog and settings routes, the production console build,
and the pinned Playwright container. It creates new fixture records; it never
edits issued receipts. The XQ settings screenshots use unconfigured fixture
provider metadata, with no external XQ call or real credentials.

`capture.json` records each screenshot, HTTP responses, page errors, viewport
and overflow, and the measured identifier touch targets. Screenshots cover
1440 and 390 px in both themes, including served custody, refused and historical
provenance; request and custody details; custody rows and empty state; Access,
Agents & people and agent detail, credentials, Catalog, theme menu, Custody
settings and its credential editor, Query limits and its editor.

## Changes

- Six fixed provenance disclosure rows replace the field dump. Human summaries,
  kind icons, recorded/not-recorded/refused/release-state badges and explicit
  historical gaps remain in order. Details use named definition rows, recorded
  timezone-aware times and individually copyable IDs. Query limits are named
  fields rather than a JSON blob. Redeemed retains the existing K2-only meaning.
- Detail opens in a dialog on desktop and the existing bottom-sheet surface on
  phone. Open receipt is the primary action. Existing entity links remain.
- Custody uses the credential list gutters with a fixed grid, column treatment
  chips, recorded identity, release-state badge and issued/expiry times. Revoke
  is admin-only, in the menu, with a consequence confirmation. Provenance is in
  the same menu. Revocation invalidates project release lists, provenance and
  Activity receipts through their key factories. Empty lists use the extracted shared empty component.
- The approved CopyName identifier variant keeps the full copy/tooltip value,
  single-line monospace ellipsis, keyboard focus and at least 44 px targets.
  Shared row, badge, definition-list and sheet components reuse console tokens.
- Sweep: remove the extra binding timestamp from the agent list's credential
  column; the credential name and binding labels remain visible, and full
  binding details remain in the panel. The panel uses the existing truncated
  value wrapper and a full metadata tooltip, fixing phone
  overflow from its identity field. Credential summaries keep the primary certificate
  and state while leaving secondary binding details to the panel. Settings
  editor footers use the shared action layout, including touch-sized Cancel.
  Credential-check explanation is on Check and save as a tooltip. Access and
  Catalog retain full catalogue names with their existing copy controls. Theme
  control and required query limits retain their established behaviour.

Current pool names are fetched only for display context, explicitly identified
as current on hover. They are not presented as recorded historical names.
Missing historical certificate, credential kind/label, engine, contributor and
write-time redaction data remain missing. No date is invented for when historic
certificate recording began.

## Inference and limits

Table/view kind is absent from the receipt projection; a relation glyph is
presentation, not additional evidence of a historical physical object kind.

The fixture captures demonstrate rendering and API integration, not a new cloud
acceptance or live XQ verification. Human design review remains necessary. A
redeemed grant proves release of Opintel's share, not local decryption. When grants have different
states, the timeline badge says recorded rather than implying a single state;
the detail retains each grant's individual state.

## Rule checklist

Each row covers both new views and their details. Parent report bands and
navigation are retained.

| Rule | Provenance timeline / detail | Custody tab |
|---|---|---|
| 1 One queue | Met: existing Needs you remains the queue | Met: release history, no new queue |
| 2 Health strip | N/A: no health screen | N/A: no health screen |
| 3 Report above workbench | Met: existing Audit band above workbench | Met: existing entitlement band above tabs |
| 4 One primary action | Met: Open receipt; disclosures are secondary | Met: existing Grant access primary; Revoke in menu and confirmed |
| 5 At most four band numbers | N/A: no new band; parent retained | N/A: parent band retained |
| 6 Badge state | Met: recorded, not recorded, refused and release states | Met: release state badge |
| 7 Names before IDs | Met: nickname/certificate, pool and aliases in summaries; IDs in detail | Met: column/agent names; grant ID is necessarily an identifier |
| 8 State-change motion only | Met: shared interactions, reduced-motion captures | Met: shared menus/sheet, no new animation |
| 9 Same information by role | Met: receipt permission unchanged | Met: history visible; revoke action needs admin |
| 10 Explanation on its subject | Met: badges, times and copy controls have tooltips | Met: state meaning, timestamps and IDs have tooltips |
| 11 Phone and touch | Met: stacked fixed rows, bottom-sheet detail, 44 px copy/link/close targets | Met: fixed phone grid and shared menu targets |
| 12 Fixed rows / truncation | Met: fixed timeline/detail rows, ellipsis and full tooltips | Met: fixed rows/grid, clipped long names with full tooltip |
| 13 Band numbers filter | N/A: no new band controls; existing Audit behaviour retained | N/A: no new band controls; existing entitlement behaviour retained |
| 14 Kind icons | Met: step kind icons and column chips/treatment marks | Met: grant/agent/column kinds and custody treatment mark |

## Validation

- `npm run console:test`: 184 tests passed (15 files, 91.50 s).
- `npm test -- test/activity.test.ts`: 15 tests passed (37.97 s). The existing
  served-custody, refused, release-first, historical-gap, permission and recorded
  row-decision assertions were unchanged.
- `npm run typecheck`: passed, strict.
- `npm run lint`: passed, including dependency boundaries.
- Foundation/component coverage: full copy value and keyboard focus; ellipsis and
  token touch sizing; six badge states; distinct/mixed recorded grant states;
  personal timezone; phone sheet surface; six ordered disclosures and gaps;
  singular execution count; existing identity, classification and routing tests.
- `node --check scripts/console-provenance-design-capture.mjs`: passed.
- `node scripts/console-provenance-design-capture.mjs`: passed (100.53 s),
  76 screenshots, zero page errors and zero HTTP failures. All captured pages
  have zero horizontal overflow. Every identifier target is at least 44 × 44 px;
  the browser verifies nowrap/ellipsis and actual truncated phone identifiers.
- Single completed-candidate gate: **failed**, exit 1, on `b461582`.
  Strict typecheck, lint, production-artifact exclusion and all 40 conformance
  checks passed (30/30 routes, zero findings). Normal tests stopped early:
  143 files passed, 4 files failed; 1,057 tests passed and 4 failed.
  Smoke was not reached. No full-gate rerun was performed. The separately
  authorized isolation follow-up is recorded below.

### Gate failure evidence

Command: `npm run check`. Retained log:
`/private/tmp/console-provenance-design-gate-b461582.log`.
Gate wall time: 2,398.62 s; normal tier: 1,624.04 s.

| Test | Recorded failure |
|---|---|
| `test/bulk-entitlements.test.ts:93` — missing epoch unit | `Hook timed out in 10000ms` at `test/database-fixture.ts:16`; teardown also reported `Server is not running` |
| `test/element-declarations.test.ts:52` — DECL-003 | `timeout expired` at `node_modules/pg/lib/client.js:170` |
| `test/normal-redis.test.ts:5` — FLUSHDB isolation | `Test timed out in 30000ms` |
| `test/observation-groups.test.ts:31` — RED-012 | `Database test run stopped: cleanup could not be confirmed or a reset was blocked. No further tests may use this database.` at `scripts/testing/database-deadline.ts:201` |

The gate then reported cleanup failure for its owned database
`opintel_test_gate_64cadc497d02_3d281ed963a7`. It was left untouched for diagnosis.
The failing tests, database reset/deadline harness and backend module files are
unchanged from main (`git diff main...b461582` on those paths is empty).
These observations do **not** establish the root cause; no environment or branch
causality is claimed. Implementation stopped, with no timeout, harness, backend
or test correction and no merge.

Implementation and screenshots: commit `b461582`, pushed to
`origin/fix/console-provenance-design`. This report update is a separate docs-only
commit; application code remains the candidate tested above.

## Authorized isolation follow-up — 2026-11-05

Tested revision: `46ca0de` (application code remains `b461582`). Each file ran
once, sequentially, with `/usr/bin/time -p npm test -- FILE`, using the unchanged
normal isolated datastore harness. No competing gate, Vite build, Docker build
or test runner was present in the pre-run process listing. Development Postgres
and Redis were healthy. The initial load averages were 5.87 / 15.16 / 20.47;
this records the observed conditions rather than assuming zero host load.

| File | Result | Test execution | Vitest total | Command including setup/cleanup |
|---|---|---:|---:|---:|
| `test/bulk-entitlements.test.ts` | 24 passed | 46.31 s | 54.54 s | 103.28 s |
| `test/element-declarations.test.ts` | 10 passed | 31.31 s | 38.35 s | 57.99 s |
| `test/normal-redis.test.ts` | 1 passed | 4.60 s | 8.69 s | 30.16 s |
| `test/observation-groups.test.ts` | Failed before a test body ran; 1 failure reported out of 8 tests | 0 ms | 16.49 s | 35.12 s |

The previously failing bulk missing-epoch case passed in 1.338 s, DECL-003 in
4.230 s, and Redis FLUSHDB isolation in 4.584 s. All three commands exited 0.
Observation groups exited 1. Its first printed error was:

> Database test run stopped: cleanup could not be confirmed or a reset was blocked. No further tests may use this database.

The stack is `stopDatabaseRun` at `scripts/testing/database-deadline.ts:48`,
`DatabaseOwner.clean:201`, `DatabaseOwner.drain:141`, then `databasePhase:291`.
The log does not establish the underlying cleanup failure or reset blocker.
No root cause is inferred from the wrapper error.

Per the stop rule, **smoke was not run** after this failure. No retries, full gate,
application changes, harness changes or test changes followed. The original gate
remains recorded as failed; the three passing isolated files do not rewrite it.

Retained complete output and timing:

- `/private/tmp/provenance-isolated-bulk-entitlements.log`
- `/private/tmp/provenance-isolated-element-declarations.log`
- `/private/tmp/provenance-isolated-normal-redis.log`
- `/private/tmp/provenance-isolated-observation-groups.log`

The failed run's standard metadata is in
`test-results/normal/97edc5e0-81a7-4d3e-b6d1-8c7c3962222c/`.

## Session inspection and requested follow-up — 2026-11-05

Fork point confirmed: `4ea417806a46909a3e3c8ddae55e04ff29d2cc5e`.
Application code remained `b461582`; checkout HEAD was `a4d8625` during the runs.

The committed administrative helper
`scripts/review/provenance-session-cleanup.mjs` inspects only `opintel_test` and
`opintel_test_gate_*` database sessions, omits SQL contents and process arguments,
and guards explicit Node termination by repository ownership and process start
time. It does not change application configuration or test deadlines.

Pre-run inspection and `--terminate-test-sessions` returned **zero sessions and
zero termination targets**. The confirmation query also returned zero sessions.
No stray test/build Node process was found. The only repository-working-directory
Node processes were preserved tooling:

- PID 65673, started Oct 29 16:26:47: Codex CUA REPL, parent Codex daemon.
- PID 3482, started Oct 29 09:20:26: Codex CLI in the user's terminal.

No process or backend was killed because no eligible leftover was present.
Retained inspection/cleanup output:
`/private/tmp/provenance-session-inspection.log` and
`/private/tmp/provenance-session-cleanup.log`.

Observation groups then ran **once**, using
`/usr/bin/time -p npm test -- test/observation-groups.test.ts`:
**8 passed**, exit 0; test execution 15.23 s, Vitest total 28.40 s, full command
49.71 s. Complete log:
`/private/tmp/provenance-observation-after-session-check.log`.
Since the branch passed, the conditional run on the main fork point was not
needed and was not performed. The earlier failure did not reproduce, but this
does not establish a cause: there was no lingering session/process to remove.

The requested single smoke run used
`/usr/bin/time -p npm run test:smoke`. It **failed**, exit 1:

> Test timeout of 30000ms exceeded.
> Error: locator.click: Test timeout of 30000ms exceeded.
> Waiting for getByRole('button', { name: 'Set rows', exact: true }).

Location: `e2e/smoke.spec.ts:65`. Playwright reported 38.2 s including teardown;
the full command took 92.41 s. Complete log:
`/private/tmp/provenance-smoke-after-session-check.log`.
Trace and error context remain under
`test-results/smoke-sign-in-→-pool-→-row-9001e--persisted-receipt-decision-smoke/`.
This is the recorded 30 s deadline failure; its underlying cause is not asserted.
The retained helper passed `node --check` and `npm run lint`; no application or
test code changed. No smoke retry, full gate, main comparison, application/test
fix or merge followed.

## Screenshots

| State | 1440 light | 1440 dark | 390 light | 390 dark |
|---|---|---|---|---|
| Served provenance | [Open](provenance-served-1440-light.png) | [Open](provenance-served-1440-dark.png) | [Open](provenance-served-390-light.png) | [Open](provenance-served-390-dark.png) |
| Refused provenance | [Open](provenance-refused-1440-light.png) | [Open](provenance-refused-1440-dark.png) | [Open](provenance-refused-390-light.png) | [Open](provenance-refused-390-dark.png) |
| Historical gaps | [Open](provenance-historical-1440-light.png) | [Open](provenance-historical-1440-dark.png) | [Open](provenance-historical-390-light.png) | [Open](provenance-historical-390-dark.png) |
| Served request detail | [Open](provenance-served-detail-1440-light.png) | [Open](provenance-served-detail-1440-dark.png) | [Open](provenance-served-detail-390-light.png) | [Open](provenance-served-detail-390-dark.png) |
| Refused request detail | [Open](provenance-refused-detail-1440-light.png) | [Open](provenance-refused-detail-1440-dark.png) | [Open](provenance-refused-detail-390-light.png) | [Open](provenance-refused-detail-390-dark.png) |
| Historical request detail | [Open](provenance-historical-detail-1440-light.png) | [Open](provenance-historical-detail-1440-dark.png) | [Open](provenance-historical-detail-390-light.png) | [Open](provenance-historical-detail-390-dark.png) |
| Custody detail | [Open](provenance-custody-detail-1440-light.png) | [Open](provenance-custody-detail-1440-dark.png) | [Open](provenance-custody-detail-390-light.png) | [Open](provenance-custody-detail-390-dark.png) |
| Custody rows | [Open](custody-1440-light.png) | [Open](custody-1440-dark.png) | [Open](custody-390-light.png) | [Open](custody-390-dark.png) |
| Custody empty | [Open](custody-empty-1440-light.png) | [Open](custody-empty-1440-dark.png) | [Open](custody-empty-390-light.png) | [Open](custody-empty-390-dark.png) |
| Access | [Open](access-1440-light.png) | [Open](access-1440-dark.png) | [Open](access-390-light.png) | [Open](access-390-dark.png) |
| Agents | [Open](agents-1440-light.png) | [Open](agents-1440-dark.png) | [Open](agents-390-light.png) | [Open](agents-390-dark.png) |
| Agent detail | [Open](agent-panel-1440-light.png) | [Open](agent-panel-1440-dark.png) | [Open](agent-panel-390-light.png) | [Open](agent-panel-390-dark.png) |
| Credentials | [Open](credentials-1440-light.png) | [Open](credentials-1440-dark.png) | [Open](credentials-390-light.png) | [Open](credentials-390-dark.png) |
| Catalog | [Open](catalog-1440-light.png) | [Open](catalog-1440-dark.png) | [Open](catalog-390-light.png) | [Open](catalog-390-dark.png) |
| Theme control | [Open](theme-menu-1440-light.png) | [Open](theme-menu-1440-dark.png) | [Open](theme-menu-390-light.png) | [Open](theme-menu-390-dark.png) |
| Custody settings | [Open](settings-custody-1440-light.png) | [Open](settings-custody-1440-dark.png) | [Open](settings-custody-390-light.png) | [Open](settings-custody-390-dark.png) |
| Credential editor | [Open](settings-credentials-editor-1440-light.png) | [Open](settings-credentials-editor-1440-dark.png) | [Open](settings-credentials-editor-390-light.png) | [Open](settings-credentials-editor-390-dark.png) |
| Query limits | [Open](settings-limits-1440-light.png) | [Open](settings-limits-1440-dark.png) | [Open](settings-limits-390-light.png) | [Open](settings-limits-390-dark.png) |
| Limits editor | [Open](settings-limits-editor-1440-light.png) | [Open](settings-limits-editor-1440-dark.png) | [Open](settings-limits-editor-390-light.png) | [Open](settings-limits-editor-390-dark.png) |
