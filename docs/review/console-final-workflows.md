# Final console workflows and legacy removal

Branch: `feat/console-final-workflows`. Base: `3a4076548fed4f8245968b4a94f49526f2f77897`.

Blocked during fresh packaged verification at prepared-demo connection. No full gate has run for this phase; the branch is not merged.

## Approved scope

Pools opens an agent detail panel from Agents & people, with recorded presence facts and self-declared tags. The Activity link preserves pool and agent scope. The project switcher groups companies and opens the reused Welcome form as New project. You edits name and time zone; theme and motion follow the device and date formatting follows the locale. Settings adds company defaults/access controls and a two-row Project section: inline Name and the existing Industry migration preview, consequences and typed confirmation. Engine registration omits Test by the approved decision, then registers and verifies; rename uses the existing update and verification endpoints.

People identifies direct, company and both access. Removing a direct grant requires confirmation, with “Company access remains” for both. Retained token-key versions show backup verification, rehearsal and creation facts; company admins can restore through the existing endpoint with the project-name confirmation. Connect a source lists only operator-prepared demo packs. Pools row rules show immutable decision history and receipt links open the recorded decision. The rows-set band filters missing row rules.

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

Removed without an editor replacement, as explicitly decided: the console scope-tag link/editor. Its API is unchanged. Removed development galleries and the unused legacy UI kit, styles, screens and tests. The old project Name/Industry, prepared demos, company editor, personal editor, engine administration, row history and retained-key restoration have console-next homes. Original backend API/governance tests remain; settings contracts, stream cache/reconnect and dashboard fact/privacy assertions now exercise console-next. The build produces one console and the image allowlist excludes legacy bundles.

## Validation

- Membership/list/outbox/table-grants targets: 29 passed.
- Console tests: 129 passed, including Project-section, multi-company switcher and contextual Settings-link coverage. Repeated after the image-31 footer/close-control refinements: 129 passed.
- Route, bundle, provisioning, settings, stream, membership and dashboard contracts: 42 passed in eight files. DEP-008 isolated packaged owner startup passed after removing scripts/native dependencies.
- Final lint and dependency boundaries passed; final strict production typecheck passed. Conformance TypeScript passed. Browser conformance passed all 36 checks, covering 28/28 registered URL scopes with zero findings. The real UI → row decision → authenticated MCP/Engine → persisted receipt and history smoke passed in 11.5 seconds. Strict production and conformance typechecks passed.
- Fresh packaged first run, root screens, agent panel, three dialogs, engine/project rename, Company editor and inherited-access removal passed. Prepared-demo connection failed as described below. Retained-key restore, twelve old URLs and the final dark Home screenshot were not reached.
- Single completed-candidate full gate: not run because completing the packaged demo requires an additional backend decision. No retry or full-gate result is claimed.

Custody and TLS check links are mapped in the console by check kind, keeping the old Project settings bookmark for Name/Industry. The company-filtered switcher offers New project only when the user administers that company.


## Fresh packaged verification and stopping point

The seven candidate images for `fdb3f8cd517b4162b6d38f6cb17031182d82e58d` built and passed their secret/runtime audits. Installed fresh gateway and engine archives, paired them with one code, and added the external synthetic PostgreSQL reference using the packaged `./sources add`. Archive SHA-256 values are in [archive-hashes.json](console-final-workflows/archive-hashes.json). No development env file or development container was changed.

