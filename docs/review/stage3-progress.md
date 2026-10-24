# Stage 3 progress

Stage 3 is **in progress, uncommitted and not acceptance-complete**. The working branch is `gateway-engine-deployment`, rebased onto main at `262fa65`. The gate database isolation and platform-aware smoke changes are present. Existing Stage 3 edits were restored; the documentation conflict was resolved by retaining both scopes. The recovery stash remains available. Applied migration 082 was checked against its saved applied bytes and is unchanged.

Current result: **the authorised changed-tree gate passed**. All 232 normal test files / 2,043 tests, 59 router-conformance tests and the browser/MCP smoke passed; isolated database cleanup succeeded. Both authorised repairs are verified, with claim rules unchanged. The previous failed gate remains preserved. Next, as explicitly ordered: commit, merge and push, then clean-release build from that committed revision, release-digest publication and final acceptance. Earlier published candidate images are not the clean release.

Previous retained result:
Current result: the authorized abstract-socket repair works in the rebuilt AMD64
candidate. All six images passed both layer audits. Startup, offline supervised
replacement, absence of a socket file, heartbeat acknowledgment, egress denial,
and pin/unknown/cross-project negatives passed. The governed query then refused
`source_unavailable`, so this candidate is **not acceptance-green**.

The retained database confirms the cause: the source is `pending`, its egress
flag is clear, its engine has acknowledged a policy, and it has zero introspection
runs. Assignment changes a previously connected source to pending egress;
acknowledgment moves it to pending, but this assignment path does not enqueue a
retest. The query correctly refuses a source that is not connected. Release
progression stopped at this product lifecycle failure; no rerun occurred.

GHCR authentication remains confirmed. Nothing from Stage 3 has been published,
committed, merged or pushed, and no final gate has run. The optional-ingest proof
and remaining controller/release checks are still outstanding. No product
decision is pending.

## Deliverables

| Deliverable | Current work and evidence | Remaining |
|---|---|---|
| 1. Independent gateway and engine packages | Added separate gateway and engine wrappers and per-service Compose definitions. Services are selected explicitly, addresses/configuration are supplied separately, external gateway dependency endpoints are supported, and wrappers reject mutable image tags. Engine joins only its own companion's network namespace. Added a package assembler that writes self-contained directories with literal image digests and package-local upstream pins. Four focused package tests passed against the templates. | Generated standalone directories passed the core end-to-end acceptance. Finish installation examples/runbooks and external-dependency acceptance. The package assembler was exercised by the completed core acceptance. |
| 2. Explicit migration/schema jobs and compatibility-only startup | Added a migrations image with minified executable migrations and a manifest preserving original source checksum identities; no applied ledger is rewritten. Added explicit application migration, SpiceDB datastore migration and authorization-schema jobs. The first acceptance attempt completed these jobs against empty synthetic datastores, including a repeated application migration invocation. API startup now checks database identities and the authorization schema; readiness checks PostgreSQL, Redis and SpiceDB. | Complete image-level startup, incompatible/missing-schema and restart acceptance; finish operational documentation. Keep runtime database login separate from the migration owner. |
| 3. Owner claim | Implemented gateway-host claim CLI and migration 082: exact email/company, 24-hour expiry, refusal when any company exists, no pre-login role, normal-login redemption, audited creation/redemption, explicit claimant kind for later IdP groups. Seven focused claim tests passed, including expiry, concurrent attempts and an authorization outage. Added bounded delivery reconciliation for a redeemed claim's pending authorization outbox grant. | Actual image-level owner login passed, with no company before redemption and both required audits present. The newly added outbox recovery assertion and runtime reconciliation still need validation on the final candidate. |
| 4. Offline engine and later registration | Added automatic readiness-source firewall preparation and engine-package wiring retaining supervised restarts, non-root runtime, read-only root/tmp/shm, resource limits and `restart: no`. Added an external synthetic acceptance harness for gateway-offline installation/replacement, egress negative control, later API registration and a governed query. | Core end-to-end acceptance passed: offline startup/replacement, egress denial, later pinned registration and governed query. This does not cover every DEP-004–008 negative/ingest case. Wrong-pin refusal and replacement now have image-level records. Unknown-engine/cross-project and pending-ingest coverage still need completion against the final images. |
| 5. Console-derived egress synchronization | Recorded the clarified requirement below. Existing source.changed events and engine registry paths have been inspected. | Live in-place policy updates and heartbeat reconciliation are **not implemented**. Console display and conflict reporting are explicitly outside Stage 3 following the latest reader decision. No operator-maintained destination list is the target for the new package. |
| 6. GHCR publication and digest deployment | Package wrappers enforce image digests; the package assembler substitutes literal digests. Local AMD64 validation images exist. | GHCR authentication as trustrail is confirmed. Nothing has been published. Clean committed-revision release provenance, publication, registry digest verification and final acceptance against the distributed digests remain. |

## Readiness-source decision

The readiness-source firewall rule is **permanent**, derived from the existing engine-local readiness credential. Console-derived destinations are added alongside it after registration. The engine fetches assigned destinations on every heartbeat after registration, applies them in place, and reports the actually applied version. Console display and conflict reporting are outside Stage 3; never remove the readiness rule. This supersedes the earlier temporary-rule proposal. The existing readiness probe runs on startup and every supervised replacement; it is not changed into an ungoverned customer-data read.

The bootstrap derivation command is implemented. Its integration with the future synchronized policy remains unfinished.

## Validation and failed-run record

