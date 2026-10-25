# Stage 4 progress

Status: implementation merged/pushed at `35610ad`; seven amd64 images published;
fresh published-digest DEP-009–011 acceptance PASSED on 25 October 2026.
The explicitly requested full gate on clean `35610ad` PASSED all seven tiers,
including 2,073 tests in 238 files and browser/MCP smoke, in 1,579.33 seconds.
Authoritative Stage 4 gate: `stage4-gate.json`. The earlier failed gate is retained
unchanged as `stage4-gate-first.json`; focused checks are not substituted for the
new full gate. Stage 5 remains pending.
Release: `stage4-release-amd64.json`; acceptance: `stage4-release-acceptance.json`.

Scope: DEP-009–011, independent package operator jobs for provisioning,
reinsurance governance, explicit synthetic seeding, preparation and soak.
Jobs run inside the gateway Compose project using package environment settings.
Existing decisions and credentials must survive reruns unchanged; conflicts fail.
Private output stays outside images and source control.

The existing development seeder starts local services and combines data creation,
governance and lifecycle credential changes. The existing soak can print PASSED
with denied certificate exchanges and expired lifecycle probes. These paths are
not sufficient for Stage 4 acceptance and will not serve as its success record.

Required exit record: published AMD64 digests, package installation, normal owner
claim/login, provision, seed, unchanged rerun, packaged API XQ connection check,
certificate exchange, escrow/redemption, preparation and passing 120-second soak.
Then retain gate and release records. Unrelated backlog edits, Stage 2 status and
Python cache are preserved.

## Implementation checkpoint

Added separate provisioning/demo-tools image entries and gateway Compose jobs.
Provisioning creates/compares project and engine state through existing services,
checks existing administrator authorization, and saves private resumable output.
The demo job separates source seeding, governance, explicit lifecycle setup and
renewal, API XQ connection checks, read-only preparation and timed execution.
The shipped soak excludes its self-contained test/reset branch at build time.

The source writer requires the explicit V-01/seed 1 target and schema names,
compares existing schemas/rows before mutation, ANALYZEs and verifies estimates.
Governance waits for actual heartbeat acknowledgment/introspection and uses the
existing declaration, entitlement and credential services. Missing saved keys,
credential inventory changes and conflicting decisions refuse rather than rotate.
Preparation requires all four declared certificates and both pools' successful
escrow/redemption, and fails expired lifecycle prerequisites before timing.

Initial strict typecheck and unchanged lint passed before the latest tests and
acceptance harness were added. These are not the final gate. The first image
build was blocked by sandbox Docker access; the authorized attempt then found
Docker Desktop stopped. Docker Desktop was started explicitly, and the build is
in progress. No Stage 4 live XQ or published-digest acceptance has passed yet.

## Candidate image and installation checks

All seven AMD64 candidate images passed secret and runtime-layer audits; manifest
`tmp/images/releases/candidate-stage4-api-engine-console-egress-migrations-provisioning-demo-tools.json`.
The first fresh-package acceptance attempt, `tmp/stage4-acceptance-oVABa4`,
completed migrations/schema and owner claim, then failed because an unrelated
container occupied console port 13873. Its result and service logs are retained.
No normal owner login, provisioning or XQ pass is claimed for that attempt.
The harness now preflights distinct Stage 4 ports before creating containers.
No unrelated container was stopped. A new acceptance attempt is in progress.

The second candidate attempt (`tmp/stage4-acceptance-E1UXNe`) completed fresh
installation, normal owner login, core provisioning and seeding. The **packaged
API XQ connection check passed**, recorded in its private output check JSON.
Governance then failed in the certificate agent process with an unhandled
`ECONNRESET` on a pipe. A separate source-free image diagnostic reproduced it.
This is not a successful certificate exchange or escrow/redemption record.

The existing host helper passes a decoded private key to OpenSSL through
`/dev/fd/3`. Linux cannot reopen Node's socket-backed descriptor as a key file.
The agent now uses a mode-600 key file in a private directory only after verifying
Linux tmpfs, removes it afterward, and handles pipe errors without crashing.
Other platforms retain the pipe path. The key never enters argv, IPC, the API,
image layers or host persistent output. This repair still needs image validation.

Operator-only concurrent-write guards now check decisions/declarations/settings
under the existing aggregate locks before saving. The ordinary API's update
semantics are unchanged; operator provisioning refuses concurrent decisions.

## Focused validation

