# Timeouts and deadlines

ARCH-01: static runtime inventory plus install-time defaults.

## XQ operation and connection bounds

Each XQ HTTP subcall keeps its existing shared **15,000 ms** deadline across
at most two connect-only attempts. Connection setup (DNS, TCP and TLS) now gets
**min(5,000 ms, remaining subcall deadline)** per attempt. Expired operations
start no further attempt. Writing ends the setup timer; the response still uses
the same remaining operation deadline. Written requests are never replayed.
The disposable SDK worker's existing **20,000 ms** outer limit is unchanged;
it can end a multi-subcall operation earlier than those subcalls' combined
budgets. Sources: `src/modules/release-custody/infrastructure/xq-transport.mjs`
and `xq-provider.ts`. No gateway/engine or validation deadline changed.

## Pinned engine HTTP/2 transport

Set these in `package.env` on gateway and engine before installation. Both
processes validate integer values at startup and name an invalid setting without
printing its value. Defaults apply when a setting is absent. The engine's private
TLS listeners advertise the stream limit and use the same idle timeout. Client
PINGs keep an active session alive; two unanswered ping intervals discard it.

Generated with `node scripts/transport/timeout-inventory.mjs`. Runtime expressions
are printed literally, not guessed as constants. Units are milliseconds unless
the setting/expression says seconds. The scan includes gateway, engine, shipped
operator tools, release/acceptance harnesses, smoke and normal/release test
guards. Test fixture timers and case/hook hang guards are included and labelled
as tests; their limits are unchanged unless expressly approved for ARCH-01.
Historical archives and frontend animation timers are excluded. Schedules and
backoffs are included because they consume deadline budgets.

