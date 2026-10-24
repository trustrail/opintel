# Auth/platform gate stop record

The 2026-10-24 changed-tree gate stopped after 3,255.27 seconds in the
normal-test tier. It reported a pool-credential migration setup timeout
(10 seconds), a sidecar HTTP readiness assertion timeout (10 seconds),
and two sidecar replacement/refusal test timeouts (15 seconds each).
There were 2,039 passing tests, three failing tests and two skipped tests;
the migration setup failure was a separate failed suite. Smoke did not run.
The isolated gate database was successfully removed.

**Disposition: environment-caused stop, per operator instruction.** The
operator attributed all four failures to the 344 MiB free RAM observed
after the run and authorized one new gate after freeing the host.
This is the operator's causal assessment; no contemporaneous memory or
port-owner capture exists to independently establish it. Post-run inspection
found no stray application/test Node processes or sidecar listeners, only
the development PostgreSQL and Redis containers, and 8.9 GiB disk free.

Evidence retained locally:

- `/private/tmp/opintel-auth-provider-platform-gate.log`
- `tmp/auth-provider-race/changed-tree-gate.json`
- `tmp/auth-provider-race/previous-gate.json` (earlier sign-in smoke failure)

The initial memory preflight required 2 GiB of OS-reported free RAM.
The operator subsequently corrected that metric to available RAM: on macOS,
free + inactive + speculative pages from `vm_stat` multiplied by its reported
page size; on Linux, `MemAvailable` from `/proc/meminfo` converted from KiB
to bytes. The corrected check prints the reading, retains the 2 GiB threshold,
and runs before services, database creation or validation tiers. No test
deadline is relaxed.

## Authorized run with the memory preflight

The single authorized run refused immediately: the OS reported **0.02 GiB
free RAM**, below the 2 GiB threshold. No services were started, no database
was created, and no validation tiers ran. Exit code was 1; displayed gate
wall time was 0.01 seconds. The threshold boundary checks passed separately.
No rerun, commit, merge or push followed; dev-path regression work remains
pending the required green gate.

- `/private/tmp/opintel-auth-platform-memory-preflight-gate.log`
- `tmp/auth-provider-race/memory-preflight-gate.json`

## Authorized run with the corrected available-memory metric

Parser checks passed for macOS 4 KiB and 16 KiB pages, Linux MemAvailable,
missing fields, and the threshold boundary. The single authorized gate run
then measured **1.79 GiB available RAM** using macOS free + inactive +
speculative pages. It refused before any service/database work or validation
tier, with exit code 1 and displayed wall time 0.01 seconds. No rerun, commit,
merge or push followed; dev-path work remains pending the green gate.

- `/private/tmp/opintel-auth-platform-available-memory-gate.log`
- `tmp/auth-provider-race/available-memory-gate.json`

## Authorized 1 GiB run with periodic sampling

The temporary admission threshold is now 1 GiB available RAM. The gate records
the initial reading and minimum sampled reading, timestamps, sample count,
failed samples and the 5-second sampling interval. It also samples at completion.

The single run lasted 1,407.87 seconds. Available memory started at
2,019,770,368 bytes (1.881 GiB) and reached a sampled minimum of 1,550,553,088
bytes (1.444 GiB), from 283 successful readings and zero failed readings.
The isolated database was removed successfully. All four earlier timeout cases
passed, as did the auth race tests. There were 2,052 passing tests and one failure.

The failure is in the new sampler test: its fake-timer advance did not drive
the timer imported from `node:timers`, leaving only start and stop observations
(two samples, zero failures rather than three samples, one failure). The actual
gate did sample periodically, as its 283 readings demonstrate. This is a test
failure, not another environment classification. Smoke was not reached; no
rerun, commit, merge or push followed. Dev-path work remains pending green.

- `/private/tmp/opintel-auth-platform-memory-sampled-gate.log`
- `tmp/auth-provider-race/sampled-memory-gate.json`

## Passed candidate after the sampler test repair

Only the sampler test changed: it uses a 10 ms real interval, waits for the
failed-reading observation, and verifies that sampling stops. The monitor
implementation was unchanged. The single gate passed all seven tiers:
233 test files / 2,053 normal tests, 59 conformance checks, and the continuous
sign-in/MCP/receipt smoke. Wall time was 1,388.59 seconds; isolated database
cleanup succeeded. Available RAM started at 2,341,924,864 bytes (2.181 GiB)
and its sampled minimum was 2,145,599,488 bytes (1.998 GiB), across 279 samples
with zero failed readings. The temporary threshold remains 1 GiB.

- `docs/review/auth-platform-gate-passed.json`
- `/private/tmp/opintel-auth-platform-sampler-test-gate.log`
