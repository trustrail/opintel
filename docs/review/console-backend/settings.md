# Console-next Settings review

Implemented beside the current console in `src/console-next/settings`, reached
through the shared Settings rail item (`?screen=settings`). The current console
and master stylesheet are unchanged. Uses React, Radix Dialog/DropdownMenu/
Checkbox/ScrollArea, shared Phosphor regular icons and kind chips, the shared
visx ring, shared navigation/account theme controls and foundation tokens.
Motion's shared reduced-motion configuration and visible focus styles apply.
No new CSS classes, UI kit, routes, permissions, migrations or backend changes.

## Endpoint wiring

| Section | Existing contract used |
|---|---|
| Health | GET `/api/v1/projects/:id/health`; warning/down/unknown are retained; ring segments navigate to the matching section, centre to first actionable check |
| Engines | GET `/api/v1/projects/:id/engines`, cursor-complete; POST `…/engines/:engineId/verify` |
| Custody · XQ | GET `…/custody-provider`; POST `…/custody-provider/check` and `…/custody-provider/rotate` |
| TLS | `tls` item from project health, derived by the backend from the deployment flag; operator replacement step only |
| Mail | No HTTP status contract; operator `./mail-test EMAIL` only, no status chip or implied health dot |
| People | GET `…/members`, GET/POST `…/invitations`, DELETE `/api/v1/invitations/:id`; complete cursor lists |
| Token key | Admin-only GET `…/token-key`, POST `…/token-key/initialize`, `/rotate`, `/rehearse`; current version, recorded backup and rehearsal metadata |
| Query limits | GET/PATCH `…/settings`: `query.timeoutSeconds`, `rowLimit`, `memoryLimitMb`, `concurrencyPerPool` |
| Discovery | Same settings API: `discovery.valueSampling`, `sampleSize`; existing schema bounds and sampling requirement |
| Evidence kept | Same settings API: `evidence.fullRetentionDays`, `rollupRetentionDays`; shown only if one is configured |
| Rail attention | Existing `…/needs-you` cursor list and shared area mapping |

Project role filtering uses actual project memberships, excluding company-only
members from project counts. Company membership administration remains operator
only (`./users`, `./invite`). No member-role update endpoint exists: no role-edit
control is rendered. Invitations support admin/operator/viewer, pending/expired
states and consequential revoke confirmation. Their email delivery is the
backend's existing flow, not a new client-side integration.

Settings patches preserve every other stored active field in the changed
section. This matters because `save_project_settings` in
`migrations/050_settings.up.sql` replaces that section's active keys. Query edits
therefore preserve aggregate, queue and staging protections; discovery edits
preserve rename/new-element decisions; retention edits preserve redaction and
capture sampling. Unconfigured required limits stay absent, never invented.
Retention changes disclose that removal is irreversible. Mutation failures retain
the draft; successful mutations invalidate Settings, health and Home facts.

Provider/key rotations are available only from row menus with consequence
confirmation. Token rotation also requires the exact project name, a reason and
an idempotency key. Token restore is not part of this requested screen increment
and is not exposed. No secret values, certificates, signing-key identifiers or
team identifiers render. XQ team is always `[team]`; credential presence is
shown only as Stored/Not set. Token-key version numbers are metadata, never key
material. Token-key status itself requires administering permission at the API;
non-admins see that requirement and make no forbidden status request.

## Data gaps and backlog

Custody today is hidden: the existing summary SQL in
`src/modules/evidence/infrastructure/reader.ts` uses
`count(DISTINCT g.receipt_id)`, grouped by release-event day/state. It is **not a
release-event count**, and additionally filters lifecycle events by the grant's
current state. Re-labelling these numbers as events would be incorrect. Add a
bounded, project-scoped event-time aggregate of `release_event` for granted,
expired and revoked before enabling the ring. No fabricated zero, receipt-count
substitute or unbounded receipt-detail sweep was introduced.

Mail's console test/status remains the existing backlog item
`CONSOLE-HEALTH-MAIL` in `docs/master-backlog.md`; no duplicate item was added.
It needs a permissioned action and timestamped safe persisted status that
separates SMTP acceptance from mailbox delivery. TLS exposes only the deployment
self-signed flag, not expiry or chain inspection. Identity providers are omitted.
Provider team/region edits, secret entry, restore and company role controls are
not added by this scope. Existing provider checks and rotation remain usable.

## Differences from image 16

- The available band has Health, People and configured Evidence kept; Custody
  today is omitted for the count-contract gap above. Evidence's ring shows real
  full-retention days (or retained indefinitely), not illustrative dash values.
- Shared report-band component is retained with its extra context header hidden. Fixed setting rows use the
  shared 72 px row scale, rather than the image's denser rows; desktop scrolls
  inside a long section. Actual project/check/member numbers replace examples.
- Captures use the real local development provider, explicitly labelled as such;
  XQ-only team/dashboard rows appear only for an actual XQ configuration. No fake
  XQ check or fabricated region is used. Signing-key presence is shown without
  its identifier; no certificate content is exposed.
- Mail has an operator instruction and no status. Identity providers are absent.
  Evidence kept is absent when no retention setting is stored. Unsupported
  member-role editing and company controls are absent.
- Settings do not navigate on decorative chevrons: supported edits use one
  section action, and destructive commands use row menus and confirmations.
- Phone has the requested compact two-column ring band and section list; opening
  a section covers the work area with a Settings back button. It uses the shared
  bottom navigation/account menu. Image 16 supplies no phone composition.
- Shared rail avatar is an icon and opens the account theme menu, rather than
  the image's illustrative initial.

## Validation and manual captures

- `npm run lint`: passed (including dependency boundaries).
- `npm run typecheck`: passed, strict.
- `npm run console:test`: 70 tests passed in six files.
- `npm test -- --config test/review/console-next-settings.config.ts`: passed;
  real project-settings PATCH and subsequent GET confirmed the saved row limit
  and preserved timeout. Five captures inspected, zero browser errors and zero
  failed API responses. Only isolated fixture data was changed. Test invitation
  mail remained in the isolated outbox; no SMTP worker or external delivery.
- No backend code changed, so no new backend unit/contract suite was required.
  No full gate, merge or deployment was run for this build-only phase.

| Width / light | Capture |
|---|---|
| 1440 · Custody · XQ | [Screenshot](settings-screenshots/1440-light-custody.png) |
| 1440 · People | [Screenshot](settings-screenshots/1440-light-people.png) |
| 1440 · Query limits | [Screenshot](settings-screenshots/1440-light-query-limits.png) |
| 390 · Section list | [Screenshot](settings-screenshots/390-light-sections.png) |
| 390 · Open section | [Screenshot](settings-screenshots/390-light-custody.png) |

[Capture metadata](settings-screenshots/capture.json) records only safe endpoint
paths/status codes, not API bodies, headers, credentials or team identifiers.