- Rebased core changes passed strict typecheck and lint before the core image builds.
- Twenty focused tests passed across package resolution (4), gateway readiness (3), console login/proxy routing (2), owner claims (7), and packaged migrations (4). They ran against an owned fresh database, which was removed afterward. These results precede the latest outbox-recovery and package-assembler changes; they are not a final Stage 3 gate result.
- All six **linux/amd64** core images built and passed secret and runtime layer audits: API, console, engine, egress, migrations and provisioning. Tags are `opintel-<image>:candidate-stage3-core-linux-amd64`. They are explicitly dirty-tree validation artifacts, not clean release builds.
- The first core acceptance run used fresh synthetic source and gateway datastores. Application migrations, their repeat invocation, SpiceDB datastore migration and authorization-schema loading completed. The owner-claim container then failed because its bundle imported `../../../native/duckdb.node`, which is intentionally absent from the provisioning image. Owner redemption, offline engine, replacement, registration and governed query were not reached.
- Cause: the CLI imported the broad tenancy index, pulling an unrelated native dependency into the bundle. The composition-root import now selects the claim writer directly. A regression test was added for executing the compiled CLI without source/node_modules/native DuckDB. The corrected local bundle's `--help` executed successfully; the provisioning image was rebuilt and passed both audits. The new regression test has not yet run through the final test suite.
- The failed acceptance result and service logs are preserved in `tmp/stage3-acceptance-uuYujM/`; its console log is `/private/tmp/opintel-stage3-core-acceptance.log`. The harness stopped its containers after failure; its synthetic volumes/records remain available.
- Core build evidence: `tmp/deployment-stages/stage-3/core/build.log` and `images.json`. The initial image manifest records the provisioning digest used by the failed attempt. The corrected provisioning build is separately recorded in `/private/tmp/opintel-stage3-core-provisioning-fixed.log` and `tmp/images/releases/candidate-stage3-core-provisioning.json`; do not confuse the two digests.
- No ARM64 build has been started here. ARM64 remains a native build on the ARM host from the committed revision.
- No full Stage 3 gate, Stage 3 commit, merge or push has occurred.

## Next steps and schedule risk

Next finish the corrected core-image acceptance and remaining ingest/trust proofs, then implement the approved source admission and heartbeat synchronization. Rebuild images with all final changes before final acceptance. Registry delivery still requires GHCR authentication. Finally run acceptance against the intended distribution artifacts, the completed-candidate gate, commit, merge and push, and report reproduction commands per deliverable.

**Wednesday 28 October is at risk.** The console-driven policy lifecycle, heartbeat/status work and registry publication extend the earlier Stage 3 scope. The offline package acceptance is still incomplete. This risk was reported immediately; there is no evidence yet supporting a firm completion promise for Wednesday. The requested checkpoint is Monday evening, 26 October, with the remaining work if the target cannot hold. This file does not establish a scheduled/background checkpoint.

GHCR namespace proposed: `ghcr.io/trustrail/opintel-*`. Docker had no configured GHCR registry login during inspection, and no authentication-ready confirmation has been received. The user's reply to that prompt clarified the permanent readiness rule; it did **not** confirm registry authentication. Do not paste registry tokens into chat.

## Subsequent acceptance attempt

The corrected provisioning image completed normal owner login against empty
gateway volumes, creating exactly one company only after login and recording
both claim and redemption audits. The engine reached local readiness with the
gateway stopped. The attempt then stopped in the external harness while locating
the child process: a JavaScript template string consumed the regular expression
backslash. No supervised-replacement or governed-query pass is claimed for this
attempt. Its record is `tmp/stage3-acceptance-4ivjsp/result.json`; the log is
`/private/tmp/opintel-stage3-core-acceptance-fixed.log`. The harness expression
now uses `[0-9]`, and a new acceptance run is in progress. This is not a gate run.

The worker-locator correction allowed offline startup and supervised replacement
(worker PID 18 to 114), with no engine registry row and gateway services stopped.
An unrestricted positive control reached the synthetic TCP listener; the engine
could not reach that undeclared destination. IPv4 OUTPUT was DROP with only the
readiness source and established-connection rules. The subsequent registration
request returned 401: the disposable Redis configuration intentionally has no
persistence, so stopping and restarting Redis invalidated the prior browser
session. This is a harness prerequisite failure, not evidence of engine
registration failure. The record is `tmp/stage3-acceptance-LpwHiR/result.json`.
The harness now performs normal login again after restarting gateway services.

## Historical stop and decisions (superseded by authorization below)

The latest run is `tmp/stage3-acceptance-g4JiTv/result.json`; its log is
`/private/tmp/opintel-stage3-core-acceptance-relogin.log`. It records owner
claim/redemption, offline replacement (PID 17 to 121), and the firewall positive
and negative controls, followed by a socket reset. No governed query passed.
All acceptance containers were stopped by the harness; records remain.
Timestamped API logs show pool errors at 02:53:14 and 02:53:54 UTC on 24 October
(during the deliberate stop and final cleanup). The API restarted at 02:53:43;
the result file was written at 02:53:53. Therefore the cleanup pool error does
**not** establish the cause of the earlier socket reset. Both findings remain
separate. Do not hide the shutdown defect by reporting a successful acceptance.

The pool's error lifecycle belongs to protected item 1.4. AGENTS.md says
“Never write code for these items” and identifies the tenant isolation wrapper.
A specific delegation is required before editing that file; no scope/security
logic has been changed. The earlier user instruction also says to stop on a
product test failure.

A separate application-behavior decision is pending for deliverable 5:
`src/modules/sources/application/source-registration.ts:42` tests a source
connection before saving its assignment. An assigned-only firewall cannot
permit a new endpoint at that point. The reader was asked to choose between
saving/assigning before testing, or a bounded authenticated pre-assignment
connection-test exception. Neither was assumed. AGENTS.md reserves changes to
application behavior and weakened governance assertions for review.

The harness now includes wrong-pin verification checks for the next candidate,
and an additional standalone-package digest-resolution test was added. These
latest additions have not been executed. The final gate has not been attempted.

## Authorized continuation and socket investigation

