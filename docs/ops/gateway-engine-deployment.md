# Gateway and engine deployment contract

Status: approved direction recorded 23 October 2026. Stages 1–3 are committed;
Stage 3 published-image acceptance is recorded in `../review/stage3-progress.md`.
Stage 4 implementation and acceptance progress are recorded in
`../review/stage4-progress.md`. Stage 5 remains planned.

## Scope and terminology

This work delivers a clean single-tenant client installation. The **gateway**
package comprises API, console, application PostgreSQL, Redis, SpiceDB and its
PostgreSQL datastore. The **engine** package comprises engine and its local
egress companion. Each image is independently buildable and distributable.
Each service can be selected explicitly; dependency readiness is checked, not
silently satisfied by starting another deployment package. External dependency
endpoints can replace the supplied gateway dependency containers.

The hosted multi-tenant **control plane** is out of scope. That term must not
name the single-tenant API host in these packages or their operator output.
There is no new enrollment service, tunnel, reverse connector or orchestrator.
Existing direct private routing and operator registration remain the model.

A test installation may place both packages on one host, but uses separate
Compose projects and explicitly configured published addresses. Production can
place the engine in a different network. Cross-package communication must not
require a shared Compose network, volume, service name or filesystem path.

## Artifact contract

Original TypeScript/TSX, repository files/history, development scripts, tests,
fixtures and source maps are excluded from shipping runtime images. Built,
minified JavaScript runtime bundles are explicitly allowed. No executable-only
packaging, obfuscation or claim that JavaScript is unreadable is required.
Browser JavaScript/CSS and native dependencies are runtime artifacts.

| Image | Allowed application artifacts | Excluded responsibilities |
|---|---|---|
| api | Minified API entrypoint/worker bundles, explicit runtime assets and required production dependency/native files | Database migration execution, fixtures, seeding, source checkout, console build |
| console | Production browser bundles/assets and minimal minified serving/proxy runtime | API execution, dev server, source maps, build tools |
| engine | Minified supervisor/worker/engine bundles, required native bindings, exact signed scanner and explicit runtime assets | Gateway services, demo setup/data generation, build tools |
| egress | Minified policy installer and required firewall/runtime files | Query execution, gateway access credentials, source data |
| migrations | Versioned one-shot migration bundles, SQL/schema artifacts and immutable original-checksum manifest | Runtime service startup, client/demo data, private credentials |
| provisioning | Minified one-shot operator commands and declared non-secret assets | Automatic data seeding or hidden governance bypasses |
| demo tools | Minified synthetic-data generator/provisioning/soak commands; explicit versioned scenario specifications | Deployment startup, embedded seeded databases, private manifests or customer data |

The final per-image allowlist will enumerate application paths, runtime assets,
executables, and required dependency paths with pinned provenance. It must not
accept an entire checkout or unrestricted node_modules tree. Necessary upstream
OS/runtime files and license notices are classified separately from application
artifacts. A filename exception is not permission for an embedded source map,
original source, credential or fixture payload. Minification is applied at build
time; runtime startup never builds or installs packages.

Every exported layer and image configuration is inspected, including deleted
files/whiteouts. Reject unknown application payloads, forbidden paths/content,
unsupported archive coverage and failed exports. Preserve existing positive
secret controls and narrow upstream self-test-vector exceptions. Add positive
controls for a TS source file, source map/inline sourcesContent, fixture and
unapproved runtime payload. No operator .env, keys, XQ identities, cookies,
source rows, database dump, PID/lock file, landing state or machine path is a
release input. Bundles may implement a synthetic generator; generated datasets
are separate operator output, never preloaded installation state.

Each selected IMAGE build must avoid building unrelated image products. A release
records the clean source revision, platform, image digest, runtime dependencies,
DuckDB/binding/scanner pin, API/engine contract and migration compatibility.
The same tested digest is distributed/promoted; dirty-tree revision tags are
not release provenance. Registry delivery and optional selected-image archives
contain images, non-secret deployment templates, manifests and checksums only.

