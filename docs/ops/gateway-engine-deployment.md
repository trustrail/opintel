# Gateway and engine deployment contract

Status: stage 1 contract, approved direction recorded 23 October 2026. This file
specifies the five-stage implementation; it does not claim that later stages
have shipped. The current image-build runbook remains historical implementation
context until the replacement packages pass their acceptance checks.

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

Initial-operator tooling must preserve existing identity and company-admission
semantics. The historical first-deployment review records unresolved admission
choices; this packaging task does not authorize an unauthenticated admin route,
public-signup change or database-granted tenant membership. Inventory supported
onboarding paths before implementing automation. Any required new admission
behavior needs a concrete review decision before its dependent implementation.

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
| 3 | Gateway/engine packages; explicit migrations/bootstrap; offline engine installation and later registration | DEP-004–008; no new admission behavior without review; repository gate; separate commit | 3–5 days |
| 4 | Independent provisioning, synthetic generation, soak preparation/execution tools | DEP-009–011; repository gate; separate commit | 3–5 days |
| 5 | Clean local and actual split-host deployment, governed query and 30-minute soak; final runbooks | DEP-012–013 and preceding checks; repository gate; separate commit with honest external-test status | 2–4 days |

Estimates total 10.5–18 focused working days, including validation, excluding
waiting for test hosts, network access or provider credentials. Stages are
sequential; record the completed stage's artifact, gate outcome, commit and
findings before moving on. Do not claim a later-stage acceptance test has passed
because its requirement has been documented. No gate retry on the same tree;
a changed candidate is a new run. Product-test failure stops progression.

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
