# Final console workflows and legacy removal

Branch: `feat/console-final-workflows`. Base: `3a4076548fed4f8245968b4a94f49526f2f77897`.

The revised decision removes the demo UI and keeps all source connections on the ordinary reference flow. Final archives and fresh packaged verification passed on `c518101177c8c419acb792c645380eda1b6b9417`. The single full gate failed on a stale OIDC proxy-file assertion. Not merged.

## Approved scope

Pools opens an agent detail panel from Agents & people, with recorded presence facts and self-declared tags. The Activity link preserves pool and agent scope. The project switcher groups companies and opens the reused Welcome form as New project. You edits name and time zone; theme and motion follow the device and date formatting follows the locale. Settings adds company defaults/access controls and a two-row Project section: inline Name and the existing Industry migration preview, consequences and typed confirmation. Engine registration omits Test by the approved decision, then registers and verifies; rename uses the existing update and verification endpoints.

People identifies direct, company and both access. Removing a direct grant requires confirmation, with “Company access remains” for both. Retained token-key versions show backup verification, rehearsal and creation facts; company admins can restore through the existing endpoint with the project-name confirmation. Connect a source has no demo-specific control. The revised decision removes the prepared-pack UI entirely; synthetic fixture data connects through the ordinary `./sources add` reference flow. Pools row rules show immutable decision history and receipt links open the recorded decision. The rows-set band filters missing row rules.

## Backend exception: direct project-grant removal

`DELETE /api/v1/projects/:id/members/:userId` declares `project#administer`. It removes the direct project membership and its SpiceDB relationship only. The transaction records the authorization revision in the outbox and audit, following invitation acceptance. Pending matching relationship writes are locked and processed before the final deletion so a queued touch cannot resurrect access. Company membership and inheritance remain untouched. A project lock serializes removals; the last direct project administrator without company inheritance cannot be removed.

The audit uses the existing company-scoped audit insert supported by the platform role, with project/user identifiers in its target. No table, grant, migration or authorization schema changes are needed. Targeted real PostgreSQL/SpiceDB HTTP tests cover direct removal, company inheritance, last-admin refusal, non-admin refusal, declared permission and an authorization-write outage.

## Legacy inventory and destinations

The inventory below was extracted from the old router and navigation before removal. Every route has a destination. Canonical authentication URLs are served by console-next. `/legacy/...` is accepted only by compatibility redirects; its SPA and even stale built assets are refused. Unknown routes return 404.

| Old route | Destination |
|---|---|
| `/auth/callback` | `/auth/callback` |
| `/auth/confirm-device` | `/auth/confirm-device` |
| `/check-email` | `/check-email` |
| `/companies/$companyId/settings` | `/?companyId=company&section=company&screen=settings` |
| `/companies/new` | `/` |
| `/dev/kitchen-sink` | `/` |
| `/dev/shared-patterns` | `/` |
| `/projects` | `/` |
| `/projects/$projectId/access` | `/?project=project&section=people&screen=settings` |
| `/projects/$projectId/activity` | `/?project=project&screen=activity` |
| `/projects/$projectId/catalog` | `/?project=project&tab=entitlements&declarations=true&screen=data` |
| `/projects/$projectId/dashboard` | `/?project=project` |
| `/projects/$projectId/data-sources` | `/?project=project&tab=sources&screen=data` |
| `/projects/$projectId/entitlements` | `/?project=project&tab=entitlements&screen=data` |
| `/projects/$projectId/introspections/$runId` | `/?project=project&scan=run&sourceView=scans&tab=sources&screen=data` |
| `/projects/$projectId/pools` | `/?project=project&screen=pools` |
| `/projects/$projectId/pools/$poolId` | `/?project=project&pool=pool&screen=pools` |
| `/projects/$projectId/pools/$poolId/agents/$agentId` | `/?project=project&pool=pool&agent=agent&tab=agents&screen=pools` |
| `/projects/$projectId/relationship-suggestions` | `/?project=project&tab=suggestions&screen=data` |
| `/projects/$projectId/runs/$runId` | `/?project=project&run=run&screen=activity` |
| `/projects/$projectId/settings` | `/?project=project&section=project&screen=settings` |
| `/projects/$projectId/settings-agents` | `/?project=project&section=people&screen=settings` |
| `/projects/$projectId/settings-discovery` | `/?project=project&section=discovery&screen=settings` |
| `/projects/$projectId/settings-engines` | `/?project=project&section=engines&screen=settings` |
| `/projects/$projectId/settings-evidence` | `/?project=project&section=evidence&screen=settings` |
| `/projects/$projectId/settings-project` | `/?project=project&section=project&screen=settings` |
| `/projects/$projectId/settings-query` | `/?project=project&section=query&screen=settings` |
| `/projects/$projectId/sources/$sourceId/introspections` | `/?project=project&source=source&sourceView=scans&tab=sources&screen=data` |
| `/projects/$projectId/token-key` | `/?project=project&section=token&screen=settings` |
| `/projects/new` | `/?dialog=new-project` |
| `/settings` | `/?dialog=you` |
| `/sign-in` | `/sign-in` |