## Installation and runtime independence

| Package | Local requirements | Remote inputs | Startup must not do |
|---|---|---|---|
| gateway | Configured dependencies, migrated schemas, runtime secrets/TLS, storage permissions | Engine addresses/pins only when explicitly registered; configured identity/mail/custody providers | Start an engine, read an engine's private keys, populate a demo, silently migrate/reset data |
| engine | Matching signed scanner, source-readiness target/credentials, runtime trust/identity, declared egress, local resource/storage controls | Offline public trust bundle; gateway receipt destination only when ingest is configured | Contact a gateway to install, enroll, register, fetch configuration, validate a license or become locally ready |

**Engine installation/startup and supervised replacement must succeed while the
gateway is unreachable**, provided engine-local prerequisites and its explicit
source-readiness target are valid. This includes no registration record existing
at the gateway. Trust/public certificates may be provisioned offline by an
operator; a running gateway is not required to produce or validate that bundle.
Private keys remain at their own endpoint. Do not relax TLS or manufacture an
untrusted bootstrap listener to satisfy offline startup.

Keep the existing constant `SELECT 1 AS ready` source probe and signed scanner
LOAD; gateway independence does not mean source independence. Keep the bounded
supervisor, non-root identity, read-only filesystem/tmp/shm, disabled spill/core
and container swap, resource limits and explicit egress. The companion must
install policy before the engine starts. It is a local companion, not a gateway
proxy, and is not deployed on another host from its engine.

Stage-3 egress correction: describe and package this as a firewall installer in
the engine's shared network namespace, not an HTTP/SOCKS service that containers
talk to. Only the engine joins its companion's namespace; gateway services do
not. Published engine ports belong to that namespace. Preserve default-deny
IPv4/IPv6 output, explicit destination allowances and the policy-ready startup
dependency. Verify allowed traffic and denied undeclared destinations in the
independent engine package; do not treat a successful governed query alone as
proof of egress denial.

Gateway availability and engine-local readiness are different facts. A locally
ready engine is not yet registered, assigned to a project/source, or authorized
to serve a caller. Later, an operator supplies its reachable address and public
certificate pin to the gateway, verifies trust/contract, and assigns sources
through existing authorized services. An unknown, wrong-pin, unverified or
cross-project engine must still fail closed. No automatic grant, source
assignment, key distribution or new admission policy is introduced.

Optional ingest must not turn gateway connectivity into a startup dependency.
Receipt failures must retain the existing durable/retry and acknowledgement
semantics: no successful delivery claim, discarded pending work or evidence
suppression. Review replay-on-open behavior and test gateway loss with pending
receipt work. If satisfying this requires changing that product contract,
identify the precise conflict for review rather than silently weakening it.

Explicit connections: console to API; API to registered engine; engine to source;
engine to gateway receipt endpoint for ingest; each provider integration to its
own configured endpoint. Certificate hostname checks and pins remain enforced.
DNS/addresses and ports are operator inputs, including approved static resolution
for the egress-restricted engine. A customer-approved routable path is required;
this package does not create one.

## Fresh installation, migrations and operator tools

Start with empty client-owned volumes and freshly provided credentials. No
migration of the development laptop is part of this deployment. Persistent
storage and secrets are provisioned separately from image delivery.

Explicit one-shot jobs initialize application migrations, SpiceDB datastore
migrations and authorization schema before gateway readiness. Later startup
checks compatibility and reports actionable failures without silently rerunning
migration/seed/reset operations. Preserve immutable applied migration checksums:
compiled TS migration execution must use a build-verified manifest of original
source identities, not a rewritten applied ledger or renamed historical version.
SQL migrations/schema are declared execution assets in the migrations image,
not undeclared copies in the API image.

