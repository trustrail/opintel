# Stage 5 customer installation

Status: implementation in progress; packages are not ready for a person-driven
install. No Stage 5 exit run has been performed or claimed.

Baseline: 801c753, seven published amd64 images, full gate and Stage 4 published
acceptance green. Final-revision amd64 and arm64 acceptance are still required.
The older execution-delay failure remains recorded separately in Stage 4 evidence.

Approved install inputs: APP_BASE_URL, OWNER_EMAIL, five XQ team values, SMTP
block. Install runs the existing expiring owner claim; only normal email login
redeems it. There is no new network bootstrap route. Optional paired existing
TLS paths override the generated fallback identity.

Approved observer: gateway-host minting only, one project, GET receipt/health
access only, job lifetime with hard cap duration + five minutes, immediate loss
of authority on process death, private job file only, creation/revocation auth
logs with project id. No general session or privilege substitution.

The on-premises defaults are PAL_PROVIDER=disabled, PAL_MODEL=disabled and
EMBEDDING_MODEL=disabled. These placeholder settings have no model adapter wired
in the current runtime. The installer rejects other values: a hosted model is
not silently enabled. A future adapter requires explicit egress consent.

The optional dashboard probe is removed from the XQ connection check. The
existing authenticated, read-only custody API probe remains mandatory; a failed
probe fails acceptance. No successful result hides a failed auxiliary probe.

## Person-driven exit record (pending)

For each row record operator, exact revision/digests, architecture, wall-clock
start/end, README step, observed result and every deviation. Do not fill a pass
from source smoke, emulation or a developer-assisted install.

| Run | README steps/timings | Deviations | Result |
|---|---|---|---|
| Clean Mac, gateway + engine from USB archives | Pending | Pending | Not run |
| Gateway laptop + engine laptop over LAN | Pending | Pending | Not run |
| 30-minute packaged soak | Pending | Pending | Not run |

Customer source data is durable customer state. Lifecycle commands never remove
its volumes. Acceptance's synthetic source is stopped only after result.json is
written; its data volume is retained. An acceptance port collision must identify
the existing install and must never stop it automatically.

Further approved clarification: the customer's XQ team owner supplies the four
exported device bundles out of band, alongside the archives, under the README's
protected identities directory. Certificate numbers and device names come from
those exports; no installer creates identities or consumes replacement seats.
The device client/self-enrollment path remains out of scope.

Implementation checkpoint: installer/command drafts, offline archive builder,
package/layer test-input audit, company invitation marker migration, bounded
mail/auth logs, TTL-based retryAfter and job-lifetime observer are under test.
The first typecheck found two wiring errors (ReleaseRuntime method name and
inferred child environment type); both were corrected before focused validation.
Focused checks use a fresh isolated database. No Stage 5 commit or publication
has occurred. Unrelated master-backlog/stage2 files remain untouched.

Focused validation checkpoint: 32 tests in eight files passed, including actual
issuer-process death, observer expiry/scope, normal invitation acceptance and
relationship-write rollback, SMTP TLS delivery, real Redis TTL and installer
configuration. Typecheck and lint passed. The seven unpublished amd64 candidate
images passed layer, secret and runtime-user readability audits. This is not the
full gate or published acceptance. Candidate package installation is now being
exercised. Recovery review added configuration/trust checksums and offline image
loading on fresh restore; migration credentials are separated from API runtime
settings. These subsequent changes still require validation.

First candidate package experiment: gateway and independent engine installed and
reached health; SMTP delivery, normal owner callback and both pinned pairing
commands passed. Demo preparation refused engine verification before the soak:
a container TCP connection to this Mac's own LAN address stalled, whereas the
same pinned engine port was reachable through Docker Desktop's host address.
The failed private log is retained. Same-host pairing now selects that host route;
split-host pairing retains the LAN address. Operator receipt/API requests use an
unpublished internal TLS ingress listener, independent of the public certificate.
The public HTTPS/browser path is unchanged. The new candidate is not yet tested.

Routing-focused follow-up: the first owned-harness attempt caught an invalid
Unicode regular expression in ingress generation; corrected before building the
next candidate. All eight installer/observer tests then passed, as did four
device-mapping tests. All seven routing-candidate amd64 images passed audits.
The second gateway installed. Its engine start hit this developer host's exhausted
Docker address pools; an unused image-smoke fixture network was removed without
removing volumes, and installation is being resumed with its generated identity
retained. This host-capacity failure is preserved separately from product results.

