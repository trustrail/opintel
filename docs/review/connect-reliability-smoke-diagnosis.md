# Smoke-only comparison: main and connection reliability

Report only. No product, test, timeout, retry, environment-file or configuration change. No full gate or packaged install. ARCH-01 is added verbatim as backlog text in the same commit as this report; it is a proposal pending owner approval, not an implemented transport decision.

## 1. Retained failure evidence

The failed gate used `1c81fbe778b72f2fd8999f7048623c59f6e1dc05`; the requested branch tip `a4215073015cb4f28a24d56b68b2d74d90899e8a` differs only in its report and gate-result JSON. Its executable code is identical. Evidence source:

- `tmp/connect-reliability-gate-1c81fbe/smoke-sign-in-→-pool-→-row-9001e--persisted-receipt-decision-smoke/trace.zip`, `1-trace.network` and `1-trace.trace`.
- `/private/tmp/connect-reliability-main-gate-1c81fbe.log`.
- `docs/review/connect-reliability/gate-1c81fbe.json`.

The row-rule PUT began at **2026-11-02 17:27:51.708 UTC** and returned **HTTP 200 in 632.871 ms**. Smoke subsequently timed out at `e2e/smoke.spec.ts:69` waiting for `[data-inline-rows]` to disappear. The final screencast shows **Saving…**. `commands.tsx:21` awaits refresh before closing, and `pools/data.ts:42–45` awaits query invalidations. This is consistent with an unfinished refresh, but does not establish its underlying cause.

### Every unfinished network entry in the retained trace

All six entries below have `status: -1` and `time: -1`, without a recorded failure message or completed response. **These are Playwright trace sentinels, not HTTP error statuses.** They establish incomplete recording, not which server thread/socket was blocked. In particular, the two older font entries span earlier document navigation; the retained HAR alone cannot establish that they were still active at the test deadline. The four API entries are the post-save refresh requests.

Identifiers, to keep the paths readable:

- `P = ad089ec0-0b6a-49ec-89e3-777d24a96bee` (project).
- `B = 30402b3d-af04-42cc-839b-2b0608979f9b` (pool).
- `T = 85831bc1-d39e-4726-9982-8619d214fe02` (table).

| Method | Path | Start, UTC on 2026-11-02 | Handler destination / dependency path |
|---|---|---|---|
| GET | `/fonts/InterVariable.woff2` | 17:27:40.178 | Console static service only; no gateway or engine. Earlier-document entry; active-at-deadline status not established. |
| GET | `/fonts/InterVariable.woff2` | 17:27:42.035 | Console static service only; no gateway or engine. Active-at-deadline status not established. |
| GET | `/api/v1/projects/P/pools` | 17:27:52.389 | **Smoke fixture only**, fulfilled directly by Playwright; no backend HTTP request. |
| GET | `/api/v1/pools/B/row-entitlements` | 17:27:52.395 | **Gateway only** in the gateway-versus-engine distinction; authorization may use SpiceDB, and the repository reads gateway Postgres. No engine call. |
| GET | `/api/v1/pools/B/row-entitlements/T` | 17:27:52.400 | **Gateway only**; authorization and gateway Postgres. No engine call. |
| GET | `/api/v1/pools/B/row-entitlements/T/history` | 17:27:52.412 | **Gateway only**; authorization and gateway Postgres. No engine call. |

These are logical destination mappings from the code, not a claim that a pending browser request had already reached that destination. A request can be waiting in Playwright's routing/transport before a backend runs.

### Code evidence for the mappings

All references below are at `a421507` and are unchanged on main for these paths:

- `e2e/smoke.spec.ts:38–46` intercepts browser API requests and forwards the row-entitlement reads to the in-process real gateway server; `:52` fulfills project pools directly from the fixture. That pools request cannot be waiting on gateway->engine.
- `e2e/smoke.spec.ts:28–29` constructs `PostgresRowDecisions` and `rowDecisionRoutes(repo)` with **no preview/engine dependency**.
- `src/modules/entitlements/api/row-routes.ts:11` calls `repo.objects`; `:13` calls `repo.history`; `:14` calls `repo.read`. The only engine-preview-capable route is the optional **POST** preview at `:12`, not any pending GET.
- `src/modules/entitlements/infrastructure/row-decisions.ts:13–36`, `:39–42` and `:44–54` implement those reads through `withTenant`/`withPlatform` and SQL. They have no engine/source-connector call.
- `src/platform/http/server.ts:274–311` performs session/permission checks; `:298–308` calls the authorization port. Thus gateway-only here may still involve SpiceDB; it does not mean an absence of all backend dependencies.
- `scripts/console-preview.mjs:3–4` serves the console using `createConsoleServer`; `deploy/images/console.mjs:26–40` reads and streams static assets.
- `e2e/smoke.spec.ts:69–72`: the retained failure was before `f.query`, the test's authenticated MCP request. That request was not reached.