The reader authorized only an idle-client pool error handler in `scope.ts`, with
no change to pool sizing, acquisition or scoping, and a shutdown-drain test.
The source workflow decision is now explicit: save and assign before testing,
mark pending egress, automatically retest after the next applied heartbeat, and
retain failed sources as unreachable. These supersede the pending decisions above.

Before product edits, the transport-instrumented acceptance attempt
`tmp/stage3-acceptance-jlgHpy/` passed normal owner redemption, offline engine
replacement, egress denial, wrong-pin refusal and correct-pin verification.
It did not reproduce the fatal socket reset. It stopped at MCP authentication:
the external seed helper wrote `issued.keyShown` (a boolean) instead of
`issued.key` to its private fixture file. This is a test-fixture defect, not a
valid-credential product refusal. No governed-query pass is claimed.

Socket diagnosis: the historical reset preceded final shutdown, so it is not
attributable to the cleanup pool error. A disposable HTTPS reproduction using
the same blocking-child-command pattern reproduced `ECONNRESET` with
`reusedSocket: true` after the server's idle timeout. With `agent: false`, both
requests returned 200 and neither reused a socket. Evidence:
`/private/tmp/opintel-stale-socket.mjs` and
`/private/tmp/opintel-stale-socket-result.jsonl`. This establishes a concrete
harness stale-socket failure mechanism independent of PostgreSQL or shutdown.
It is the leading explanation for the original reset, **not a proven attribution**:
that old attempt did not record its request path or socket-reuse flag, and the
instrumented replay did not reproduce that fatal error. Do not state that the
historical reset and the pool error had the same cause. The harness will use
independent HTTPS connections across blocking Docker commands and retain safe
transport diagnostics; no product retry or authentication bypass is introduced.


### Narrow pool fix completed and tested

`src/platform/db/scope.ts` now attaches a pool `error` listener that emits only
a fixed event/message. It does not log the Error/client, change pool size,
alter acquisition/scoping, or export the pool. The existing mocked pool fixture
was adapted for the EventEmitter interface. The new real-PostgreSQL regression
terminates an idle backend, observes the safe event without an unhandled error,
checks that a subsequent scoped query works, drains the private pool with
`end()`, and verifies zero remaining clients. The private pool is captured only
by a test-time subclass; no product access was added.

All 26 tests in the shutdown, session-settings and export-boundary files passed
against a fresh isolated database, which was removed afterward. Record:
`/private/tmp/opintel-stage3-pool-focused.log`; normal-run metadata:
`test-results/normal/5768436d-e3b4-450d-bf71-78708c45dc2f/`.
This is focused validation, not the final Stage 3 gate.

The external acceptance seed now writes the actual one-time key into its private
fixture file, rather than the `keyShown` boolean. Acceptance HTTPS requests now
use `agent: false` to avoid stale pooled connections across synchronous Docker
commands. No failed request is automatically retried as a successful mutation.
A new acceptance run is in progress against the previously audited core image
digests; those images do not yet contain the new pool listener. Its outcome must
not be reported as final-candidate image acceptance.

Assignment-before-testing is recorded in the implementation plan and deployment
contract. The pending-egress persistence, heartbeat acknowledgment, automatic
retest and unreachable-state implementation is still outstanding, along with
the live companion-policy protocol and GHCR publication. No gate, commit, merge
or push has occurred.


### Corrected core acceptance passed

Command:

```sh
TAG=candidate-stage3-core PLATFORM=linux/amd64 node scripts/images/stage3-smoke.mjs
```

Result: `tmp/stage3-acceptance-4dlcmh/result.json` (exit 0).
Log: `/private/tmp/opintel-stage3-core-acceptance-transport-fixed.log`.
The result file records the six exact local image digests and isolated Compose
project names. Containers were stopped after the run; records were retained.

Passed: empty gateway database migration/schema jobs; normal owner login with
no pre-login company and both required audits; engine startup with gateway
services stopped and registry empty; supervised worker replacement offline;
undeclared-egress refusal with a live positive control; wrong-pin refusal and
cleared verification; correct-pin verification; one governed query returning
exactly the entitled synthetic row, with evidence ID
`01a16be3-53aa-7424-bd6a-2b5601e4ce3e`.

This run used fresh HTTPS connections and the corrected one-time-key fixture.
It did not reproduce the fatal socket reset. The earlier pool-error shutdown
issue is fixed in source and covered by focused tests, but these already-built
images still predate that change. This is a **core package acceptance pass**, not
completion of Stage 3, all DEP-004–008 cases, or final-image acceptance. Live
heartbeat egress, pending-egress automatic retest, pending-ingest acceptance,
remaining negative controls, final image rebuild/publication, final gate and
release operations remain outstanding.

Strict typecheck passed after the pool-handler and harness fixes (exit 0):
`/private/tmp/opintel-stage3-pool-typecheck.log`. `git diff --check` also passed.
No validation process from this continuation remains running. No full gate,
commit, merge, push or GHCR publication was performed. The next implementation
work is the approved pending-egress/heartbeat/retest lifecycle, not another run
of the same core acceptance candidate.

## Heartbeat lifecycle continuation

GHCR authentication as `trustrail` is now confirmed by the reader; the earlier
external authentication prerequisite is cleared. Publish only the final rebuilt
images and verify the distributed digests before the gate/release operations.

Implementation is underway on a dedicated engine-certificate heartbeat boundary,
versioned assigned-source policies, durable applied-version reporting, and
release of pending-egress work only on acknowledgment of the current policy.
Migration 083 is new; applied migration 082 remains unchanged. This work is not
yet integrated or validated and must not be reported as shipped.

The assignment-first path is being wired end to end: source creation no longer
contacts the source before persistence; verified engine assignment is checked;
queued introspection is held while `egress_pending` is true; acknowledgment of
the current policy releases it. The existing introspection worker performs the
automatic connection test and preserves an unreachable source on failure.
The console form now saves/assigns without a prerequisite network test and uses
the existing source-status display. No policy-version/conflict screen is added.

