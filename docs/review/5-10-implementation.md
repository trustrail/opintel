# Item 5.10 implementation

The evidence aggregate is an immutable snapshot of a request header, stages,
element deliveries and an optional completion. Its version stamp belongs to the
header, so later policy changes do not change the recorded decisions. A header
without completion decodes as incomplete; a missing header remains missing.

Migration 046 separates the immutable header from the single append-only
completion. Element state distinguishes withheld from undecided; the database
requires treatment to be null if and only if either state applies. Completion
preserves the complete tagged outcome rather than just its name. These approved
schema changes and their reasons are documented in §4.6 and reflected in §1.2
and §1.7.

The application has SELECT and INSERT, with no UPDATE, DELETE or TRUNCATE, on
every evidence table and monthly partition. Forced RLS binds child records to a
visible header. Completion seals subsequent stage/element appends. Historical
element identifiers survive catalogue removal, and evidence foreign keys never
cascade deletion. The owner-only partition helper provisions matching UTC
start-month partitions with the same grants and RLS; migration bootstrap covers
the previous, current and next months. Later provisioning and retention jobs
remain operational responsibilities and item 5.17 respectively.

This item contains no production record writer, pipeline integration, route or
screen. Scoped SQL in the tests is fixture construction for M-001–M-006; record
writing remains item 5.11.

## Verification

- M-001–M-006 cover unique header/completion identity, incomplete reads, all
  delivered treatments, withheld/undecided state, actual UPDATE/DELETE rejection,
  and captured policy versions across a committed entitlement change.
- Additional coverage checks direct partition grants and tenant isolation,
  start-month routing across a UTC boundary, malformed records, completed-run
  immutability, and owner-only partition creation.
- The migration test runs down/up twice in a rollback-only transaction and
  verifies partition boundaries, forced RLS and append-only grants.
- Final focused run: `npx vitest run test/evidence.test.ts
  test/evidence-domain.test.ts test/evidence-migration.test.ts
  test/table-grants.test.ts test/row-level-security.test.ts
  test/policy-version.test.ts` — 6 files, 36 tests passed (26.21 seconds).
- Full `npm test` — 120 files, 1,284 tests passed (356.87 seconds). Both runs
  used the isolated test database; migration 046 was applied there, not to the
  development database.
- Strict `npm run typecheck`, `npm run lint` (including module boundaries),
  and `git diff --check` passed. No routes, external calls, screens or CSS changed.
