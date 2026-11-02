# Connection reliability product extraction

Current status: **gate validation accepted by the owner**, using the completed gate's six passing tiers plus the approved smoke-only comparison evidence. Product fixes and telemetry remain unchanged; diagnostic gate hooks were removed and the branch is rebased onto main **4e82a73**. Fresh amd64 archives and one standard packaged first-receipt verification are now authorized and pending. The original failed gate record is preserved unchanged below.

Branch: `fix/connect-reliability`, created in the main checkout from
`770174d29025b4f94a983685bfde7f2761d0b912`. That approved merge was pushed to main
with the exact title “Merge feat/console-followups-1 after amd64 packaged and arm64
native verification”. The console tip was `c1e1c38`. The operator's arm64 basis
included a Receipt API 401 in the old soak, zero invariant breaches and no Redis
restart; that exception is recorded as unresolved rather than labelled a clean
soak pass. No worktree was created. This reliability branch is not merged.

## Selected upstream changes

The source patches were applied in order with `git diff PARENT COMMIT -- PATHS |
git apply --3way`, not by merging the VERIFY-01 branch or copying its final tree.
Both selected sets applied cleanly. This preserves main's newer source-schema
listing capability and the separately merged SpiceDB schema-load fix.

From **c967006a2615ef9e13a33c0589c8682c1002a572**:

- `sidecar/application/source-connector.ts`, `sidecar/config.ts`,
  `sidecar/infrastructure/postgres-source-scope.ts`: one 10-second default connect
  allowance, capped by the shared operation deadline; at most two connect-only
  attempts, existing retryable codes, no SQL replay, and no second attempt when
  its full allowance cannot fit. Native scanner uses the same allowance rounded
  up to seconds with libpq's minimum of two. Cancellation/cleanup limits remain.
- `sidecar/execution/infrastructure/postgres-source.ts` and
  `src/shared/infrastructure/source-trace.ts`: source ID and allowance telemetry,
  moving native scanner events to the scope that knows the actual allowance.
- `scripts/operator/customer-install.ts`, `sidecar/README.md`: adjacent install
  setting and documentation for the source connect limit.
- Existing tests: `customer-install.test.mjs`, `postgres-source-deadline.test.ts`
  and `staging-source.test.ts`.

From **e31e596bff4121a2504df01632474c8894e58663**:

- `src/shared/infrastructure/engine-transport.ts`: per-call/per-attempt path,
  DNS/TCP/TLS/write/failure timestamps and phase durations, with bounded native
  codes; no addresses, credentials, certificates, bodies or SQL. Gateway-to-engine
  deadlines, retry count, connection reuse and admission behavior remain unchanged.
- Source-scope/source-trace lease occupancy events. These count active leases,
  not an assertion that every leased PostgreSQL connection has authenticated.
- `scripts/run-capture.mjs`: independent collector, full timestamped Docker stats
  series at a scheduled five-second interval, events, capacity and service logs.
- `scripts/gate.mjs`, `scripts/gate-postgres-logging.mjs`: gate run directory,
  per-tier logs and capture lifecycle; enable PostgreSQL connection/disconnection
  logging, restoring inherited versus explicit prior settings after the run.
- `scripts/images/first-hour-source.mjs`: connection/disconnection logging on the
  ordinary external Postgres fixture. Its data and connection path are unchanged.
- Existing tests: `engine-connect-transport.test.ts`,
  `gate-postgres-logging.test.mjs`, `run-capture.test.mjs`,
  `postgres-source-deadline.test.ts` and `staging-source.test.ts`.

### Exclusions and mixed context

No changes under `scripts/verification/verifier/`, `scripts/release/`,
`scripts/images/stage5-smoke.mjs`, `scripts/images/verify-installation.mjs`, or
VERIFY-01 review files were applied. Both index and worktree diffs for those
paths were empty after selection. The original commits' master-backlog changes
only proposed/removed future capture work, so those were omitted; this branch
records the implemented capture and the newly requested open items instead.

No selected source hunk contained verifier implementation that needed splitting.
The excluded stage5 and verification-installation wiring hunks were omitted in
full. The retained first-hour-source hunk is observability only. The source
connector patch was merged around main's additional `listSchemas` method,
retaining that method and adding only the upstream timeout constant. The capture
helper is wired to the gate; excluded verifier/release harness wiring is not
recreated under another name or replaced with a substitute.

