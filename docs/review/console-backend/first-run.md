# Console-next first run

Implementation: `src/console-next/first-run`, served from the existing console
archive at `/console-next/`. The original console remains available. Uses the
shared React/Radix, Phosphor regular icons, Motion reduced-motion foundations,
visx ring, kind chips, source dialog and pool/Settings/Data/Activity screens.

## Backend changes

- Company-admin-only GET `/api/v1/companies/:id/paired-engines` returns only names
  and opaque candidate ids from trusted installation pairing state. It does not
  expose addresses, certificates, pins, keys or engine source references.
  The installer projects public peer identity into a dedicated read-only API
  mount; it excludes readiness URLs, source credentials and private keys.
- POST `/api/v1/projects` reads that same installation state. Within its creation
  transaction, one unused paired engine is registered unverified. Several are
  returned for explicit selection (`pairedEngineId`); none is selected silently.
  A stale choice rolls back project/membership/outbox writes. Allocation is
  serialized with engine inserts; an engine registered anywhere is unavailable
  for automatic allocation. Existing projects cannot use the creation-only
  helper; explicit registration remains separate.
- Migration 088 introduces a narrowly granted, fixed-search-path helper. It does
  not grant platform reads of tenant engines or change existing engine RLS.
- Approved extension, migration 089: one nullable `project.first_receipt_at`.
  Backfill uses the earliest retained receipt, including retained rollups. A
  query-run insert sets it inside the durable header transaction only while
  null. Further edits/clearing are rejected. The existing project-list read
  exposes `firstReceiptAt`; no marker endpoint or write control was added.

## Console wiring

Welcome reads current user, company memberships, industry choices, company
settings/defaults and safe paired candidates. Project creation uses the existing
POST. Optional email invitations are project viewers, sent through the existing
invitation API after successful creation. Failed invitation attempts keep the
created project and allow retry without creating another project. Users with no
administered company and no project see only “An administrator needs to add you
to a project”.

Home computes six steps from project existence, registered/verified engines,
connected sources, pools, active credentials and `firstReceiptAt`. Once the
marker is set the tracker is absent, regardless of retained evidence. The shared
stream coalesces refreshes and refreshes project metadata on completion; existing
project reads also poll every 15 seconds. There is no browser completion latch.
Engine preparation explicitly verifies, designates the custody engine and
initializes/verifies the backed-up token key using existing endpoints. Query
limits remain explicit Settings values, not invented defaults.

Connect a source reuses the existing source dialog. The reference is typed as
stored by `./sources add`; no reference-list feed or demo-data action is shown.
The current test endpoint explicitly requires save/assignment before a network
check, so its real response is shown. Registration applies engine policy and
queues the scan. The dialog waits for actual connected status, then reads the
catalogue for table/column counts and nullable scan-time row estimates. Unknown
estimates remain unknown; no source COUNT(*) is run.

## Differences from images 17–19

- Welcome's engine step says registration/verification is needed after creation,
  reflecting actual state; a trusted pair alone is not a verified project engine.
- When the company's industry default is absent, Welcome exposes the real
  industry selection required by project creation. Region uses the company
  default. Optional invitations explicitly identify the viewer role.
- Engine setup includes explicit token-key backup preparation; the source API
  requires it. Required project query limits are set in Settings before querying.
- Step 3 has the typed-reference instruction rather than the unavailable engine
  reference feed. No waiting-reference box or demo-data button is fabricated.
- Source testing/registration precedes the real scan summary. After registration,
  Reference and Name are read-only and Done closes the summary; there is no
  invented pre-registration scan or pre-scan table/row count.
- Welcome retains the shared 48 px display token (24 px on phones), rather than
  adding a separate prototype font size; the title uses tighter tracking. Phone
  Welcome shows the six-step plan in two compact columns above the form.
- Home keeps the shared Needs-you queue with actual required settings/decisions;
  unavailable exposure content is hidden. Phone uses a compact two-column tracker
  and the shared bottom rail; there are no phone reference images for 17–19.