The initial 60 focused tests passed in seven files (61.16 seconds of Vitest
execution), using an owned fresh application test database and a separate owned
synthetic source database. Both were cleaned up. Coverage includes DEP-009
private output/locking and setting conflicts, intervening field/row/declaration
conflicts, DEP-010 unchanged reruns and incompatible/empty table preservation,
DEP-011 expired lifecycle prerequisites, and real OpenSSL token unwrap/failure.
The latest settings-snapshot regression was added afterward and awaits validation.

Strict typecheck passed after the guarded-service changes. A focused lint run
found one unused `existsSync` import in the acceptance harness; it was removed.
Lint rules were unchanged. The completed-candidate gate has not run.
The initial image manifest is retained at
`tmp/deployment-stages/stage-4/initial-candidate-images.json`; a repaired candidate
build is underway. No clean release, merge, push or publication is claimed.

Agent bundle mounts were separated from the API's XQ directory: only demo-tools
receives `GATEWAY_AGENT_CERTIFICATES_DIRECTORY`; core provisioning receives no
agent keys. Added a package boundary regression. The ten ordinary callers are
also checked against their persisted current key hashes and active public
associations before resume. Altered or rotated credentials become conflicts.

The repaired-image attempt `tmp/stage4-acceptance-fmcFXg` completed gateway
installation and normal owner login, then stopped before engine preparation:
Docker reported that its default address pools were fully subnetted. The empty
`stage4-certificate-diagnostic_default` network created by this task was removed;
no unrelated networks, containers or volumes were pruned. This attempt does not
establish certificate or soak success. Its failed result and service logs remain.

Latest strict typecheck and unchanged lint passed. The additional focused run
passed 20 tests in three files, including stale settings snapshots and the
agent-key/API mount boundary; this overlaps the earlier 60-test run.
The final demo-tools candidate rebuild includes exact discovered schema/type
checks and per-certificate/verified-value/receipt metadata in preparation reports.
The full completed-candidate gate has not run yet.

The final candidate attempt `tmp/stage4-acceptance-5n0PA8` completed normal
owner login, independent engine startup, core provisioning, synthetic seeding
and the packaged API XQ connection check. Governance/certificate acceptance is
still running; no certificate, escrow or soak pass is claimed at this checkpoint.

All four requested certificate exchanges (223, 224, 225, 226) returned HTTP 200
in the final candidate governance job. Actual introspection and governance
completed: three sources, six objects, two pools, ten callers and 85 declared
scenarios. The Linux tmpfs unwrap repair is now exercised successfully in the
packaged agent. Rerun, escrow/redemption, preparation and soak are pending.

The candidate rerun preserved the database snapshot and private credential
manifest byte-for-byte. Preparation passed all four certificate exchanges,
verified 11 redeemed custody values across both pools and checked receipt
ownership. Both explicit preparation and the soak's own preflight passed.
The two-minute timed soak is running; its outcome is not yet recorded.

The 120-second candidate soak FAILED with 41 declared-scenario mismatches:
37 source_unavailable, three budget_exceeded and one dependency_unavailable
(being investigated).
It recorded zero operational errors and skipped receipt checks, 25 verified
custody values, and no custody refusals/skips. These successes do not override
the failed scenario assertions. The earlier interim zero-error count excluded
alarm events; the final invariant count is authoritative. The full gate and
publication remain pending; no governance assertion was weakened.

The failed fixture inherited Stage 3's two source connections and 8/9-second
statement/operation deadlines. Its log includes source_connections_saturated,
interruption_unclassified and subsequent engine_registry refusals. The new
fixture declares eight source connections, 30/35-second source deadlines and
three-second per-agent pacing for ten callers. Safe timing diagnostics are on.
This changes acceptance installation capacity, not production defaults or any
scenario expectation/refusal assertion. A fresh run will test that hypothesis;
no passing outcome is assumed.

The capacity attempt `tmp/stage4-acceptance-yb1WrG` stopped at API startup:
the existing opt-in local diagnostics writes `tmp/diag`, which the shipping
API's read-only filesystem correctly disallows. That harness-only diagnostic
flag was removed; filesystem protections remain unchanged. No load or XQ
result is claimed for this attempt. Service logs and the failed result remain.

The capacity-corrected run `tmp/stage4-acceptance-SJfRDC` failed with 16
scenario mismatches, all source_unavailable/engine_registry. There were no
source-connection saturation refusals, operational errors or skipped receipt
checks; 30 custody values were verified. Capacity alone did not solve it.