Initial-operator decision (23 October 2026): stage 3 adds an explicit one-shot
claim CLI on the gateway host. It refuses if any company exists. The operator
names the initial owner email and company; the CLI records a claim expiring in
24 hours. It grants no administrator role. Only that exact email completing the
existing normal login within the window may redeem the claim, create the company
and receive its administrator role. An unredeemed claim expires and requires an
explicit CLI rerun; historical claims and audit records remain intact. Claim
creation and redemption both enter the audit log. The CLI prints or stores no
password, token or secret, and does not prove identity or issue a session.
Model the claimant with an explicit kind so a later IdP-group claimant can be
added; implement only email claims now. No new public signup, bootstrap login
endpoint or pre-login role grant is authorized. Other admission behavior remains
unchanged. The historical first-deployment review is background; this decision
resolves its initial-operator choice for this package.

Separate commands cover installation/bootstrap, engine local preparation,
registration/verification, reinsurance governance provisioning, synthetic source
seeding, soak preparation and soak execution. They target explicit endpoints and
run from independently built operator images without a checkout or host Node.
Use existing application services/ports and scopes; never turn a direct SQL edit
into a bypass for authorization, evidence or policy validation.

Reinsurance is opt-in after installation. Its provisioning declares a project,
sources, pools and governance configuration. Synthetic seeding declares a demo
target/schema and fixture version/seed; it refuses incompatible existing data,
never drops customer tables, and ANALYZEs its own generated tables before proving
row estimates. Repeated provisioning resumes matching state, reports conflicts,
and never silently rotates credentials or overwrites decisions. Private outputs
are separate mode-restricted files, not image content or ordinary logs.

Soak preparation checks the running deployment, actual receipt access, scenario
manifest, known source estimates, custody certificate exchanges and requested
lifecycle coverage before the timer. Expired grace windows and provider-location
refusals are explicit failed/incomplete prerequisites. Renewing test credentials
is an explicit operator operation. Soak execution does not provision or repair
its target. Preserve failed run records; a later run is a new record.

## Five stages and acceptance

| Stage | Deliverable | Exit requirement | Focused effort estimate |
|---|---|---|---|
| 1 | This contract; implementation sequence; deployment acceptance IDs | Reviewed scope recorded; documentation checks and repository gate; separate commit | 0.5–1 day |
| 2 | Independent targets; minified runtime artifacts; per-image layer allowlists; release manifest | DEP-001–003 and packaging checks; repository gate; separate commit | 2–3 days |
| 3 | Gateway/engine packages; explicit migrations and expiring owner claim; offline engine installation and later registration | DEP-004–008; approved claim admission only; repository gate; separate commit | 5–8 days |
| 4 | Independent provisioning, synthetic generation, soak preparation/execution tools | DEP-009–011; repository gate; separate commit | 3–5 days |
| 5 | Clean local and actual split-host deployment, governed query and 30-minute soak; final runbooks | DEP-012–013 and preceding checks; repository gate; separate commit with honest external-test status | 2–4 days |

Revised estimates total 12.5–21 focused working days, including validation, excluding
waiting for test hosts, network access or provider credentials. Stages are
sequential; record the completed stage's artifact, gate outcome, commit and
findings before moving on. Do not claim a later-stage acceptance test has passed
because its requirement has been documented. No gate retry on the same tree;
a changed candidate is a new run. Product-test failure stops progression.
The original estimate was 10.5–18 days; stage 3 increased from 3–5 to 5–8 days
after the explicit 24-hour claim/redemption/audit lifecycle was approved.

Stage 5 needs two reachable test hosts and usable external provider credentials.
Single-host separate Compose projects prove package separation, not actual
cross-host routing. Record platform/digest/host identities and active negative
controls. A successful SQL import or process start alone does not prove service
usability. For any future data migration (outside this clean-install scope),
SpiceDB must use supported API backup/restore rather than PostgreSQL logical
copying; never reuse the laptop transfer as a deployment test.

## Initial findings (stage 1)

- Current builds always select all four runtime targets. The common build stage
  compiles broad src/sidecar/scripts/migrations trees and builds the console.
- Backend compilation transpiles modules without minification. API runtime copies
  original migrations (including TS), broad compiled scripts and sidecar modules.
- The current combined Compose package extends the engine package. The replacement
  must make the gateway/engine boundary explicit without shared service discovery.
