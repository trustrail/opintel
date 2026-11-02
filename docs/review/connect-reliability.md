# Connection reliability product extraction

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