The live egress reconciler rebuilt OUTPUT via many separate commands, flushing
active rules on each heartbeat poll. It now installs each family in one atomic
iptables-restore commit with identical reply-only/root-DNS/destination rules.
On any installation failure it removes prior destination authority under DROP
and propagates failure. Legacy/S4 static firewall code is unchanged. New focused
regressions check atomic commit boundaries and failure cleanup; Stage 4 package
acceptance now includes a reachable positive control plus denial of an undeclared
destination. Fresh image/load validation is still required.

Strict typecheck passed for the atomic installer. The initial new tests failed
on an unsupported ESM spy, while the nine existing egress tests passed. The
corrected command-injection harness passed all 11 tests in three files (7.36
seconds of Vitest execution), including existing identity, acknowledgment,
source-failure and reassignment cases. No assertion was removed. The egress
candidate image rebuild/audits are now running.

Atomic-egress attempt `tmp/stage4-acceptance-F32OWR` still failed the soak;
the atomic installer is not sufficient to resolve the registry refusals. Its
positive-controlled undeclared-destination denial, unchanged rerun, all four
certificate exchanges and both-pool escrow preparation passed. The next change
adds authored diagnostic stage/reason codes at registry/probe failures, without
exception text, keys or sentinel material, to identify the remaining failure.
No soak assertion has been changed.

Atomic-egress run summary: 26 invariant breaches, zero operational errors,
40 verified custody values. It remains a failed acceptance record. Safe registry
and HTTPS-probe stage diagnostics now pass strict typecheck, unchanged lint and
20 focused tests in two files (20.26 seconds of Vitest execution). The diagnostic
API image is rebuilding; source/identity/custody assertions remain unchanged.

Diagnostic attempt `tmp/stage4-acceptance-aKrO9G` failed with 25 scenario
mismatches and zero operational errors; 10 custody values were verified. API
logs identify ABORT_ERR transport deadlines at /health and /egress/register
(two each), with no token-attestation failure or engine process replacement.
The next fixture explicitly sets UV_THREADPOOL_SIZE=16 for the engine: native
DuckDB work otherwise shares the default four libuv workers with TLS/filesystem
work. This is a capacity hypothesis to verify, not a passing result or a change
to verification deadlines, governance assertions or query concurrency.

Worker-capacity attempt `tmp/stage4-acceptance-vE7hng` also failed. Its logs
show transport ABORT_ERR at egress registration, health and token attestation;
16 libuv workers did not resolve it. No workload assertion was weakened. Probe
diagnostics are being narrowed to TCP/TLS/response phase and elapsed time, and
the next disposable candidate target will be retained for direct inspection.
The final published-digest exit validation will still use a fresh installation.

Retained target `tmp/stage4-acceptance-KZKos3` failed with 35 scenario
mismatches and zero operational errors, while verifying 25 custody values.
The narrowed diagnostics show four 9-second TCP-connect timeouts, before TLS,
on the Docker Desktop special host route `192.168.65.254`. Idle probes from
both container and host each passed 200/200. During a repeat failing soak,
120/120 host probes passed (median 18 ms, maximum 307 ms), with zero engine
listen/backlog drops. Peak sampled engine memory was 125.3 MiB; this was not
memory exhaustion. All diagnostic records remain under `/private/tmp/opintel-stage4-load-*`.

Acceptance now accepts an explicit STAGE4_HOST_ADDRESS; the next fresh target
uses this host's private interface 192.168.7.46 instead of Docker Desktop's
special host proxy address. TLS SANs and all package endpoints use that declared
address. The retained target's own containers/networks are being removed after
log capture; its volumes and private evidence are preserved.

Private-interface attempt `tmp/stage4-acceptance-y86HaO` failed source readiness;
192.168.7.46 is not reachable from this engine container. TCP checks also found
192.168.65.1 and 172.17.0.1 cannot reach the published engine/source ports here.
Only Docker Desktop's special host route is reachable. The retained diagnostic
target was restarted using its original settings; the packaged seeder restored
its disposable synthetic source without changing application decisions or keys.

The transport repair retries only an initial TCP-connect stall, once, within
the original operation deadline. These control probes are read-only or idempotent
registration. A successful retry still requires the full pinned-TLS handshake
and valid response. TLS/pin/HTTP failures and query execution are not retried.
Persistent outage keeps the original deadline. Focused tests exercise recovery,
persistent stalls, wrong pins and HTTP refusal without altering governance checks.

Bounded-connect recovery passed strict typecheck, unchanged lint and all 22
focused registry/routing tests (25.58 seconds of Vitest execution). The new
regressions use real pinned TLS after an intentionally withheld initial lookup,
verify the original total deadline under persistent stalls, and prove wrong-pin
and HTTP refusals make no retry. An audited API rebuild is in progress before
retesting the retained disposable installation.