- Core engine readiness probes a declared PostgreSQL source, not the gateway.
  TLS files are loaded locally. Optional landing watcher initialization/replay
  needs a separate gateway-unreachable acceptance check; core readiness alone
  does not prove ingest independence.
- dev:demo combines local startup, identity, registration, governance and seeding;
  it cannot be the independent production provisioning interface unchanged.
- Existing migration checksum semantics, initial-account admission and worker/native
  module loading are constraints to resolve explicitly in their owning stages.

Stage-1 gate infrastructure finding: the first candidate stopped before any tier
because Docker Compose inspection exceeded its 2-second deadline. Subsequent
read-only inspection took 1.72 seconds and Docker info took 2.79 seconds. The
inspection budget is now 5 seconds, still bounded with no retries; a controlled
2.2-second inspection is a regression case. Source/Redis probe and startup
deadlines and all product assertions remain unchanged. The stopped record is
retained under tmp/deployment-stages/stage-1/stopped-preflight/.

## Stage-2 packaging validation

Independent IMAGE selection builds API, engine, console or egress without
building other product targets. Both linux/amd64 and linux/arm64 images pass
the secret scan and the explicit runtime layer allowlist. Combined manifests
select the same eight platform image identities that were audited. Candidate
release metadata records runtime file hashes, upstream pins, binding/build,
engine contract and original migration checksums; it is not a migration runner.

The packaged API native binding and XQ worker execute without a checkout or
node_modules on both platforms. The worker must contact its synthetic loopback
provider, so an import failure reported as provider-unreachable cannot pass.
The amd64 image smoke passed signed-scanner source readiness, console serving
and an entitled MCP query returning one expected row and an evidence id.
ARM scanner preparation verifies LOAD in the ARM target runtime under emulation.
The normal E-10 suite retains missing-scanner/source and failed-readiness controls.

Build/audit records and manifest selection are retained under
tmp/deployment-stages/stage-2/; the governed-query result is
tmp/images-smoke-pkloUq/result.json. The completed-candidate gate is recorded
separately in that stage directory before commit. No stage-3 package, fresh
owner claim, independent demo tooling or actual split-host proof is implied.

Findings: ESM bundles need explicit native-binding and worker paths. OS relative
symlinks and the POSIX test executable must be classified as pinned runtime
files, while application links and test payloads remain forbidden. The first
disposable smoke helper failed to resolve a container-native import on the host
before services started; the corrected helper passed. Provisioning and migration
helpers no longer belong in the API image: the stage-2 smoke uses external test
setup, pending the independently packaged stage-3 jobs. Disk space interrupted
builds; the completed platform audits required no weakened exclusions.


## Stage-3 scope update (reader decision, 23 October 2026)

The branch continues from main 262fa65 with isolated gate databases and
platform-aware image smoke. Implement in order: (1) independently selectable
gateway/engine Compose projects with explicit addresses and external dependency
support; (2) explicit application/SpiceDB/schema jobs and compatibility-only
startup; (3) the approved expiring first-owner claim; (4) gateway-offline engine
installation/replacement and later pinned registration; (5) console-derived
source egress fetched by the engine from the gateway on every heartbeat after
registration, applied in place, with the applied version reported in the heartbeat; (6) GHCR publication and digest-only package
references. No operator-maintained destination list remains in the new package.

The readiness-source rule is **permanent** and derived from the existing
engine-local readiness credential. Console-derived destinations are added
alongside it after registration; never remove the readiness rule. Console
display and assignment-conflict reporting are explicitly outside Stage 3.
This preserves the mandatory source probe on startup and every supervised
replacement, without making gateway availability a prerequisite. This decision
supersedes the proposed temporary bootstrap rule and the earlier operator-list
packaging model. Existing legacy/S4 fixtures keep their explicit test controls.

