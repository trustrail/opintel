# S5 packaging validation

Recorded 2026-10-04. Deployment instructions and both models are in
[deploy/engine/README.md](../../deploy/engine/README.md).

## Shipped image and controller

The shipping `engine` target and S4's inspected target are the same OCI image.
The successful full invocation retained matching image IDs:

`sha256:e798b3af58584e797e593ff718afa9c37c34e3e0b9ec7f6a8cc6b0fefb2826b4`

Local artifacts: `test-results/ephemerality/2026-10-04T15-00-39.432Z/`.
`shipping-runtime.json` verifies read-only root, UID 65534, no added capabilities,
all capabilities dropped, equal 3 GB memory/memory+swap limits, core soft/hard
limits zero, read-only `/tmp` and `/dev/shm`, and exactly three writable storage
mounts: `/audit`, `/custody`, `/ingest`. Production may omit `/ingest` and uses
the same shared enforcement manifest with its configured memory budget.
Linux tmpfs size=0 means unlimited and is explicitly not used as a control.

The engine lacks Python, strace, psql, OpenSSL and Vitest (absence actively
checked). The separate controller supplies those, independent markers, fixtures,
the address addon and reports. Read-only instrumentation pauses a child inside
the shipping image before production imports; the outside controller attaches
through the shared Linux PID namespace. Only the controller has SYS_PTRACE.
Production modules remain baked in the image. Reports and tracer tools are not
mounted into the engine; workload markers in permitted storage are never exempted.

## Checks

- `npm run test:ephemerality`: one complete invocation passed all 11 checks:
  SD-005, the adversarial scanner gate and nine S4 scenarios. All nine have
  empty failure and incomplete-coverage lists and working live controls.
- SD-005 first proves an undeclared peer is reachable from an outside witness;
  engine-side attempts to that host and an undeclared port fail. The declared
  source connects, and an mTLS POST reaches the declared synthetic application
  receipt receiver and returns 204. Static hostname resolution is read-only;
  neither Docker DNS nor loopback has an implicit outbound exception.
- The baked shipping entry point starts and shuts down under the controls.
  Every S4 scenario attempts writes to `/tmp`, `/dev/shm`, `/work` and `/` and
  requires EROFS/EACCES; SD-005 also verifies non-root, no capabilities, zero
  core limits and the effective cgroup swap limit.
- `npm test`: 153 files, 1,478 tests passed.
- `npm run test:bypass`: 97 passing checks, zero open checks, zero regressions.
- Strict typecheck, lint and `git diff --check` pass. No migrations, routes or
  screens changed. The functional suite exercises migration up/down coverage.
- Remote CI has not been run here. Its Linux S4/S5 gate now uploads fresh
  per-invocation JSON artifacts, including runtime identity and SD-005 evidence.

## Residual memory, separately

No forced collection or suppression was used. Counts are occurrences of marker
representations, not distinct rows, live-object counts or a secure-erasure metric.
These observations are for the shipping image above; older S4 counts remain
historical results for its earlier fixture.

| Scenario | Coverage | Immediate post-response occurrences |
|---|---|---|
| clear | VERIFIED | 617,667 |
| treated | VERIFIED | 1,069,414 |
| aggregate | VERIFIED | 100,727 |
| cancel | VERIFIED | 5,645 |
| deadline | VERIFIED | 5,547 |
| source_failure | VERIFIED | 3,365 |
| staging_failure | VERIFIED | 5,928 |
| memory_pressure | VERIFIED | 20,872 |
| application | VERIFIED | 102,990 |

## Harness corrections and limits

Earlier invocations failed or reported incomplete and remain recorded separately.
External strace attachment cannot use its launch-time seccomp-BPF filter; the
original 500-second fixture budget expired after 79,872 treated rows. The
fixture now permits 1,000 seconds without changing production defaults,
100,000-row assertions, or the explicitly triggered cancellation/deadline cases.
A controller socket's accidental 30-second read timeout expired during a
75-second native pause; blocking transport now leaves the explicit event, HTTP
and test deadlines in charge. The trace showed native failure and balanced
teardown: the engine had not exited before teardown, as initially inferred.
The application fixture also needed DATABASE_URL in its own engine-side test
environment, alongside TEST_DATABASE_URL. The full corrected invocation above
passed without weakening any proof assertion.

The memory-pressure case returned `budget_exceeded` in this invocation. That
observation does not resolve S4b's full wording-dependent classifier inventory
or replace its required native exception/cause-chain capture. S4b remains a
separate, unimplemented item.

The receipt receiver proves network/TLS delivery, not application receipt
persistence or authorization; existing ingest application tests cover those.
There is no configured span exporter: NOT_CONFIGURED is not a zero-match claim.
Host/hypervisor swap, crash collectors, host logging, physical remnants and
kernel buffers remain outside this container proof and require operator controls.

Both deployment models use this image. Multi-tenant placement needs an approved
hosted-application-to-customer-engine path and authenticated cross-organisation
certificate/pin provisioning; customer-appointed operators run the engine.
Single-tenant placement needs internal routing and customer-owned provisioning
and operation of both endpoints. Packaging does not settle 5.20's reachability
or registration decisions and implements no engine registry.