The engine-local controller implementation is in progress. It keeps the query
UID without general DNS access, resolves assigned names in the privileged local
companion, updates a read-only hosts view for PostgreSQL hostname/TLS handling,
and applies IPv4/IPv6 rules without recreating the engine. The new control/state
mount contains operational metadata only. These changes still require negative
controls, final audits and integration tests; no completion claim is made.

## Pending decision

None. The source-admission decision and narrow pool-handler authorization are
recorded, and GHCR authentication is confirmed. Remaining work is implementation
and verification within the approved scope.


### Heartbeat implementation and focused verification

Added shared strict Zod contracts, migration 083, `EngineEgress`, a PostgreSQL
policy repository, and a dedicated mTLS heartbeat listener. It checks the engine
certificate against the claimed project and registered verified engine, returns
only assigned credential references/identifiers, records the reported applied
version, and releases pending work only when that version matches the current
assignment snapshot. Repeated acknowledgments resume durable queued work after
a gateway restart. Source credentials remain engine-local.

Gateway verification now provisions the heartbeat binding over the existing
pinned engine connection. The engine forwards it to its local companion control
socket. The companion fetches on a five-second loop using the engine identity,
resolves assigned destinations locally, retains readiness access, rewrites the
hosts view and both firewall families in place, and reports applied versions.
Policy application and registration are serialized. Read-only engine mounts and
capability restrictions remain; the privileged companion owns policy/hosts
writes. Legacy static/S4 operation remains separate. This controller path has
**not yet passed container acceptance**, and its recovery/failure behavior still
requires dedicated tests before shipping.

Source creation now saves the verified engine assignment before source contact,
marks it pending egress, and excludes it from queued work until acknowledgment.
The form no longer requires a pre-save connection test. After release, the normal
introspection worker tests the connection; connection failures preserve an
unreachable source. The dedicated automatic-retest/failure tests and adaptations
to existing source-registration/conformance tests remain unfinished. DNS or
credential resolution failure in the companion also needs explicit end-to-end
coverage so it cannot strand a source indefinitely as pending.

Three focused tests passed using an isolated database migrated through 083:

- Unknown engine, wrong pin, unverified engine and cross-project heartbeat refuse.
- A saved pending source stays queued until its exact current policy is acknowledged.
- Assignment changes invalidate old acknowledgments; archived sources leave the policy.

Evidence: `/private/tmp/opintel-stage3-egress-focused.log`, normal metadata
`test-results/normal/bd2b81a0-46ad-4406-a8fa-1a70b5382db7/`. The isolated database
was removed. Strict typecheck passed in
`/private/tmp/opintel-stage3-egress-typecheck-final-progress.log`.

The external image acceptance harness now supplies the gateway heartbeat address,
waits for a real applied-version acknowledgment before its governed query, and
includes unknown/cross-project heartbeat negative controls. Its new version has
not run against rebuilt images yet. Published-digest acceptance, optional-ingest
proof and final release operations remain pending; these focused results are not
a gate result.

Lint and dependency-boundary checks passed (484 modules, 1,563 dependencies):
`/private/tmp/opintel-stage3-egress-lint.log`. No validation process remains
running from this continuation. No pending product decision or approval question
was raised; the remaining work stays within the authorized scope.

## Automatic retest and rebuild continuation

Five focused heartbeat tests now pass, including the actual source-registration
and introspection application path: zero source contact before acknowledgment;
one automatic connection test afterward; a failed connection retains the saved
source as unreachable. A separate case covers failed destination resolution,
held work, and automatic release when resolution recovers. Evidence:
`/private/tmp/opintel-stage3-retest-focused.log`, metadata
`test-results/normal/f7fd7776-5c50-4105-8c17-4fbdd0a60e0c/`.
The isolated migrated database was removed afterward.

Heartbeats now report unresolved source identifiers alongside the applied
version. Those destinations remain denied and their saved sources are marked
unreachable; successful assignments can proceed. Recovery releases the held
connection test. The protocol reports installation state separately from source
reachability, without including credentials or source values.

Existing source-registration tests have been adapted to perform the current
policy acknowledgment before awaiting jobs. Permission, custody, history and
retention assertions remain. The test and technical specifications now describe
the approved assignment-first workflow. Those adapted tests have not run yet.

The six-image AMD64 candidate rebuild is running with both the pool fix and
heartbeat changes, tagged `candidate-stage3-heartbeat`. Each image receives the
existing secret and runtime layer audits. Build log:
`/private/tmp/opintel-stage3-heartbeat-build.log`. No ARM64 build was started on
this host. The candidate is not a published clean-revision release.

The source-registration integration suite now acknowledges a real current
policy through `EngineEgress` before awaiting the existing jobs. Its F-001 case
explicitly asserts pending-egress persistence and no pre-save connector contact;
all prior permission, custody, archive-confirmation and history assertions are
retained. The suite still needs execution after the image-build audits finish.

The AMD64 rebuild completed successfully: all six images built and passed both
secret-layer and runtime-allowlist audits. Manifest:
`tmp/images/releases/candidate-stage3-heartbeat-api-engine-console-egress-migrations-provisioning.json`.
This candidate includes the pool error handler and the current heartbeat/source
workflow. No GHCR publication has occurred yet. The adapted source-registration
integration suite is now running against an isolated database before container
acceptance of these digests.

All 17 adapted source-registration integration tests passed, including real
PostgreSQL/sidecar connection and introspection after acknowledgment, custody and
permission refusals, archive confirmation, retained history, and demo recovery.
Log: `/private/tmp/opintel-stage3-source-registration-focused.log`; metadata:
`test-results/normal/cffa1de5-faee-42d8-a5cb-ac595de74261/`.
The isolated database was removed. These are focused checks, not the final gate.