Build/acceptance on this Intel host uses AMD64 only. ARM64 is built natively on
the ARM host from the committed revision. Final acceptance on this host starts
from empty gateway volumes, redeems the owner through normal login, installs the
engine in a distinct project while the gateway is stopped, starts the gateway,
registers/verifies the engine and runs a governed query. Preserve negative trust,
egress and pending-ingest controls from DEP-004–008. Report commands and actual
digests per deliverable. Gate, commit, merge and push require a green result.

Target: Wednesday 28 October 2026. Risk identified immediately: live policy
synchronization/heartbeat and registry publication are new work beyond
the earlier stage estimate; separate-package and offline acceptance remain.
GHCR authentication is an external prerequisite. Report the remaining work by
Monday evening 26 October if the target cannot hold; do not imply background
execution or a completed acceptance result.

### Source admission after the egress decision

Save the source and its engine assignment before attempting a connection. Its
initial status is `pending_egress` (displayed as “Pending egress”). The engine's
heartbeat fetches assigned destinations and reports the version actually applied.
Only acknowledgment of a version containing that assignment may release its
connection-test work. A failed connection leaves the saved source marked
`unreachable`; it must not delete the source or grant a pre-assignment firewall
exception. Registration, pin, project and source authorization still apply.
Console policy-version display and assignment-conflict reporting remain outside
Stage 3; the source's admission status is part of this authorized workflow.

### Package build, publication and operator handoff

On a clean committed checkout, build only the required native platform:

```sh
TAG=release-name make build IMAGE=all PLATFORM=linux/amd64
node scripts/images/publish.mjs tmp/images/releases/release-name-api-engine-console-egress-migrations-provisioning-demo-tools.json /absolute/output/published.json
PLATFORM=linux/amd64 node scripts/images/package.mjs /absolute/output/published.json /absolute/output/packages
```

Use the committed revision on the native ARM64 machine with `PLATFORM=linux/arm64`.
Do not emulate ARM64 builds on this Intel host. The publisher verifies the audited
local image identity, pushes to `ghcr.io/trustrail/opintel-*`, checks each remote
digest, and writes the published manifest only after all images succeed. It
requires explicit `--candidate` for dirty validation artifacts and preserves their
candidate flag. Candidate provenance must never be relabelled as a clean release.

Each standalone package carries its own README, wrapper, Compose files and
`release.json`; every image reference in its Compose files is a literal digest.
The gateway includes the pinned upstream dependency definitions. Copy only the
package to its corresponding host. Supply operator-owned configuration, TLS and
customer-local storage there. Do not copy the acceptance directories, synthetic
fixtures, sample files or development databases to a client installation.

External acceptance against published digests (creates disposable projects and
synthetic data, then removes only its own containers/networks and retains its
logs/volumes):

```sh
RELEASE_MANIFEST=/absolute/output/published.json INGEST=1 PLATFORM=linux/amd64 node scripts/images/stage3-smoke.mjs
```

The gateway exposes separately configured mTLS heartbeat and receipt listeners;
set their bind addresses and public ports explicitly for remote engines. Its
receipt listener maps to 3101 internally, heartbeat to 3102. Readiness remains an
engine-local requirement. Configured receipt destinations join the permanent
readiness rule; no operator destination list is required. Temporary DNS failure
for gateway/receipt destinations withholds those destinations without preventing
local source readiness, and periodic reconciliation retries their resolution.

Existing-source reassignment queues the same normal introspection work as source
creation, retaining its schema selection. A repeated assignment reuses queued
work; an executing introspection must finish before reassignment. Only a current
policy acknowledgment releases work. Successful introspection reconnects it;
connection failure leaves it saved and unreachable. Query admission remains
connected-only.

## Stage-4 operator implementation

Operator jobs run inside the gateway Compose project, with the same scoped
application database connectivity as its migration/claim jobs. `provision`
compares project/engine declarations and initializes token custody without
rotating it. The independently built `demo-tools` image separates `seed`,
`governance`, `lifecycle`, `lifecycle-renew`, `xq-check`, `prepare` and `soak`.
Settings come from the package operator environment and its referenced private
configuration. V-01 seed 1 declares three schemas and six synthetic tables.
The versioned governance declares two pools, ten callers and threads=1 per pool;
existing differing resource/field/row/token decisions are conflicts.