## Gateway worker mitigation and backlog

The gateway install now writes `UV_THREADPOOL_SIZE=16` to its runtime environment,
matching the engine's existing value. The new existing-file installer test verifies
both the written environment and the effective API Compose environment. This is
a **mitigation for an unproven hypothesis** that address lookup waits behind
other libuv thread-pool work. It does not establish the cause or close gateway to
engine stalls. The new performance-phase backlog item explicitly stays open.
No lookup implementation, connection retry policy or transport timeout changed
as part of this mitigation.

Backlog only, not implemented:

- The reported arm64 `c1e1c38` owner-session loss at about 90 seconds (Receipt API
  401, zero invariant breaches, Redis not restarted, cause unknown). The VERIFY-01
  rebuild must maintain a valid session for the full run and report why it ends.
- Console polish pending an approved board: one-line conditions, labels once,
  remove icon, single “+ Add condition”, AND/OR toggle; one schema heading/no
  stray status line; the same builder for per-table rules.

## Targeted validation

All commands use `/Users/rzarita/opintel`. Unrelated pre-existing untracked
documents/cache files are preserved and are not staged.

```sh
npm test -- test/postgres-source-deadline.test.ts test/staging-source.test.ts test/engine-connect-transport.test.ts test/gate-postgres-logging.test.mjs test/run-capture.test.mjs test/customer-install.test.mjs test/provisioning-runtime.test.mjs test/source-trace.test.ts test/sidecar-http.test.ts test/sidecar-startup.test.ts test/sidecar-validation.test.ts test/postgres-connector.test.ts test/source-connector.test.ts test/reinsurance-conformance.test.ts test/first-hour-contract.test.mjs
```

**135 passed, 15 files, exit 0**, 196.43 seconds.
Log: `/private/tmp/connect-reliability-targeted.log`.
Includes source deadline/native scanner rounding, 1.5-second first-connect
success, no SQL replay, refusal behavior, DNS/TCP distinctions, telemetry
allowlists, independent capture, Postgres logging restoration, gateway workers,
V-01 and DEP-008. No migration was added or edited.

`node --check` passed for `scripts/run-capture.mjs`,
`scripts/gate-postgres-logging.mjs`, `scripts/gate.mjs` and
`scripts/images/first-hour-source.mjs`.

Strict typecheck, lint, the single full gate and the fresh packaged result are
recorded below as they complete. Product changes will be committed and pushed
before the completed-candidate gate; no verifier or release-script substitute
will be written for installation verification.


Strict `npm run typecheck`: **exit 0**.
Log: `/private/tmp/connect-reliability-typecheck.log`.
`npm run lint`: **exit 0**, no dependency violations (580 modules, 1,919 dependencies).
Log: `/private/tmp/connect-reliability-lint.log`.


## Porting defect found by the first candidate gate

Implementation candidate **adaf97df0c8bb9aa3495ce88efbe00d83b5435ff** was pushed,
then ran `COMPOSE_PROJECT_NAME=opintel npm run check` once. It exited **1**.
Preflight, both typechecks, lint, production-artifact exclusion and **36
conformance tests (28/28 routes, zero findings)** passed. Before any normal-test
result was produced, the parent failed with an unhandled WriteStream error:

```text
ENOENT: no such file or directory, open
  test-results/gate-runs/4acd19ec-34f5-41f4-9bb2-2b89d65f3d67/test.log
```

Log: `/private/tmp/connect-reliability-full-gate-adaf97d.log`.
[Last structured state](connect-reliability/gate-adaf97d-incomplete.json) is
incomplete: it records five passed tiers and a last wall time of 688.17 seconds,
not a final completed result. No normal-tier result or smoke result is claimed.

**Established cause:** the selected e31e596 gate code placed its new evidence
under `test-results/gate-runs`. Playwright's default output directory is
`test-results` (`node_modules/playwright/lib/common/index.js:587` in the pinned
1.63.0 installation). Its `createRemoveOutputDirsTask` removes that whole root
before tests (`node_modules/playwright/lib/runner/index.js:6398–6406`). The
repository Playwright config does not override that root. The directory was
observed missing, the capture worker had exited, and advancing to the normal tier
then produced the recorded ENOENT. This is a ported harness defect, not a source
connect or installed-product failure. The previously observed 51 successful
Docker samples were subsequently lost with the directory; a complete retained
series is **not** claimed for that invocation.