Container acceptance is now running against the six rebuilt
`candidate-stage3-heartbeat` AMD64 images, including the pool fix, applied-version
acknowledgment before querying, and unknown/cross-project heartbeat negatives.
Log: `/private/tmp/opintel-stage3-heartbeat-acceptance.log`. The optional-ingest
outage proof, controller recovery/removal coverage, final publication and
published-digest acceptance are still outstanding.

The next ingest acceptance extension will create its synthetic landing fixture
outside the images, start the engine with an empty landing zone while the gateway
is stopped, then deliver one CSV and preserve its pending receipt through worker
replacement. After registration/assignment, it must deliver the same receipt
without re-landing duplicate rows. The configured receipt endpoint also needs to
be included in the derived operational egress policy; the current controller
only derives readiness, heartbeat and assigned-source endpoints. This is an
identified remaining integration gap, not a passed DEP-007 claim.


## Rebuilt heartbeat acceptance failure — 24 October

Command:

```sh
TAG=candidate-stage3-heartbeat PLATFORM=linux/amd64 node scripts/images/stage3-smoke.mjs
```

The run exited 1 while starting the egress companion. Gateway empty-state
migration/schema jobs and normal owner-claim redemption passed, including both
audit entries. The engine could not start because its prerequisite companion
never became healthy. This is a product startup failure; release progression
has stopped. It is not an environment-only failure or a gate result.

Evidence:

- `tmp/stage3-acceptance-VwNxa5/result.json` records exact image digests and checks.
- `/private/tmp/opintel-stage3-heartbeat-acceptance.log` records the failed command.
- `tmp/stage3-acceptance-VwNxa5/opintel-engine-proof-1792814336612.log` records
  `engine.egress_startup_failed`; exception text is intentionally withheld.
- The companion left its 35-byte hosts file, persisted empty binding state, and
  `control.sock` (mode 0755) in the isolated engine state directory. Startup
  reached control-socket creation. The next operations are socket chmod to 0666
  and writing the readiness marker. The mode did not change. Socket permission
  handling on the host bind mount is therefore the leading failure location,
  **not a confirmed errno/root cause**. No raw exception or secret was exposed.

The harness stopped all its containers and retained the isolated records and
volumes. No process from this acceptance remains running. No rerun occurred.
The next repair must identify the socket-operation failure with safe phase/error
classification, preserve the engine's no-capability/read-only controls, then
validate on a changed candidate. Optional-ingest receipt egress and outage proof,
remaining controller recovery/removal controls, final published-digest acceptance
and release operations remain outstanding.

## Authorized abstract-socket repair

The reader authorized replacing the filesystem socket with a Linux abstract Unix
socket in the engine/companion shared network namespace. Both ends now use the
same abstract address; no socket file, unlink or chmod is involved. The engine's
whole state-directory mount was removed; only its read-only hosts view remains.
The companion state directory continues to hold operational metadata only.

Startup failures now include an authored phase (configuration, TLS, stored
state, bootstrap policy/firewall, endpoint resolution, hosts update, firewall
apply, persistence, control listener or readiness marker), without exception
text or cause chains. The configured HTTPS receipt endpoint is now resolved and
included in derived egress alongside readiness and assigned destinations.
Rebuild and changed-candidate acceptance are next; this entry is not a pass.

The abstract-socket/receipt-egress correction passed strict typecheck:
`/private/tmp/opintel-stage3-abstract-typecheck.log`. The six-image AMD64 rebuild
and existing layer audits are running under tag `candidate-stage3-abstract`:
`/private/tmp/opintel-stage3-abstract-build.log`. The acceptance harness now also
asserts that startup creates no filesystem control socket. Added a focused
startup-diagnostic regression for authored phases and withheld exception/config
text; it will run sequentially after build validation.

All six `candidate-stage3-abstract` AMD64 images built and passed both layer
audits. Manifest:
`tmp/images/releases/candidate-stage3-abstract-api-engine-console-egress-migrations-provisioning.json`.
The startup-phase diagnostic regression is running before container acceptance.
No ARM64 build, publication, final gate or release commit has been performed.

The startup-phase regression passed: both configuration-read and TLS-read
failures report only the authored phase and safe fixed message, with no injected
configuration sentinel, path, errno or exception text. Log:
`/private/tmp/opintel-stage3-startup-phases.log`; metadata:
`test-results/normal/8d409bff-c2e9-4826-93c0-4f3ce623e6e0/`.
Changed-candidate image acceptance is running in
`/private/tmp/opintel-stage3-abstract-acceptance.log`.


## Abstract-socket acceptance and confirmed query failure

Command:

```sh
TAG=candidate-stage3-abstract PLATFORM=linux/amd64 node scripts/images/stage3-smoke.mjs
```

Record: `tmp/stage3-acceptance-Go1Llk/result.json`.
Log: `/private/tmp/opintel-stage3-abstract-acceptance.log`.
The record includes all six exact digests; the run exited 1 at the governed-query
assertion. Earlier checks passed: owner admission/audits, no filesystem control
socket, gateway-offline engine startup and worker replacement, undeclared-egress
denial with a live positive control, wrong-pin refusal, correct-pin verification,
policy acknowledgment before query, and unknown/cross-project heartbeat refusal.

The API recorded `mcp.refused` with reason `source_unavailable`. A read-only
inspection of the retained synthetic gateway database returned:

```text
source status | egress_pending | policy acknowledged | introspection runs
pending       | false          | true                | 0
```

Cause: `PostgresEngineRepository.assign` changes the existing connected fixture
source to `pending_egress`. `PostgresEngineEgress.heartbeat` acknowledges the
policy and changes it to `pending`. Assignment does not create an introspection
run, so the resume callback has no retest work. Query preparation correctly
requires `connected` and refuses it. This is the assignment/retest lifecycle gap,
not abstract-socket failure, a wrong pin, an unacknowledged firewall, or the
previous shutdown/socket-reset issue. Do not repair it by making the query accept
pending sources or by marking them connected without a successful test.

