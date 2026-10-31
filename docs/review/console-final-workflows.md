# Final console workflows and legacy removal

Branch: `feat/console-final-workflows`. Base: `3a4076548fed4f8245968b4a94f49526f2f77897`.

Implementation and validation in progress. No full gate has run for this phase.

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
- Console tests: 129 passed, including Project-section, multi-company switcher and contextual Settings-link coverage.
- Route, bundle, provisioning, settings, stream, membership and dashboard contracts: 42 passed in eight files. DEP-008 isolated packaged owner startup passed after removing scripts/native dependencies.
- Lint and dependency boundaries passed. Conformance TypeScript passed. Browser conformance passed all 36 checks, covering 28/28 registered URL scopes with zero findings. The real UI → row decision → authenticated MCP/Engine → persisted receipt and history smoke passed in 11.5 seconds. Strict production and conformance typechecks passed.
- Packaged first run, dialogs, company/people, prepared demo, retained-key restore, ten old URLs and screenshots: pending.
- Single completed-candidate full gate: not run.

Custody and TLS check links are mapped in the console by check kind, keeping the old Project settings bookmark for Name/Industry. The company-filtered switcher offers New project only when the user administers that company.