Second candidate paired run: owner SMTP callback and pin pairing passed; pinned
engine verification, provisioning, seed and governance/lifecycle setup completed.
Preparation failed at 2026-10-26T18:30:20.735870Z with dependency_unavailable.
Retained receipt stages show source resolution succeeded, then validation refused,
without execution. The packaged API provider status reports
provider_configuration_changed. The host job's internal transport URL had changed
the canonical URL used in custody checkBinding, so the correct existing refusal
fired. The fix separates OPINTEL_OPERATOR_API_TARGET from OPINTEL_API_BASE_URL;
the provider binding remains unchanged and equally enforced. The failed result
and API/engine logs remain under the private routing-candidate paths.

Canonical-URL candidate experiment: fresh offline gateway and engine installation
and mutual pin pairing succeeded. An initial mail-catcher readiness race stopped
the developer login driver; the packaged demo correctly refused before normal
owner login. After the fixture was ready, SMTP delivery and the normal callback
passed. The fresh package's `./demo soak 120` then passed at
2026-10-26T19:13:34Z: 87 queries, zero invariant breaches, zero operational errors,
15 custody values verified, all four issued certificate exchanges successful,
and receipt verification active with zero skipped checks. Seed, lifecycle-renew,
prepare and soak each exited zero. Result is retained at the private canonical
package's `state/output/soak-run-2026-10-26T19-10-31.691Z/result.json` with its JSONL.

Gateway-host xq-check authenticated successfully; mail-test received SMTP code
250. A host-issued administrator invitation was delivered; a real browser against
the packaged HTTPS ingress completed normal SMTP login and loaded the existing
project dashboard (three built-index assets, zero page errors). This is a
developer candidate experiment, not a person-driven or published-digest exit.
Both package backups completed and resumed healthy services; restore checks are
in progress. Source follow-ups add exact generated-file modes under umask 077,
preserve an existing observer file on exclusive-create failure, and suppress
untrusted installer exception text. The completed-candidate full gate is still
pending; no Stage 5 commit or publication has occurred.

Recovery/lifecycle checkpoint: both packages restored their backups and resumed
healthy services. Configuration, credentials and certificates were unchanged;
private modes and pre-restore backups were retained, and engine escrow was
excluded. Standalone `./demo prepare` passed after restore with a job-scoped
observer that was revoked on completion. Same-candidate upgrades of both
packages also passed and retained those identities. This proves idempotent
upgrade mechanics, not yet a version-changing release upgrade.

Final focused regression run: ten tests in three files passed, covering generated
modes under umask 077, warning-free project configuration, local/LAN pin pairing,
observer expiry and issuer death, preservation of an existing credential file,
and migration failure stopping startup with private diagnostics. Full gate will
run on an isolated candidate tree excluding unrelated user edits; its exact tree
identity and complete gate record must be retained before any commit.

First completed-candidate gate failed (tree
`95c7dc0cf9a5c3f8b09a70c2d6f319b8b9f24b87`, 1460.16 seconds). Typechecks,
lint, production exclusion and all 59 conformance checks passed. Normal tests
finished with 2127 passing and two failures in one installer test file; final
smoke was not run. Both failures showed inherited COMPOSE_PROJECT_NAME=opintel
overriding the package's saved installation name. The wrapper now explicitly
passes its persisted project name; regression tests supply a conflicting name
and retain the original warning-free/isolation assertions. No gate tier or
assertion was weakened. The failed log and gate record are retained; a new full
gate is required on the corrected tree before commit or publication.

Release-runner follow-up: the pasted arm64 command could exit silently during
preflight because its exit summary was installed too late. The repository now
ships `scripts/release/native.sh REVISION [--provider-env PATH]` (provider default:
repository `.env`). Exit/error handlers precede every check; architecture, Docker,
provider file and every licensed certificate file have named failures. Phases
announce their start; private logs, archives and acceptance result locations are
reported at exit, including explicit “not produced” for early failures. The
runner uses an isolated checkout and never reads terminal input or enrolls devices.
It is a developer release tool, not a customer installation prerequisite.

Greenfield arm64 report at df56789 (customer archives, Docker wiped): installation,
pairing and real-inbox owner login passed; demo soak failed at TLS health
verification. This is a failed Stage 5 exit, regardless of earlier Stage 4 results.
The reported default-port issue was withdrawn: APP_BASE_URL explicitly contained
5173 and was honored. The supplied provenance and environment-key inventory contain neither TEST key;
the reported leakage is not reproduced in that evidence.

