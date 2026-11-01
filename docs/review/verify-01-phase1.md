# VERIFY-01 phase 1

DEMO-01 was merged and pushed to main as
`ac91c4c51ab6d9a63aeb3f000bcb0ae68f565de8`, after the reported native arm64
release pass for `251f0e4`. This phase starts from that merge on
`feat/verify-01-frame`. It changes internal verification and operator harnesses,
not application behavior, migrations, source ingest, or the versioned V-01 answers.

## Frame

`scripts/verification/verifier/` builds internal artifact 1.0.0. The artifact is
self-contained JavaScript with its custody-agent child, version/revision and
source/artifact hashes. Customer bundle construction rejects verifier inputs.
It is not added to any image entry or customer archive.

The registry has 115 stable logical cell IDs, fixture-derived outcomes, dimensions,
prerequisites and expected evidence. Installation-specific source names and
credential UUIDs map to logical names/slots; installed responses never define
expectations. The finite scheduler runs each selected cell once before optional
random traffic. Dependency setup does not enlarge claimed coverage. Selection
supports all, capability, cell and dimension filters. Missing prerequisites,
interruption and an expired retiring credential are not exercised and fail.
Unknown selectors fail before setup. Invalid combinations are separate from cells.

JSON and Markdown record all selected cells, outcomes, dimensions, receipt IDs,
durations and sanitized checks, including cells not reached. Installation revision
and image identities are separate from verifier revision/source hashes. Raw rows,
connection strings, cookies, device tokens and receipt bodies stay out of reports.
Reports fail until complete; optional traffic failures/interruption also fail.

## Customer-path setup and the approved evidence adaptation

External V-01 database writes use the existing standalone synthetic writer with
an explicit target, never metadata or readiness. The real installed `./sources add`
stores credentials on the engine. Public APIs create a dedicated project, register,
verify and designate its paired engine, configure project limits/custody, initialize
the token key, register sources and read their catalogue. Public pool/table APIs
bind all eight tables explicitly. Declarations, treatments, row decisions, threads
budget and normal/lifecycle credentials all use the console's public APIs.
The compatibility operator setup no longer uses service/repository writes for
those operations. There is no public source-binding endpoint.

All 115 query outcomes/row expectations remain unchanged. Only these four cells'
row-scope evidence expectations change:

| Cell | Previous evidence | New evidence | Reason |
|---|---|---|---|
| pool0/v01.soak_recoveries.open_reference/reference_id/clear | unscoped | explicit all-rows decision ID/hash | Customer table binding requires an explicit row decision. |
| pool0/v01.soak_recoveries.open_reference/description/clear | unscoped | explicit all-rows decision ID/hash | Same table/decision, same three answer rows. |
| pool1/v01.soak_recoveries.open_reference/reference_id/clear | unscoped | explicit all-rows decision ID/hash | Customer table binding requires an explicit row decision. |
| pool1/v01.soak_recoveries.open_reference/description/clear | unscoped | explicit all-rows decision ID/hash | Same table/decision, same three answer rows. |

The all-rows predicate is the public editor's nullable-safe predicate on the first
supported column. Pool 0's treaty_reference retains its explicit false predicate;
pool 1 retains its missing row decision and zero rows. Other row predicates and
all treatments are unchanged. The implicit-table mode investigation/removal is
backlogged, not implemented.

The 16 existing custody cells require four certificate exchanges, actual unsealing
against fixture values and no skipped custody. The packaged-mode environment flag
is removed. The legacy exploration pass also refuses incomplete declared coverage.

## Release integration

`native.sh` builds the internal artifact separately and passes it to Stage 5.
Stage 5 runs finite all-cells coverage then the selected timed traffic duration
(default 120 seconds), retaining SMTP/browser/outage/restore checks. It also proves
a missing normal session produces 115 not exercised and a nonzero exit, and runs
custody-only selection. Stage 4 keeps its extra egress-denial and unchanged-rerun
checks, then uses the same fresh-archive Stage 5 acceptance for finite coverage,
receipts, browser and outage rather than a second timed pass rule. That final
Stage 4 step requires CUSTOMER_ARCHIVES, RELEASE_MANIFEST and INTERNAL_VERIFIER.

## Verification record