<!-- generated runtime timeout inventory -->
| Setting | Default | Accepted range | Purpose / implementation |
|---|---|---|---|
| `ENGINE_TRANSPORT_MAX_SESSIONS` | 1 | 1–16 | Per pinned engine/client identity. Another session is opened only when existing sessions have exhausted available streams. `src/shared/infrastructure/engine-h2-pool.ts` |
| `ENGINE_TRANSPORT_MAX_CONCURRENT_STREAMS` | 32 | 1–1024 | Per-session stream cap, bounded by peer SETTINGS. Waiting consumes the caller deadline. `engine-h2-pool.ts`, `internal-h2-server.ts` |
| `ENGINE_TRANSPORT_IDLE_TIMEOUT_MS` | 60000 | 1000–3600000 | Close idle sessions. Private server idle timeout matches. `engine-h2-pool.ts`, `internal-h2-server.ts` |
| `ENGINE_TRANSPORT_MAX_SESSION_AGE_MS` | 600000 | 1000–86400000 | Stop admitting streams and rotate; written streams drain under their original deadlines. Draining sessions count toward the maximum; the replacement validates the certificate pin again. `engine-h2-pool.ts` |
| `ENGINE_TRANSPORT_CONNECT_TIMEOUT_MS` | 5000 | 100–120000 | DNS, TCP, TLS and HTTP/2 setup allowance, also bounded by the caller's remaining deadline. `engine-h2-pool.ts` |
| `ENGINE_TRANSPORT_PING_INTERVAL_MS` | 15000 | 1000–300000 | H2 PING interval; two missed responses discard the session. `engine-h2-pool.ts` |
| main: periodic schedule | 60000 | Caller/configuration dependent | deploy/engine/egress.mjs:35 |
| Ingress timeout | proxy_read_timeout 90s; | Caller/configuration dependent | deploy/gateway/ingress/nginx.conf:31 |
| company: idleTimeoutMins | 60 | Caller/configuration dependent | e2e/console-fixture.ts:6 |
| mockConsole: timeoutSeconds | 30 | Caller/configuration dependent | e2e/console-fixture.ts:38 |
| module configuration: deadlines | [] | Caller/configuration dependent | e2e/recorded-performance-reporter.ts:9 |
| onTestEnd: timeoutMs | test.timeout | Caller/configuration dependent | e2e/recorded-performance-reporter.ts:13 |
| onEnd: deadlines | this.deadlines | Caller/configuration dependent | e2e/recorded-performance-reporter.ts:26 |
| module configuration: timeout | 30_000 | Caller/configuration dependent | playwright.config.ts:5 |
| module configuration: timeout | 10_000 | Caller/configuration dependent | playwright.config.ts:6 |
| module configuration: timeout | 120_000 | Caller/configuration dependent | playwright.config.ts:34 |
| module configuration: timeout | 60_000 | Caller/configuration dependent | playwright.smoke.config.ts:3 |
| module configuration: until | Date.now()+120000 | Caller/configuration dependent | scripts/column-grid-diagnostic.mjs:18 |
| module configuration: timer / backoff | 250 | Caller/configuration dependent | scripts/column-grid-diagnostic.mjs:19 |
| module configuration: operation cancellation | 1000 | Caller/configuration dependent | scripts/companion/live-check.mjs:16 |
| module configuration: timer / backoff | 1000 | Caller/configuration dependent | scripts/companion/live-check.mjs:16 |
| child: timeout | 15000 | Caller/configuration dependent | scripts/conformance/v02-agent.mjs:53 |
| module configuration: until | Date.now()+120000 | Caller/configuration dependent | scripts/console-followups-3-capture.mjs:18 |
| module configuration: timer / backoff | 250 | Caller/configuration dependent | scripts/console-followups-3-capture.mjs:19 |
| module configuration: until | Date.now()+120000 | Caller/configuration dependent | scripts/console-provenance-design-capture.mjs:18 |
| module configuration: timer / backoff | 250 | Caller/configuration dependent | scripts/console-provenance-design-capture.mjs:19 |
| response: operation cancellation | 3000 | Caller/configuration dependent | scripts/dev-demo-readiness.ts:10 |
| settleDevelopmentSource: deadline | Date.now()+90000 | Caller/configuration dependent | scripts/dev-demo-readiness.ts:34 |
| settleDevelopmentSource: timer / backoff | 100 | Caller/configuration dependent | scripts/dev-demo-readiness.ts:41 |
| waitUntilReady: deadline | Date.now() + 60_000 | Caller/configuration dependent | scripts/dev-up.ts:24 |
| waitUntilReady: timer / backoff | 1_000 | Caller/configuration dependent | scripts/dev-up.ts:28 |
| admin: connectionTimeoutMillis | 5_000 | Caller/configuration dependent | scripts/dev-up.ts:39 |
| client: connectionTimeoutMillis | 5_000 | Caller/configuration dependent | scripts/dev-up.ts:50 |
| prepareDevelopmentServices: deadline | Date.now() + 10_000 | Caller/configuration dependent | scripts/dev-up.ts:81 |
| developmentEngineOptions: timeoutMs | 9000 | Caller/configuration dependent | scripts/development-engine.ts:6 |
| prepareDevelopmentScanner: {file=resolve(root,'tmp/duckdb-extensions/postgres_scanner.duckdb_extension'),prepare=async()=>{ await promisify(execFile)(process.execPath,['--import','tsx',resolve(root,'scripts/prepare-duckdb-scanner.ts')],{cwd:root,timeout:120000}); }} | {} | Caller/configuration dependent | scripts/development-scanner.ts:8 |
| prepareDevelopmentScanner: timeout | 120000 | Caller/configuration dependent | scripts/development-scanner.ts:9 |
| waiting: periodic schedule | 100 | Caller/configuration dependent | scripts/ephemerality/infrastructure/bridge.mjs:17 |
| tcp: socket.setTimeout | 1500 | Caller/configuration dependent | scripts/ephemerality/infrastructure/deployment-probe.mjs:12 |
| module configuration: timer / backoff | 100 | Caller/configuration dependent | scripts/ephemerality/infrastructure/deployment-probe.mjs:59 |
| waiting: periodic schedule | 100 | Caller/configuration dependent | scripts/ephemerality/infrastructure/peer.mjs:6 |
| start: deadline | Date.now()+60000 | Caller/configuration dependent | scripts/ephemerality/infrastructure/target.ts:123 |
| start: statementTimeoutMs | 1000000 | Caller/configuration dependent | scripts/ephemerality/infrastructure/target.ts:123 |
| start: operationTimeoutMs | 1000000 | Caller/configuration dependent | scripts/ephemerality/infrastructure/target.ts:123 |
| start: queryTimeoutSeconds | 1000 | Caller/configuration dependent | scripts/ephemerality/infrastructure/target.ts:123 |
| scope: statementTimeoutMs | 1000000 | Caller/configuration dependent | scripts/ephemerality/infrastructure/target.ts:129 |
| scope: operationTimeoutMs | 1000000 | Caller/configuration dependent | scripts/ephemerality/infrastructure/target.ts:129 |
| timer: timer / backoff | ms | Caller/configuration dependent | scripts/ephemerality/infrastructure/target.ts:182 |
| module configuration: timer / backoff | Math.max(0,claims.exp*1000-Date.now()+20) | Caller/configuration dependent | scripts/ephemerality/infrastructure/target.ts:208 |
| docker: timeout | 15000 | Caller/configuration dependent | scripts/gate-containers.mjs:8 |
| migrate: timeout | 120000 | Caller/configuration dependent | scripts/gate-database.mjs:15 |
| client: connectionTimeoutMillis | 3000 | Caller/configuration dependent | scripts/gate-database.mjs:33 |
| client: query_timeout | 10000 | Caller/configuration dependent | scripts/gate-database.mjs:33 |
| client: statement_timeout | 9000 | Caller/configuration dependent | scripts/gate-database.mjs:33 |
| start: periodic schedule | intervalMs | Caller/configuration dependent | scripts/gate-memory.mjs:20 |
| main: until | Date.now()+3000 | Caller/configuration dependent | scripts/gate-probe.ts:14 |
| client: connectionTimeoutMillis | 500 | Caller/configuration dependent | scripts/gate-probe.ts:20 |
| client: query_timeout | 500 | Caller/configuration dependent | scripts/gate-probe.ts:20 |
| client: connectTimeout | 500 | Caller/configuration dependent | scripts/gate-probe.ts:29 |
| main: timer / backoff | 100 | Caller/configuration dependent | scripts/gate-probe.ts:40 |
| stop: timer / backoff | 5000 | Caller/configuration dependent | scripts/gate.mjs:36 |
| module configuration: acceptanceDeadlineMs | 30000 | Caller/configuration dependent | scripts/images/acceptance-json.mjs:15 |
| createAcceptanceLab: timeout | 30000 | Caller/configuration dependent | scripts/images/acceptance-lab.mjs:9 |
| command: timeout | 60000 | Caller/configuration dependent | scripts/images/acceptance-lab.mjs:19 |
| captureProcessLog: {env,timeout=600000} | {} | Caller/configuration dependent | scripts/images/acceptance-log.mjs:6 |
| docker: timeout | 5000 | Caller/configuration dependent | scripts/images/acceptance-preflight.mjs:8 |
| host: timeout | 5000 | Caller/configuration dependent | scripts/images/acceptance-preflight.mjs:11 |
| response: timeout | 10000 | Caller/configuration dependent | scripts/images/acceptance-preflight.mjs:28 |
| r: timeout | 30000 | Caller/configuration dependent | scripts/images/agent-ingress-handshake.mjs:21 |
| r: timeout | 30000 | Caller/configuration dependent | scripts/images/agent-ingress-handshake.mjs:24 |
| module configuration: deadline | Date.now()+30000 | Caller/configuration dependent | scripts/images/agent-ingress-handshake.mjs:38 |
| r: timeout | 5000 | Caller/configuration dependent | scripts/images/agent-ingress-handshake.mjs:39 |
| module configuration: timer / backoff | 250 | Caller/configuration dependent | scripts/images/agent-ingress-handshake.mjs:39 |
| module configuration: req.setTimeout | 10000 | Caller/configuration dependent | scripts/images/agent-ingress-handshake.mjs:55 |
| module configuration: timer / backoff | 100 | Caller/configuration dependent | scripts/images/agent-ingress-handshake.mjs:58 |
| result: timeout | 30000 | Caller/configuration dependent | scripts/images/capture-engine-verification.mjs:10 |
| result: timeout | 600000 | Caller/configuration dependent | scripts/images/companion-custody-acceptance.mjs:8 |
| result: timeout | 600000 | Caller/configuration dependent | scripts/images/companion-custody-acceptance.mjs:16 |
| output: timeout | 180000 | Caller/configuration dependent | scripts/images/companion-custody-acceptance.mjs:28 |
| logs: timeout | 30000 | Caller/configuration dependent | scripts/images/companion-custody-acceptance.mjs:33 |
| companionCustodyAcceptance: timeout | 30000 | Caller/configuration dependent | scripts/images/companion-custody-acceptance.mjs:33 |
| module configuration: page.setDefaultTimeout | 120000 | Caller/configuration dependent | scripts/images/console-auth-source-browser.mjs:20 |
| mailLink: timer / backoff | 500 | Caller/configuration dependent | scripts/images/console-auth-source-browser.mjs:22 |
| fixture: timer / backoff | 500 | Caller/configuration dependent | scripts/images/console-auth-source-browser.mjs:24 |
| module configuration: page.setDefaultTimeout | 120000 | Caller/configuration dependent | scripts/images/console-auth-source-browser.mjs:26 |
| module configuration: timer / backoff | 500 | Caller/configuration dependent | scripts/images/console-auth-source-browser.mjs:45 |
| r: timeout | 600000 | Caller/configuration dependent | scripts/images/console-auth-source-install.mjs:18 |
| fixture: timer / backoff | 500 | Caller/configuration dependent | scripts/images/console-auth-source-install.mjs:41 |
| fixture: timer / backoff | 500 | Caller/configuration dependent | scripts/images/console-auth-source-install.mjs:41 |
| timer: periodic schedule | 250 | Caller/configuration dependent | scripts/images/console-auth-source-install.mjs:52 |
| module configuration: page.setDefaultTimeout | 120000 | Caller/configuration dependent | scripts/images/console-final-workflows-browser.mjs:20 |
| mailLink: timer / backoff | 500 | Caller/configuration dependent | scripts/images/console-final-workflows-browser.mjs:22 |
| module configuration: page.setDefaultTimeout | 120000 | Caller/configuration dependent | scripts/images/console-final-workflows-browser.mjs:26 |
| r: timeout | 600000 | Caller/configuration dependent | scripts/images/console-final-workflows-install.mjs:18 |
| fixture: timer / backoff | 500 | Caller/configuration dependent | scripts/images/console-final-workflows-install.mjs:37 |
| timer: periodic schedule | 250 | Caller/configuration dependent | scripts/images/console-final-workflows-install.mjs:42 |
| module configuration: page.setDefaultTimeout | 120000 | Caller/configuration dependent | scripts/images/console-first-run-browser.mjs:19 |
| module configuration: timer / backoff | 500 | Caller/configuration dependent | scripts/images/console-first-run-browser.mjs:22 |
| r: timeout | 600000 | Caller/configuration dependent | scripts/images/console-first-run-install.mjs:17 |
| r: timeout | 600000 | Caller/configuration dependent | scripts/images/customer-package.mjs:14 |
| tar: timeout | 600000 | Caller/configuration dependent | scripts/images/customer-package.mjs:44 |
| packed: timeout | 60000 | Caller/configuration dependent | scripts/images/customer-package.mjs:45 |
| r: timeout | 120000 | Caller/configuration dependent | scripts/images/first-hour-source.mjs:23 |
| output: timeout | 10000 | Caller/configuration dependent | scripts/images/first-hour-source.mjs:26 |
| firstHourSource: until | Date.now()+120000 | Caller/configuration dependent | scripts/images/first-hour-source.mjs:30 |
| r: timeout | 5000 | Caller/configuration dependent | scripts/images/first-hour-source.mjs:31 |
| firstHourSource: timer / backoff | 500 | Caller/configuration dependent | scripts/images/first-hour-source.mjs:31 |
| firstHour: until | Date.now()+120000 | Caller/configuration dependent | scripts/images/first-hour.mjs:52 |
| firstHour: timer / backoff | 500 | Caller/configuration dependent | scripts/images/first-hour.mjs:52 |
| module configuration: timer / backoff | 500 | Caller/configuration dependent | scripts/images/package-browser.mjs:34 |
| result: timeout | 600000 | Caller/configuration dependent | scripts/images/publish.mjs:11 |
| existing: timeout | 60000 | Caller/configuration dependent | scripts/images/publish.mjs:21 |
| result: timeout | 60000 | Caller/configuration dependent | scripts/images/runtime-smoke.mjs:34 |
| module configuration: timeoutSeconds | 30 | Caller/configuration dependent | scripts/images/seed-smoke.ts:22 |
| module configuration: statementTimeoutMs | 8000 | Caller/configuration dependent | scripts/images/smoke.mjs:43 |
| module configuration: operationTimeoutMs | 9000 | Caller/configuration dependent | scripts/images/smoke.mjs:43 |
| wait: until | Date.now()+90000 | Caller/configuration dependent | scripts/images/smoke.mjs:52 |
| wait: timer / backoff | 500 | Caller/configuration dependent | scripts/images/smoke.mjs:52 |
| bounded: timer / backoff | 60000 | Caller/configuration dependent | scripts/images/smoke.mjs:53 |
| q: timeout | 5000 | Caller/configuration dependent | scripts/images/smoke.mjs:54 |
| result: timeout | 120000 | Caller/configuration dependent | scripts/images/stage3-smoke.mjs:24 |
| module configuration: statementTimeoutMs | 8000 | Caller/configuration dependent | scripts/images/stage3-smoke.mjs:67 |
| module configuration: operationTimeoutMs | 9000 | Caller/configuration dependent | scripts/images/stage3-smoke.mjs:67 |
| module configuration: timeout | '2s' | Caller/configuration dependent | scripts/images/stage3-smoke.mjs:78 |
| wait: until | Date.now()+90000 | Caller/configuration dependent | scripts/images/stage3-smoke.mjs:84 |
| wait: timer / backoff | 500 | Caller/configuration dependent | scripts/images/stage3-smoke.mjs:84 |
| call: timeout | 5000 | Caller/configuration dependent | scripts/images/stage3-smoke.mjs:88 |
| module configuration: timeoutSeconds | 30 | Caller/configuration dependent | scripts/images/stage3-smoke.mjs:120 |
| denied: timeout | 10000 | Caller/configuration dependent | scripts/images/stage3-smoke.mjs:141 |
| owner: timeout | 10000 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:20 |
| sourceLimits: statementTimeoutMs | 30000 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:27 |
| sourceLimits: operationTimeoutMs | 35000 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:27 |
| result: timeout | 600000 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:32 |
| module configuration: timeout | '2s' | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:98 |
| wait: timeout | 90000 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:103 |
| wait: until | Date.now()+timeout | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:103 |
| wait: timer / backoff | 500 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:103 |
| call: timeout | 5000 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:107 |
| call: timeout | 5000 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:112 |
| module configuration: timeoutSeconds | 30 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:151 |
| denied: timeout | 10000 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:174 |
| module configuration: timer / backoff | 15000 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:190 |
| module configuration: timer / backoff | 5000 | Caller/configuration dependent | scripts/images/stage4-smoke.mjs:198 |
| bounded: timer / backoff | ms | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:65 |
| output: timeout | 600000 | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:68 |
| wait: timeout | 120000 | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:74 |
| wait: deadline | Date.now()+timeout | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:74 |
| wait: timer / backoff | 500 | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:74 |
| req: timeout | acceptanceDeadlineMs | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:83 |
| req: operation cancellation | acceptanceDeadlineMs | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:83 |
| module configuration: operation cancellation | 5000 | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:141 |
| list: operation cancellation | 5000 | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:144 |
| message: operation cancellation | 5000 | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:144 |
| module configuration: timeoutSeconds | 30 | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:153 |
| module configuration: timer / backoff | 5000 | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:188 |
| listed: timeout | 10000 | Caller/configuration dependent | scripts/images/stage5-smoke.mjs:211 |
| result: timeout | 180000 | Caller/configuration dependent | scripts/images/steps-custody-acceptance.mjs:22 |
| sign: timeout | 180000 | Caller/configuration dependent | scripts/images/steps-custody-acceptance.mjs:29 |
| custodyStepsAcceptance: timer / backoff | 500 | Caller/configuration dependent | scripts/images/steps-custody-acceptance.mjs:31 |
| result: timeout | operation==='benchmark-verify'?600000:180000 | Caller/configuration dependent | scripts/images/steps-custody-acceptance.mjs:36 |
| result: timeout | 15000 | Caller/configuration dependent | scripts/infrastructure/xq-device-certificate-envelope.mjs:34 |
| child: timeout | 15000 | Caller/configuration dependent | scripts/infrastructure/xq-token-unwrap.mjs:19 |
| r: operation cancellation | 30000 | Caller/configuration dependent | scripts/operator/common.ts:31 |
| customerSoak: timeoutSeconds | 30 | Caller/configuration dependent | scripts/operator/customer-demo.ts:33 |
| pairingService: timeout | '3s' | Caller/configuration dependent | scripts/operator/customer-install.ts:32 |
| initialize: timeout | '5s' | Caller/configuration dependent | scripts/operator/customer-install.ts:146 |
| initialize: statementTimeoutMs | 30000 | Caller/configuration dependent | scripts/operator/customer-install.ts:154 |
| initialize: operationTimeoutMs | 35000 | Caller/configuration dependent | scripts/operator/customer-install.ts:154 |
| initialize: connectTimeoutMs | DEFAULT_SOURCE_CONNECT_TIMEOUT_MS | Caller/configuration dependent | scripts/operator/customer-install.ts:154 |
| initialize: timeout | '3s' | Caller/configuration dependent | scripts/operator/customer-install.ts:159 |
| servePairing: server.requestTimeout | 5000 | Caller/configuration dependent | scripts/operator/engine-pairing.ts:79 |
| servePairing: server.headersTimeout | 5000 | Caller/configuration dependent | scripts/operator/engine-pairing.ts:79 |
| servePairing: server.setTimeout | 5000 | Caller/configuration dependent | scripts/operator/engine-pairing.ts:79 |
| req: operation cancellation | 10000 | Caller/configuration dependent | scripts/operator/engine-pairing.ts:96 |
| provisionReinsurance: deadline | Date.now()+120000 | Caller/configuration dependent | scripts/operator/reinsurance.ts:59 |
| provisionReinsurance: timer / backoff | 1000 | Caller/configuration dependent | scripts/operator/reinsurance.ts:60 |
| module configuration: until | Date.now()+120000 | Caller/configuration dependent | scripts/provenance-capture.mjs:18 |
| module configuration: timer / backoff | 250 | Caller/configuration dependent | scripts/provenance-capture.mjs:19 |
| module configuration: timer / backoff | 2000 | Caller/configuration dependent | scripts/review/provenance-session-cleanup.mjs:37 |
| client: connectionTimeoutMillis | 5_000 | Caller/configuration dependent | scripts/service-readiness.ts:17 |
| client: query_timeout | 5_000 | Caller/configuration dependent | scripts/service-readiness.ts:17 |
| response: deadline | Date.now() + 5_000 | Caller/configuration dependent | scripts/service-readiness.ts:51 |
| client: connectTimeout | 5_000 | Caller/configuration dependent | scripts/service-readiness.ts:75 |
| service: statementTimeoutMs | 8000 | Caller/configuration dependent | scripts/sidecar-dev.ts:38 |
| service: operationTimeoutMs | 9000 | Caller/configuration dependent | scripts/sidecar-dev.ts:38 |
| req: operation cancellation | 1500 | Caller/configuration dependent | scripts/sidecar-dev.ts:53 |
| stop: timeoutMs | config.shutdownTimeoutMs+4000 | Caller/configuration dependent | scripts/sidecar-dev.ts:72 |
| startDevelopmentSidecar: timer / backoff | 250 | Caller/configuration dependent | scripts/sidecar-dev.ts:93 |
| stopRecordedSidecar: deadline | Date.now()+options.timeoutMs | Caller/configuration dependent | scripts/sidecar-process.ts:36 |
| stopRecordedSidecar: timer / backoff | 50 | Caller/configuration dependent | scripts/sidecar-process.ts:42 |
| module configuration: until | Date.now()+120000 | Caller/configuration dependent | scripts/smoke.mjs:17 |
| module configuration: timer / backoff | 250 | Caller/configuration dependent | scripts/smoke.mjs:18 |
| interval: periodic schedule | 30000 | Caller/configuration dependent | scripts/soak/custody.ts:21 |
| monitor: periodic schedule | 500 | Caller/configuration dependent | scripts/soak/engine-fault-injection.mjs:25 |
| waitFor: timeout | 100000 | Caller/configuration dependent | scripts/soak/engine-fault-injection.mjs:28 |
| waitFor: deadline | Date.now()+timeout | Caller/configuration dependent | scripts/soak/engine-fault-injection.mjs:28 |
| waitFor: timer / backoff | 250 | Caller/configuration dependent | scripts/soak/engine-fault-injection.mjs:28 |
| module configuration: timer / backoff | 20000 | Caller/configuration dependent | scripts/soak/engine-fault-injection.mjs:32 |
| module configuration: timer / backoff | 2000 | Caller/configuration dependent | scripts/soak/engine-fault-injection.mjs:36 |
| module configuration: timer / backoff | 15000 | Caller/configuration dependent | scripts/soak/engine-fault-injection.mjs:43 |
| module configuration: timer / backoff | 10 | Caller/configuration dependent | scripts/soak/engine-fault-injection.mjs:45 |
| get: operation cancellation | 15000 | Caller/configuration dependent | scripts/soak/observer.ts:31 |
| ready: periodic schedule | 30000 | Caller/configuration dependent | scripts/soak/observer.ts:44 |
| response: operation cancellation | 15000 | Caller/configuration dependent | scripts/soak/reinsurance.ts:115 |
| timer: timer / backoff | duration*1000 | Caller/configuration dependent | scripts/soak/reinsurance.ts:129 |
| module configuration: timer / backoff | rate+Math.floor(rng()*Math.max(1,rate/4)) | Caller/configuration dependent | scripts/soak/reinsurance.ts:212 |
| apiRequest: operation cancellation | 30000 | Caller/configuration dependent | scripts/steps/infrastructure/http.ts:5 |
| main: timer / backoff | 100 | Caller/configuration dependent | scripts/test-performance.ts:32 |
| main: until | Date.now()+2000 | Caller/configuration dependent | scripts/test-performance.ts:54 |
| main: timer / backoff | 25 | Caller/configuration dependent | scripts/test-performance.ts:59 |
| control: connectionTimeoutMillis | 1000 | Caller/configuration dependent | scripts/testing/database-deadline.ts:76 |
| control: statement_timeout | 500 | Caller/configuration dependent | scripts/testing/database-deadline.ts:76 |
| control: query_timeout | 1000 | Caller/configuration dependent | scripts/testing/database-deadline.ts:76 |
| polling: timer / backoff | 100 | Caller/configuration dependent | scripts/testing/database-deadline.ts:95 |
| record: afterTimeout | await redact(current) | Caller/configuration dependent | scripts/testing/database-deadline.ts:108 |
| module configuration: deadline | () => Number.POSITIVE_INFINITY | Caller/configuration dependent | scripts/testing/database-deadline.ts:133 |
| control: connectionTimeoutMillis | 5_000 | Caller/configuration dependent | scripts/testing/database-deadline.ts:157 |
| control: statement_timeout | 1_000 | Caller/configuration dependent | scripts/testing/database-deadline.ts:158 |
| control: query_timeout | 1_500 | Caller/configuration dependent | scripts/testing/database-deadline.ts:158 |
| pending: timer / backoff | 1_000 | Caller/configuration dependent | scripts/testing/database-deadline.ts:167 |
| pending: timer / backoff | 1_000 | Caller/configuration dependent | scripts/testing/database-deadline.ts:175 |
| pending: timer / backoff | 500 | Caller/configuration dependent | scripts/testing/database-deadline.ts:179 |
| pending: until | now() + 2_000 | Caller/configuration dependent | scripts/testing/database-deadline.ts:189 |
| pending: timer / backoff | 25 | Caller/configuration dependent | scripts/testing/database-deadline.ts:193 |
| pending: timer / backoff | 500 | Caller/configuration dependent | scripts/testing/database-deadline.ts:197 |
| results: timer / backoff | 5_000 | Caller/configuration dependent | scripts/testing/database-deadline.ts:199 |
| operation: timeout | typeof configured === 'number' && configured > 0 ? Math.min(remaining, configured) : remaining | Caller/configuration dependent | scripts/testing/database-deadline.ts:231 |
| owner: owner.deadline | () => { // Vitest 4.1 exposes the active timeout window to its runner. Reading // it covers hook overrides as well as test.timeout; never reset it. const timing = this as unknown as { _currentTaskStartTime?: number; _currentTaskTimeout?: number }; if (timing._currentTaskStartTime === undefined \|\| timing._currentTaskTimeout === undefined) throw new Error('Active Vitest deadline is unavailable. Refusing unbounded database work.'); return timing._currentTaskTimeout <= 0 ? Number.POSITIVE_INFINITY : timing._currentTaskStartTime + timing._currentTaskTimeout; } | Caller/configuration dependent | scripts/testing/database-runner.ts:12 |
| wrapped: owner.deadline | this.owner(suite).deadline | Caller/configuration dependent | scripts/testing/database-runner.ts:38 |
| freshNormalSpiceDb: until | Date.now()+20_000 | Caller/configuration dependent | scripts/testing/normal-environment.ts:25 |
| freshNormalSpiceDb: timer / backoff | 100 | Caller/configuration dependent | scripts/testing/normal-environment.ts:26 |
| client: connectionTimeoutMillis | 5000 | Caller/configuration dependent | scripts/testing/normal-environment.ts:42 |
| freshNormalRedis: until | Date.now()+10000 | Caller/configuration dependent | scripts/testing/normal-redis.ts:18 |
| freshNormalRedis: timer / backoff | 100 | Caller/configuration dependent | scripts/testing/normal-redis.ts:19 |
| warm: deadline | performance.now() + 60_000 | Caller/configuration dependent | scripts/testing/performance-warmup.ts:27 |
| warm: owner.deadline | () => deadline | Caller/configuration dependent | scripts/testing/performance-warmup.ts:28 |
| signal: operation cancellation | 60_000 | Caller/configuration dependent | scripts/testing/performance-warmup.ts:29 |
| timer: timer / backoff | 20000 | Caller/configuration dependent | scripts/xq-bootstrap.ts:19 |
| module configuration: DEFAULT_SOURCE_CONNECT_TIMEOUT_MS | 10000 | Caller/configuration dependent | sidecar/application/source-connector.ts:26 |
| sidecarConfigSchema: statementTimeoutMs | milliseconds | Caller/configuration dependent | sidecar/config.ts:21 |
| sidecarConfigSchema: operationTimeoutMs | milliseconds | Caller/configuration dependent | sidecar/config.ts:21 |
| sidecarConfigSchema: connectTimeoutMs | milliseconds.default(DEFAULT_SOURCE_CONNECT_TIMEOUT_MS) | Caller/configuration dependent | sidecar/config.ts:21 |
| sidecarConfigSchema: shutdownTimeoutMs | milliseconds.default(10000) | Caller/configuration dependent | sidecar/config.ts:25 |
| signal: operation cancellation | 5000 | Caller/configuration dependent | sidecar/egress/infrastructure/control-client.ts:16 |
| timer: timer / backoff | 3000 | Caller/configuration dependent | sidecar/egress/infrastructure/controller.ts:42 |
| fetchPolicy: operation cancellation | 5000 | Caller/configuration dependent | sidecar/egress/infrastructure/controller.ts:100 |
| timer: periodic schedule | 5000 | Caller/configuration dependent | sidecar/egress/infrastructure/controller.ts:136 |
| firewall: timeout | 5000 | Caller/configuration dependent | sidecar/egress/infrastructure/firewall.ts:14 |
| firewall: timeout | 5000 | Caller/configuration dependent | sidecar/egress/infrastructure/firewall.ts:18 |
| firewall: timeout | 5000 | Caller/configuration dependent | sidecar/egress/infrastructure/firewall.ts:18 |
| addresses: timer / backoff | 3000 | Caller/configuration dependent | sidecar/egress/infrastructure/readiness-policy.ts:20 |
| module configuration: deadlineClock | {after(ms,expire){const timer=setTimeout(expire,ms);return ()=>clearTimeout(timer);}} | Caller/configuration dependent | sidecar/execution/application/ports.ts:11 |
| timer: timer / backoff | ms | Caller/configuration dependent | sidecar/execution/application/ports.ts:11 |
| signal: operation cancellation | r.limits.timeoutMs | Caller/configuration dependent | sidecar/execution/application/preview.ts:17 |
| acquire: timer / backoff | maxWaitMs | Caller/configuration dependent | sidecar/execution/application/queue.ts:27 |
| handle: req.setTimeout | Math.min(2147483647,parsed.data.limits.timeoutMs+Math.floor(parsed.data.limits.timeoutMs/3)+10000) | Caller/configuration dependent | sidecar/http/server.ts:89 |
| server: req.setTimeout | options.config.limits.operationTimeoutMs+10000 | Caller/configuration dependent | sidecar/http/server.ts:117 |
| createSidecarServer: server.requestTimeout | 10000 | Caller/configuration dependent | sidecar/http/server.ts:142 |
| createSidecarServer: server.headersTimeout | 10000 | Caller/configuration dependent | sidecar/http/server.ts:143 |
| close: deadline | new Promise<void>((resolve)=>{timer=setTimeout(resolve,options.config.shutdownTimeoutMs);}) | Caller/configuration dependent | sidecar/http/server.ts:169 |
| deadline: timer / backoff | options.config.shutdownTimeoutMs | Caller/configuration dependent | sidecar/http/server.ts:169 |
| unavailableEngine: server.headersTimeout | 10000 | Caller/configuration dependent | sidecar/http/unavailable.ts:23 |
| unavailableEngine: server.requestTimeout | 10000 | Caller/configuration dependent | sidecar/http/unavailable.ts:23 |
| module configuration: realDeadlineClock | { after(milliseconds, expire) { const timer = setTimeout(expire, milliseconds); return () => clearTimeout(timer); }, } | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:30 |
| timer: timer / backoff | milliseconds | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:32 |
| module configuration: deadlineClock | realDeadlineClock | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:43 |
| module configuration: this.connectTimeoutMs | limits.connectTimeoutMs??DEFAULT_SOURCE_CONNECT_TIMEOUT_MS | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:44 |
| external: deadline | performance.now()+this.limits.operationTimeoutMs | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:66 |
| external: allowance | this.connectAllowance(deadline) | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:76 |
| control: connectionTimeoutMillis | 1000 | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:80 |
| control: statement_timeout | 1000 | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:80 |
| control: query_timeout | 1000 | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:80 |
| connect: connectAllowanceMs | seconds*1000 | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:82 |
| run: connectAllowanceMs | 0 | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:97 |
| run: deadlineAt | performance.now()+this.limits.operationTimeoutMs | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:98 |
| run: deadline | new Promise<never>((_resolve, reject) => { clearDeadline = this.deadlineClock.after(this.limits.operationTimeoutMs, () => { expired = true; reject(new SourceTimeout()); }); }) | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:113 |
| deadline: clearDeadline | this.deadlineClock.after(this.limits.operationTimeoutMs, () => { expired = true; reject(new SourceTimeout()); }) | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:114 |
| execute: connectionTimeoutMillis | this.limits.operationTimeoutMs | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:124 |
| execute: statement_timeout | this.limits.statementTimeoutMs | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:125 |
| execute: query_timeout | this.limits.operationTimeoutMs | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:125 |
| execute: timer / backoff | connectAllowanceMs | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:135 |
| control: connectionTimeoutMillis | 1000 | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:172 |
| control: statement_timeout | 1000 | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:172 |
| control: query_timeout | 1000 | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:172 |
| run: timer / backoff | 1000 | Caller/configuration dependent | sidecar/infrastructure/postgres-source-scope.ts:182 |
| module configuration: statementTimeoutMs | 30_000 | Caller/configuration dependent | sidecar/ingest/infrastructure/postgres-landing.ts:35 |
| scope: connectionTimeoutMillis | 5000 | Caller/configuration dependent | sidecar/ingest/infrastructure/postgres-landing.ts:40 |
| scope: statement_timeout | this.statementTimeoutMs | Caller/configuration dependent | sidecar/ingest/infrastructure/postgres-landing.ts:40 |
| post: operation cancellation | 9000 | Caller/configuration dependent | sidecar/ingest/infrastructure/receipt-client.ts:24 |
| tick: timer / backoff | this.zone.pollMs | Caller/configuration dependent | sidecar/ingest/register.ts:116 |
| reconcile: timer / backoff | delay | Caller/configuration dependent | sidecar/ingest/register.ts:122 |
| start: timer / backoff | 0 | Caller/configuration dependent | sidecar/ingest/register.ts:126 |
| start: timer / backoff | 0 | Caller/configuration dependent | sidecar/ingest/register.ts:127 |
| validationBudget: timeoutMs | 2000 | Caller/configuration dependent | sidecar/session/infrastructure/validation.ts:8 |
| custodyTimer: periodic schedule | 60000 | Caller/configuration dependent | sidecar/start.ts:33 |
| pairingTrustTimer: periodic schedule | 1000 | Caller/configuration dependent | sidecar/start.ts:43 |
| stop: deadline | setTimeout(() => { console.error('Opintel Engine shutdown deadline exceeded. Unfinished register locks require operator recovery.'); process.exit(1); }, config.shutdownTimeoutMs) | Caller/configuration dependent | sidecar/start.ts:56 |
| deadline: timer / backoff | config.shutdownTimeoutMs | Caller/configuration dependent | sidecar/start.ts:56 |
| timer: periodic schedule | 5000 | Caller/configuration dependent | sidecar/start.ts:86 |
| stableTimer: periodic schedule | Math.min(1000,options.stableMs??stablePeriodMs) | Caller/configuration dependent | sidecar/supervision.ts:29 |
| stop: timer / backoff | options.shutdownMs | Caller/configuration dependent | sidecar/supervision.ts:30 |
| timer: timer / backoff | delayMs | Caller/configuration dependent | sidecar/supervision.ts:41 |
| sleep: timer / backoff | ms | Caller/configuration dependent | src/modules/authz/infrastructure/load-schema.ts:40 |
| writeSchemaWithRetry: until | now() + 120_000 | Caller/configuration dependent | src/modules/authz/infrastructure/load-schema.ts:41 |
| writeSchemaWithRetry: allowance | Math.min(5_000, until - now()) | Caller/configuration dependent | src/modules/authz/infrastructure/load-schema.ts:44 |
| main: deadline | Date.now()+allowance | Caller/configuration dependent | src/modules/authz/infrastructure/load-schema.ts:76 |
| actual: deadline | Date.now()+2000 | Caller/configuration dependent | src/modules/authz/infrastructure/spicedb-authorization-port.ts:94 |
| startHealthRefresh: periodic schedule | this.policy.refreshMs | Caller/configuration dependent | src/modules/engines/application/registry.ts:45 |
| timer: timer / backoff | 1000 | Caller/configuration dependent | src/modules/engines/application/registry.ts:124 |
| signal: operation cancellation | path==='/custody/attest'?Math.min(e.timeoutMs??10000,5000):e.timeoutMs??10000 | Caller/configuration dependent | src/modules/engines/infrastructure/probe.ts:21 |
| post: connectTimeout | error instanceof EngineTransportError&&error.phase==='connect'&&(error.connectExpired\|\|signal.aborted) | Caller/configuration dependent | src/modules/engines/infrastructure/probe.ts:38 |
| call: timeoutMs | remaining | Caller/configuration dependent | src/modules/engines/infrastructure/routing.ts:41 |
| call: timeoutMs | remaining | Caller/configuration dependent | src/modules/engines/infrastructure/routing.ts:46 |
| response: operation cancellation | this.options.timeoutMs??10000 | Caller/configuration dependent | src/modules/entitlements/infrastructure/custody-client.ts:17 |
| signal: operation cancellation | operation==='attest'?Math.min(this.options.timeoutMs??10000,5000):this.options.timeoutMs??10000 | Caller/configuration dependent | src/modules/entitlements/infrastructure/custody-client.ts:24 |
| input: timeoutMs | Math.min(b.timeoutMs??q('timeoutSeconds')*1000,q('timeoutSeconds')*1000) | Caller/configuration dependent | src/modules/entitlements/infrastructure/row-preview.ts:35 |
| ProvenanceSupplement: timeoutMs | z.number().optional() | Caller/configuration dependent | src/modules/evidence/application/provenance.ts:10 |
| module configuration: provisioningDeadlineMs | 10_000 | Caller/configuration dependent | src/modules/evidence/infrastructure/partition-health.ts:3 |
| run: timer / backoff | provisioningDeadlineMs | Caller/configuration dependent | src/modules/evidence/infrastructure/partition-health.ts:20 |
| client: timeout | 1_000 | Caller/configuration dependent | src/modules/identity/infrastructure/magic-link-repositories.ts:92 |
| module configuration: sessionIdleTimeoutMs | 8 * 60 * 60 * 1_000 | Caller/configuration dependent | src/modules/identity/infrastructure/redis-session-store.ts:19 |
| module configuration: sessionAbsoluteTimeoutMs | 30 * 24 * 60 * 60 * 1_000 | Caller/configuration dependent | src/modules/identity/infrastructure/redis-session-store.ts:20 |
| storedSessionSchema: idleTimeoutMs | z.number().int().positive().optional() | Caller/configuration dependent | src/modules/identity/infrastructure/redis-session-store.ts:26 |
| sessionRecord: idleTimeoutMs | stored.idleTimeoutMs | Caller/configuration dependent | src/modules/identity/infrastructure/redis-session-store.ts:54 |
| create: idleTimeoutMs | await this.idlePolicy(user) | Caller/configuration dependent | src/modules/identity/infrastructure/redis-session-store.ts:81 |
| messages: "Deadline" | "This query ran longer than the limit allows and was cancelled. Nothing partial was returned." | Caller/configuration dependent | src/modules/mcp/application/response.ts:30 |
| mapping: 'source_unavailable/deadline_exceeded' | ['Deadline',false] | Caller/configuration dependent | src/modules/mcp/application/response.ts:75 |
| mapping: 'budget_exceeded/deadline_exceeded' | ['Deadline', false] | Caller/configuration dependent | src/modules/mcp/application/response.ts:79 |
| call: timeout | AbortSignal.timeout(timeoutMs) | Caller/configuration dependent | src/modules/mcp/infrastructure/execution-client.ts:20 |
| timeout: operation cancellation | timeoutMs | Caller/configuration dependent | src/modules/mcp/infrastructure/execution-client.ts:20 |
| call: markDeadline | ()=>{abortOrigin??='transport_deadline';} | Caller/configuration dependent | src/modules/mcp/infrastructure/execution-client.ts:22 |
| start: periodic schedule | 1000 | Caller/configuration dependent | src/modules/mcp/infrastructure/http.ts:35 |
| querySettings: timeoutSeconds | projectSettingSchema('query.timeoutSeconds') | Caller/configuration dependent | src/modules/mcp/infrastructure/query-reader.ts:9 |
| budgets: timeoutMs | positive.optional() | Caller/configuration dependent | src/modules/mcp/infrastructure/query-reader.ts:10 |
| limits: timeoutMs | Math.min(b.timeoutMs??Number(q.timeoutSeconds)*1000,Number(q.timeoutSeconds)*1000) | Caller/configuration dependent | src/modules/mcp/infrastructure/query-reader.ts:37 |
| create: timeoutMs | state.budgets.timeoutMs | Caller/configuration dependent | src/modules/pools/domain/pool.ts:49 |
| start: periodic schedule | 1000 | Caller/configuration dependent | src/modules/release-custody/infrastructure/runtime.ts:173 |
| stop: timer / backoff | 20000 | Caller/configuration dependent | src/modules/release-custody/infrastructure/xq-provider.ts:21 |
| xqRequest: {deadlineMs=15000,connectTimeoutMs=5000,lookup} | {} | Caller/configuration dependent | src/modules/release-custody/infrastructure/xq-transport.mjs:12 |
| xqRequest: deadline | performance.now()+deadlineMs | Caller/configuration dependent | src/modules/release-custody/infrastructure/xq-transport.mjs:13 |
| signal: operation cancellation | deadlineMs | Caller/configuration dependent | src/modules/release-custody/infrastructure/xq-transport.mjs:13 |
| response: timer / backoff | Math.max(1,Math.ceil(Math.min(connectTimeoutMs,deadline-performance.now()))) | Caller/configuration dependent | src/modules/release-custody/infrastructure/xq-transport.mjs:40 |
| poll: periodic schedule | 100 | Caller/configuration dependent | src/modules/sources/application/introspection-job.ts:49 |
| module configuration: this.timeoutMs | options.timeoutMs ?? 9_000 | Caller/configuration dependent | src/modules/sources/infrastructure/sidecar-source-connector.ts:31 |
| call: timeout | AbortSignal.timeout(this.timeoutMs) | Caller/configuration dependent | src/modules/sources/infrastructure/sidecar-source-connector.ts:97 |
| timeout: operation cancellation | this.timeoutMs | Caller/configuration dependent | src/modules/sources/infrastructure/sidecar-source-connector.ts:97 |
| response: operation cancellation | 1500 | Caller/configuration dependent | src/modules/tenancy/infrastructure/project-health.ts:10 |
| client: connectionTimeoutMillis | 5000 | Caller/configuration dependent | src/platform/http/development-migrations.ts:13 |
| timer: periodic schedule | 60 * 60 * 1000 | Caller/configuration dependent | src/platform/http/evidence-maintenance.ts:19 |
| module configuration: deadlineMs | 2500 | Caller/configuration dependent | src/platform/http/readiness.ts:8 |
| results: timer / backoff | this.deadlineMs | Caller/configuration dependent | src/platform/http/readiness.ts:18 |
| heartbeat: periodic schedule | 15000 | Caller/configuration dependent | src/platform/http/server.ts:366 |
| readiness: timeout | 2000 | Caller/configuration dependent | src/platform/http/start.ts:218 |
| ownerGrantTimer: periodic schedule | 30000 | Caller/configuration dependent | src/platform/http/start.ts:237 |
| completionTimer: periodic schedule | 30000 | Caller/configuration dependent | src/platform/http/start.ts:268 |
| rehearsalTimer: periodic schedule | 60*60*1000 | Caller/configuration dependent | src/platform/http/start.ts:271 |
| presenceTimer: periodic schedule | 5000 | Caller/configuration dependent | src/platform/http/start.ts:280 |
| observerSweep: periodic schedule | 1000 | Caller/configuration dependent | src/platform/http/start.ts:338 |
| module configuration: startupDeadline | setTimeout(()=>{ process.stderr.write('Gateway API startup exceeded 30 seconds. Check its configured dependencies.\n',()=>process.exit(1)); },30000) | Caller/configuration dependent | src/platform/http/start.ts:396 |
| startupDeadline: timer / backoff | 30000 | Caller/configuration dependent | src/platform/http/start.ts:396 |
| module configuration: connectionTimeout | 10000 | Caller/configuration dependent | src/platform/mail/infrastructure/smtp-adapter.ts:18 |
| module configuration: greetingTimeout | 10000 | Caller/configuration dependent | src/platform/mail/infrastructure/smtp-adapter.ts:18 |
| module configuration: socketTimeout | 20000 | Caller/configuration dependent | src/platform/mail/infrastructure/smtp-adapter.ts:18 |
| publish: timeout | 2000 | Caller/configuration dependent | src/platform/sse/redis-hub.ts:13 |
| subscribe: timeout | 2000 | Caller/configuration dependent | src/platform/sse/redis-hub.ts:41 |
| timer: periodic schedule | 1000 | Caller/configuration dependent | src/platform/telemetry/diagnostics.ts:45 |
| module configuration: apiTimeoutMs | 30_000 | Caller/configuration dependent | src/shared/api/client.ts:63 |
| messages: timeout | The request did not finish within ${timeoutMs/1000} seconds. Refresh to check its status before trying again. | Caller/configuration dependent | src/shared/api/client.ts:71 |
| request: timeoutMs | request.timeoutMs??apiTimeoutMs | Caller/configuration dependent | src/shared/api/client.ts:96 |
| timer: timer / backoff | timeoutMs | Caller/configuration dependent | src/shared/api/client.ts:102 |
| PoolBudgetValues: timeoutMs | PositivePoolBudget.optional() | Caller/configuration dependent | src/shared/api/pool-budgets.ts:7 |
| CompanySettings: idleTimeoutMins | z.number().int().min(1).max(43200) | Caller/configuration dependent | src/shared/api/settings.ts:6 |
| readinessMessages: source_timeout | 'The readiness source connection or constant query timed out.' | Caller/configuration dependent | src/shared/engine-readiness.ts:12 |
| engineTransportSettingDefinitions: idleTimeoutMs | {env:'ENGINE_TRANSPORT_IDLE_TIMEOUT_MS',default:60000,min:1000,max:3600000} | Caller/configuration dependent | src/shared/engine-transport-settings.ts:5 |
| engineTransportSettingDefinitions: connectTimeoutMs | {env:'ENGINE_TRANSPORT_CONNECT_TIMEOUT_MS',default:5000,min:100,max:120000} | Caller/configuration dependent | src/shared/engine-transport-settings.ts:7 |
| executionRequest: timeoutMs | positive.max(2147483647) | Caller/configuration dependent | src/shared/execution-contract.ts:34 |
| timer: timer / backoff | ms | Caller/configuration dependent | src/shared/infrastructure/engine-h2-pool.ts:37 |
| discard: timer / backoff | settings.idleTimeoutMs | Caller/configuration dependent | src/shared/infrastructure/engine-h2-pool.ts:48 |
| idle: timer / backoff | settings.idleTimeoutMs | Caller/configuration dependent | src/shared/infrastructure/engine-h2-pool.ts:60 |
| open: timer / backoff | settings.maxSessionAgeMs | Caller/configuration dependent | src/shared/infrastructure/engine-h2-pool.ts:96 |
| open: periodic schedule | settings.pingIntervalMs | Caller/configuration dependent | src/shared/infrastructure/engine-h2-pool.ts:97 |
| open: timer / backoff | dial.connectTimeoutMs??settings.connectTimeoutMs | Caller/configuration dependent | src/shared/infrastructure/engine-h2-pool.ts:108 |
| createInternalH2Server: streamTimeoutMs | 10000 | Caller/configuration dependent | src/shared/infrastructure/internal-h2-server.ts:8 |
| server: request.setTimeout | streamTimeoutMs | Caller/configuration dependent | src/shared/infrastructure/internal-h2-server.ts:11 |
| createInternalH2Server: server.setTimeout | config.idleTimeoutMs | Caller/configuration dependent | src/shared/infrastructure/internal-h2-server.ts:15 |
| createInternalH2Server: requestTimeout | 10000 | Caller/configuration dependent | src/shared/infrastructure/internal-h2-server.ts:18 |
| createInternalH2Server: headersTimeout | 10000 | Caller/configuration dependent | src/shared/infrastructure/internal-h2-server.ts:18 |
| createInternalH2Server: keepAliveTimeout | config.idleTimeoutMs | Caller/configuration dependent | src/shared/infrastructure/internal-h2-server.ts:18 |
| Test: server: timer / backoff | 100 | Caller/configuration dependent | test/acceptance-json.test.mjs:25 |
| Test: agent: timeout | 5 | Caller/configuration dependent | test/acceptance-json.test.mjs:27 |
| Test: req: timeout | acceptanceDeadlineMs | Caller/configuration dependent | test/acceptance-json.test.mjs:29 |
| Test: response: timeout | 30000 | Caller/configuration dependent | test/acceptance-lab.test.mjs:28 |
| Test: result: timeout | 5000 | Caller/configuration dependent | test/acceptance-lab.test.mjs:54 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/activity-migration.test.ts:5 |
| Test: module configuration: timeoutMs | 5000 | Caller/configuration dependent | test/activity.test.ts:181 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/agent-credential-provenance.test.ts:33 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/agent-presence-migration.test.ts:7 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/agent-presence-migration.test.ts:16 |
| Test: module configuration: timeout | 30_000 | Caller/configuration dependent | test/agent-presence.test.ts:16 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/authorization-revision-upgrade.test.ts:6 |
| Test: module configuration: allowances | [] | Caller/configuration dependent | test/authz-spicedb.test.ts:205 |
| Test: module configuration: allowances | [] | Caller/configuration dependent | test/authz-spicedb.test.ts:239 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/bulk-entitlement-migration.test.ts:6 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/bypass/attacks.test.ts:13 |
| Test: afterAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/bypass/attacks.test.ts:14 |
| Test: module configuration: timeout | 30000 | Caller/configuration dependent | test/bypass/attacks.test.ts:21 |
| Test: {stdout}: timeout | 25000 | Caller/configuration dependent | test/bypass/attacks.test.ts:61 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/bypass/attacks.test.ts:136 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/bypass/attacks.test.ts:150 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/canonicaliser-assignment.test.ts:48 |
| Test: afterAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/canonicaliser-assignment.test.ts:56 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/canonicaliser-registry.test.mjs:21 |
| Test: Test case hang guard (unchanged) | 15000 | Caller/configuration dependent | test/canonicaliser-registry.test.mjs:35 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/catalog-name-case.test.ts:28 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/catalog-name-case.test.ts:43 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/catalog-tree.test.ts:105 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/catalog-tree.test.ts:142 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/certificate-association.test.ts:71 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/companion-runtime.test.mjs:10 |
| Test: module configuration: timer / backoff | 50 | Caller/configuration dependent | test/companion-runtime.test.mjs:16 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/compiler-declaration-migration.test.ts:6 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/console-followups-migration.test.ts:6 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/contributor-key-migration.test.ts:5 |
| Test: Test case hang guard (unchanged) | 15000 | Caller/configuration dependent | test/credential-identity-binding.test.ts:84 |
| Test: result: timeout | setTimeout(()=>reject(new Error('Credential issuance blocked behind XQ escrow')),5000) | Caller/configuration dependent | test/credential-identity-binding.test.ts:90 |
| Test: result: timer / backoff | 5000 | Caller/configuration dependent | test/credential-identity-binding.test.ts:90 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/credential-local-revocation.test.ts:15 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/credential-local-revocation.test.ts:52 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/credential-local-revocation.test.ts:71 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/custody-engine-transport.test.ts:8 |
| Test: result: timeout | 10000 | Caller/configuration dependent | test/customer-command.test.mjs:78 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/customer-install.test.mjs:30 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/customer-install.test.mjs:40 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/customer-install.test.mjs:48 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/customer-install.test.mjs:59 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/customer-install.test.mjs:71 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/customer-install.test.mjs:89 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/customer-install.test.mjs:98 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/customer-install.test.mjs:102 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/customer-install.test.mjs:114 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/customer-install.test.mjs:144 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/customer-install.test.mjs:154 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/customer-install.test.mjs:166 |
| Test: module configuration: ENGINE_TRANSPORT_IDLE_TIMEOUT_MS | '60000' | Caller/configuration dependent | test/customer-install.test.mjs:170 |
| Test: module configuration: ENGINE_TRANSPORT_CONNECT_TIMEOUT_MS | '8000' | Caller/configuration dependent | test/customer-install.test.mjs:170 |
| Test: module configuration: ENGINE_TRANSPORT_CONNECT_TIMEOUT_MS | '8000' | Caller/configuration dependent | test/customer-install.test.mjs:173 |
| Test: Test case hang guard (unchanged) | 15_000 | Caller/configuration dependent | test/database-deadline-runner.test.ts:9 |
| Test: child: OPINTEL_DEADLINE_CONTROL_DIRECTORY | directory | Caller/configuration dependent | test/database-deadline-runner.test.ts:13 |
| Test: child: OPINTEL_DEADLINE_CONTROL_CASE | scenario | Caller/configuration dependent | test/database-deadline-runner.test.ts:13 |
| Test: module configuration: owner.deadline | () => performance.now() + 30_000 | Caller/configuration dependent | test/database-deadline.test.ts:8 |
| Test: module configuration: timer / backoff | 100 | Caller/configuration dependent | test/database-deadline.test.ts:26 |
| Test: module configuration: deadline | performance.now() + 1_300 | Caller/configuration dependent | test/database-deadline.test.ts:38 |
| Test: module configuration: owner.deadline | () => deadline | Caller/configuration dependent | test/database-deadline.test.ts:39 |
| Test: module configuration: owner.deadline | () => performance.now() + 30_000 | Caller/configuration dependent | test/database-deadline.test.ts:49 |
| Test: client: statement_timeout | 500 | Caller/configuration dependent | test/database-deadline.test.ts:50 |
| Test: beforeEach hook guard (unchanged) | tables.includes('industry') ? 30_000 : undefined | Caller/configuration dependent | test/database-fixture.ts:16 |
| Test: settings: statement_timeout | 0 | Caller/configuration dependent | test/db-scope-session-settings.test.ts:132 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/demo-pack.test.ts:21 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/demo-pack.test.ts:52 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/demo-removal-migration.test.ts:6 |
| Test: Test case hang guard (unchanged) | 15_000 | Caller/configuration dependent | test/dependency-cruiser.test.mjs:11 |
| Test: module configuration: originalTimeout | AbortSignal.timeout.bind(AbortSignal) | Caller/configuration dependent | test/egress-control-client.test.ts:13 |
| Test: result: timeout | 15000 | Caller/configuration dependent | test/egress-startup.test.mjs:14 |
| Test: client: timeoutMs | 5 | Caller/configuration dependent | test/engine-cancellation-origin.test.ts:6 |
| Test: keepAlive: periodic schedule | 20 | Caller/configuration dependent | test/engine-cancellation-origin.test.ts:11 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:19 |
| Test: result: operation cancellation | 2000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:29 |
| Test: result: connectTimeoutMs | 250 | Caller/configuration dependent | test/engine-connect-transport.test.ts:29 |
| Test: common: operation cancellation | 3000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:36 |
| Test: call: operation cancellation | 300 | Caller/configuration dependent | test/engine-connect-transport.test.ts:40 |
| Test: call: connectTimeoutMs | 50 | Caller/configuration dependent | test/engine-connect-transport.test.ts:40 |
| Test: module configuration: operation cancellation | 500 | Caller/configuration dependent | test/engine-connect-transport.test.ts:47 |
| Test: module configuration: connectTimeoutMs | 50 | Caller/configuration dependent | test/engine-connect-transport.test.ts:47 |
| Test: module configuration: operation cancellation | 200 | Caller/configuration dependent | test/engine-connect-transport.test.ts:53 |
| Test: module configuration: connectTimeoutMs | 20 | Caller/configuration dependent | test/engine-connect-transport.test.ts:53 |
| Test: module configuration: operation cancellation | 250 | Caller/configuration dependent | test/engine-connect-transport.test.ts:55 |
| Test: module configuration: connectTimeoutMs | 20 | Caller/configuration dependent | test/engine-connect-transport.test.ts:55 |
| Test: module configuration: connectTimeoutMs | 20 | Caller/configuration dependent | test/engine-connect-transport.test.ts:56 |
| Test: module configuration: operation cancellation | 500 | Caller/configuration dependent | test/engine-connect-transport.test.ts:60 |
| Test: module configuration: operation cancellation | 150 | Caller/configuration dependent | test/engine-connect-transport.test.ts:66 |
| Test: module configuration: connectTimeoutMs | 20 | Caller/configuration dependent | test/engine-connect-transport.test.ts:66 |
| Test: timer: timer / backoff | 150 | Caller/configuration dependent | test/engine-connect-transport.test.ts:80 |
| Test: module configuration: connectTimeoutMs | 20 | Caller/configuration dependent | test/engine-connect-transport.test.ts:81 |
| Test: common: operation cancellation | 3000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:95 |
| Test: common: operation cancellation | 5000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:116 |
| Test: module configuration: idleTimeoutMs | 1000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:128 |
| Test: common: operation cancellation | 5000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:131 |
| Test: module configuration: timer / backoff | 1100 | Caller/configuration dependent | test/engine-connect-transport.test.ts:133 |
| Test: common: operation cancellation | 6000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:142 |
| Test: module configuration: timeout | 4000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:145 |
| Test: common: operation cancellation | 3000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:153 |
| Test: common: operation cancellation | 3000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:167 |
| Test: common: operation cancellation | 5000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:178 |
| Test: module configuration: timer / backoff | 1100 | Caller/configuration dependent | test/engine-connect-transport.test.ts:180 |
| Test: module configuration: timer / backoff | 50 | Caller/configuration dependent | test/engine-connect-transport.test.ts:181 |
| Test: common: operation cancellation | 3000 | Caller/configuration dependent | test/engine-connect-transport.test.ts:190 |
| Test: config: statementTimeoutMs | 2000 | Caller/configuration dependent | test/engine-readiness.test.ts:7 |
| Test: config: operationTimeoutMs | 4000 | Caller/configuration dependent | test/engine-readiness.test.ts:7 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/engine-registry.test.ts:24 |
| Test: module configuration: timer / backoff | 1100 | Caller/configuration dependent | test/engine-registry.test.ts:34 |
| Test: module configuration: timer / backoff | 1100 | Caller/configuration dependent | test/engine-registry.test.ts:97 |
| Test: module configuration: timer / backoff | 1100 | Caller/configuration dependent | test/engine-registry.test.ts:116 |
| Test: module configuration: timer / backoff | 1100 | Caller/configuration dependent | test/engine-registry.test.ts:121 |
| Test: probe: connectTimeoutMs | 250 | Caller/configuration dependent | test/engine-registry.test.ts:138 |
| Test: result: timeoutMs | 1000 | Caller/configuration dependent | test/engine-registry.test.ts:139 |
| Test: endpoint: timeoutMs | 300 | Caller/configuration dependent | test/engine-registry.test.ts:143 |
| Test: stalled: connectTimeoutMs | 20 | Caller/configuration dependent | test/engine-registry.test.ts:144 |
| Test: probe: connectTimeoutMs | 1000 | Caller/configuration dependent | test/engine-registry.test.ts:147 |
| Test: module configuration: timeoutMs | 1000 | Caller/configuration dependent | test/engine-registry.test.ts:148 |
| Test: module configuration: timeoutMs | 1000 | Caller/configuration dependent | test/engine-registry.test.ts:150 |
| Test: timer: periodic schedule | 10 | Caller/configuration dependent | test/engine-supervision.test.ts:18 |
| Test: module configuration: idleTimeoutMs | 60000 | Caller/configuration dependent | test/engine-transport-settings.test.ts:8 |
| Test: module configuration: connectTimeoutMs | 5000 | Caller/configuration dependent | test/engine-transport-settings.test.ts:8 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/entitlement-mask-migration.test.ts:15 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/entitlement-mask-migration.test.ts:21 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/entitlement-migration.test.ts:5 |
| Test: beforeAll hook guard (unchanged) | 180000 | Caller/configuration dependent | test/ephemerality/proof.test.ts:8 |
| Test: module configuration: timeout | 180000 | Caller/configuration dependent | test/ephemerality/proof.test.ts:12 |
| Test: module configuration: timer / backoff | 1000 | Caller/configuration dependent | test/ephemerality/proof.test.ts:17 |
| Test: result: timeout | 1090000 | Caller/configuration dependent | test/ephemerality/proof.test.ts:35 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/evidence-export-migration.test.ts:22 |
| Test: module configuration: timer / backoff | 150 | Caller/configuration dependent | test/evidence-export-stream.test.ts:9 |
| Test: module configuration: timer / backoff | 30 | Caller/configuration dependent | test/evidence-export-stream.test.ts:9 |
| Test: server: timer / backoff | 20 | Caller/configuration dependent | test/evidence-export-stream.test.ts:12 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/evidence-export-upgrade.test.ts:13 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/evidence-lifecycle-migration.test.ts:9 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/evidence-migration.test.ts:6 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/evidence-writer-migration.test.ts:31 |
| Test: module configuration: timeout | 60000 | Caller/configuration dependent | test/evidence-writer.test.ts:14 |
| Test: module configuration: timeout | 30000 | Caller/configuration dependent | test/evidence.test.ts:31 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/exposed-names-upgrade.test.ts:6 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/extraction-migration.test.ts:11 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/filing-party-upgrade.test.ts:13 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/filing-party-upgrade.test.ts:54 |
| Test: beforeAll hook guard (unchanged) | 30_000 | Caller/configuration dependent | test/filing-register.test.ts:61 |
| Test: connector: statementTimeoutMs | 2000 | Caller/configuration dependent | test/filing-register.test.ts:267 |
| Test: connector: operationTimeoutMs | 5000 | Caller/configuration dependent | test/filing-register.test.ts:267 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/filing-register.test.ts:324 |
| Test: Test case hang guard (unchanged) | scenario === 'lock' ? 3_000 : 1_500 | Caller/configuration dependent | test/fixtures/database-deadline/cases.fixture.ts:34 |
| Test: module configuration: timer / backoff | 2_000 | Caller/configuration dependent | test/fixtures/database-deadline/cases.fixture.ts:50 |
| Test: beforeAll hook guard (unchanged) | 60_000 | Caller/configuration dependent | test/fixtures/migration-database.ts:21 |
| Test: module configuration: periodic schedule | 1000 | Caller/configuration dependent | test/fixtures/operator-observer/holder.ts:5 |
| Test: queryFixture: timeoutSeconds | fixtureOptions.queryTimeoutSeconds??15 | Caller/configuration dependent | test/fixtures/query/fixture.ts:59 |
| Test: scope: statementTimeoutMs | 10000 | Caller/configuration dependent | test/fixtures/query/fixture.ts:97 |
| Test: scope: operationTimeoutMs | 15000 | Caller/configuration dependent | test/fixtures/query/fixture.ts:97 |
| Test: f: statementTimeoutMs | 10000 | Caller/configuration dependent | test/fixtures/reinsurance/conformance.ts:14 |
| Test: f: operationTimeoutMs | 15000 | Caller/configuration dependent | test/fixtures/reinsurance/conformance.ts:14 |
| Test: module configuration: timeout | 1000 | Caller/configuration dependent | test/gate-memory.test.mjs:11 |
| Test: module configuration: timer / backoff | 30 | Caller/configuration dependent | test/gate-memory.test.mjs:16 |
| Test: globalSetup: deadlineDirectory | await mkdtemp(join(tmpdir(), 'opintel-database-deadline-')) | Caller/configuration dependent | test/global-setup.ts:14 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/identifier-resolver.test.ts:91 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/ingest-extract.test.ts:36 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/ingest-extract.test.ts:48 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/ingest-extract.test.ts:61 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/ingest-extract.test.ts:80 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/ingest-extract.test.ts:100 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/ingest-extract.test.ts:119 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/ingest-extract.test.ts:141 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/ingest-land.test.ts:137 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/ingest-land.test.ts:159 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/isolated-token-domain-migration.test.ts:6 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:35 |
| Test: afterAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:45 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:56 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:66 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:73 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:84 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:96 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:101 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:114 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:130 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:135 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:144 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:149 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:156 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/key-custody.test.ts:163 |
| Test: beforeAll hook guard (unchanged) | 30_000 | Caller/configuration dependent | test/landing-receipt.test.ts:30 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/landing-receipt.test.ts:102 |
| Test: module configuration: timeout | 30_000 | Caller/configuration dependent | test/mcp-describe.test.ts:50 |
| Test: module configuration: timeout | 60000 | Caller/configuration dependent | test/mcp-explain.test.ts:17 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/mcp-migration.test.ts:5 |
| Test: module configuration: timeout | 60000 | Caller/configuration dependent | test/mcp-query.test.ts:12 |
| Test: module configuration: timeout | 30_000 | Caller/configuration dependent | test/mcp.test.ts:45 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/module-boundary.test.mjs:17 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/module-boundary.test.mjs:26 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/module-boundary.test.mjs:37 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/module-boundary.test.mjs:46 |
| Test: result: timeout | 30000 | Caller/configuration dependent | test/native-release.test.mjs:24 |
| Test: result: timeout | 30000 | Caller/configuration dependent | test/native-release.test.mjs:41 |
| Test: module configuration: timeoutSeconds | 30 | Caller/configuration dependent | test/needs-you.test.ts:26 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/observation-groups.test.ts:76 |
| Test: timer: timer / backoff | 10000 | Caller/configuration dependent | test/operator-observer.test.ts:38 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/package-boundaries.test.mjs:12 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/pattern-rule-migration.test.ts:7 |
| Test: Test case hang guard (unchanged) | 180000 | Caller/configuration dependent | test/performance/activity.test.ts:9 |
| Test: beforeEach hook guard (unchanged) | 30_000 | Caller/configuration dependent | test/performance/bulk-entitlements.test.ts:12 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/performance/bulk-entitlements.test.ts:21 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/performance/catalog-tree.test.ts:45 |
| Test: beforeAll hook guard (unchanged) | 60000 | Caller/configuration dependent | test/performance/datastore-lifecycle.test.ts:9 |
| Test: Test case hang guard (unchanged) | 180000 | Caller/configuration dependent | test/performance/evidence-export.test.ts:13 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/performance/ingest-extract.test.ts:25 |
| Test: beforeAll hook guard (unchanged) | 60000 | Caller/configuration dependent | test/performance/mcp-query.test.ts:7 |
| Test: afterAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/performance/mcp-query.test.ts:8 |
| Test: Test case hang guard (unchanged) | 10000 | Caller/configuration dependent | test/performance/mcp-query.test.ts:9 |
| Test: module configuration: deadline | ()=>{ // Vitest aborts this signal on its deadline. Tag that event at the body, // not by matching timeout wording; hooks and query exceptions stay hard failures. if(context.signal.reason instanceof Error) Object.assign(context.signal.reason,{code:'OPINTEL_COLD_MEASUREMENT_DEADLINE'}); } | Caller/configuration dependent | test/performance/mcp-query.test.ts:11 |
| Test: Test case hang guard (unchanged) | 10000 | Caller/configuration dependent | test/performance/mcp-query.test.ts:25 |
| Test: Test case hang guard (unchanged) | 20000 | Caller/configuration dependent | test/performance/mcp-query.test.ts:29 |
| Test: beforeEach hook guard (unchanged) | 30_000 | Caller/configuration dependent | test/performance/policy-version.test.ts:7 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/performance/policy-version.test.ts:8 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/performance/postgres-source-deadlines.test.ts:13 |
| Test: afterAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/performance/postgres-source-deadlines.test.ts:21 |
| Test: scope: statementTimeoutMs | 50 | Caller/configuration dependent | test/performance/postgres-source-deadlines.test.ts:28 |
| Test: scope: operationTimeoutMs | 1000 | Caller/configuration dependent | test/performance/postgres-source-deadlines.test.ts:28 |
| Test: scope: statementTimeoutMs | 5000 | Caller/configuration dependent | test/performance/postgres-source-deadlines.test.ts:39 |
| Test: scope: operationTimeoutMs | 100 | Caller/configuration dependent | test/performance/postgres-source-deadlines.test.ts:39 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/performance/row-scoping.test.ts:8 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/performance/staging-cancellation.test.ts:15 |
| Test: afterAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/performance/staging-cancellation.test.ts:16 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/performance/staging-cancellation.test.ts:17 |
| Test: scope: statementTimeoutMs | 30000 | Caller/configuration dependent | test/performance/staging-cancellation.test.ts:18 |
| Test: scope: operationTimeoutMs | 40000 | Caller/configuration dependent | test/performance/staging-cancellation.test.ts:18 |
| Test: request: timeoutMs | 40000 | Caller/configuration dependent | test/performance/staging-cancellation.test.ts:27 |
| Test: module configuration: timeout | 10000 | Caller/configuration dependent | test/performance/staging-cancellation.test.ts:30 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/policy-version-migration.test.ts:11 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/policy-version-migration.test.ts:32 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/policy-version.test.ts:32 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/pool-binding-migration.test.ts:7 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/pool-binding-migration.test.ts:15 |
| Test: module configuration: timeout | 30_000 | Caller/configuration dependent | test/pool-binding.test.ts:33 |
| Test: values: timeoutMs | 3000 | Caller/configuration dependent | test/pool-budgets.test.ts:19 |
| Test: module configuration: timeoutSeconds | 10 | Caller/configuration dependent | test/pool-budgets.test.ts:64 |
| Test: module configuration: timeoutMs | 10000 | Caller/configuration dependent | test/pool-budgets.test.ts:67 |
| Test: module configuration: timeoutMs | 3000 | Caller/configuration dependent | test/pool-budgets.test.ts:68 |
| Test: module configuration: timeoutMs | 20000 | Caller/configuration dependent | test/pool-budgets.test.ts:69 |
| Test: module configuration: timeoutMs | 10000 | Caller/configuration dependent | test/pool-budgets.test.ts:69 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/pool-credential-migration.test.ts:6 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/pool-credential-migration.test.ts:26 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/pool-credentials.test.ts:20 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/pool-credentials.test.ts:35 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/pool-credentials.test.ts:61 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/pool-credentials.test.ts:83 |
| Test: base: timeoutMs | 1000 | Caller/configuration dependent | test/pool-domain.test.ts:8 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/pool-key-migration.test.ts:7 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/pool-key-migration.test.ts:20 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/pool-key-route-schemas.test.ts:16 |
| Test: module configuration: timeout | 30_000 | Caller/configuration dependent | test/pool-keys.test.ts:25 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/pool-migration.test.ts:5 |
| Test: beforeAll hook guard (unchanged) | 60000 | Caller/configuration dependent | test/postgres-connector.test.ts:35 |
| Test: module configuration: statementTimeoutMs | 2000 | Caller/configuration dependent | test/postgres-connector.test.ts:57 |
| Test: module configuration: operationTimeoutMs | 5000 | Caller/configuration dependent | test/postgres-connector.test.ts:57 |
| Test: source: statementTimeoutMs | 1000 | Caller/configuration dependent | test/postgres-connector.test.ts:76 |
| Test: source: operationTimeoutMs | 3000 | Caller/configuration dependent | test/postgres-connector.test.ts:76 |
| Test: source: statementTimeoutMs | 1000 | Caller/configuration dependent | test/postgres-connector.test.ts:117 |
| Test: source: operationTimeoutMs | 3000 | Caller/configuration dependent | test/postgres-connector.test.ts:117 |
| Test: failing: statementTimeoutMs | 1000 | Caller/configuration dependent | test/postgres-connector.test.ts:132 |
| Test: failing: operationTimeoutMs | 3000 | Caller/configuration dependent | test/postgres-connector.test.ts:132 |
| Test: refused: statementTimeoutMs | 1000 | Caller/configuration dependent | test/postgres-connector.test.ts:187 |
| Test: refused: operationTimeoutMs | 2000 | Caller/configuration dependent | test/postgres-connector.test.ts:187 |
| Test: unavailable: statementTimeoutMs | 1000 | Caller/configuration dependent | test/postgres-connector.test.ts:208 |
| Test: unavailable: operationTimeoutMs | 2000 | Caller/configuration dependent | test/postgres-connector.test.ts:208 |
| Test: scope: statementTimeoutMs | 5000 | Caller/configuration dependent | test/postgres-connector.test.ts:215 |
| Test: scope: operationTimeoutMs | 6000 | Caller/configuration dependent | test/postgres-connector.test.ts:215 |
| Test: connect: timer / backoff | delay | Caller/configuration dependent | test/postgres-source-deadline.test.ts:18 |
| Test: limits: statementTimeoutMs | 5000 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:31 |
| Test: limits: operationTimeoutMs | 100 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:31 |
| Test: limits: connectTimeoutMs | 10 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:31 |
| Test: request: timeoutMs | 10000 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:42 |
| Test: scope: operationTimeoutMs | 30000 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:176 |
| Test: scope: connectTimeoutMs | 10000 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:176 |
| Test: module configuration: connectAllowanceMs | 10000 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:181 |
| Test: scope: operationTimeoutMs | 30000 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:189 |
| Test: scope: connectTimeoutMs | 10000 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:189 |
| Test: request: timeoutMs | 30000 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:191 |
| Test: scope: operationTimeoutMs | 15000 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:204 |
| Test: scope: connectTimeoutMs | 10000 | Caller/configuration dependent | test/postgres-source-deadline.test.ts:204 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/project-members.test.ts:149 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/provisioning-runtime.test.mjs:34 |
| Test: result: timeout | 30000 | Caller/configuration dependent | test/provisioning-runtime.test.mjs:53 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/provisioning-runtime.test.mjs:57 |
| Test: module configuration: timeoutSeconds | 10 | Caller/configuration dependent | test/query-batching.test.ts:23 |
| Test: run: timeout | 20_000 | Caller/configuration dependent | test/recorded-performance-reporter.test.ts:21 |
| Test: module configuration: deadlines | JSON.parse(await readFile(join(directory,'test-results/recorded-performance-deadlines.json'),'utf8')) as {deadlines:{title:string}[]} | Caller/configuration dependent | test/recorded-performance-reporter.test.ts:29 |
| Test: waitForReady: deadline | Date.now() + 5_000 | Caller/configuration dependent | test/redis.test.ts:22 |
| Test: waitForReady: timer / backoff | 25 | Caller/configuration dependent | test/redis.test.ts:29 |
| Test: Test case hang guard (unchanged) | 180000 | Caller/configuration dependent | test/reinsurance-conformance.test.ts:14 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/relationship-suggestions.test.ts:83 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/release-custody-availability.test.ts:9 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/release-custody-availability.test.ts:23 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/release-custody-availability.test.ts:33 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/release-custody-escrow-refusal.test.ts:16 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/release-custody-mcp.test.ts:10 |
| Test: module configuration: timer / backoff | Math.max(0,expiringClaims.exp*1000-Date.now()+20) | Caller/configuration dependent | test/release-custody-mcp.test.ts:42 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/release-custody-migration.test.ts:7 |
| Test: Test case hang guard (unchanged) | 180000 | Caller/configuration dependent | test/review/column-grid.capture.ts:59 |
| Test: module configuration: timeout | 30000 | Caller/configuration dependent | test/review/column-grid.capture.ts:84 |
| Test: module configuration: testTimeout | 180000 | Caller/configuration dependent | test/review/column-grid.config.ts:3 |
| Test: Test case hang guard (unchanged) | 180000 | Caller/configuration dependent | test/review/console-followups-3.capture.ts:56 |
| Test: module configuration: testTimeout | 180000 | Caller/configuration dependent | test/review/console-followups-3.config.ts:3 |
| Test: module configuration: testTimeout | 180000 | Caller/configuration dependent | test/review/console-next-activity.config.ts:3 |
| Test: module configuration: testTimeout | 180000 | Caller/configuration dependent | test/review/console-next-data.config.ts:3 |
| Test: module configuration: idleTimeoutMins | 60 | Caller/configuration dependent | test/review/console-next-first-run.capture.ts:21 |
| Test: module configuration: testTimeout | 180000 | Caller/configuration dependent | test/review/console-next-first-run.config.ts:2 |
| Test: module configuration: hookTimeout | 30000 | Caller/configuration dependent | test/review/console-next-first-run.config.ts:2 |
| Test: module configuration: testTimeout | 180000 | Caller/configuration dependent | test/review/console-next-pools.config.ts:3 |
| Test: module configuration: testTimeout | 180000 | Caller/configuration dependent | test/review/console-next-settings.config.ts:3 |
| Test: module configuration: testTimeout | 120000 | Caller/configuration dependent | test/review/console-next.config.ts:3 |
| Test: Test case hang guard (unchanged) | 600000 | Caller/configuration dependent | test/review/console-provenance-design.capture.ts:57 |
| Test: module configuration: testTimeout | 600000 | Caller/configuration dependent | test/review/console-provenance-design.config.ts:3 |
| Test: Test case hang guard (unchanged) | 180000 | Caller/configuration dependent | test/review/provenance.capture.ts:57 |
| Test: module configuration: testTimeout | 180000 | Caller/configuration dependent | test/review/provenance.config.ts:3 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/row-decision-level-migration.test.ts:8 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/row-entitlement-migration.test.ts:13 |
| Test: request: timeoutMs | 10000 | Caller/configuration dependent | test/row-preview-sealing.test.ts:14 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/secret-references-upgrade.test.ts:6 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/session-construction.test.ts:63 |
| Test: {stdout}: timeout | 25000 | Caller/configuration dependent | test/session-construction.test.ts:66 |
| Test: module configuration: timeout | 60000 | Caller/configuration dependent | test/session-store.test.ts:53 |
| Test: module configuration: timeout | 120000 | Caller/configuration dependent | test/session-store.test.ts:54 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/settings-migration.test.ts:6 |
| Test: Test case hang guard (unchanged) | 10000 | Caller/configuration dependent | test/sidecar-http.test.ts:62 |
| Test: payload: timeoutMs | 10000 | Caller/configuration dependent | test/sidecar-http.test.ts:66 |
| Test: req: operation cancellation | 3000 | Caller/configuration dependent | test/sidecar-http.test.ts:93 |
| Test: beforeAll hook guard (unchanged) | 60000 | Caller/configuration dependent | test/sidecar-http.test.ts:104 |
| Test: module configuration: statementTimeoutMs | 5000 | Caller/configuration dependent | test/sidecar-http.test.ts:108 |
| Test: module configuration: operationTimeoutMs | 6000 | Caller/configuration dependent | test/sidecar-http.test.ts:108 |
| Test: module configuration: timeout | 2500 | Caller/configuration dependent | test/sidecar-http.test.ts:213 |
| Test: Test case hang guard (unchanged) | 15000 | Caller/configuration dependent | test/sidecar-http.test.ts:246 |
| Test: module configuration: shutdownTimeoutMs | 2000 | Caller/configuration dependent | test/sidecar-http.test.ts:252 |
| Test: module configuration: statementTimeoutMs | 60000 | Caller/configuration dependent | test/sidecar-http.test.ts:252 |
| Test: module configuration: operationTimeoutMs | 60000 | Caller/configuration dependent | test/sidecar-http.test.ts:252 |
| Test: module configuration: timeout | 10000 | Caller/configuration dependent | test/sidecar-http.test.ts:257 |
| Test: connector: timeoutMs | 9000 | Caller/configuration dependent | test/sidecar-http.test.ts:258 |
| Test: module configuration: timeout | 4000 | Caller/configuration dependent | test/sidecar-http.test.ts:264 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/sidecar-http.test.ts:287 |
| Test: r: timeoutMs | 10000 | Caller/configuration dependent | test/sidecar-http.test.ts:288 |
| Test: Test case hang guard (unchanged) | 20000 | Caller/configuration dependent | test/sidecar-landing-check.test.ts:30 |
| Test: module configuration: timeout | 15000 | Caller/configuration dependent | test/sidecar-landing-check.test.ts:37 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/sidecar-pin.test.ts:11 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/sidecar-process.test.ts:19 |
| Test: Test case hang guard (unchanged) | 15000 | Caller/configuration dependent | test/sidecar-process.test.ts:46 |
| Test: module configuration: shutdownTimeoutMs | 300 | Caller/configuration dependent | test/sidecar-process.test.ts:56 |
| Test: module configuration: timeout | 10000 | Caller/configuration dependent | test/sidecar-process.test.ts:59 |
| Test: module configuration: timeout | 2000 | Caller/configuration dependent | test/sidecar-process.test.ts:66 |
| Test: Test case hang guard (unchanged) | 15000 | Caller/configuration dependent | test/sidecar-process.test.ts:77 |
| Test: module configuration: shutdownTimeoutMs | 500 | Caller/configuration dependent | test/sidecar-process.test.ts:79 |
| Test: stop: timeoutMs | 4500 | Caller/configuration dependent | test/sidecar-process.test.ts:80 |
| Test: Test case hang guard (unchanged) | 15000 | Caller/configuration dependent | test/sidecar-process.test.ts:92 |
| Test: module configuration: shutdownTimeoutMs | 100 | Caller/configuration dependent | test/sidecar-process.test.ts:94 |
| Test: module configuration: timeout | 10000 | Caller/configuration dependent | test/sidecar-process.test.ts:97 |
| Test: Test case hang guard (unchanged) | 15000 | Caller/configuration dependent | test/sidecar-process.test.ts:109 |
| Test: Test case hang guard (unchanged) | 15000 | Caller/configuration dependent | test/sidecar-process.test.ts:123 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/sidecar-register-help.test.ts:5 |
| Test: Test case hang guard (unchanged) | 15000 | Caller/configuration dependent | test/sidecar-startup.test.ts:49 |
| Test: module configuration: deadline | 0 | Caller/configuration dependent | test/sidecar-validation.test.ts:18 |
| Test: validator: deadline | ms | Caller/configuration dependent | test/sidecar-validation.test.ts:19 |
| Test: timer: timer / backoff | 0 | Caller/configuration dependent | test/sidecar-validation.test.ts:19 |
| Test: module configuration: timeoutMs | 999999 | Caller/configuration dependent | test/sidecar-validation.test.ts:20 |
| Test: module configuration: timeoutMs | 2000 | Caller/configuration dependent | test/sidecar-validation.test.ts:21 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/smtp-mail.test.ts:11 |
| Test: until: timer / backoff | 5 | Caller/configuration dependent | test/soak-observer-session.test.ts:35 |
| Test: beforeAll hook guard (unchanged) | 30_000 | Caller/configuration dependent | test/source-connector.test.ts:30 |
| Test: module configuration: timeoutMs | 100 | Caller/configuration dependent | test/source-connector.test.ts:108 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/source-registration.test.ts:53 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/source-registration.test.ts:165 |
| Test: module configuration: timeout | 30000 | Caller/configuration dependent | test/sql-subset.test.ts:19 |
| Test: module configuration: timeout | 30000 | Caller/configuration dependent | test/sql-treatments.test.ts:26 |
| Test: module configuration: timeout | 30000 | Caller/configuration dependent | test/sql-treatments.test.ts:183 |
| Test: Test case hang guard (unchanged) | 15000 | Caller/configuration dependent | test/sse.test.ts:57 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/sso-enforcement-migration.test.ts:5 |
| Test: request: timeoutMs | 10000 | Caller/configuration dependent | test/staged-execution.test.ts:15 |
| Test: module configuration: timeout | 30000 | Caller/configuration dependent | test/staged-execution.test.ts:20 |
| Test: scope: statementTimeoutMs | 1000 | Caller/configuration dependent | test/staged-execution.test.ts:105 |
| Test: scope: operationTimeoutMs | 2000 | Caller/configuration dependent | test/staged-execution.test.ts:105 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-process.test.ts:12 |
| Test: r: timeoutMs | 30000 | Caller/configuration dependent | test/staging-process.test.ts:22 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:17 |
| Test: afterAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:18 |
| Test: request: timeoutMs | 10000 | Caller/configuration dependent | test/staging-source.test.ts:19 |
| Test: scope: statementTimeoutMs | 5000 | Caller/configuration dependent | test/staging-source.test.ts:20 |
| Test: scope: operationTimeoutMs | 10000 | Caller/configuration dependent | test/staging-source.test.ts:20 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:21 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:22 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:24 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:29 |
| Test: sourcePhase: connectAllowanceMs | z.number().int().positive().optional() | Caller/configuration dependent | test/staging-source.test.ts:33 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:47 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:58 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:72 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:81 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:92 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:102 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:112 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:141 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/staging-source.test.ts:151 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/tenancy-list-routes.test.ts:164 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/token-domain-history.test.ts:15 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/token-domain-history.test.ts:37 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/token-join-candidate-migration.test.ts:10 |
| Test: Test case hang guard (unchanged) | 60_000 | Caller/configuration dependent | test/token-join-candidate-migration.test.ts:41 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/tokenization-boundary.test.ts:27 |
| Test: scope: statementTimeoutMs | 5000 | Caller/configuration dependent | test/tokenization-source.test.ts:20 |
| Test: scope: operationTimeoutMs | 15000 | Caller/configuration dependent | test/tokenization-source.test.ts:20 |
| Test: beforeAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/tokenization-source.test.ts:25 |
| Test: afterAll hook guard (unchanged) | 30000 | Caller/configuration dependent | test/tokenization-source.test.ts:36 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/tokenization-source.test.ts:41 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/tokenization-source.test.ts:51 |
| Test: Test case hang guard (unchanged) | 60000 | Caller/configuration dependent | test/tokenization-source.test.ts:101 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/tokenization-source.test.ts:125 |
| Test: Test case hang guard (unchanged) | 600000 | Caller/configuration dependent | test/tokenization-stress/collision.test.ts:6 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/tokenization.test.ts:29 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/tokenization.test.ts:121 |
| Test: Test case hang guard (unchanged) | 30_000 | Caller/configuration dependent | test/tokenization.test.ts:141 |
| Test: Test case hang guard (unchanged) | 30000 | Caller/configuration dependent | test/view-compiler-invariants.test.ts:155 |
| Test: child: timeout | 20000 | Caller/configuration dependent | test/view-compiler-invariants.test.ts:162 |
| Test: result: connectTimeoutMs | 25 | Caller/configuration dependent | test/xq-transport.test.mjs:11 |
| Test: result: deadlineMs | 1000 | Caller/configuration dependent | test/xq-transport.test.mjs:11 |
| Test: result: connectTimeoutMs | 100 | Caller/configuration dependent | test/xq-transport.test.mjs:20 |
| Test: result: deadlineMs | 200 | Caller/configuration dependent | test/xq-transport.test.mjs:20 |
| Test: module configuration: connectTimeoutMs | 20 | Caller/configuration dependent | test/xq-transport.test.mjs:27 |
| Test: module configuration: deadlineMs | 200 | Caller/configuration dependent | test/xq-transport.test.mjs:27 |
| Test: result: timer / backoff | 1500 | Caller/configuration dependent | test/xq-transport.test.mjs:33 |
| Test: module configuration: deadlineMs | 120 | Caller/configuration dependent | test/xq-transport.test.mjs:39 |
| module configuration: testTimeout | 30_000 | Caller/configuration dependent | vitest.config.ts:7 |
<!-- end runtime timeout inventory -->

All settings share one definition in
`src/shared/engine-transport-settings.ts`. Invalid values refuse startup;
they are never clamped silently. HTTP/2 uses Node's built-in `node:http2` in the
existing digest-pinned Node runtime, without an additional transport dependency.

The pool separates engine origin, pin, client identity, trust material and TLS
policy. No request headers are written before certificate validation. Only
connect-phase failures before request write may retry, at most four attempts
with bounded jitter. A written request is never replayed. Session rotation,
GOAWAY, cancellation and missed pings do not grant permission to replay it.