The final attempted fixture is `tmp/console-final-workflows-acceptance-0z83Gb`; [packaged-verification.json](console-final-workflows/packaged-verification.json) contains the recorded results and CDP evidence of packaged Inter rendering. Earlier runs stopped at three harness locator mistakes (Data band attribute, ambiguous agent-name button and the region Select's accessible name). Those selectors were corrected; these were not full-gate runs.

| Verification | Result |
|---|---|
| Email link opened in a second browser and device confirmed | Passed |
| Separate email link declined; no session issued | Passed |
| Create first project; the one unused paired engine attaches | Passed |
| Verify engine and initialize its custody/token prerequisites | Passed |
| Connect, test, register and scan the external reference | Passed |
| Set project limits, create pool and explicitly clear the record-number column | Passed |
| Issue credential; real MCP agent request returns the six permitted rows | Passed |
| Receipt in Activity; permanent first-receipt marker; tracker disappears | Passed |
| Home, Activity, Pools, Data and Settings at the root | Passed |
| Agent panel, self-declared client and scoped Activity link | Passed |
| Receipt's recorded row decision opens history | Passed |
| You: save name and America/Toronto through existing settings API | Passed |
| New project using Welcome form; no used engine silently attaches | Passed |
| Add and verify existing paired engine explicitly; rename and verify | Passed |
| Project → Name inline rename | Passed |
| Company editor: defaults, domains, session and SSO controls | Passed |
| People: both badge, warning, remove direct grant, company access remains | Passed |
| Connect operator-prepared demo template through existing endpoint | **Failed: packaged engine has no provision-demo endpoint** |
| Two retained token versions and typed Restore | Not reached |
| Twelve old URL destinations, including the four specifically requested | Not reached in packaged browser; targeted redirect contracts passed |
| Final dark Home capture | Not reached |

### Existing backend blocker: prepared demo

The console displayed: **“The source or demo preparation was not found. Check the project preparation before retrying.”** The source was marked introspection failed and Done remained disabled. The engine's retained log records `sidecar.refused` with `reason: not_found`; inspection confirms its `NODE_ENV=production`.

This is a production/backend mismatch, rather than another UI locator problem:

- `src/modules/sources/application/source-registration.ts` calls `this.connector(ctx,work.sourceId).provisionDemo(...)` for every template-backed source before scanning.
- `src/modules/sources/infrastructure/sidecar-source-connector.ts` sends that operation to `'/provision-demo'`.
- `sidecar/start.ts` constructs the handler only under `config.demo && process.env.NODE_ENV !== 'production'`; its comment explicitly says synthetic workbook generation is not a shipping-engine payload.
- `sidecar/http/server.ts` registers the route only with `...(options.demo ? { '/provision-demo': ... } : {})`; missing routes return 404 `not_found`.
- `deploy/engine/Dockerfile` sets `NODE_ENV=production`. The production bundle removes the generator and its workbook dependencies.

The acceptance fixture inserted operator template/deployment metadata after the first receipt; it did not mock a response, enable development mode, or bypass the real connection endpoint. It used a minimal database template. That fixture would additionally need real spreadsheet/landing preparation for the development-only generator; correcting the fixture alone cannot supply a route deliberately absent from the packaged engine.

**Decision needed:** permit a narrow backend path for connecting already-prepared demo data without invoking the development-only generator, or revise the prepared-demo requirement. Do not add the workbook generator to the shipping engine as an incidental fix. No backend fix for this blocker was applied: direct project-grant removal remains the only backend exception in this branch.

The final tip also includes image-31 footer/round-close styling identified during screenshot review. Its console tests passed, but those style refinements were not rebuilt into archives after the blocker was established. Final packaged verification and the single full gate remain outstanding.

## Screenshots and differences

Side-by-side evidence: [image 30 comparison](console-final-workflows/comparison-30.png) and [image 31 comparison before footer refinement](console-final-workflows/comparison-31-before-footer-refinement.png). The latter is deliberately labelled as earlier evidence, not the final tip.

- [Agent panel, 1440 light](console-final-workflows/30-agent-panel.png), compared with image 30: actual single-agent data replaces illustrative names/counts; the real Pools band is present (the reference abbreviates it); timestamps follow the user's locale/zone, with complete dates; the Activity action uses the shared primary-action styling. No person identity is invented.
- [Company](console-final-workflows/settings-company.png), [People provenance](console-final-workflows/settings-people-provenance.png), and [company-access-remains confirmation](console-final-workflows/people-company-access-remains.png). These reuse Settings' approved fixed-row layout; no separate Company/People image was provided for this phase.
- Image-31 captures of [New project](console-final-workflows/31-new-project-before-footer-refinement.png), [You](console-final-workflows/31-you-before-footer-refinement.png), and [Add engine](console-final-workflows/31-add-engine-before-footer-refinement.png) are **before the final footer/close-control refinements**, not screenshots of the final tip. Real account/project values replace examples; the already-used engine is not offered as free; Add engine omits Test and a pre-registration reachable badge as explicitly approved; the operator hint uses the packaged `./status` command.
- [Prepared-demo failure](console-final-workflows/prepared-demo-blocker.png) shows the actual stopping point. The dark Home and final image-31 screenshots remain pending.

No legacy-only workflow URL remains without a destination in the route inventory/contracts. The sole intentionally removed editor is scope tags, as approved; its API remains. No evidence records, applied migrations, grants or authorization schema were altered for the new membership removal operation.