- Initial packaged-lab diagnostic: all 115 selected cells passed, zero failed,
  zero not exercised; `tmp/verify01-debug/all-public/result.json`.
- A preserved lab's self-advertised LAN engine address was unreachable from Docker;
  a certificate-valid `engineAddress` override used the normal registration API.
  No engine validation was changed. Original authorised XQ exports were used.
- Targeted checks: 41 distinct tests across the verifier, standalone artifact,
  provisioning isolation, deployment contracts, native release preconditions,
  first-hour contract and existing V-01 oracle/workflow files pass. Strict
  typecheck and lint pass on verifier candidate `7f2fa37`.
- All seven amd64 images at `80c42a3` pass layer/secret/runtime audits; fresh
  offline gateway and engine archives install successfully. The independently
  versioned verifier is `7f2fa37`. The intervening change touches only the
  internal verifier, its test and gate-tier documentation; customer payload
  source inputs are unchanged.
- Fresh archive verification: all 115 selected cells passed, zero failed and
  zero not exercised. All 114 admitted-query receipts passed caller, literal
  exclusion and scope checks. The revoked credential cell correctly refuses
  authentication before opening a receipt. All 16 custody cells perform real
  unsealing. Optional 120-second traffic completes 54 requests with zero failures.
- Deliberately missing normal session: exit 1, 115 not exercised, zero passed.
- Custody-only selection: exit 0, exactly 16 selected/passed cells, no extra
  claimed coverage. It resumes the owned public setup with its private source
  registration record; unrelated engine source references are never adopted.
- Fresh install run: `tmp/verify01-packaged-DDHKJM/install-result.json`.
  Compact review copies and complete matrices are committed beside this report
  in `verify-01-phase1/{all,missing,custody}.{json,md}`. Compact copies omit
  fixture row bodies, not outcomes or checks; full local reports remain in the
  run directory. No credentials, team identifier or receipt bodies are copied.
- The first fresh-install harness attempt incorrectly used a Docker alias for
  one-code pairing. The unchanged installer correctly refused its mismatch with
  the advertised registration address. Documented recovery with the advertised
  address succeeds through the already recorded gateway identity. Public engine
  editing then applies the certificate-valid reachable address to the fixture's
  auto-attached engine. The internal verifier now tests that path and refuses a
  different pin. The original harness failure record/log remains in the lab.
- The owned fresh lab is stopped after verification. Its expanded image-cache
  tar files were removed after retaining the compressed archives; state, volumes
  and verification records remain.
- The single completed-candidate full gate on `7f2fa37` **failed**. Typecheck,
  conformance typecheck, lint, production exclusion and all 36 console conformance
  checks passed. Normal tests: 265 files / 2,206 tests passed; one test failed.
  The browser/MCP smoke tier did not run. Cleanup passed. Total wall time:
  2,259.86 seconds. No gate retry, test rerun or code correction followed.

### Full-gate failure

`test/reinsurance-conformance.test.ts:45`, tokenized cross-source join for
`v01-cedant-1-agent-5`, expected success (`isError: false`) but received
`isError: true`. Its retained diagnostic is:

```json
{
  "code": "source_unavailable",
  "cause": "source_read_failed",
  "sourceFailure": {
    "operation": "connect",
    "nativeCode": "ETIMEDOUT",
    "sqlState": null,
    "attempt": 2
  },
  "evidenceId": "01a194fc-b4de-7ee9-b3e3-af32c1ee22d1"
}
```

The response-contract assertion at line 54 consequently expected true and
received false. The persisted-count assertion at line 107 expected an empty
count map (no successful response decoded) and received two object IDs with
null counts. These are follow-on assertions in the same test. The retained
`test-results/v01/report.json` also marks the unexpected refusal check failed.
The timeout's underlying cause is not established by this run; it is not
classified as a branch or environment defect. No application backend file or
migration changed. Fresh packaged finite V-01 verification passed, but does not
replace this failing concurrent ten-agent normal test.

Compact gate/failure evidence is in `verify-01-phase1/gate.json`; full local log:
`/private/tmp/verify01-full-gate-7f2fa37.log`. The phase is **not gate-green** and
is not merged.

No migration is touched, so no migration-test exemption or applied-migration edit
is involved. No issued evidence is edited. The four requested backlog follow-ups
are recorded in `docs/master-backlog.md`.

