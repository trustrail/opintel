# Gate tiers
Version: 1.1 — 2026-10-16

`npm run check` is the sequential completed-tip gate. It stops at a failed tier, records each duration and total wall time in `test-results/gate.json`, and never retries. The ten-minute objective is not permission to reduce domain/integration coverage. The previous normal suite alone took 1,211.51 seconds, so that is the expected dominant cost until measured otherwise.

| Tier | Defect class | Existing concrete counterexample / caught defect |
|---|---|---|
| Host memory preflight (before services and tiers) | Starting an expensive gate without sufficient free RAM | The operator classified the 2026-10-24 run’s migration setup timeout and three sidecar test failures as an environment-caused stop based on a post-run reading of 344 MiB free RAM. The gate prints the available reading and refuses below 1 GiB of available RAM (macOS: free + inactive + speculative pages from `vm_stat`, multiplied by its page size; Linux: `MemAvailable` from `/proc/meminfo`), before starting services or creating its database. Tests cover one byte below the threshold, exactly 1 GiB, invalid readings, and no service calls on refusal. The gate record includes start and minimum sampled available bytes, sample count, failures and timestamps, sampled every 5 seconds plus completion; this is a sampled minimum, not a continuous low-water measurement. This is a startup check, not a guarantee against later memory pressure. |
| Dependency preflight (before tiers) | Expensive validation reaching a stopped development dependency late | The first image-build gate stopped at normal bootstrap because test PostgreSQL was offline; the next passed 1,986 normal tests but stopped at smoke setup because Redis was offline. Preflight starts only stopped dev Compose PostgreSQL/Redis services, then authenticates with SELECT 1 against the test server maintenance database and Redis PING. Inspection is bounded to 5 seconds, startup to 5 seconds and parallel probes to 5 seconds; failures name the dependency before any tier. Regression controls cover stopped-service startup, one/both unavailable dependencies and killing a hung command. Stage 1 deployment documentation validation exposed a cold Compose inspection exceeding the former 2-second limit (zero tiers ran); a controlled 2.2-second inspection now passes within the 5-second bound, while inspection failure still names both services and never reaches tiers. |
| Checkout database bootstrap and teardown | Cross-checkout migration/schema contamination | A Stage-2 checkout against the shared Stage-3 test database failed two checksum tests on migration 082 and the explicit table-grant contract on installation_owner_claim. The gate now creates a fresh database from template0, named with a checkout-path hash plus a unique run suffix, and migrates only the current checkout before any tier. TEST_DATABASE_URL is inherited by normal tests and final smoke. Existing development/test databases are never recreated or dropped. CREATE/DROP connections are bounded to 3 seconds, statements to 9 seconds (client query deadline 10 seconds), and migration execution to 120 seconds. Teardown drops only the database successfully created by that gate, including after migration/tier failure or handled SIGINT/SIGTERM; cleanup failure fails the gate and records the owned database name. SIGKILL or host loss can leave an orphan for explicit operator cleanup. Regression controls cover concurrent name separation, refused creation, partial migration cleanup, cleanup failure, URL routing overrides, and real migrate-from-zero/drop. |
| Strict typecheck | Invalid typed contracts | The three recorded dashboard-fixture missing-custody errors in the conformance project; normal strict typecheck catches the equivalent production contract mismatch. The production and conformance projects are checked separately. |
| Conformance typecheck (`typecheck:conformance`) | Invalid TypeScript contracts in conformance checks and their imported fixtures, outside the production tsc project | Three TS2741 assignments in `e2e/dashboard-fixture.ts` omitted the required output custody count. The fixture now explicitly records zero; this tier prevents the omission being invisible to a green gate. |
| Lint and boundaries | Forbidden dependency direction and unsafe implementation patterns | `test/module-boundary.test.mjs` catches domain→infrastructure and cross-module non-index imports with the real ESLint rule. During this change lint also rejected twelve undeclared Node globals in the new scripts; explicit imports fixed them. |
| Production artifact exclusion | Shipping review-only routes | The positive counterexample is an artifact containing either literal `/dev/kitchen-sink` or `/dev/shared-patterns`; the checker rejects it. Normal production must omit both. |
| Router-derived conformance (32 real screens: 28 legacy, four console-next authentication routes) | Unclassified controls, broken disclosure semantics, navigation and identity-mark placement; missing route visits | Existing checker counterexamples reject five broken controls and a disclosure whose target visibility contradicts `aria-expanded`; the full-route reporter rejects missing visits. During the default-console switch, visiting `/legacy/auth/callback` caught Vite resolving the old entry before its legacy mounting transform. The transform now runs before entry resolution. The route count excludes 21 removed heading placeholders (14 global, seven project) and the removed Observations page. Its workflows now live in Data and Settings. Four authentication routes are covered in console-next; unported workflows and both development galleries remain covered in legacy. A console-next counterexample rejects an unclassified button and input; the reviewed authentication patterns cover those actual controls. |
| Domain/integration | Incorrect composition, treatments, custody, refusal, evidence or isolation | CSV and NDJSON release-event omission (97a42b8 through b1da401), covered by the dedicated export regression replayed in this branch. All existing tests and Vitest configuration are unchanged. |
| One smoke path | Wiring failures between row-decision UI/API, real authenticated MCP/Engine query and persisted receipt rendering | The earlier ROW-003 regression asserts a saved decision governs returned rows and is recorded in evidence; this smoke extends that exact check through UI save and receipt rendering. During assembly it caught an invalid PostgreSQL-text timestamp in the receipt URL: the router refused it before rendering. The fixture now uses the persisted receipt’s canonical ISO timestamp. |

