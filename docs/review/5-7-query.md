# Item 5.7 — authenticated query dispatch

The MCP query tool is wired through the existing authenticated transport. Every
request rechecks the key, requires the unverified agent-id header, and reads the
pool's current configuration and compilation. The application runs item 4.5's
refuse-only pre-filter. Referenced sources must pass the current SpiceDB binding
check; compilation supplies only the pool's entitled read plans. The sidecar
receives the original SQL, plans and independent entitlements over pinned mTLS
and performs its own authoritative inspection and execution. There is no
application authorization flag to trust.

The structured result contains native post-treatment column types, rows,
truncation and an evidence id. Withheld, undecided and nonexistent columns have
the distinct I-010/I-011/I-012 refusals. Undecided columns never appear in result
metadata or star projections. Successful-answer text composition is not built:
I-009 remains proved by handwritten item 5.8, as recorded in the plan and test
specification.

## Evidence boundary

`EvidenceWriterPort` is a port, not an implementation of 5.10 or 5.11. Tests use
a marked stub and verify that a returned evidence id identifies its completed
outcome. Opening evidence is required before parsing or execution; completing
its outcome is required before releasing rows. A failed evidence write returns
no result rows.

Production wires `UnavailableEvidenceWriter`, which refuses with
`dependency_unavailable` naming 5.10 and 5.11 before compilation or source work.
Both the service constructor and production startup assert that a test-stub
writer is not installed outside tests. Query therefore remains unavailable in
production until durable evidence lands; no fabricated record substitutes for
it. This is also recorded in `deferred.md`.

## Refusal, cancellation and resource settings

The query path has no result cache or alternate fallback. An unreachable source,
a dead sidecar, an incomplete response or an inconsistent result refuses without
partial rows. The HTTP adapter retains structured sidecar refusal details and
retryability without exposing transport exceptions. MCP cancellation and HTTP
disconnection propagate an abort signal downstream.

Execution settings come from the project, capped by pool overrides and the
caller's optional lower row limit. C.4's per-pool thread count must be configured
in `pool.budgets.threads`; no deployment default is invented. Missing or invalid
limits refuse. The staged path remains the sole sidecar path.

## Bypass closure

J-044 now attacks the real authenticated SQL path with another pool's key. It
receives `not_found`, without confirmation that the object exists elsewhere.
Positive controls execute the same SQL through the entitled key and, after an
explicit grant, through the previously refused key.

J-045 executes successfully, then revokes the named key version and verifies
that the next request in the same session returns HTTP 401 without executing
SQL. A separate rotation/expired-grace case proves expiry too. Malformed,
unknown, revoked and expired keys return the identical authentication envelope
apart from the request id.

The two prerequisite tests and exemptions are replaced by these real attacks.
The gate reports **97 passing checks, zero open exemptions, zero regressions**.
`docs/bypass-attacks.md` is unchanged; no existing attack SQL or refusal property
was weakened. J-055's documented tracker limitation still succeeds intentionally;
J-047 remains the deliberately broken-lock positive control.

The bypass project now uses the functional project's local service setup for
these authenticated attacks; CI already provisions those services before both
projects.

## Verification

The focused MCP, describe, pre-filter and sidecar HTTP checks passed: 125 tests.
K-007 (under two seconds) and K-008 (under fifteen seconds) passed in the isolated
performance project, using real PostgreSQL and mTLS/engine execution with the
explicitly approved evidence stub. Strict typecheck and lint passed. No migration
or screen was added.

Final full functional run: **113 files / 1,186 tests passed**. The cross-source
failure test stages the first source successfully, then fails the second real
connector and asserts that no partial result is returned. The three older
pre-filter assertions were updated to I-010/I-011/I-012's specific refusal codes,
with their SQL unchanged.