Native release must be run by hand on the arm64 MacBook Air; this Intel host cannot
execute the native-arm64 script. Fetch and switch to the pushed branch so the
updated release driver is used, then run the immutable revision from the handoff:

```sh
git fetch origin
git switch feat/verify-01-frame
scripts/release/native.sh "$(git rev-parse origin/feat/verify-01-frame)"
```

The default timed traffic remains 120 seconds, after finite coverage. The native
release path, including the updated Stage 5 browser/outage integration, has not
been executed in this Intel verification round. Internal artifact 1.0.0 built at
`7f2fa37` is retained separately as
`tmp/opintel-installation-verifier-1.0.0-7f2fa37.tar.gz`; no verifier is inside the
customer archives. Final report-only changes do not alter the tested executables.


## Approved source-connect correction (from d1fb550)

The single gate failure is a product connection-cutoff defect, superseding the
initial unclassified diagnosis above. Attempt 1 ran 02:42:34.166–35.167Z and
attempt 2 ran 02:42:35.356–36.364Z. All nine peer executions remained in flight.
A peer timed out at 02:42:36.311Z; Postgres logged “expected SASL response, got
message type 88” at 02:42:36.315Z (Terminate during authentication). This temporal
correlation supports the approved diagnosis that our one-second timer interrupted
healthy authentication. The server line has no request ID, so correlation is not
an independently proven request-to-backend mapping. Retained logs:
`/private/tmp/verify01-full-gate-7f2fa37.log:70599` and
`/private/tmp/verify01-postgres-failure-window.log:1`.

Step 0: `84b9503bd3723f243806f79f4b4213c13860e842` is “fix(stage5): bound
recovery and pair customer installs with one code”, dated 2026-10-27. It is an
ancestor of `5300c82` (`git merge-base --is-ancestor` exit 0). Its Stage 5 recovery
requirement is at most one connect-only retry before SQL with bounded diagnostics
(`docs/review/stage5-install.md:296`). Its source-scope tests require two attempts,
no SQL replay and no retry for authentication refusals; none requires the one-second
cap. The existing G-018 2.5-second abort-cleanup assertion starts after connecting;
its control-connection limits are unchanged. No conflicting requirement was found.

The approved correction centralizes the per-attempt allowance, default 10,000 ms,
bounded by remaining operation time. A full second allowance must fit before a
retry starts; retryable codes and the two-attempt maximum remain unchanged. Native
scanner configuration uses the same allowance rounded up to seconds, at least two,
with shared operation cancellation still active. Installation `limits.connectTimeoutMs`
is adjacent to existing source operation/statement limits; legacy configs use the
same default. Connect records include non-secret source ID and allowance; scanner
records identify its configured allowance without pretending native connect timing
is separately observable. Cancellation and cleanup limits are unchanged.

Three earlier diagnostic isolated V-01 runs passed; their slowest logged source
connects were 361, 494 and 471 ms. Those runs did not establish historical resource
load. The original gate failure and reports remain retained.

Correction checks: 128 tests in 12 targeted files passed (137.03 seconds), including
source-scope timing/refusal cases, source connector and staging, engine transport,
readiness/admission, V-01, installer defaults and provisioning-runtime. Strict
typecheck passed. Lint passed after removing the import made unused by centralizing
scanner telemetry. The first test-launch attempt was blocked by sandbox IPC before
any test ran; the actual targeted run used normal Docker/socket access.

### Correction verification result — stopped at packaged failure

Source correction commit: `c967006a2615ef9e13a33c0589c8682c1002a572`.
All seven fresh amd64 images pass layer, runtime allowlist and runtime-user audits.
Offline gateway and engine archives install. Installed engine configuration has
`connectTimeoutMs:10000`, `operationTimeoutMs:35000`, `statementTimeoutMs:30000`,
`maxConnectionsPerSource:8`.

The host initially had less than 1 GiB free. Unused cache reclamation and the
operator-authorized image removal freed space; Docker retained the images used
by the running development Postgres and Redis containers. One build was cancelled
for that removal. Another stopped because Docker lacked its just-exported runtime
base tag; rebuilding unchanged inputs under fresh local tags passed every audit.
Logs remain `/private/tmp/verify01-connect-build*.log`; no build check was bypassed.