The next change must make assignment and retest scheduling coherent for existing
sources and exercise that transition through the normal worker. The external
fixture must retain its explicit setup/proof rather than silently overriding the
resulting source state. The source-creation path already has queued work and its
focused automatic-retest test passes; this failure exposes the separate
assignment path.

The API shutdown logs show the fixed `db.idle_client_error` event instead of an
unhandled exception. The harness stopped all acceptance containers. Only the
retained synthetic PostgreSQL container was briefly restarted for the read-only
status inspection, then stopped again; acceptance was not rerun. No process from
this continuation remains running. Publication, final gate and commit/merge/push
were not attempted after the product failure.

The configured receipt endpoint is included in the new controller's derived
policy, but the receipt/ingest outage proof has not yet run. Its status remains
unverified, not passed.

### Authorized reassignment repair in progress
Existing-source assignment now queues the normal introspection worker atomically, reusing queued work and retaining prior schema selection. Worker claiming checks pending egress under the same source lock. Focused success/failure cases added. The acceptance fixture now configures and designates its local development custody store, and waits for real introspection to reconnect before querying. This fixture storage is not a production independent-custody claim. Previous Go1Llk failure record is retained; no same-tree rerun.

Validation record: strict typecheck exited 0 (`/private/tmp/opintel-stage3-reassignment-typecheck.log`). Focused reassignment/egress run passed all 7 tests, metadata `test-results/normal/52c55149-571e-4468-907c-b5bd964779b4`, log `/private/tmp/opintel-stage3-reassignment-focused.log`. Lock-order review afterward removed assignment’s unnecessary introspection-run lock to avoid inversion with completion; queued claim still serializes on the source. Candidate build log: `/private/tmp/opintel-stage3-reassignment-build.log`. No gate has been run for this continuation yet.

Rebuild completed successfully: all six `candidate-stage3-reassignment` AMD64 images passed secret/layer and runtime allowlist audits; manifest `tmp/images/releases/candidate-stage3-reassignment-api-engine-console-egress-migrations-provisioning.json`. One changed-candidate acceptance run started, log `/private/tmp/opintel-stage3-reassignment-acceptance.log`, fixture directory `tmp/stage3-acceptance-k7GezT`. Focused regression has additionally been strengthened to start from a different assigned engine and verify preserved `public` schema selection; that test-only enhancement awaits validation.

### Reassignment candidate acceptance: fixture defect retained
`tmp/stage3-acceptance-k7GezT/result.json` failed waiting for normal introspection. Read-only inspection while the disposable database was running showed `pending|false|failed|Catalogue element identities and names must be unique within an object.` The worker was queued and executed, so the original missing-retest defect is repaired. The synthetic seed had inserted its `answer` column with no stable reference, whereas the real PostgreSQL connector reports `attnum::text` (`1` here). The aggregate correctly cannot equate those identities. Corrected only the external seed to record stable_ref `1`, matching its explicitly created one-column table; no product reconciliation or query assertion changed. This changed-harness run is permitted by the clarified changed-tree rule; the failed run is retained and will not be rerun unchanged.

Corrected-fixture attempt `tmp/stage3-acceptance-01dJh8/result.json` stopped before any acceptance check: Docker reports all predefined network address pools fully subnetted. Environment failure, not a product or gate result. Preserve record. Harness cleanup now removes only its own disposable containers and networks after collecting logs; named volumes and fixture records remain. The preceding k7GezT stopped containers/networks are being cleaned explicitly to free its three subnets. No global prune or customer-volume removal.

### Core acceptance passed after external fixture correction
`tmp/stage3-acceptance-VT0NIv/result.json` passed against all six audited reassignment image digests. Empty gateway install/claim/login, gateway-offline engine startup and supervised replacement, abstract control/no file, positive-controlled egress denial, wrong pin, valid pin, current heartbeat, unknown/cross-project refusals, normal reassignment introspection and governed query all passed. Query evidence `01a16e32-4e4b-7bce-8c80-c8406793e290`. Own containers/networks cleaned; volumes/logs retained.
Next is optional ingest: external synthetic CSV lands while gateway is stopped, receipt remains pending across worker replacement, then delivered after registration/assignment without duplicate customer rows. Added explicit gateway receipt listener/port wiring to the package, using existing runtime support; this Compose-only change does not alter audited runtime image bytes.

Optional ingest run started: `INGEST=1 TAG=candidate-stage3-reassignment PLATFORM=linux/amd64 node scripts/images/stage3-smoke.mjs`, log `/private/tmp/opintel-stage3-ingest-acceptance.log`, directory `tmp/stage3-acceptance-q1ah8J`. Runtime images unchanged; package explicitly exposes its configured mTLS receipt listener. Fixture and generated CSV remain external.

### Ingest acceptance passed
`tmp/stage3-acceptance-q1ah8J/result.json`: complete core and ingest passed. Filing `8d27a7af-de5a-4aba-b6c0-c475cfc62d54` committed offline, retained its exact receipt across worker replacement, delivered after registration/assignment, and remained one customer row. Governed evidence `01a16e37-ee29-709c-97c5-c30279cad1fd`. Firewall includes the configured receipt endpoint alongside permanent readiness.
Final review identified and repaired narrow failure paths before publication: invalid heartbeat failure IDs must be rejected before storing applied version; registration failure clears verified metadata; companion registration restores prior in-memory state after failed install/persist; gateway/receipt DNS failure no longer prevents local startup, and periodic installation refreshes their resolution even when policy fetch is failing. These runtime changes require a fresh candidate rebuild/acceptance before publication.