The unhandled stream error bypassed normal gate cleanup. Necessary environment
cleanup, before further validation:

- Verified no surviving normal-test process, then restored the two prior inherited
  PostgreSQL settings with the same ALTER SYSTEM RESET/pg_reload_conf operations
  the imported restore closure uses. Exact local commands were
  `COMPOSE_PROJECT_NAME=opintel docker compose exec -T postgres psql -U opintel -d postgres -v ON_ERROR_STOP=1 -c 'ALTER SYSTEM RESET log_connections' -c 'ALTER SYSTEM RESET log_disconnections' -c 'SELECT pg_reload_conf()' -c 'DROP DATABASE IF EXISTS "opintel_test_gate_64cadc497d02_70e45e757e40" WITH (FORCE)'`.
- A fresh settings read confirmed `log_connections|off|default` and
  `log_disconnections|off|default`, matching the saved pre-run settings. Only that
  run's generated isolated database was dropped.
- Called the existing `cleanupGateContainers` with the failed run ID; it removed
  **2** run-labelled fixture containers. Other installations and dev services
  were preserved. No replacement install/sign-in/HTTP/TLS harness was used.

### Correction under the instruction to fix own defects

A shared `gateRunDirectory` path factory in the existing capture module now uses
`tmp/gate-runs/<runId>`, outside the browser output root. The gate uses that
factory. No Playwright cleanup, assertion, timeout or gate tier is weakened.
The new test in the existing `run-capture.test.mjs` starts real capture in a
fixture checkout root, deletes its browser output directory, writes the later
normal-tier log, stops capture, and verifies the samples and completion manifest
survive. It would fail with the original nested evidence path.

Focused validation:
`npm test -- test/run-capture.test.mjs test/gate-postgres-logging.test.mjs test/provisioning-runtime.test.mjs`
— **5 passed, 3 files, exit 0**, 47.35 seconds. Includes the existing independent
sampling test, the new output-cleanup regression, Postgres restoration contract
and DEP-008. Log: `/private/tmp/connect-reliability-capture-path-targeted.log`.
Syntax checks on the gate and capture scripts passed. The failed candidate is
preserved, not amended or relabelled. The corrected candidate gets its own
commit, targeted/type/lint checks and gate invocation; the unchanged failed
candidate is not rerun to obtain a green record. This is within the user's
explicit authority to fix defects in the assigned observability work.


Capture-path correction: strict `npm run typecheck` **exit 0** and
`npm run lint` **exit 0**, no dependency violations (580 modules, 1,919 dependencies).
Logs: `/private/tmp/connect-reliability-capture-path-typecheck.log` and
`/private/tmp/connect-reliability-capture-path-lint.log`.


## Corrected candidate — external preflight blocker

Correction **33668d270ced64784095667d01d10be0bdda64fa** was committed separately
and pushed immediately (`fix(gate): retain capture outside Playwright output
cleanup`). It changes only the evidence directory factory/gate integration, the
new regression test and the preserved failed-candidate report. Product code and
the source/transport tests remain as in the targeted passing selection.

`COMPOSE_PROJECT_NAME=opintel npm run check` ran once on that corrected tip and
exited **1**, total wall time **60.61 s**, preflight record **49.03 s**:

```text
Gate memory preflight: 1.89 GiB available RAM; minimum 1 GiB.
Docker info: 8.592s elapsed; timeout 30s.
Docker memory: 7.75 GiB; minimum 7 GiB usable.
Gate failed: Redis did not accept connections within 5 seconds
```

Log: `/private/tmp/connect-reliability-corrected-full-gate.log`.
[Structured result](connect-reliability/gate-33668d2-preflight.json) has
`tiers: []`, `complete: false`, cleanup exit 0 and zero containers removed.
Postgres logging overrides and isolated gate database creation were not reached
in this invocation. The first failed invocation's owned database and settings
had already been cleaned/restored as recorded above.