Fresh installation: `tmp/verify01-packaged-vu8nT4`. The initial local harness reused
the original phase-1 pairing alias error. It correctly failed before any verifier
cell ran. Its result and private command log remain as
`install-result-first-pairing-harness-failure.json` and
`gateway-register-engine-first-harness-failure.log`. The existing phase-1 recovery
harness continued that same fresh installation using the advertised address and
recorded gateway identity; it did not replace trust or alter product code. One-code
pairing, customer identity import and real SMTP owner magic-link sign-in passed.

The single finite all-cells run completed: **115 selected, 114 passed, 1 failed,
0 not exercised**, exit 1. No cell was rerun. The 16 custody cells within that
selection all passed. The failed cell is
`pool0/v01.soak_recoveries.unmatched/policy_id/tokenized`: expected success, actual
`source_unavailable`, cause `engine_registry`, duration 9,767 ms, receipt
`01a1956a-8ae3-7939-8553-073c331316c9`. Diagnostics: outcome and row-count mismatch.

Gateway log lines 950–964 record `engine.transport_failed` at
2026-11-01T04:42:39.034Z (`phase:connect`, `reason:ABORT_ERR`, `written:false`,
`aborted:true`, `attempt:4`) and `engine.probe_refused` on `/custody/attest`.
Lines 972–985 record the receipt's refusal at 04:42:39.038Z with
`sourceFailure:undefined`. These retained events identify a gateway-to-engine
transport refusal, rather than a recorded source-Postgres connect failure; its
underlying cause is not established and no fix is applied. Log:
`tmp/verify01-packaged-vu8nT4/gateway-services-diagnostic.log`.

The verifier correctly skips optional two-minute traffic when finite coverage
fails. The acceptance driver stops at that failed assertion, so the standalone
missing-session and custody-only runs were not reached. The fresh services were
stopped by its cleanup. Full matrices remain in `all/result.{json,md}`; a compact
copy with image identities and no fixture row bodies is
`verify-01-phase1/source-connect-all.json`.

**The full gate has not been run for this correction.** Work stops at the known
packaged failure: no further code change, validation rerun, merge or push. The
source-connect correction has targeted-test, strict-typecheck and lint evidence,
but this candidate is not verified for release. There is no green native handoff
revision yet. The earlier native command in this report is historical, not an
assertion that this correction passed.


## Gateway transport observability round (after c967006 / eb8e8ab)

### Step 0 — retained receipts, no diagnostic rerun

A read-only forensic transaction over retained `run_stage.detail` records found
the same exact message in all five diagnostic refusals:
“Engine Paired engine is not healthy. Verify its readiness before querying.”

| Diagnostic | Receipt |
|---|---|
| Single 1 | 01a19791-769f-74e2-9ffa-1ce107966f0b |
| Single 2 | 01a19791-7a5f-73fa-87ef-47561fddcd65 |
| Single 3 | 01a19791-7be9-7927-ab69-c036958c06e3 |
| Full: cedant/clear | 01a19791-7d6d-78f2-83e7-30f4c03ab44a |
| Full: policy_id/tokenized | 01a19791-8055-7119-b7c1-3686376efc96 |

Each is the `queryReadyLoaded` condition at
`src/modules/engines/application/registry.ts:62`: health is not healthy **or**
verifiedAt is absent. They do not match “has not passed verification” at line 142
or “no current acknowledged heartbeat” at lines 65/75. The message does not
identify which side of the line-62 condition held. Refusal stages preserve the
original message (`src/modules/evidence/infrastructure/write.ts:46`); the public
receipt view substitutes a generic source-unavailable sentence
(`src/modules/evidence/infrastructure/read.ts:97–98`). Prior inspection of only
that view could not make this distinction. Retained read output:
`/private/tmp/verify01-telemetry-step0-receipts.txt`. No receipt was edited.

### Changes and resolution path

`src/shared/infrastructure/engine-transport.ts` records a generated call ID, path
without address/query, attempt number, attempt start, observed socket lookup
completion/address-returned boolean, TCP connection, TLS completion, request
write invocation, failure and completion timestamps. Successful and failed
attempts have monotonic DNS/TCP/TLS/write/total durations where observable.
Unobserved phases remain null; literal IPs explicitly skip DNS. “Written” retains
its existing meaning: the request has been handed to `req.end`, not proof that a
peer received it. No address, credential, certificate or body is logged.