Final review focused run: 32 tests passed and one package assertion failed (`/private/tmp/opintel-stage3-final-review-focused.log`, metadata `56426c12-85ac-4eaa-b696-0c07e38b9da0`). All strengthened reassignment/registry/routing tests passed. The package test rejected gateway-owned `ENGINE_HEARTBEAT_*` listener configuration by prefix, not a dependency on the engine package. Corrected it to assert those three exact gateway listener values before applying the unchanged no-engine/no-external-shared-resource assertion to the remaining configuration. This is a harness correction; no isolation or governance assertion removed.

Final rebuild: `candidate-stage3-final`, all six AMD64 layer/runtime audits passed; `/private/tmp/opintel-stage3-final-build.log`, manifest `tmp/images/releases/candidate-stage3-final-api-engine-console-egress-migrations-provisioning.json`. Combined core/ingest acceptance started: `/private/tmp/opintel-stage3-final-acceptance.log`.

Additional guard regression added in `test/mcp-query.test.ts`: pending egress, pending introspection and unreachable sources must refuse before execution, return no result rows, and record `source_not_ready` in evidence. Existing connected-only application guard is unchanged. The new tests await the final validation run.

Final rebuilt core and ingest acceptance PASSED: `tmp/stage3-acceptance-Ff9MJ2/result.json`. Evidence `01a16e42-94fe-72b2-99bc-19c1a274d5ab`; ingest filing `4c379212-d74c-44c0-ac89-28318e4e0dc1`, one customer row, same receipt and filing across offline replacement. Publication of these exact AMD64 candidate images started using `scripts/images/publish.mjs --candidate`; dirty candidate provenance remains explicit and is not represented as a clean release. Log `/private/tmp/opintel-stage3-candidate-publication.log`.

First publication helper stopped at Docker push exit 1 before writing a published manifest; its initial implementation did not retain Docker stderr, so the exact cause is unknown. An explicit diagnostic push of the same API candidate succeeded, digest `sha256:6f676d01ca2261de27c87f24d9aad24b1996012a1c8f9dc59d7240a167d37f20`. No authentication change or credential read was needed. Publisher now retains Docker stderr on failure; continuing idempotent publication. This is not a gate run or a product-test retry.

Registry diagnostic: the API digest was independently verified by `docker buildx imagetools inspect` at GHCR, including AMD64 and its attestation. The continued publication log shows API and engine succeeded, then the console push returned explicit registry `denied` (not an API overwrite failure). Publisher now checks for the exact audited remote digest and skips an already-present artifact, rather than attempting unnecessary tag overwrites; missing artifacts still require push and subsequent remote verification. No access-control workaround or credential change.

Next resume verified API/engine and successfully published console; egress then returned `denied`. The same account can publish these artifacts on a subsequent attempt; the underlying registry denial cause is not established. Continue only missing digests with all attempt logs retained, without changing credentials or access policy.

### GHCR candidate publication completed
All six exact audited digests remotely verified; manifest `tmp/images/releases/candidate-stage3-final-published.json`. Registry denied some first attempts; resumptions succeeded without a credential/access-policy change. Logs `opintel-stage3-candidate-publication{-continued,-resume,-missing,-jobs}.log` in `/private/tmp` preserve the sequence.

| Image | AMD64 GHCR digest |
|---|---|
| api | `ghcr.io/trustrail/opintel-api@sha256:6f676d01ca2261de27c87f24d9aad24b1996012a1c8f9dc59d7240a167d37f20` |
| engine | `ghcr.io/trustrail/opintel-engine@sha256:c3c20a599df6488dfa24f13254ab16c922c762e00f9e57280a2ed5f88b46fe01` |
| console | `ghcr.io/trustrail/opintel-console@sha256:49ea5c04d3d6de3be32fc3ba9124fe91d856a3fe0fe8f1d93022bf178e546726` |
| egress | `ghcr.io/trustrail/opintel-egress@sha256:6947f6f6553a650e83bd812a8c038321a8367225e8ec511a7293c3a025d66c34` |
| migrations | `ghcr.io/trustrail/opintel-migrations@sha256:abfb3672bf791c3a433ce24bfd19a3ff4ca85327c2b51844d7769f9846791552` |
| provisioning | `ghcr.io/trustrail/opintel-provisioning@sha256:b9040f97c2c819b5a4d2e6e6b88bc62ac881a3f8da564f595c1a399d7fabfb74` |

Published-digest acceptance started with `RELEASE_MANIFEST=tmp/images/releases/candidate-stage3-final-published.json INGEST=1 TAG=candidate-stage3-final PLATFORM=linux/amd64 node scripts/images/stage3-smoke.mjs`; log `/private/tmp/opintel-stage3-published-acceptance.log`.

### Published-digest acceptance passed; completed-tree gate starting
`tmp/stage3-acceptance-dO9o7b/result.json` passed with packages containing the six literal GHCR digests and explicit pulls from GHCR. Query evidence `01a16e65-db68-7953-8dc5-4dafd80669b5`; durable ingest filing `5a43914b-d0c8-4ffe-b04b-abd276f1a816`, one customer row. Logs `/private/tmp/opintel-stage3-published-acceptance.log`.
One completed-tree `npm run check` is starting, log `/private/tmp/opintel-stage3-completed-gate.log`. No same-tree retry. Clean-release provenance remains separate from these explicitly marked candidate images; the tested runtime source must be committed only after this gate is green, then rebuilt from a clean checkout for release labels/digests before final release acceptance and merge/push.

### Completed-tree gate failure — 24 October 2026

Gate record: `docs/review/stage3-gate-20261024.json` (retained copy of
`test-results/gate.json`). Full log:
`/private/tmp/opintel-stage3-completed-gate.log`. Normal-run metadata:
`test-results/normal/58f3c199-588a-47cc-903b-843be769d782`.

- Preflight: PostgreSQL and Redis reachable; isolated database migrated from zero.
- Passed: strict typecheck, conformance typecheck, unchanged lint, production
  artifact exclusion, 59 conformance tests / 54 routes / zero findings.
