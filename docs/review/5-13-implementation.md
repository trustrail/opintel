# Item 5.13 implementation

Exports use an idempotent descriptor and an authenticated signed download URL.
There is no stored export file. Creation records the format, filters, owner and
creation bound; status returns a fifteen-minute link. Download requires the
creating user and current project export permission. Signatures bind the export,
project, user and expiry. Reusing an Idempotency-Key replays the descriptor for
24 hours; changing its body returns 409. Expired receipts can create a new
descriptor without rewriting the old one.

The stream reads descending timestamp/id keyset pages of at most 100 records,
with tenant RLS active in each database transaction. It applies the same argument
redaction as Activity, including parsed SQL literal stripping, and rechecks
export permission and redaction at page boundaries. Both formats omit arguments
without view_unredacted. CSV has one row per run, JSON in nested cells, standard
quote/newline escaping and a leading apostrophe for formula-like text. NDJSON
has one typed object per line. Zod schemas also describe the OpenAPI contract and
typed creation/status client.

Known demo-touching runs are excluded using their stored completion flag, not
current source or project state. Null-ID derived deliveries and declarations are
excluded; withheld/undecided refusal facts remain. Incomplete headers are included
with status incomplete, synthetic null and demoProvenance unknown. Omitting a
question that was asked would erase an audit fact and create a discrepancy with
Activity. Unknown must neither become an assertion of no demo contact nor be
treated as known demo contact. This approved distinction is recorded in §4.6.

The HTTP download transport awaits drain rather than buffering ahead or dropping
a slow reader. Disconnects abort iteration and stop subsequent database pages.
A failure before output uses the error envelope; a failure after output destroys
the transfer, so a partial artifact does not look successfully complete. SSE's
existing separate transport is unchanged.

Migration 049 adds owner/project-scoped descriptors and idempotency receipts.
The application cannot update or delete descriptors. No existing evidence is
changed. No UI, stored redaction, retention job or export file store was added.
§2.5 records the endpoint and wire details, including the live completion read
and descriptor's header-time upper bound.

Policy review narrowed tenant_write to FOR INSERT on both export tables, matching
the immutable evidence tables. Idempotency receipts additionally have a separate
tenant_update FOR UPDATE policy because reuse after expiry updates the receipt;
they are mutable request metadata, not immutable run evidence. Every policy keeps
both project and actor predicates. Application grants remain SELECT/INSERT on
descriptors and SELECT/INSERT/UPDATE on receipts, with no DELETE on either.
The administrative role retains broader export-table grants (including UPDATE
and DELETE), unlike its SELECT/INSERT/TRUNCATE grants on immutable run evidence.
The initial policy-name fix's FOR ALL matched mutable tenant tables, but was too
broad a description of the repository convention: immutable evidence uses
FOR INSERT, and RLS-10 checks names rather than policy commands.

## Verification

- M-009/M-010 and redaction tests exercise real HTTP and scoped PostgreSQL:
  all filters, demo exclusion despite mixed prepared sources, incomplete
  provenance, derived exclusion, refusal facts, current redaction, signatures,
  ownership, expiry, concurrent idempotent creation and expired receipt reuse.
- Streaming tests check a paused consumer, cancellation, page-boundary permission
  and redaction changes, and transfer failure after a producer error.
- M-008 exports 100,000 real database headers in each format without accumulating
  the response. Each database page has at most 100 records. Live retained heap
  growth remains below 16 MiB, sampled every 10,000 rows with test-only garbage
  collection. Production never calls GC. Early probes measured 83–88 MiB of
  uncollected temporary allocation growth; the retained-memory check distinguishes
  that from retaining the export. Per-record schema compilation and unnecessary
  legacy-stamp validation were also removed from the shared detail reader.
- Migration down/up is exercised twice in a rollback-only transaction; table
  grants are declared explicitly. Migration 049 was applied only to the isolated
  test database, not the development database.
- Full regression run: 128 files, 1,313 tests; 1,312 passed and RLS-10 failed
  because the new policies were named owner_scope rather than the repository's
  required tenant_read/tenant_write pair (439.31 seconds). Migration 049 was
  corrected without weakening either the project or actor condition, then
  reverted and reapplied in the isolated test database.
- Final focused run after that correction: seven files, 36 tests passed
  (14.41 seconds), covering exports, migration, Activity, HTTP transport, all
  row-level-security checks and table grants. The full suite was not repeated
  after this targeted migration correction.
- Strict typecheck, lint including boundaries, production build and
  `git diff --check` passed. The build retains its bundle-size warning. No
  frontend markup or CSS changed, so no new screen snapshots were required.
- Final isolated M-008 run: one test passed (47.95 seconds), exporting all
  100,000 records as NDJSON and again as CSV, checking the 100-record page bound
  and less than 16 MiB retained-heap growth for each format.
- Final export-only run, including expiry of a valid signed URL: six tests
  passed (6.07 seconds).
- Follow-up policy-command correction: four files, 18 tests passed (23.56
  seconds), covering exports, migration down/up twice, RLS and table grants.
  The migration regression now checks the exact policy commands and project/actor
  predicates; export tests verify expired receipt reuse still works. Migration
  049 was reverted and reapplied only in the isolated test database. The full
  suite was not repeated for this correction.

## Applied-history correction

The policy correction is now delivered by forward migration **053**, not by
rewriting 049. 049 has been restored to the exact checksum in the development
ledger. Earlier verification statements about isolated reapplication did not
prove compatibility with databases already on original 049; that missing upgrade
test allowed the checksum break to escape. See
[the correction report](049-migration-correction.md) for the verified chronology,
checksums, forward repair and upgrade regression.