The legacy conformance sweep asserts master control classification and disclosure contracts, mark placement and breadcrumb navigation, plus route coverage. **It does not assert AuthGuard coverage.** The two review routes pass because their controls conform; bypassing AuthGuard is outside this checker. The production artifact check, not conformance, prevents those routes shipping.

The normal `npm run build` uses Vite production mode. The harness uses `browser-test` for the review screens, and writes its output to `tmp/browser-build`, separate from deployment `dist`. The release command runs the artifact check against `dist`. Directly invoking Vite with arbitrary flags is not a protected deployment operation.

204 PNGs are preserved byte-for-byte under `archive/browser-baselines/2026-10-16`. There are no screenshot comparisons, tolerances, refresh commands or active snapshot projects. The old baseline investigation is cancelled. The central renderer policy remains; no test may override it.

The smoke uses fixture mail/session responses and pool header data. Row decisions go through the actual HTTP routes and SpiceDB permissions; a real pool credential authenticates the MCP client; the real Engine queries a synthetic Postgres source; the receipt is read back from Postgres and rendered. It is not a live mail-provider or XQ test. Existing identity, custody and provider-failure integration tests remain unchanged.

`make build` also runs an image-layer secret audit, outside the completed-tip gate.
Its defect class is credentials accidentally packaged in a final image, including
files deleted by a later layer. Its executable positive controls reject a nested
`.env`, `.xq` material, a key file, PEM private-key content under an innocent name,
and synthetic live-key/XQ credential values. The negative control permits ordinary
key-handling source code. The normal test suite runs these controls too; the build
audits every exported platform image and fails if layer coverage is incomplete.

The separate image runtime allowlist catches source/development payloads in
shipping layers. Positive counterexamples include original TypeScript, fixtures,
source-map files and embedded sourcesContent, an unknown JavaScript file, and an
artifact replaced after its manifest was recorded. Every layer is checked, so a
later whiteout cannot erase a violation. Exact pinned-base layer identity allows
necessary OS files; application payloads must match the per-image inventory and
hashes. Packaged-worker smoke additionally catches a missing SDK/native module
hidden by a worker's normal unreachable-provider response: it requires an actual
request to its synthetic loopback provider with external networking disabled.

## Change ledger
| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1.0 | 2026-10-16 | Retire pixel/scenario tiers; retain conformance and governance tests; add connected smoke. | No custody or query behavior changes. Review routes remain development/browser-test only and are excluded from normal production artifacts. |
| 1.1 | 2026-10-16 | Add conformance typecheck immediately after production typecheck as a separately timed, fail-fast gate tier. | No product behavior change; the gate now covers the conformance TypeScript project. |

Stage 4 adds DEP-009–011 regressions within the existing normal-test tier:
private manifest/lock boundaries, refusing conflicting settings, preserving
changed or pre-existing empty synthetic tables, and rejecting missing/expired
lifecycle prerequisites. These address the development workflow's concrete
failure modes: an empty existing table was previously repopulated, and expired
retiring credentials could be reported as unexercised while the soak passed.
External published-image acceptance separately requires the real packaged API
XQ check and certificate/escrow/redemption; normal tests cannot establish them.

The normal egress regression also rejects a refresh that exposes an empty OUTPUT
chain between commands, and checks that failed commits clear old destination
authority under DROP. Stage 4 load acceptance exposed repeated engine-registry
refusals while the old live installer flushed/rebuilt active rules. The package
acceptance adds a reachable positive control and proves an undeclared destination
is still denied alongside the real source-query workload.

Registry transport tests retain the original operation deadline across bounded
initial-connect recovery, reject invalid pins and HTTP refusals without retry,
and require a real pinned-TLS response after an intentionally stalled lookup.
The concrete live defect was a nine-second TCP-connect stall on the Docker
Desktop host route; direct host health remained responsive during failing load.

Stage 4's normal tier caught the stale provisioning runtime inventory after the
operator entrypoint was added, and G-018 exposed a cancellation response/close
race. The inventory check now also removes the added runtime before testing
owner-claim independence. Source cancellation drains the PostgreSQL error with
a one-second cap before closing; the SQLSTATE and original timing assertions
remain unchanged. The failed full-gate record is retained separately from the
focused repair checks and the subsequently executed browser/MCP tier.

Bounded-health admission adds ENG-H01–H10 to the normal tier. Defect class:
control-transport uncertainty promoted to loss of previously verified serving
health, or stale/untrusted health reused as authority. Concrete regressions inject
a pre-TLS stall while age and heartbeat remain valid, then advance beyond expiry;
wrong pins, explicit unhealthy responses, policy changes and concurrent edits must
still refuse. ENG-H08 detects the redundant query-client health socket that could
independently turn a healthy registry observation into a query refusal. The arm64
retained logs show nine-second refusals but lack per-request transport metadata;
that attribution remains a hypothesis, not a proven execution-path diagnosis.