After exit, read-only `docker ps` for project `opintel` reported both development
services **Up 33 hours (healthy)**. A healthy container after the failure does
not establish why the five-second Redis readiness probe failed. The underlying
cause is **not established**; no claim of a Redis restart or a product-connect
regression is made. This is an environment/setup blocker outside the requested
product changes. Per the user's stop rule, there was no fix, preflight retry,
additional gate, image/archive build or packaged install after this failure.

The corrected capture path retained its evidence and completed shutdown:
[capture manifest](connect-reliability/capture-33668d2.json),
[Docker capacity](connect-reliability/docker-capacity-33668d2.json).
It records **4 successful sampling cycles, 0 failed**, from
`2026-11-02T04:45:46.371Z` to `04:46:46.492Z`, scheduled interval 5 seconds.
These are the actual completed samples; Docker command duration can make actual
sample windows longer than the scheduled interval. Capacity: **4 CPUs**, Docker
**8,325,943,296 bytes** (~7.75 GiB), **x86_64**. Full stats/events and private
container logs remain under
`tmp/gate-runs/876f618f-df77-4ea5-9e19-a8e1f9a9bbe5/observations` and are not
committed. This preflight stop does not itself exercise Playwright cleanup; the
new targeted output-cleanup regression supplies that check.

## Handoff

- Console merge **770174d** is on main and pushed, as approved. Main was not
  advanced again after branching.
- Reliability implementation **adaf97d** and capture correction **33668d2** are
  pushed on `fix/connect-reliability`. All requested exclusions remain untouched.
- Targeted source/transport/engine/V-01/installer/provisioning tests passed
  (**135**); capture correction tests passed (**5**); strict typecheck and lint
  passed for both candidates. A full green gate and fresh packaged first receipt
  are **not claimed**.
- The gateway worker setting remains labelled a hypothesis mitigation; performance
  investigation and session/design-board backlog entries remain open.
- Work remains in `/Users/rzarita/opintel`, with no worktrees and unrelated
  untracked documents preserved. No reliability merge.
- This final evidence/report commit is documentation only and is pushed
  immediately. The native.sh command in chat targets that final revision but is
  an unverified follow-up, not a release certification. Intel packaged validation
  remains pending because the corrected candidate stopped in preflight.

## Resumed after the priority row-rule correction — preflight stopped

The user directed that `fix/connect-reliability` resume after the priority compound-row-rule fix. That priority work is complete on **fix/row-rule-conditions**, pushed at **f29dd9e** without a merge. Its source candidate **2856515992b0855286681b83bddc4a5b02c2299e** passed the approved smoke-only correction and one fresh amd64 archived install through the first receipt (zero browser errors). Those archives contain the row-rule fix, **not** the reliability changes; they are not reliability validation. The row-rule native command is:

```sh
scripts/release/native.sh 2856515992b0855286681b83bddc4a5b02c2299e
```

Resumed in the main checkout on unchanged reliability revision **20618f7071842eb02a1c71dd3582124f8e7541d0**. `docker compose ps postgres redis` before the gate showed both `opintel-postgres-1` and `opintel-redis-1` **Up 45 hours (healthy)**. No service was restarted and no code, setting, timeout or environment file was changed.

The resumed command was:

```sh
COMPOSE_PROJECT_NAME=opintel npm run check
```

It exited **1**, stopping in preflight after **17.18 s**, total wall time **22.98 s**:

```text
Gate memory preflight: 1.69 GiB available RAM; minimum 1 GiB.
Docker info: 1.014s elapsed; timeout 30s.
Docker memory: 7.75 GiB; minimum 7 GiB usable.
Gate failed: Redis did not accept connections within 5 seconds
```

[Structured result](connect-reliability/gate-20618f7-resumed-preflight.json): `tiers: []`, `complete: false`, cleanup exit 0, zero containers removed. Gate database preparation and the Postgres logging override were not reached. After exit, the same two development services still reported **Up 45 hours (healthy)**. This establishes the failed five-second probe and before/after container health, **not its underlying cause**.

[Capture record](connect-reliability/capture-20618f7-resumed.json) retains **3 complete collector samples, zero failed samples**, from `2026-11-02T15:50:47.133Z` to `15:51:09.973Z`; configured interval 5 seconds. This is separate from the gate memory monitor's four samples. [Docker capacity](connect-reliability/docker-capacity-20618f7-resumed.json): four CPUs, 8,325,943,296 memory bytes, x86_64. Full private stats/events/container logs remain in `tmp/gate-runs/3a551038-3334-48ac-b46a-8258174d79f8/observations/`. Console log: `/private/tmp/connect-reliability-resumed-full-gate-20618f7.log`.