Corrective work: explicit operator TLS configuration and absolute container paths;
unique installation CA subjects; private runtime keys/directories with explicit
runtime ownership and an install-time audit; local diagnostics that retain the
exception message and private log path; Docker hints suppressed; compact install
output; archive-level environment audit. Engine transport diagnostics retain a
bounded TLS error code without changing trust, pin checks, or refusal behavior.

Stage 5 acceptance now requires customer archives installed using their own
commands into a dedicated Docker daemon proven empty before installation. It
pairs, completes normal SMTP login, executes ./demo soak, exercises the packaged
browser and console outage, and retains its result before stopping the source.
No Stage 4 source-oriented acceptance can count as this exit. The disposable
nested daemon retains its own data volume and never wipes the operator's daemon.

Remaining customer-experience backlog (not represented as completed):
- Import an XQ-issued export ZIP with ./identities add, maintain the manifest,
  and move cedant slot details into demo documentation. Requires verification
  against the actual XQ export layout; never create replacement identities.
- Reduce pairing to one gateway-entered pin and authenticated engine trust fetch;
  preserve mutual verification and require a reviewed bootstrap protocol.

Evidence clarification: `/Volumes/JZ OS/stage5-evidence` identifies df56789 and
its published arm64 image digests. The supplied package.env.keys lists neither
TEST variable nor OPINTEL_XQ_REDEEM_URL. Both recorded pins agree with the served
identity; the peer CA verifies its signature. The saved job target is
host.docker.internal, while the reported manual check used the LAN address; the
certificate covers both. No retained TLS error code is present, so the exact
MacBook transport cause is not yet established. Do not label the new diagnostics
or independent-CA regression as a reproduction of that failure.
The correction uses dedicated peer-CA trust for both runtimes and operator jobs;
CA/pin checks remain mandatory. Existing installations receive the configuration
and mode changes through upgrade without rotating their identities.

Retained completed gates before this corrective work: 60e19e2 passed all seven
full-gate tiers in 1406.42 seconds (2129 normal tests, 59 conformance checks and
browser/MCP smoke); df56789 passed in 1558.40 seconds (2135 normal tests, including
six native-runner reporting regressions, plus conformance and smoke). Neither
proves the newly required greenfield customer-archive path; the corrections need
a new full gate and published-archive acceptance.

Corrective candidate experiment (unpublished, not the final release):
`tmp/stage5-acceptance-wgjjon/result.json` passed on native amd64, from
2026-10-26T23:35:22Z to 23:41:41Z. A dedicated daemon began with zero images
and zero containers. Both archive installers, pairing, normal SMTP owner login,
XQ check and the shipped seed/renew/prepare/120-second soak passed. The packaged
browser fetched three built assets and opened the authenticated dashboard with
zero page errors. Twenty queries completed with verified receipts during the
console outage; the UI returned afterward. Soak counters: zero operational
errors, invariant breaches or skipped receipt checks; five custody values verified.
The prior driver attempt `tmp/stage5-acceptance-5mxp4e/result.json` is retained as
failed (exit 13, unfinished await), never counted as product acceptance. Driver
requests now have referenced deadlines and persist phase progress. Final source
gate and published-image acceptance remain required.

Corrective full-gate attempt on candidate tree
`45e325d42671c87b2b780b8e5070f957d1fc03f8` failed at lint after both
typechecks passed (66.76 seconds). Four acceptance-driver references needed an
explicit AbortSignal global binding. No later tier ran. The failed gate record
and log are retained at `/private/tmp/stage5-greenfield-failed-gate-1.*`.
The declaration is corrected; a new full gate is required before commit.

The second corrective gate (tree e66308eee3692a91bc41d116780c00fa5602520a)
failed after 1420.61 seconds: 2140 normal tests passed and three failed; smoke
did not run. E-10 caught transport diagnostics overwriting the last explicit
readiness reason; that reason again takes precedence, while transport codes
remain logged. ROW-003 matched 1002 inside its expected decision digest. Its
raw-value assertion now excludes only the exact, separately verified digest;
all other receipt content remains checked. Failed record:
`/private/tmp/stage5-greenfield-failed-gate-2.json`, full log:
`/private/tmp/stage5-greenfield-full-gate-2.log`. A new full gate is required.