- Long engine-step labels truncate within the fixed tracker columns. On phones,
  completed-step details are hidden to keep the compact rows; the shared
  Needs-you list also truncates long setting labels instead of wrapping them.

## Checks

Targeted backend/contracts: 68 tests passed across ten files, including new
paired-engine/migration/marker tests, project read/create, table grants, HTTP
permissions, receipt retention, deployment packages and DEP-008 isolated startup.
Console tests: 79 passed across seven files. Lint and strict typecheck pass.
After strengthening the new-project marker lifecycle assertion, the marker,
migration, table-grant and project-list contracts passed again: 19 tests in four
files. Installer/package follow-up checks passed: 20 tests in three files.
No full gate or merge is part of this phase.

## Fresh archive acceptance

The initial archive attempt found a missing API mount for pairing state after
owner sign-in/project creation. The installer now supplies a dedicated public
metadata mount and has regression coverage; verification restarts from fresh
archives. Two browser-driver locator issues were also corrected: the source
catalogue trigger is scoped to the source picker, and the table/column actions
are scoped to the table list and their pool. These were driver failures, with no
browser application errors.

Final candidate runtime revision: `1ce8a358aec2396b84fc5d86a56e77d82e767f89`,
`linux/amd64`, seven audited images. The archives are local validation candidates,
not published release images. Archive SHA-256:

| Archive | SHA-256 |
| --- | --- |
| `gateway-1ce8a35-amd64.tar.gz` | `db317ed649e44c5cae68ecfcab727de30d90b96936e3a3a780119c3e37aec488` |
| `engine-1ce8a35-amd64.tar.gz` | `99b55049b389cf5a0fb26a47f02d33cb1d7fc25cee058fa383938cec1f70f8e5` |

Final fresh-install result: **passed**, with zero browser application errors.
The gateway and engine were extracted into empty directories, installed and
paired by their packaged commands. No dev server, login fixture, API response
mock, or direct API setup write was used. The owner signed in through the normal
email-link flow, delivered through a disposable TLS SMTP catcher. A separate
customer Postgres fixture was prepared with ordinary planner statistics; its
reference was stored with the packaged engine's `./sources add claims-db`.

| Step | Observed result |
| --- | --- |
| 1. Project | Owner/company admin created Reinsurance demo in Welcome; the paired engine was attached atomically and initially unverified. |
| 2. Engine | Verify and prepare engine completed through the console; engine became healthy and token-key preparation completed. |
| 3. Source | Typed claims-db, tested, saved/assigned and scanned; summary showed 2 tables, 8 columns and ~11 rows. |
| 4. Pool | Created First pool with records, id >= 5 and suggested 1 thread. Required project limits were explicitly saved in Settings: 30 seconds, 100 rows, 256 MB, concurrency 2. |
| 5. Credential | Pool creation issued its initial credential; the console also issued the named First agent credential used for verification. An explicit Clear decision for id was saved in Data with a justification. |
| 6. Receipt | A real MCP client authenticated with that pool credential, described its catalogue and queried its exposed column. Six permitted rows were returned. Activity opened “Answered · 6 rows from table records”. |

The existing project read then returned non-null `firstReceiptAt`. Returning to
Home showed the normal numbers band and no first-hour tracker. The independent
migration/retention tests cover the case where all retained history later goes
away. Optional invitations and multi-engine choice have targeted coverage; the
packaged acceptance exercised one paired engine and no optional invitations.

Safe acceptance metadata: [first-run-acceptance.json](first-run-acceptance.json).
Private install settings, certificates, credentials, cookies, source passwords
and row values are excluded from that record and these screenshots.

## Reviewed screenshots

- [1440 light · Welcome](first-run-screenshots/1440-light-welcome.png)
- [1440 light · Home at step 3](first-run-screenshots/1440-light-first-hour-step3.png)
- [1440 light · Connect a source](first-run-screenshots/1440-light-connect-source.png)
- [390 light · Welcome](first-run-screenshots/390-light-welcome.png)
- [390 light · Home at step 3](first-run-screenshots/390-light-first-hour-step3.png)