Stopped without another probe/gate, code or limit change, archive build or packaged run for reliability. The report and sanitized metadata alone are committed and pushed. No merge; reliability still has no green full gate or packaged first-receipt result.
## Gate comparison and diagnostic removal (approved follow-up)

Main now contains the approved row-rule merge **4e82a736dafbd67b5856fd9f9741a2566a08e4db**, pushed with the exact title `Merge fix/row-rule-conditions after amd64 packaged and arm64 native verification`. Basis supplied by the user includes the arm64 native pass on `2856515`; no verification was rerun for that merge.

### Evidence: behavior before removal

References for reliability below are at **a9028659e911ed03eff70b6780a1c9e8f1f0e136**, so deleted diagnostic code remains inspectable in history. Main references are at **4e82a73**.

| File | Main / successful row-rule gate | Reliability before removal |
|---|---|---|
| `scripts/gate.mjs` | Lines 50–54: memory monitoring, preflight, then isolated database preparation. Lines 43–47 inherit child stdio. | Lines 29–30 create a separate run directory; lines 58–60 start and await a Docker collector **before** memory/preflight. Lines 49–54 tee tier output into files. Lines 61–63 reconfigure Postgres **after** preflight; lines 89–90 restore settings and stop capture during cleanup. |
| `scripts/gate-preflight.mjs` | **Byte-identical on both branches.** Lines 21–25 run each `node --import tsx` probe under a five-second process deadline. Lines 113–118 inspect services and start only missing services with `--no-recreate --no-deps --pull never`. Lines 120–126 run the two probes and report failures. | No difference, including timeouts, start behavior, image checks and readiness criteria. |
| `scripts/gate-probe.ts` | **Unchanged.** Lines 12–14 load only the needed driver, then establish a three-second retry window. Redis uses a 500 ms socket connect timeout, no reconnect, and PING at lines 27–31. | No difference. The outer five-second deadline includes Node/tsx/driver startup; it is not exclusively a Redis-server handshake measurement. |
| `scripts/gate-postgres-logging.mjs` | File absent. | Lines 5–7 inspect development Postgres settings using `docker compose exec`; lines 11–12 `ALTER SYSTEM SET log_connections/log_disconnections='on'` and `pg_reload_conf()`. Line 9 restores prior settings/reset provenance and reloads. This **reconfigures** the development server; it does not restart it. |
| `scripts/run-capture.mjs` | File absent; no collector invoked. | Lines 19–23 fork/await the collector; lines 27–60 issue Docker info, stats, discovery, events and followed logs, including ongoing work during preflight. These commands observe containers; they do not restart or reconfigure services. |

The Postgres logging helper could not have caused the reported Redis failures: `gatePreflight` rejected at gate line 60 before the helper call at line 61. Its diagnostic reconfiguration is nevertheless outside the now-approved scope. The additional preflight-time collector is an established behavioral difference, but the retained evidence does **not** establish it as the root cause of the five-second probe failures.

### Change

Restore `scripts/gate.mjs` **exactly to main**, removing all automatic capture/tee/logging integration. Delete the now-unused, branch-only Postgres logging and capture helpers and their diagnostic-only tests. Keep historical reports, stats and traces intact. `scripts/gate-preflight.mjs` and every readiness/timeout criterion remain unchanged. Thus the gate itself now behaves exactly like the successful main/row-rule path; it does not automatically change Postgres logging.

Product source-connect allowances/configuration/native scanner behavior, source and engine-transport telemetry, the gateway `UV_THREADPOOL_SIZE=16` mitigation and the engine's existing setting remain untouched. Verifier/release-wiring exclusions remain untouched. No governance assertion is weakened: only tests of the removed diagnostic tools are removed; source/transport/refusal/receipt tests are retained.

### Rebase and targeted results

