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

## Checks

Targeted backend/contracts: 68 tests passed across ten files, including new
paired-engine/migration/marker tests, project read/create, table grants, HTTP
permissions, receipt retention, deployment packages and DEP-008 isolated startup.
Console tests: 79 passed across seven files. Lint and strict typecheck pass.
No full gate or merge is part of this phase.

## Fresh archive acceptance

The initial archive attempt found a missing API mount for pairing state after
owner sign-in/project creation. The installer now supplies a dedicated public
metadata mount and has regression coverage; verification restarts from fresh
archives. Pending the corrected candidate archive install. Results and five reviewed
screenshots are added after the packaged owner-to-first-receipt run.
