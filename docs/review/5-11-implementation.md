# Item 5.11 implementation

Production query dispatch uses `PostgresEvidenceWriter`. Source-free preparation
captures the plan and configuration; the header transaction commits before any
source estimation or reads. A second transaction appends stages, element facts
and completion before the query releases rows. An unsuccessful open prevents
source work. An unsuccessful completion leaves an incomplete header and releases
no answer. Transport loss without trustworthy execution facts also leaves the
run incomplete instead of claiming no tokenization occurred.

The record retains policy, effective vocabulary and catalogue versions,
per-element treatment, withheld/undecided state and reasons, source freshness,
landing strategy and origin. Synthetic provenance is derived from the sources
reached, not the project or all bound sources. Stages retain execution path,
engine version, aggregate inspection facts and refusal reasons. Results and
credentials are not supplied to the writer.

The approved key-version distinction is implemented in §4.6:

- Header `versions.tokenKeyVersionSelected` names the pinned key when the plan
  contains tokenized elements. A tokenized plan without an available key cannot
  open its record or execute.
- Completion `tokenKeyVersionUsed` names the key only when a non-null token was
  produced. Empty/all-null input and failures before tokenization leave it null.
- Every source resolves the selected retained key version, so rotation cannot
  mix keys within a run. Database insert guards require used = selected when
  used is present, and require a selected version for tokenized element rows.

Migration 047 adds `project.catalog_generation`, advanced once per transaction
by triggers on catalogue objects, elements and schema temporal declarations.
The trigger uses the same database-owned transaction marker as policy version.
The compilation reader checks versions around its snapshot without nesting
connection scopes. Completion uses the exact database start timestamp, retaining
microseconds required by the partitioned foreign keys.

Migration 047 preserves historical stamps without updating evidence rows. Its
downgrade removes the new counter and token guards/column but leaves the widened
stamp check, so immutable headers written with the new names need no rewrite.

The production unavailable adapter and its item-number refusal are removed.
The startup assertion against test writers outside tests remains. Explain stays
source-free and does not require the evidence writer. No retention job, activity
screen, export or prompt pipeline was introduced.

## Verification

The durable writer tests exercise authenticated MCP and the real mTLS sidecar:
M-002 deliveries, M-011 refusal reasons, M-012 reductions, ING-24 persisted
landing strategy, TOK-30 persisted selected/used keys, rotation between sources,
selected-but-unused failures, failures after token production, and both evidence
gates. Database tests cover transaction-coalesced catalogue generation, rollback,
selected/used constraints and migration down/up twice.


- Full `npm test`: 122 files, 1,293 tests passed (372.65 seconds).
- Final focused run after the additional edge cases and snapshot-reader update:
  9 files, 86 tests passed (75.78 seconds), covering evidence writer/domain/schema,
  migration, key custody, MCP query/explain and staged execution/source reads.
- Unchanged `npm run test:bypass`: 97 passing checks, zero registered open checks,
  zero regressions. No attack or exemption was changed.
- Strict typecheck, lint including module boundaries, generated sidecar OpenAPI,
  and `git diff --check` passed.
- Migration 047 was applied only to the isolated test database. Its rollback-only
  down/up test passes twice. No development database migration was run.