Rebased without conflicts onto **4e82a736dafbd67b5856fd9f9741a2566a08e4db**. Rebased implementation/removal tip **8e483e518b810ec8fd46eaf57f4b8d51767bdc95** was pushed with a lease. The former gate-removal commit was **00546d9b7188bfbb1bb39447f987f60245b45687**; its rebased identity is **8e483e5**. `git merge-base main HEAD` returned the new main. `git diff --exit-code main -- scripts/gate.mjs scripts/gate-preflight.mjs` returned 0. All excluded verifier/release paths remain unchanged relative to main.

Post-rebase targeted validation: **173 passed in 18 files, exit 0**, 205.06 seconds. It includes the retained product/source/transport/installer/V-01 tests, DEP-008, existing gate prerequisite/database/memory/container tests, and the merged row-rule/receipt tests. No migration was touched. Diagnostic helper tests were removed with the deleted helpers; no source/refusal/receipt assertions were removed.

```sh
npm test -- test/postgres-source-deadline.test.ts test/staging-source.test.ts test/engine-connect-transport.test.ts test/customer-install.test.mjs test/provisioning-runtime.test.mjs test/source-trace.test.ts test/sidecar-http.test.ts test/sidecar-startup.test.ts test/sidecar-validation.test.ts test/postgres-connector.test.ts test/source-connector.test.ts test/reinsurance-conformance.test.ts test/first-hour-contract.test.mjs test/gate-preflight.test.mjs test/gate-memory.test.mjs test/gate-containers.test.mjs test/gate-database.test.mjs test/row-entitlements-console.test.ts
```

Log: `/private/tmp/connect-reliability-rebased-targeted-8e483e5.log`. Strict `npm run typecheck` and `npm run lint` passed, with zero dependency violations; logs `/private/tmp/connect-reliability-rebased-typecheck.log` and `/private/tmp/connect-reliability-rebased-lint.log`. `node --check` passed for restored `scripts/gate.mjs` and retained `scripts/images/first-hour-source.mjs`.

The requested `docker compose ps postgres redis` check immediately before gate preparation showed both services **Up 45 hours (healthy)**. No start, restart, reconfiguration or persistent environment change was needed.

The single new completed-candidate gate and its stop result are recorded below.
### Single new gate: preflight passed, smoke stopped

Completed candidate **1c81fbe778b72f2fd8999f7048623c59f6e1dc05** was committed and pushed before `COMPOSE_PROJECT_NAME=opintel npm run check`. It ran **once**, exited **1**, wall time **2830.10 s**. [Structured result](connect-reliability/gate-1c81fbe.json). Log: `/private/tmp/connect-reliability-main-gate-1c81fbe.log`.

| Stage | Result |
|---|---|
| Main's unmodified preflight | Passed in 14.64 s: Postgres/Redis reachable, no services started, fresh database migrated from zero |
| Strict typecheck | Passed |
| Conformance typecheck | Passed |
| Lint / boundaries | Passed |
| Production artifact | Passed |
| Full control conformance | 38 passed; 28/28 screen routes, zero findings |
| Normal domain/integration tests | **2,228 passed in 265 files**; source allowance/transport, V-01, row-rule/receipt and DEP-008 tests included |
| Browser/MCP smoke | **Failed**, unchanged 30,000 ms test deadline; editor still present at `e2e/smoke.spec.ts:69` after Apply |
| Cleanup | Exit 0; isolated gate database removed, zero containers removed by final cleanup |

Both development services remained **Up 46 hours (healthy)** after the run. There was no development service restart or logging reconfiguration. The restored preflight now passed; that observation alone does **not** prove the old collector caused the earlier Redis failures.

#### Retained smoke evidence, no new run

The approved checkbox correction is present at `e2e/smoke.spec.ts:66`; this failure did **not** wait for a missing column picker. The path selected `field_1 >= 3` and clicked Apply at line 68, then timed out waiting for the editor count to become zero at line 69. The assertions that read the stored decision and execute authenticated MCP at lines 70–74 were not reached.

The final screencast shows All rows unchecked, column `field_1`, operator `>=`, value `3`, and **Saving…**. It was extracted read-only to `/private/tmp/connect-reliability-smoke-1c81fbe.jpeg`. The retained trace/context were copied without modification to `tmp/connect-reliability-gate-1c81fbe/smoke-sign-in-→-pool-→-row-9001e--persisted-receipt-decision-smoke/` so a later Playwright output cleanup cannot remove them.