DNS-versus-TCP is an observational phase only. `EngineTransportError.phase`, the
retry predicate, first-three one-second timers, four-attempt maximum, caller
budgets, agent:false, and the pre-write-only rule remain unchanged. Source and
admission timing/limits are unchanged from c967006. Source telemetry adds lease
occupancy without changing acquisition/release logic; leases are distinguished
from authenticated PostgreSQL sockets.

The phase fixture registers the hostname `host.docker.internal` through
`scripts/images/verify-installation.mjs` and the existing public engine editor;
`scripts/verification/verifier/infrastructure/engine.ts:6` takes that override.
Other installations may register a hostname or literal IP. `EngineRegistry.endpoint`
passes the registered address (`registry.ts:109`), the probe calls `engineConnect`
(`src/modules/engines/infrastructure/probe.ts:23`), and transport uses Node HTTPS
without replacing the default lookup (see `engine-transport.ts`, request call).
Production construction in `src/platform/http/start.ts:237` supplies no custom
lookup. Node's hostname path uses `dns.lookup` / `getaddrinfo` on the libuv
threadpool; IP literals bypass lookup. See the primary
[Node DNS documentation](https://nodejs.org/download/release/latest-jod/docs/api/dns.html).

The retained gateway container has `UV_THREADPOOL_SIZE` unset, as do the gateway
service definition (`deploy/gateway/services/api.json`) and installer branch.
Its effective default is **4**, per the
[Node CLI documentation](https://nodejs.org/download/release/v22.23.0/docs/api/cli.html#uv_threadpool_sizesize).
The **16** at `scripts/operator/customer-install.ts:157` is engine-only. Neither
setting is changed in this round.

### Harness retention

`scripts/run-capture.mjs` runs an independent observer process, including while
parents block in spawnSync. It retains full timestamped Docker stats for every
container at five-second intervals, container lifecycle events, safe Docker
capacity metadata and timestamped service log streams. Samples are appended,
not reduced to a minimum; collection failures are explicit. Private raw logs stay
in the run directory and are not copied into review docs. Gate tier stdout/stderr
(including in-process API/engine events) is also retained in that gate's directory.

Gate runs use `test-results/gate-runs/RUN_ID`; packaged runs use their fresh run's
`observations` directory. Stage 5 collects both the outer daemon and its nested
installed daemon. The phase-specific fresh-install driver is now versioned as
`scripts/images/verify-installation.mjs`, using the approved advertised-address
pairing flow rather than the obsolete temporary harness alias.

Gate PostgreSQL connection/disconnection logging is enabled for the run, with
prior settings restored afterward by `scripts/gate-postgres-logging.mjs`. The
ordinary packaged source fixture also enables those logs, allowing authenticated
source socket peaks to be correlated with source lease occupancy. This implements
and replaces the previous gate-correlation backlog note.

### Candidate results

Targeted tests: **151 passed in 19 files**, 196.28 seconds. This includes the new
DNS/TCP phase cases, existing no-replay/pin/TLS/recovery assertions, source scope,
engine, V-01, independent observer, retention, package and provisioning contracts.
Strict typecheck and lint pass. Lint required explicit Node/global imports in
the new harness files; no application behavior changed. Fresh packaged verification
failed as recorded below. The conditional full gate was not run.


### Fresh packaged verification — stopped at fixture setup

Candidate: **e31e596bff4121a2504df01632474c8894e58663**, new amd64 images,
new gateway and engine archives, and verifier artifact 1.0.0 built from this
revision. Image manifest:
`tmp/images/releases/candidate-verify01-e31e596-api-engine-console-egress-migrations-provisioning-demo-tools.json`.
Run directory: `tmp/verify01-packaged-oOsQB0`.

The single fresh-install command exited **1**. Archive extraction, gateway install,
engine install, one-code pairing, customer identity import and normal owner SMTP
login passed. The all-cells verifier then exited **1** with:

```
Setup prerequisite unavailable: fixture
Selected 115: 0 passed, 0 failed, 115 not exercised
```

Evidence: `all.log:1–2`, `all/result.json` and `install-result.json` in that run.
The report is complete and failed, not interrupted. Optional traffic, the
missing-session check, custody-only and the full gate were **not run**. No
verification rerun or corrective application change was made after this failure.

The boundary is assigned immediately before `customerSource`
(`scripts/verification/verifier/main.ts:44–45`). That operation seeds the ordinary
source, lists engine source references and adds the reference through the
packaged `sources` tool (`infrastructure/source.ts:13–18`). No
`all/source-registration.json` or `all/setup.json` was written. The catch at
`main.ts:70–76` deliberately suppresses most raw exceptions; this run retained
no exception code or message beyond the boundary. **The exact failing operation
within customerSource and its underlying cause cannot be established.**

#### Phase timestamps and source concurrency

There are **zero** `engine.transport_*` records in the complete retained gateway
and engine log streams. No gateway-to-engine failure timestamps, phase breakdown
or slowest successful connection exist for this run: setup stopped before
project registration/verification and the query cells. This is not evidence of a
DNS, TCP or TLS failure on that path.

The all-cells report was written at **2026-11-01 16:20:14.397952 UTC**, and
`all.log` at **16:20:14.583204 UTC** (host filesystem timestamps, not transport
phase timestamps). Source PostgreSQL's retained log shows final readiness at
**16:20:13.396 UTC**, following the entrypoint's temporary-server shutdown. Its
connection records show only local initialization `psql` sessions, not an
external seed or engine query connection; this does not establish what failed
on the client. Source log:
`observations/containers/a2aa9f55f8e7159137dbda74d2c20943235df0873138f7c2cbd53ac7940ed361-29.log:31–72`.

The only engine source lease occupancy was **1**, for `sourceId:
startup-readiness`, at **16:17:37.874 UTC**, released at **16:17:38.951 UTC**.
There were no V-01 engine source-connect attempt records or authenticated engine
query backends. The readiness lease is not a V-01 query connection, and lease
counts are not counts of authenticated sockets. These observations cannot
measure the failed fixture client's connect duration. Sanitized extraction:
`transport-analysis.json` in the run directory.

#### Docker stats around the setup failure

Docker capacity: **7.754 GiB / 4 CPUs / x86_64** (`observations/docker-capacity.json`).
The full raw series is `observations/docker-stats.jsonl`; selected measurements
below retain their sampling windows rather than assigning a point timestamp.
CPU percentages are Docker container percentages, summed across the listed
running containers (four CPUs can total 400%).

| UTC sample window | Containers with positive PIDs | Sum CPU | Gateway API CPU / memory | Engine CPU / memory | Ordinary source CPU / memory |
|---|---:|---:|---|---|---|
| 16:19:57.168–16:20:02.106 | 15 | 167.87% | 1.20% / 124 MiB | 4.48% / 56.08 MiB | 58.72% / 5.266 MiB |
| 16:20:07.169–16:20:10.784 | 15 | 215.00% | 1.55% / 124.5 MiB | 4.12% / 56.09 MiB | 103.50% / 7.352 MiB |
| 16:20:12.169–16:20:15.870 | 14 + 1 unknown | 104.25% | 6.40% / 128.6 MiB | 16.33% / 56.09 MiB | Docker returned `--`, unavailable |
| 16:20:22.171–16:20:25.641 | 13 | 118.34% | 1.26% / 128.6 MiB | 17.32% / 56.11 MiB | Removed by cleanup |

Raw-series lines **57–60** contain these windows and every other container's
measurements. This is observational load evidence, not proof of a root cause.

Retention limitation: `observations/capture.json` reports **62 successful samples,
2 failed sampling cycles, complete:false**. Stats/discovery commands timed out
during installation (raw-series lines 40–41). Five seconds is the scheduled
interval; commands taking longer cause gaps, not fabricated samples. Sampling
also contains one unavailable source-container measurement at the failure.
The retained series therefore cannot honestly be described as complete five-second
coverage. Gateway/engine lifecycle logs and container events remain retained.

The requested stop condition applies. **No full gate, push or merge followed the
packaged failure.** Implementation commit remains local at `e31e596`; this result
updates the report without applying a fix or running further verification.

## Verifier diagnostic round after e31e596

### Step 0 — retained evidence only

At 2026-11-01 **16:20:14 UTC**, the verifier was in `customerSource`, under
`boundary='fixture'` (pre-change `main.ts:44–45`, `infrastructure/source.ts:13–18`).
`all.log:1–2` names fixture setup; the report was written at
16:20:14.397952 UTC. It cannot identify whether seed, source-list or source-add
was the failing substep. There is no retained exception establishing the cause.

The last gateway request indicated by control flow is **GET /api/v1/auth/me**,
which returned successfully before that boundary was entered. Its exact status,
time, refusal code and cause are **not retained** in the access logs. This is a
control-flow observation, not a measured HTTP trace. The preceding owner login
**POST /api/v1/auth/callback** was asserted **200** by the acceptance driver
(`scripts/images/verify-installation.mjs:38`); its gateway `auth.link_accepted`
event is at **16:20:07.525 UTC**, captured in
`observations/containers/517c9aa33cadeb4c3dd260a47321e14d0536cc64ee93b12952b94e4dedb0aa26-27.log:15–19`.
The preceding request-link event is at 16:20:04.289 UTC (lines 3–7).
No refusal code, cause or request error was recorded for these successful
operations. The later idle database error at 16:20:32 (lines 20–23) follows the
failure and cleanup; it does not establish the setup failure's cause.

The last engine HTTP route and status are **not found** in the retained logs.
`engine.paired_trust_loaded` at 16:18:21.052 UTC is the last engine operational
event before the failure, not an HTTP access record:
`observations/containers/19d35266e43d41fd2245c8c8cf6c8e37f2f1bffcba433975c8b7934637016c72-24.log:21–25`.
No gateway-to-engine transport events, refusal or error were recorded in this
window. Source PostgreSQL's temporary init server and final readiness are recorded
in the previous section; they alone do not establish the client exception.
All paths in this Step 0 refer to `tmp/verify01-packaged-oOsQB0`.

### Catch inventory and change

All five pre-change catches in `scripts/verification/verifier/` that swallowed or
replaced errors were reviewed:

| Original location at e31e596 | Previous handling | New report handling |
|---|---|---|
| `main.ts:25` | Replaced selector exception with generic text, exit 2 | Sanitized selection diagnostic in JSON/Markdown when an output directory is supplied; exit 2 |
| `main.ts:47` | Ignored ENOENT for an absent resume file | Recorded informational `governance.resume` diagnostic; this expected first-run absence remains nonfatal; other errors still fail setup |
| `main.ts:70–76` | Replaced most setup errors with boundary only | Structured setup error, native/recursive causes, route/status/refusal context when applicable; nonzero exit |
| `main.ts:82` | Optional traffic catch incremented count only | Records the failing cell diagnostic as well as the failure count; failed scheduled traffic is retained too |
| `scheduler.ts:13` | Replaced ordinary cell exceptions with generic text | Structured per-cell exception plus a sanitized readable diagnostic; failure/not-exercised distinction preserved |

`infrastructure/http.ts:28` was not a catch, but discarded failed response bodies.
It now retains only refusal code/cause and a sanitized message, alongside route
without query and HTTP status. It does not store response bodies or cookies.
The new diagnostic boundary wrapper catches and rethrows with context; execution
and cleanup catches also record their errors before returning a failing report.
A native error code and nested causes are separate from a domain refusal cause;
null explicitly means unavailable/not applicable, not an invented value.

Fixture operations have distinct `fixture.seed`, `fixture.sources-list` and
`fixture.sources-add` labels. Reports include error class/code and sanitized
message; argv, stacks, database detail/hint/query and response payloads are not
copied. Credentials, URLs, cookies, quoted values, SQL and opaque values are
redacted. No file under `src/` or `sidecar/` is changed, and no installed image,
timeout, retry, reuse or admission behavior changes.

### Validation and installed run

Targeted validation: **11 tests passed in three files**, including fixture setup
cause reporting, HTTP context/redaction, standalone artifact and DEP-008. Strict
typecheck and lint passed. An initial direct Vitest invocation was refused before
tests by datastore safety; validation used the repository normal-test bootstrap.
The one existing-install run is pending. The original run
reports remain intact; new reports will have a separate directory. The prior
harness stopped the installed services and removed its ephemeral source fixture.
Restarting the same installed packages and recreating that ordinary external
fixture at its retained target is environment setup, not a fresh archive install.
Only the internal verifier artifact will be rebuilt.
