# Development bootstrap regressions

The platform, sign-in race, smoke trace and memory preflight changes were
committed, merged and pushed as `88b2430` after the green gate recorded in
`auth-platform-gate-passed.json`.

The follow-up changes affect development tooling only:

- `dev:api` loads dotenv before importing the HTTP entry point, so database
  construction sees the configuration. The production entry point is unchanged.
- `dev:demo` requires a responding local API before any provisioning. It
  acknowledges the verified local engine's current policy through `EngineEgress`
  and lets the normal source worker finish introspection before treatments.
  The optional soak sources follow the same path and no longer assume that
  a queued source is connected. Deployed policy acknowledgment is unchanged.
- Local `tmp/sidecar` preparation reuses the scanner or runs the existing signed
  scanner preparation/LOAD check if missing, then fills an absent
  `postgresExtension` path without replacing a configured path.

Focused validation passed: five files, 31 tests, covering development API import
order, API refusal, scanner preparation/reuse/failure, acknowledgment ordering,
source registration against the real sidecar, and bootstrap scope imports.

The first completed-tree gate stopped at lint after both typechecks passed:
`scripts/dev-demo-readiness.ts` used `NodeJS.ProcessEnv`, rejected by `no-undef`.
No product test ran in that gate. The database was removed. The fix replaces
only that type annotation with the existing scripts' `Record<string,string |
undefined>` convention. A new gate is allowed on this changed tree; the stopped
run was not repeated on the same tree.

- `dev-path-gate-lint-stop.json`
- `/private/tmp/opintel-dev-path-gate.log`
- `/private/tmp/opintel-dev-path-focused.log`

## Completed validation

The changed-tree gate passed all seven tiers: 235 normal test files / 2,057
tests, 59 conformance checks covering 54 routes with zero findings, and the
continuous sign-in/MCP/receipt smoke. Wall time was 1,362.71 seconds; the
isolated database was removed successfully. Available memory started at
3,118,379,008 bytes and had a sampled minimum of 2,297,585,664 bytes across
274 readings, with zero failed readings. Record: `dev-path-gate-passed.json`;
log: `/private/tmp/opintel-dev-path-corrected-gate.log`.

Validation used isolated fixture databases and real sidecar source-registration
tests. It did not recreate this host's demo installation or run a full fresh-machine
`dev:demo` provisioning session.

## Files

- `package.json`, `scripts/dev-api.ts`: development API import order.
- `scripts/dev-demo.ts`, `scripts/dev-demo-readiness.ts`,
  `scripts/dev-demo-soak.ts`: API preflight, local policy acknowledgment and
  waiting for introspection before treatments.
- `scripts/sidecar-dev.ts`, `scripts/development-scanner.ts`: local scanner
  preparation and configuration.
- `test/dev-api-entry.test.ts`, `test/dev-bootstrap.test.ts`,
  `test/source-registration.test.ts`: regression coverage.
- `README.md`, `docs/slice1-technical-documentation.md`: startup order and
  environment-loading contract.
- `docs/review/dev-path-regressions.md`, `docs/review/dev-path-gate-lint-stop.json`,
  `docs/review/dev-path-gate-passed.json`: findings and both gate records.

## Local startup

Run `npm run dev:up`, then keep `npm run dev:api` running. In another terminal,
run `npm run dev:demo` (or `npm run dev:demo -- --soak` with its required
operator configuration). Run `npm run dev` separately for the console.