Redacted trace network metadata:

| UTC start | Request | Recorded result |
|---|---|---|
| 17:27:51.708 | PUT `/api/v1/pools/…/tables/…/rows` | **200**, 632.871 ms; no recorded transport failure |
| 17:27:52.389 | GET `/api/v1/projects/…/pools` | No completed response recorded (`status: -1`, `time: -1` in Playwright trace) |
| 17:27:52.395 | GET `/api/v1/pools/…/row-entitlements` | No completed response recorded |
| 17:27:52.400 | GET current row decision | No completed response recorded |
| 17:27:52.412 | GET row decision history | No completed response recorded |

`-1` is trace metadata for an incomplete request, **not an HTTP response status**. The sequence is consistent with awaiting the post-save refresh: `src/console-next/pools/commands.tsx:21–22` awaits `refresh()` before `onClose()`, and `src/console-next/pools/data.ts:42–47` awaits query invalidations. It does not establish why those refresh requests had not completed before the test deadline. No engine-connect failure or refusal is established by this smoke evidence; its MCP query was not reached. No timeout, application behavior, test or configuration was changed to obtain a pass.

The read-only extraction script used for the recorded network metadata is included here with its result. It makes no requests and emits only route, timing and status metadata, excluding headers, credentials and bodies:

```python
import json, zipfile
from urllib.parse import urlsplit
with zipfile.ZipFile('test-results/smoke-sign-in-→-pool-→-row-9001e--persisted-receipt-decision-smoke/trace.zip') as z:
    rows = [json.loads(x).get('snapshot', {}) for x in z.read('1-trace.network').decode().splitlines()]
    cutoff = next(s['startedDateTime'] for s in rows if s.get('request', {}).get('method') == 'PUT')
    for s in rows:
        if s.get('startedDateTime', '') >= cutoff:
            r = s.get('request', {})
            print(json.dumps({'at': s.get('startedDateTime'), 'method': r.get('method'),
                              'path': urlsplit(r.get('url', '')).path,
                              'status': s.get('response', {}).get('status'),
                              'timeMs': s.get('time'), 'failure': s.get('_failureText')}))
```

**Stopped.** No gate retry, no new reliability image/archive build and no packaged reliability install after this failure. The earlier row-rule amd64/arm64 verification does not include these connection changes and is not reused as reliability evidence. Only this report and the gate result are committed/pushed after failure; main stays at approved merge **4e82a73** and reliability stays unmerged. Native verification remains pending.

## Owner acceptance and packaged verification authorization

The user explicitly accepted the gate on **a421507** with the later smoke evidence. This is an owner acceptance decision, not a rewritten test result:

- The actual full gate ran at **1c81fbe**; **a421507** has identical executable code and adds only the report/result. Preflight, both typechecks, lint, production-artifact exclusion, 38 control-conformance tests (28/28 routes, zero findings), and **2,228 normal tests** passed.
- The original smoke timed out after a successful row-rule PUT. Its unfinished refresh paths made no gateway-to-engine call; the MCP query had not been reached.
- The requested unchanged, back-to-back standard smoke comparison passed on main **4e82a73** (14.0 s path; 35.9 s overall) and branch **a421507** (18.1 s path; 40.8 s overall). The failure did not reproduce.
- Therefore the owner accepts the existing gate with that smoke evidence and authorizes fresh amd64 archives and one standard packaged installation through the first receipt. No new gate/smoke rerun or timeout/product change is needed in this round.

[Smoke diagnosis and all pending-request evidence](connect-reliability-smoke-diagnosis.md). The raw `gate-1c81fbe.json` still records exit 1 and `complete: false`; no historical evidence is edited to claim that invocation exited 0. **4d4218a** is documentation/backlog only and has the same executable code.

The requested HTTP/2 ingress backlog hypothesis was added as text only. No existing ingress item was found in the checked-out backlog, so a new heading was added. It records the owner's six-pending-GET/per-host-limit hypothesis, while retaining the evidence limitation about older font entries and unmeasured connection occupancy/HTTP version. It is not an established cause or an implemented change.

Fresh image/archive and packaged first-receipt results will be appended after the standard steps finish. Reliability remains unmerged; native arm64 verification will be performed on the MacBook Air using the supplied revision command.
