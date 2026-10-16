# Gate follow-ups
Version: 1.0 — 2026-10-16

Status: scheduled backlog; neither follow-up is implemented in this change. Scheduling here establishes the next work, not a delivery date.

## Domain/integration runtime: scope before implementation

The voided run spent 1,267.36 seconds in the domain command: 1,837 tests passed and two failed because local executable paths were missing. Its roughly 0.69 seconds per passing test is an average, not evidence that database setup alone dominates. Vitest reported 1,058.09 seconds in tests (including hooks), 114.91 seconds importing, 10.87 seconds transforming and 1.14 seconds in setup. Measure hook/reset, migration, service startup and body costs separately before selecting an optimization.

The target is under 300 seconds without reducing assertions or changing isolation. It requires more than a 4.2× end-to-end improvement. Four workers alone cannot meet it even with ideal scaling (1,267 / 4 = 317 seconds). Estimates below are engineering effort, not commitments or demonstrated speedups.

| Option | Work and constraints | Estimated effort |
|---|---|---|
| Profile first | Attribute each file's imports, database reset/seed hooks, Engine/provider setup and test body; identify serial tail and memory/CPU pressure. Preserve deterministic ordering and deadlines. | 0.5–1 day |
| Fixture reuse | Reuse immutable vocabulary/schema setup and safe service bootstrap; reset mutable tenant decisions, grants and evidence between tests. Benchmark whether existing per-test industry seed SQL and TRUNCATE CASCADE are material. Never share mutable evidence or leak tenants. | 2–4 days |
| Rollback transactions | Use only for tests whose work stays on the same connection and does not depend on commit visibility. HTTP/MCP, Engine, outbox, concurrency, migrations and independent scoped connections cannot be isolated by wrapping the caller in a transaction. Do not change the tenant-scope implementation. | 1–3 days for eligible tests; limited coverage |
| Parallel isolated workers | Provision a separate test database and SpiceDB namespace/instance per worker; separate fixture bindings, locks and service ports. Keep migration/DDL/exclusive tests serial and deterministic ordering within shards. Preserve database-runner abort/drain ownership and all isolation proofs. Trial 6–8 workers only after resource measurement; extra databases, containers and memory are the CI cost. Merely enabling fileParallelism on today's shared database is unsafe. | 5–10 days plus CI capacity |

Recommendation: profile, remove repeated immutable setup, then evaluate isolated workers against the remaining serial tail. A five-minute result is a measurement to earn, not a promise based on average test duration. Existing `vitest.config.ts`, `test/database-fixture.ts`, `scripts/testing/database-runner.ts`, `scripts/testing/normal-environment.ts` and deterministic sequencer remain unchanged.

## Conformance authentication coverage

Defect class: **a route reachable without authentication**. Real example: `/dev/kitchen-sink`; also check `/dev/shared-patterns`. Today's 54-route sweep checks control classification, disclosure semantics, mark placement, breadcrumb navigation and route-visit completeness, not AuthGuard coverage. These review routes bypass AuthGuard and therefore demonstrate the missing assertion even though their controls conform. Normal production's artifact exclusion is a separate protection.

Scheduled work: add a router-derived authentication assertion with an explicitly declared public-route inventory and fresh anonymous browser context. Protected routes must redirect to sign-in or refuse before protected content or actions become available. Include an unguarded-route positive counterexample that fails, and authenticated controls that pass. Verify review routes in browser-test mode as well as their absence from normal production; do not silently exempt the known counterexample. Determine the required review-route protection explicitly before changing application behavior. Keep the current conformance assertions intact.

Estimated effort: 1–2 days for inventory, assertion, counterexample and build-mode coverage, excluding any separately required application behavior decision. No assertion or route behavior is changed here.

## Change ledger
| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1.0 | 2026-10-16 | Schedule runtime profiling/optimization options and authentication coverage with costs and acceptance criteria. | None; both follow-ups remain unimplemented. |