Additional query-bearing redirects preserve Activity range/outcome/pool/agent, run `startedAt`, Data pool/element/decision, Suggestions element/pool, source/scan scopes and row-decision identity. `/companies/new` goes Home; `/projects?companyId=C` opens the company-filtered switcher; `/projects/P/access` opens Settings → People; `rowFilter=unscoped` opens the Pools missing-row-rule filter.

Removed without an editor replacement, as explicitly decided: the console scope-tag link/editor. Its API is unchanged. Removed development galleries and the unused legacy UI kit, styles, screens and tests. The old project Name/Industry, prepared demos, company editor, personal editor, engine administration, row history and retained-key restoration have console-next homes. The demo-pack editor/control was also removed by the revised decision; its backend paths are inventoried in backlog DEMO-01 and unchanged in this round. Original backend API/governance tests remain; settings contracts, stream cache/reconnect and dashboard fact/privacy assertions now exercise console-next. The build produces one console and the image allowlist excludes legacy bundles.

## Revised demo decision

Removed the demo picker/component, query key, styles, demo-only connection state and
the acceptance fixture that used template registration. Both synthetic and customer
data now use the ordinary console reference flow; the acceptance database was connected
through packaged `./sources add`, tested, registered and scanned through ordinary endpoints.
There is no demo control in console-next or retained legacy editor. AGENTS.md contains
the exact standing decision. [DEMO-01](../master-backlog.md#demo-01--remove-demo-specific-product-paths)
is backlog only, including the inventory of registration, engine, schema/API, evidence/export
and installer/operator distinctions. No backend path was changed in this round; the
previously explicitly approved direct-project-grant removal remains unchanged.

## Validation

- Final console tests: **129 passed**, 13 files. Includes absence of demo controls/requests,
  Project Name/Industry, multi-company switching, dialogs and membership provenance.
- Final provisioning, route and bundle contracts: **13 passed**, three files, including
  DEP-008 isolated packaged owner startup (6.4 seconds).
- Earlier full-phase membership/list/outbox/table-grants targets: 29 passed; the eight-file
  route/bundle/provisioning/settings/stream/dashboard/membership target set: 42 passed.
- Final strict production typecheck and unchanged lint/dependency boundaries passed.
  The final gate also passed conformance typecheck and all 36 browser checks across
  28/28 scopes with zero findings. The earlier targeted real UI/MCP/Engine receipt-and-row-history
  smoke passed before demo-only UI removal; the final gate smoke was skipped after failure.
- Seven final `linux/amd64` candidate images built and passed secret/runtime/user-readability
  audits. Final archived install and all 27 recorded browser steps passed; zero page errors.
- **Single completed-candidate gate: failed, exit 1**, on `c518101`, in 35m 41.82s.
  Normal tests: **2,206 passed, 1 failed** (263 passing files, one failing file).
  Typecheck, conformance typecheck, lint, production build and 36 browser conformance checks
  passed. Smoke was not run. Cleanup succeeded. No gate retry or post-failure code fix.
  [Gate result](console-final-workflows/gate.json), [exact assertion](console-final-workflows/gate-failure.txt).

## Final offline archives and fresh verification

Code/archive revision: `c518101177c8c419acb792c645380eda1b6b9417`. All application code was committed. Pre-existing tracked backlog edits and unrelated
untracked user files were excluded from commits and shipped bundles. Output: `tmp/console-final-workflows-packages-c518101/`.
[Archive sizes and SHA-256](console-final-workflows/archive-hashes.json).
Installed into `tmp/console-final-workflows-acceptance-JuD4SO`, without a development server,
API response mocks or changes to the development env file/containers.
[Recorded browser results and Inter font proof](console-final-workflows/packaged-verification.json).

| First run / workflow | Result |
|---|---|
| Owner email link opened in a second browser, device confirmed; another link declined with no session | Passed |
| 1. Create project; the single unused paired engine attaches | Passed |
| 2. Verify engine and initialize token custody prerequisites | Passed |
| 3. Ordinary reference test/register/scan | Passed: 2 tables, 8 columns, ~11 estimated rows |
| Set query limits | Passed |
| 4. Create first pool with a table and `id >= 5` row rule; explicitly clear its record-number column | Passed |
| 5. Issue the first agent credential | Passed |
| 6. Real MCP agent request and receipt in Activity | Passed: 6 permitted rows; permanent marker set; tracker gone |
| Open Home, Activity, Pools, Data and Settings from root | Passed |
| Agent panel with claimed client facts and scoped Activity link | Passed |
| Receipt row-decision link opens immutable history | Passed |
| You: save name/time zone; device theme/motion and locale date policy | Passed |
| New project: reused Welcome form; already-used engine does not silently attach | Passed |
| Add engine and verify explicitly; rename and reverify | Passed |
| Settings Project: inline rename through existing endpoint | Passed |
| Company defaults/domains/session/SSO editor | Passed |
| People both badge, removal warning, direct grant removed, company access preserved | Passed |
| Two retained token versions; typed Restore of version 1 | Passed: disabled until typed name; restore completed; version 2 still current |
| Twelve old URLs, including all four specifically requested | Passed; destinations below |
| Final 1440 dark Home | Passed; packaged Inter and device-dark theme |

The earlier image-31 dialog captures preceded the final footer/close-control fixes; the
new captures below come from the final archives. The exact Add-engine Test omission is
the previously approved decision, not an invented pre-registration check.

## Old URL verification

`P` = project, `Q` = pool, `C` = company, `R` = receipt, `T` = table, `D` = row decision.
Exact identifiers, timestamps and redirect destinations are retained in the JSON results.

| Opened old URL | Landed at |
|---|---|
| `/companies/new` | `/` |
| `/projects?companyId=C` | `/?companyId=C&switcher=true` |
| `/projects/P/access` | `/?project=P&section=people&screen=settings` |
| `/projects/P/entitlements?poolId=Q&rowFilter=unscoped` | `/?rowFilter=unscoped&project=P&pool=Q&tab=access&screen=pools` |
| `/projects/P/runs/R?startedAt=2026-10-31T14:07:36.336967Z` | `/?startedAt=2026-10-31T14:07:36.336967Z&project=P&run=R&screen=activity` |
| `/projects/P/activity?from=2026-10-31T00:00:00.000Z&outcome=refused&poolId=Q` | `/?from=2026-10-31T00:00:00.000Z&outcome=refused&project=P&pool=Q&screen=activity` |
| `/projects/P/entitlements?poolId=Q&rowObjectId=T&rowDecisionId=D` | `/?rowDecisionId=D&project=P&pool=Q&rows=T&tab=access&screen=pools` |
| `/projects/P/pools/Q/agents/first-run-review` | `/?project=P&pool=Q&agent=first-run-review&tab=agents&screen=pools` |
| `/projects/P/catalog?advanced=true` | `/?project=P&tab=entitlements&declarations=true&screen=data` |
| `/companies/C/settings` | `/?companyId=C&section=company&screen=settings` |
| `/projects/P/settings-project` | `/?project=P&section=project&screen=settings` |
| `/projects/P/token-key` | `/?project=P&section=token&screen=settings` |

## Screenshots and remaining design differences

- [Image 30 beside the final agent panel](console-final-workflows/comparison-30.png),
  [full 1440 light capture](console-final-workflows/30-agent-panel.png).
- [Image 31 beside final New project, You and Add engine](console-final-workflows/comparison-31.png).
  Individual 1440 light captures: [New project](console-final-workflows/31-new-project.png),
  [You](console-final-workflows/31-you.png), [Add engine](console-final-workflows/31-add-engine.png).
  The three dialogs open separately; the comparison labels their unmodified dialog excerpts.
- [Company](console-final-workflows/settings-company.png),
  [People provenance](console-final-workflows/settings-people-provenance.png),
  [company-access-remains confirmation](console-final-workflows/people-company-access-remains.png),
  [Home 1440 dark](console-final-workflows/home-1440-dark.png).

Differences from the reference images: real fixture names/counts replace illustrative values;
image 30 abbreviates the existing Pools band while the implementation shows it; the panel
uses complete locale/time-zone dates and the shared primary Activity action. Image 31 uses
the shared control tokens, focus ring and switch chevrons; input adornment icons are not
repeated inside the fields and the helper/field text has the shared weight. The New project
fixture has no company-default industry or unused paired engine, so neither explanatory
line is invented. You shows the real email without appending a role claim. Add engine
omits Test and an unverified reachable badge by approval, and gives the packaged `./status`
operator instruction rather than a source-tree command. Company/People reuse the approved
Settings row layout; no distinct reference was supplied. The demo offer from image 19 is
intentionally removed by the revised binding decision.

## Historical attempts and environment work

Earlier packaged `fdb3f8c` verification reached prepared-demo connection and failed because
production engines omit `/provision-demo`. That requirement was then removed by the user's
revised decision; no backend workaround was applied. Earlier evidence remains in
[failed results](console-final-workflows/packaged-verification-fdb3f8c-failed.json),
[archive hashes](console-final-workflows/archive-hashes-fdb3f8c.json) and explicitly labelled
before-footer screenshots. Three earlier acceptance locator mistakes were corrected; none
was a full-gate run.

The first final-archive install stopped before browser work because Docker reported
“all predefined address pools have been fully subnetted”. Ten empty networks belonging
only to this phase's stopped acceptance fixtures were rechecked and removed. No container,
volume, image, evidence or unrelated network was removed. The final install then passed
unchanged. Only unused build cache and superseded reproducible archive bytes were cleared
to make room; hashes and verification records were retained.


## Single-gate failure: branch contract mismatch, not environment

The only failing test is `test/oidc-routes.test.ts:41:51`, after its start/callback,
readable-session, replay refusal and production-factory wiring assertions passed.

```text
Expected substring:
'/auth/oidc':

Received root vite.config.ts:
export {default} from './src/console-next/vite.config.js';
```

`f0a2fa2` replaced the legacy root Vite configuration with this delegation. The actual
`src/console-next/vite.config.ts` still declares `'/auth/oidc': {target, changeOrigin:true}`.
I missed this legacy-file assertion when updating the route contracts. This is a branch
contract-test mismatch, not an environment timing failure or a missing backend route.

**Proposed fix, not applied:** update the final OIDC assertion to follow the root export
and check the authoritative console-next proxy configuration, preserving every HTTP,
session, replay and factory-wiring assertion. No backend change is needed. Per the
single-gate instruction, no test or application code was changed afterward and the
gate was not retried. The branch remains unmerged and the full phase is not marked green.