Connect-only recovery adds CONNECT-01–04 to the normal tier. Defect class:
duplicate mutations caused by replay after an uncertain response. The real TLS
regressions reset or stall the server after it receives a mutation and require
exactly one request; three pre-connect stalls must deliver exactly once. Wrong
pins and TLS stalls never write or retry. TRACE-01–02 checks bounded phase
allowlists and correlated execution/response evidence. Updated ENG-H03 catches
refusing a healthy engine solely because its companion heartbeat is stale.

Stage 4 package follow-up defect examples: normal tests reject an unhandled
static-file EACCES, unreadable image-layer assets from umask 077, untrusted SMTP
certificates and plaintext SMTP mode. Published-digest acceptance (separate from
source smoke) catches missing built-index assets, broken delivered-link browser
login, and receipt verification coupled to console uptime. All existing gate
assertions remain active; a package browser does not substitute for the full gate.

Stage 5 extends the existing normal and image/package audit tiers. Concrete
regressions: retryAfter=1 while Redis still blocked requests for nearly 15 minutes;
an optional failed dashboard probe inside a passing acceptance; operator observer
credentials remaining usable after issuer death; and historical projectless
invitations accidentally becoming company grants. The tests kill the live issuer,
exercise actual database-lock loss and receipt scope, and require normal verified
login before new company membership. The package/layer audit has positive controls
for embedded demo-source and XQ test-rig variable names. Full gate remains required
before every changed-tree commit; person-driven installs are additional evidence.

The Stage 5 installer test also reproduces the packaged refusal caused by using
an internal transport URL as the canonical custody-check URL. It compares actual
checkBinding values from generated API/operator environments while requiring the
separate internal TLS target. Matching transport reachability alone is not a
substitute for the unchanged provider configuration binding.

Parent-owned fixture cleanup (2026-10-28): normal Redis/SpiceDB and browser
containers carry a unique gate-run label. The parent removes only that run's
remaining fixtures during final cleanup; a cleanup failure cannot produce a
green gate. Defect class: interrupted launchers leaking test services after
skipping their finally. Concrete example: two normal-service containers remained
from the interrupted console-needs-you gate; the Docker ownership proof removed
a labelled fixture while preserving an unlabelled sentinel. This adds no tier,
retry or service/behavioral timeout relaxation.

Existing dependency preflight extended (2026-10-29): `gatePreflight()` in
`scripts/gate-preflight.mjs` remains the single gate prerequisite step. After
the unchanged 1 GiB available-host-memory check, it requires at least 7 GiB
usable Docker RAM (an 8 GB Docker Desktop allocation), resolves PostgreSQL, Redis
and SpiceDB by the exact digests in `deploy/images/upstream.json`, and resolves
the browser by the locked Playwright version. Missing references are pulled
with a 120-second deadline, then inspected again; no mutable fallback is used.
Normal Redis/SpiceDB fixtures use the same pinned references, including when
launched outside the full gate. Existing five-second Compose inspection,
stopped-service startup and bounded connection probes remain; PostgreSQL probes
also verify CREATEDB. The gate does not recreate running services.

Defect examples: a missing `redis:7-alpine` tag caused a redacted normal-bootstrap
failure after conformance; a stopped PostgreSQL service was misreported as a
CREATEDB grant problem. Targeted controls now cover exact-reference pulls, pull
failure before tiers, Docker memory refusal, authenticated readiness, stopped
service startup, and connection-refused/authentication/privilege distinctions.
Normal bootstrap reports known prerequisite causes on one line; other failures
report the bootstrap stage and an allowlisted operating-system/database code,
without emitting native messages containing credentials or test data. No
additional preflight, Compose change, governance change or normal-test timeout
relaxation is introduced. DEP-008 also retains isolated owner-claim startup after
removing native/operator runtimes, with the new engine-sources artifact expected.

Console first-hour contract follow-up (2026-10-29): normal-table discovery caught
the new pool_table_binding table missing from the explicit grant inventory, and
RLS-10 caught migration 086's tenant_access name instead of tenant_read and
tenant_write. The grant inventory now follows pool_source_binding exactly,
without changing SQL grants. Forward migration 087 preserves the applied bytes
of 086 and keeps its predicates and app-only policy role while supplying the
required policy names. PT-010 checks same-table membership in two pools and
rejects duplicate membership in one pool; the new migration regression checks
up/down/up, unchanged privileges/predicates and forced RLS. The affected
explicit-list inventory and separate-file baseline/candidate results are in
`docs/review/console-backend/contract-inventory.md`. No governance assertion is
relaxed and no grant is widened.

Console-next uses its approved tokens and shared primitives. Its unit tests and the fresh packaged-install acceptance cover the five root screens, Select interactions, translated links and actual Inter rendering; the legacy conformance report does not claim coverage of console-next controls.