- Normal tests: **230 files passed, 2 files failed; 2,041 tests passed, 2 failed**.
- Final browser/MCP smoke: **not run**, because the normal tier failed.
- Cleanup: isolated database dropped successfully. Wall time **1,369.45 seconds**.
- New regressions passed: all eight engine-egress tests, all 17 engine-registry
  tests, all five deployment-package tests, and the three MCP pending-egress /
  pending / unreachable refusal tests within the 26-test query suite.

Failures:

1. `test/provisioning-runtime.test.mjs:14`: compiled owner-claim `--help` exited
   without output (`expected '' to contain 'claim expires after 24 hours'`).
   The entrypoint guard in `src/platform/ops/owner-claim.ts` compares
   `resolve(process.argv[1])` with `fileURLToPath(import.meta.url)`. On this Mac,
   the test's temporary directory is `/var/folders/.../T`, whose canonical path
   is `/private/var/folders/.../T`. This is consistent with the guard suppressing
   `main()` when Node resolves the module through the canonical path. The actual
   provisioning image had already completed the owner claim and normal-login
   redemption in both local and published-digest acceptance. Proposed repair:
   canonicalize the entrypoint comparison, keeping every claim/admission rule
   and the compiled-runtime assertion unchanged. **Not applied or rerun.**
2. `test/sidecar-http.test.ts:195`: exact OpenAPI path assertion omits the newly
   authorized `/egress/register`; actual shared contract includes it. The
   checked-in `sidecar/openapi.json` also needs regeneration from that contract.
   Proposed repair: include the new route in the exact expected list, assert its
   pinned application-certificate protection, and regenerate the document.
   Preserve the request-size and every existing route/security assertion.
   **Not applied or rerun.**

Release progression stopped at the failed gate. No commit, merge or git push.
There is no clean committed-release build yet; do not represent the published
candidate images or generated candidate packages as a finished client release.
No new permission question is pending.

### Deliverable status and reproduction at this stop

| Deliverable | Result |
|---|---|
| 1. Independent gateway / engine packages | Implemented; standalone literal-digest packages accepted in distinct Compose projects. Operator instructions are in `deploy/gateway/README.md` and `deploy/engine-package/README.md`, copied into assembled packages. |
| 2. Explicit migrations / schema jobs | Fresh gateway volumes, repeated application migration job, SpiceDB datastore/schema jobs and compatibility-only API startup passed published-digest acceptance. Applied migration 082 still matches its saved bytes. |
| 3. Owner claim | Image-based claim, normal-login redemption and audit checks passed; 24-hour/once-per-installation domain tests passed. Host compiled-CLI help entrypoint regression fails as above. |
| 4. Offline engine / later registration | Local readiness and supervised replacement with gateway stopped passed; abstract control creates no socket file; wrong pin, unknown certificate and cross-project checks passed. |
| 5. Heartbeat egress and retest | Permanent readiness and configured receipt destinations retained; assignment queues normal introspection, current acknowledgment releases it, success reconnects and connection failure retains unreachable. Query refusals and evidence tested. Ingest retained the same filing/receipt across offline replacement and delivered exactly once after registration. |
| 6. GHCR publication | All six AMD64 validation candidates published and remotely verified; table above lists exact digests. Clean-release publication awaits a green gate and committed source revision. ARM64 remains native-host work from the committed revision. |

Commands already executed successfully (acceptance creates synthetic external
fixtures, removes only its own containers/networks and retains its volumes/logs):

```sh
BUILD_CANDIDATE=1 TAG=candidate-stage3-final make build IMAGE=all PLATFORM=linux/amd64
node scripts/images/publish.mjs tmp/images/releases/candidate-stage3-final-api-engine-console-egress-migrations-provisioning.json tmp/images/releases/candidate-stage3-final-published.json --candidate
RELEASE_MANIFEST=tmp/images/releases/candidate-stage3-final-published.json INGEST=1 TAG=candidate-stage3-final PLATFORM=linux/amd64 node scripts/images/stage3-smoke.mjs
```

The publication output file is intentionally exclusive-create; use a new output
path when reproducing publication. Package a candidate independently with:

```sh
PLATFORM=linux/amd64 node scripts/images/package.mjs tmp/images/releases/candidate-stage3-final-published.json /absolute/new/package-directory --candidate
```

The failed gate was `npm run check`. Its record is preserved; it was not rerun.
Unrelated `docs/master-backlog.md`, `docs/review/stage2-status.md` and the existing
Python cache remain untouched and uncommitted.

### Authorised two-repair continuation
Applied realpath comparison on both sides of the owner-claim entrypoint. Claim creation/redemption rules unchanged. Updated the exact sidecar path list and added `/egress/register` certificate security/refusal assertions without removing existing request bounds or route checks. Regenerating `sidecar/openapi.json`, then one changed-tree gate. User explicitly orders commit, merge and push after green, followed by clean-release build/publication/final acceptance.

### Authorised repairs: gate passed
OpenAPI generation initially hit the sandbox restriction on tsx IPC; the approved elevated generation completed. Owner-claim now uses `realpathSync` on both sides. `/egress/register` is present in the exact route list and regenerated OpenAPI, with explicit mTLS declaration and missing/CA-trusted-but-unpinned client rejection checks.

Gate: `/private/tmp/opintel-stage3-authorised-repairs-gate.log`; retained record `docs/review/stage3-gate-authorised-repairs.json`. All seven tiers passed, including 232 files / 2,043 normal tests, 59 conformance tests with zero findings across 54 routes, and the sign-in → pool → row filter → authenticated MCP query → persisted receipt smoke. Fresh isolated database removed successfully. Wall time **1434.3 seconds**. This is one gate on the changed tree; the prior failed tree was not rerun.

Proceeding with the authorised source commit, fast-forward merge and push before the clean-release build. Unrelated backlog/status/cache files will be excluded.
