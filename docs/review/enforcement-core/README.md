# Inputs to CORE-01 and CORE-02

Findings only. Implementation waits for the approved `docs/architecture/engine.md`
specification. ARCH-01 does not change admission deadlines or separate health
from the execution loop.

CORE-01 — one request context and typed outcomes:

- Retained ARCH-01 run `stage5-acceptance-09enB0`, `/execute` call
  `766d2caf-c79d-4ecb-9c76-57d30f57c46e`, receipt
  `01a1b422-0c08-7fa5-a031-705fbf182121`: 8.831 s admission wait, 5.502 s
  validation, caller abort at 30.400 s while execution continued.
- `sidecar/execution/application/execute.ts:48–53` admits before starting a
  fresh execution timeout. The public caller budget already includes waiting.
  Carry one caller budget through stages; do not reset it after admission.
- Query response metadata says `source_unavailable / deadline_exceeded`,
  cancellation origin `transport_deadline`; retained receipt-read snapshot was
  still incomplete. Typed outcomes should preserve this distinction; never
  pretend a transport status is a finalized receipt.

CORE-02 — independent control liveness:

- Same run, `/health` call `19c99f49-9b31-4c80-9e4a-70012638a52e`: written
  04:00:36.089Z, engine handler arrival 45.819Z, response end 46.306Z;
  caller aborted at 46.246Z (10.540 s total).
- Same engine pid 29 emitted readiness again at 44.919Z after an IPC heartbeat
  gap >10 seconds (`sidecar/supervision.ts:28`). No restart was recorded.
- Four admitted requests were awaiting responses, two per pool. A queue timer
  nominally ten seconds fired at 16.592 seconds. Lag, host load and cgroup CPU
  counters were not retained. Blocked process versus host starvation is unknown.
- `sidecar/start.ts` constructs execution and the TLS server in one child;
  `/health` shares its event loop (`sidecar/http/server.ts`). Bypassing admission
  does not make liveness independent of execution. The future control process
  must report timestamped core progress, and unhealthy when progress is stale.

[Full correlated evidence](../engine-transport-h2/README.md#retained-timeout-diagnosis--2026-11-07-no-execution-fix)
and [sanitized stage extraction](../engine-transport-h2/timeout-window-20261107.json).
New ARCH-01 acceptance results, if reached, are appended with their own run
identities; baseline absence or missing lag stays explicitly unknown.