**Gateway->engine phase records for these entries: not applicable.** None of their code paths makes a gateway->engine call. There is no matching call ID for which DNS/connect/TLS/written/failure phases should exist. This classification comes from the handlers, not from treating absent telemetry as proof of a successful connection. Engine traffic during fixture preparation is not attributed to these unrelated refresh GETs.

## 2. Exact back-to-back smoke runs

Both runs used `/Users/rzarita/opintel` on the same Intel Mac, the existing `npm run test:smoke` command and its unchanged browser/MCP harness. No worktree or substitute client was used. `package.json`, `package-lock.json`, `e2e/smoke.spec.ts`, `playwright.smoke.config.ts` and `scripts/smoke.mjs` are identical between the two commits. Before the pair, standard Postgres and Redis both reported **Up 47 hours (healthy)**; neither was restarted or reconfigured.

| Order | Commit | Result | Browser/MCP path | Whole Playwright run | Retained log |
|---|---|---|---|---|---|
| 1 | Main `4e82a736dafbd67b5856fd9f9741a2566a08e4db` | **Exit 0, one passed** | 14.0 s | 35.9 s | `/private/tmp/connect-smoke-diagnosis-main-4e82a73.log` |
| 2, immediately after main completed | Reliability `a4215073015cb4f28a24d56b68b2d74d90899e8a` | **Exit 0, one passed** | 18.1 s | 40.8 s | `/private/tmp/connect-smoke-diagnosis-branch-a421507.log` |

Only the standard harness's per-run isolated fixture setup and the branch switch occurred between runs. Each run executed the original sign-in, row change, authenticated MCP query, persisted receipt and historical-decision assertions. There were no retry flags or extra attempts. The branch did not fail, so there is no new branch-failure pending-request list or failure trace. The smoke configuration retains traces only on failure (`playwright.smoke.config.ts:4`).

Commands, in order:

```sh
git switch main
npm run test:smoke
git switch fix/connect-reliability
npm run test:smoke
```

## 3. Conclusion — separate from evidence

**Both passed. Stop, as instructed.** The original symptom did not reproduce in this pair of standalone runs. The retained unfinished refresh paths do not call the engine, so they do not establish a hanging gateway->engine call or meet the authorized condition for fixing a transport/source-connect regression.

This does **not** establish a root cause for the original deadline failure. In particular, one passing pair is not proof of a particular environment-load mechanism, nor proof that the transport has no other defect. No timeout is changed, and the failed full-gate record is not rewritten as a pass. These are diagnostic smoke passes, not a new completed full gate.

No product/test/config change, no new full gate, no fresh archive build or packaged verification, and no merge. ARCH-01 remains text only pending owner approval.

## Reproducible read-only trace extraction

The following extraction is recorded with the report because it produced the incomplete-entry evidence. It only reads the retained archive, lists every network file and emits method, path, time and response/failure sentinels; it excludes headers, cookies, connection strings and bodies. It is not an HTTP client or a replacement verification step.

```python
import json, zipfile
from urllib.parse import urlsplit
path = 'tmp/connect-reliability-gate-1c81fbe/smoke-sign-in-→-pool-→-row-9001e--persisted-receipt-decision-smoke/trace.zip'
with zipfile.ZipFile(path) as archive:
    for name in archive.namelist():
        if name.endswith('.network'):
            for line in archive.read(name).decode().splitlines():
                snapshot = json.loads(line).get('snapshot', {})
                request = snapshot.get('request', {})
                response = snapshot.get('response', {})
                if response.get('status', -1) < 0 or snapshot.get('time', -1) < 0:
                    print(json.dumps({
                        'file': name,
                        'startedDateTime': snapshot.get('startedDateTime'),
                        'method': request.get('method'),
                        'path': urlsplit(request.get('url', '')).path,
                        'time': snapshot.get('time'),
                        'status': response.get('status'),
                        'failure': snapshot.get('_failureText') or response.get('_failureText')
                    }))
```

## Subsequent owner decision

After this report, the owner accepted the gate on `a421507` with the passing smoke comparison: the failure did not reproduce on either revision, and the unfinished requests did not call the engine. The original gate failure and this report's evidence remain unchanged. Fresh amd64 packaging and one standard first-receipt installation are authorized; no product, test or timeout change and no new gate run. The HTTP/2 ingress connection-limit explanation is recorded in the backlog as **hypothesis only**, not as this report's established conclusion.