Matching reruns retain credential material and decisions. Operator-only guards
recheck prior state under existing aggregate locks; ordinary console update
semantics are unchanged. Interrupted issuance without a saved plaintext key
requires explicit operator recovery, never implicit replacement. Lifecycle
renewal is separate and preserves prior probe records. The package-only runbook
is included in generated gateway packages.

Linux certificate agents unwrap device tokens using OpenSSL and private files
only on verified tmpfs, with mode 600, private directories and cleanup. This
avoids Linux's inability to reopen Node's socket-backed `/dev/fd/3`; private keys
never cross into the API or IPC. Non-Linux agents retain the pipe path. Source
and API secrets, certificate bundles and private outputs remain external inputs.

Acceptance remains conditional on the published-digest installation and real XQ
checks in `docs/review/stage4-progress.md`; this section is implementation detail,
not an acceptance claim.

Sustained Stage 4 traffic exposed the live egress installer's repeated OUTPUT
flush/rebuild interval. Each address family now commits the replacement OUTPUT
rules atomically through `iptables-restore`, preserving unrelated chains and the
existing reply-only, root-only resolver, readiness and assigned-destination rules.
A failed install removes old destination authority under DROP and cannot be
acknowledged. Policy retrieval, DNS re-resolution, serialization and heartbeat
version checks remain unchanged. The legacy static S4 installer is unchanged.

Stage-4 transport recovery: an initial TCP-connect stall may make up to three fresh
connection attempts for health, key attestation or idempotent egress registration.
The first three connect attempts are capped at one second each; the final
attempt uses only the remaining original deadline (normally nine seconds). All attempts
require normal pinned TLS and response validation. TLS/pin/HTTP failures and
query execution are never retried by this mechanism. Safe diagnostics report
fixed failure stages, transport phases and elapsed time, never exception text or
key/sentinel material.

### Bounded health admission (approved 25 October 2026)

Query admission reuses only a successful pinned health observation for the same
project, engine registration and gateway trust instance. The observation includes
the contract and query build; its age starts at the successful health response,
not at heartbeat receipt or query use. The gateway refreshes active observations
independently of queries. Configure its API runtime env with
`ENGINE_HEALTH_MAX_AGE_MS=30000`, `ENGINE_HEALTH_REFRESH_MS=5000` and
`ENGINE_HEARTBEAT_MAX_AGE_MS=15000`. Values are positive bounded integer
milliseconds; refresh must be shorter than maximum health age.

Reuse requires a fresh authenticated heartbeat acknowledging the current source
assignment policy. Missing/stale heartbeat or policy mismatch refuses admission.
The heartbeat belongs to the egress companion and never renews query-engine
health. A gateway without the configured heartbeat channel (legacy development
and standalone tooling) gets no health reuse: it retains fresh pinned verification.
The packaged gateway already requires that channel.

A pre-TLS control-connect timeout cannot erase the prior healthy observation or
extend its expiry. Once expired, a new successful verification is required.
Wrong-pin/TLS, explicit readiness, malformed-response and contract failures still
invalidate verification. Unknown/never-verified or edited registrations cannot
inherit an observation; cold gateway instances must verify before using one.
Configuration updates and concurrent verification retain their existing guarded
writes. Every actual request retains pinned TLS. Token-sentinel checks, source
status/authorization, execution budgets, refusal evidence and result validation
remain in place. Query preparation reads the observed build and no longer opens
its redundant query-client `/health` socket. Actual validation/execution transport
failures still refuse; they are not retried or satisfied from cached results.

The native-arm64 33-second execution-path refusal remains a separate open item.
Its cause awaits the retained soak JSONL; this change is not an execution-path fix.

Forward migration 084 adds an internal registration version. Every registration
edit advances it; health writes and reuse are bound to that version. An edit
followed by a revert cannot let a probe begun before the edits publish health.
The version is not an API setting, a source policy, or retained evidence.