The first retry-image attempt stopped during preparation with HTTP 401 because
the diagnostic observer session had expired. Normal owner login was refreshed
through the request-link/callback flow; no pool credential changed. The ensuing
120-second soak failed with two declared-scenario mismatches: 13 initial stalled
TCP probes were retried, 12 recovered, and one second connection also stalled.
Its record is `/private/tmp/opintel-stage4-load-1792947647363-*`.
The recovery bound is now at most four TCP connections within the same original
operation deadline: first three connect windows at one second, final connection
gets the remaining time. No TLS/pin/HTTP or query execution retry is introduced.

The four-connection bounded recovery passed strict typecheck, unchanged lint,
and all 22 registry/routing tests (21.92 seconds). The rebuilt amd64 API passed
layer and runtime audits. Its first diagnostic run refused preparation because
the dedicated lifecycle grace window expired before execution; no soak ran.
Normal owner login was refreshed and `demo-tools lifecycle-renew` explicitly
renewed only dedicated probes, preserving the ten ordinary callers and archiving
prior probe records. A new packaged two-minute diagnostic run is in progress.

The four-connection diagnostic run also failed: two declared-scenario mismatches,
zero operational errors, and 15 custody values checked. One egress-registration
TCP connection exhausted all attempts within the original deadline. Record:
`/private/tmp/opintel-stage4-load-1792956174922-*`. No acceptance claim is made.
The next diagnostic run retains ten callers and all assertions, with explicit
10-second per-caller pacing to measure capacity on this emulated amd64 host.

The paced diagnostic soak PASSED: `2026-10-25T19-27-55.857Z-1.jsonl`,
120 seconds, ten callers, 78 queries, zero invariant breaches/operational errors,
zero skipped receipt checks, ten custody values verified and all four certificate
exchanges HTTP 200. There were three `source_unavailable` outcomes in exploratory
queries; they are retained in the report, not described as zero refusals. All
executed declared scenarios passed. This is limited two-minute coverage, not the
Stage 5 proof. Evidence: `/private/tmp/opintel-stage4-load-1792956463558-*`.
The acceptance harness/runbook now explicitly use 10,000 ms per-caller pacing.
Published-digest acceptance remains pending. The completed candidate gate is next.

The single completed-candidate gate FAILED after 1,335.05 seconds. Typechecks,
lint, production exclusion and router conformance passed; normal tests had
2 failures / 2,073 tests (236/238 files passed). The browser/MCP tier did not run.
The original record is `stage4-gate-first.json`; it will not be replaced by a retry.
Failures: the owner-claim artifact inventory still expected the pre-Stage-4 image;
and G-018 cancellation closed the source socket before its cancellation SQLSTATE
arrived. The inventory now includes the explicit operator/native artifacts and
removes them before testing owner-claim independence. Source cancellation now
briefly drains the canceled operation before closing, with a one-second bound;
the original timing and SQLSTATE assertions remain unchanged. Focused verification
and the previously unrun browser/MCP tier are required; no green full gate is claimed.

Post-gate fixes passed strict typecheck, unchanged lint and all 11 tests in the
two affected files (12.75 seconds). G-018's original SQLSTATE, 2.5-second bound
and released-connection assertions are unchanged. The previously unrun
browser/MCP smoke tier is running once against a fresh migrated database.

The previously unrun browser/MCP smoke tier PASSED once (34.1 seconds): sign-in,
pool, row filter, authenticated MCP query and persisted receipt decision.
Validation status is deliberately not a green full gate: one full gate failed,
the two defects were fixed and passed their 11 focused tests, typecheck/lint
passed on the fixes, and the remaining smoke passed. Release build/publication
and fresh published-digest acceptance are next.

Implementation commit `35610ad` was fast-forward merged and pushed to main.
All seven clean amd64 images built at that commit and passed layer-secret and
runtime allowlist audits. Build record:
`/private/tmp/opintel-stage4-release-35610ad/tmp/images/releases/35610ad-api-engine-console-egress-migrations-provisioning-demo-tools.json`.
Publication to GHCR is in progress, followed by a fresh package installation
against those exact published digests. Initial unrelated workspace files remain
untouched.


## Published amd64 exit acceptance

Fresh installation `/private/tmp/opintel-stage4-release-35610ad/tmp/stage4-acceptance-yq1vOf`
PASSED against the exact seven GHCR digests in the acceptance result. Normal
owner claim/login, independent provisioning, synthetic seeding, reinsurance
governance, egress-denial positive control and byte-identical rerun state/private
manifest checks all passed. Ordinary keys and existing decisions were unchanged.

