# RED-019 fixed clock and test-tree clock audit

RED-019 previously chose the host UTC day, seeded 01:00 runs, and let the
Dashboard composition independently read the host time. Before 01:00 its runs
were in the future. Moving the seed earlier would leave the same dependency.

`readDashboardModel` now accepts a current-time function, defaulting to the
existing wall clock. The test supplies a fixed noon clock shared with its server
readers, derives run and observation timestamps relative to it, and asserts the
exact current-day range. The identical fixture runs with the host Date at
00:10 UTC and 23:50 UTC. Real scheduling timers and database test deadlines remain
unchanged. Only RED-019 fixtures are corrected in this change.

## Audit scope

Literal search of `test/`, including performance and shared fixtures:

```sh
rg --json 'Date\.now\s*\(|new\s+Date\s*\(\s*\)' test --glob '*.ts' --glob '*.tsx' --glob '*.mjs' --glob '*.js'
```

After the RED-019 correction: **90 matching lines in 45 files**. This inventories
JavaScript wall-clock expressions, not SQL defaults or tests outside `test/`.
It is a review list, not a claim that every occurrence causes a flaky assertion.
Injected clocks initially anchored to wall time remain on the list. No other
fixtures were changed.

## Fixture dates and timestamps

These 29 files use wall time for domain records, HTTP/UI fixture values,
retention/range boundaries, notices, receipts or stream snapshots. Some also
contain auth metadata. `dashboard.test.ts` and `key-custody.test.ts` inject a
clock downstream but initialize it from ambient time; that does not make their
fixtures independent of the host clock.

- `test/activity.test.ts` — lines 16, 24, 27, 54.
- `test/aggregate-contributor.test.ts` — lines 23.
- `test/canonicaliser-assignment.test.ts` — lines 16.
- `test/certificate-association.test.ts` — lines 75.
- `test/dashboard-requests.test.tsx` — lines 14, 18, 72.
- `test/dashboard.test.ts` — lines 22, 28.
- `test/engine-registry.test.ts` — lines 63.
- `test/entitlement-read.test.ts` — lines 81.
- `test/entitlements.test.ts` — lines 15.
- `test/evidence-export.test.ts` — lines 15, 79.
- `test/evidence-writer-migration.test.ts` — lines 20.
- `test/evidence.test.ts` — lines 9, 78, 109.
- `test/filing-register.test.ts` — lines 187, 259.
- `test/introspection-job.test.ts` — lines 18, 118.
- `test/introspection-routes.test.ts` — lines 20, 52, 53.
- `test/isolated-tokenization.test.ts` — lines 18.
- `test/key-custody.test.ts` — lines 27, 28, 47, 131.
- `test/performance/activity.test.ts` — lines 10.
- `test/performance/evidence-export.test.ts` — lines 16.
- `test/policy-version.test.ts` — lines 28.
- `test/pools-ui.test.tsx` — lines 15, 23, 33, 38.
- `test/release-custody-availability.test.ts` — lines 13.
- `test/source-registration.test.ts` — lines 68, 69, 169, 186.
- `test/sse-lifecycle.test.ts` — lines 23.
- `test/sse.test.ts` — lines 53, 63, 64, 97, 109.
- `test/temporal-declarations.test.ts` — lines 15.
- `test/tenancy-list-routes.test.ts` — lines 43, 74, 85.
- `test/token-declarations.test.ts` — lines 13.
- `test/type-observation-routes.test.ts` — lines 10, 11, 13.

## Auth/session metadata fixtures

These 11 files supply ambient checked-at, issued-at or expiry values to auth
fixtures. They are included in the audit; their failure risk differs from
current-day aggregation assertions.

- `test/catalog-tree.test.ts` — lines 44, 45.
- `test/company-routes.test.ts` — lines 54.
- `test/fixtures/bulk-entitlements/fixture.ts` — lines 30, 36.
- `test/fixtures/evidence-export/fixture.ts` — lines 13, 17.
- `test/industry-migration.test.ts` — lines 18, 25.
- `test/industry-routes.test.ts` — lines 22.
- `test/observation-groups.test.ts` — lines 26, 28.
- `test/performance/catalog-tree.test.ts` — lines 39, 40.
- `test/project-routes.test.ts` — lines 61, 78, 124, 131.
- `test/project-update-routes.test.ts` — lines 23, 71, 98, 105.
- `test/relationship-suggestions.test.ts` — lines 23, 26.

## Other grep matches

These four files use wall time for polling/deadline/expiry waits or bounds on
recorded timestamps, rather than seeding fixtures:

- `test/mcp-explain.test.ts` — lines 47, 53.
- `test/redis.test.ts` — lines 22, 23.
- `test/release-custody-mcp.test.ts` — lines 42.
- `test/soak-observer-session.test.ts` — lines 35.

`test/mcp-explain.test.ts` bounds a recorded attempt by before/after times;
`release-custody-mcp.test.ts` waits for an issued grant's real expiry. Redis and
soak matches are polling deadlines. Do not replace those with a frozen Date
without preserving their timing assertions.

The remaining file is an intentional negative control:

- `test/fixtures/canonicalisers/clock.ts` — lines 1.

Its nondeterministic canonicalizer must continue to be rejected; removing its
wall-clock dependency would weaken that test.

## Validation

Focused Dashboard validation passed: two files, five tests, including both
RED-019 host-clock cases. The final `npm run check` passed once in 1,461.41 seconds: both typechecks, lint,
production build, 59 route-conformance checks, 219 normal-test files / 1,984 tests,
and the browser/MCP smoke path. Both host-clock cases passed inside the full gate.
The earlier gate failures remain in the [X-07 review record](x07-summary-statement-settings.md).
Raw log and copied result: `tmp/red019-clock/full-gate.log` and `full-gate.json`.