The packaged API XQ check was reachable/authenticated with no provider failure.
Its optional dashboard result was `credentials_missing`, retained verbatim.
Certificates 223, 224, 225 and 226 each exchanged with HTTP 200. Preparation
verified 11 redeemed values and persisted receipts across both pools. The
120-second soak used ten callers at 10,000 ms pacing: 70/70 queries succeeded,
zero refusals, zero invariant breaches, zero operational errors, zero skipped
receipt checks, and ten custody values verified. Nine initial TCP stalls recovered
within the bounded probe deadline; there were zero engine-verification refusals.
Only 10/85 distinct declared scenarios were exercised during this short run;
this is not exhaustive scenario coverage or the Stage 5 thirty-minute proof.

The raw result's legacy `tag` field is the unused local-image fallback label
`candidate-stage4-core`; `published: true`, `candidate: false`, the source revision
and every exact GHCR digest identify the actual clean release. The release
manifest's authoritative tag is `35610ad`. The raw acceptance record is preserved
unchanged. Disposable acceptance containers/networks were removed; private
outputs, logs and volumes remain available locally. No credentials are committed.

Generated package archive:
`/private/tmp/opintel-stage4-packages-35610ad-amd64.tar.gz`.
The package contains pinned Compose definitions, wrappers and runbooks only;
operator settings, source credentials, certificates and private manifests are
external. Native ARM64 reproduction uses the exact image-source revision
`35610ad4dac409abb83cb7c4048546573ad777f7`, builds all seven targets with
`PLATFORM=linux/arm64`, publishes that architecture's manifest, then runs the
same acceptance harness with that manifest and the existing licensed provider
configuration. Build/acceptance-host dependencies are separate from the shipped
operator jobs, which run entirely inside the gateway Compose project.


## Authorized full gate on the published source revision

At the user's explicit request, `npm run check` ran in a clean detached checkout
of main's image-source commit `35610ad4dac409abb83cb7c4048546573ad777f7`.
Locked dependencies and the signed pinned scanner were prepared first; the gate
used existing test services and created/dropped its own fresh migrated database.
No source changes were made during the run. All seven sequential tiers passed:
strict typecheck, conformance typecheck, unchanged lint, production exclusion,
router conformance (54/54 routes, zero findings), 2,073 normal tests in 238 files,
and browser/MCP smoke. The two previously failing files both passed within this
full run. Total gate wall time: 1,579.33 seconds; cleanup succeeded.

Exact machine record: `stage4-gate.json`. Raw log:
`/private/tmp/opintel-stage4-35610ad-full-gate.log`. The previous failed gate and
repair chronology remain intact. This request caused no image publication.
The governing rule is restated: each changed tree receives a full gate before
commit; focused checks or separately executed tiers cannot substitute for it.
These evidence-file updates are recorded locally and are not committed.

## Approved bounded-health follow-up

The user approved bounded health admission after reviewing the retained native
arm64 failure. Work is on `fix/stage4-engine-health-admission`; no image
publication is authorized by this follow-up. Initial bounds are 30-second health
age, five-second independent refresh and 15-second authenticated heartbeat age,
configurable in the gateway API environment. Heartbeat does not renew health.
Preparation consumes the verified build without its redundant health socket.
Explicit trust/readiness/contract failures and all token/source/governance checks
remain refusals. The current-policy heartbeat check reads scoped state afresh.
Forward migration 084 versions registrations to reject in-flight observations
across edits, including edit/revert races. No applied migration is modified.

The regression set ENG-H01–H10 covers bounded transport-stall reuse, health and
heartbeat expiry, wrong pin/explicit failure, unknown/edited registrations,
independent/concurrent refresh, current-policy acknowledgment, no duplicate
health socket, configuration validation and migration round trip. Validation is
sequential and requires a full `npm run check` on the completed changed tree
before commit. Its machine record is `test-results/gate.json`; its raw log is
`/private/tmp/opintel-health-admission-full-gate.log`. Focused runs do not replace
that gate. The 33-second arm64 execution failure remains a separate open item;
its cause will be reported from the retained soak JSONL when supplied.

The final focused admission/registry suite passed 39 tests in three files,
including heartbeat expiry during token attestation, edit/revert protection and
migration down/up preservation. The full candidate gate runs in the isolated
checkout `/private/tmp/opintel-health-admission-candidate`, containing exactly
the staged change and no unrelated backlog/status/cache files. The commit must
match that tested tree; the machine gate record remains in that checkout's
`test-results/gate.json`. No post-gate source change may be committed without a
new full gate.
