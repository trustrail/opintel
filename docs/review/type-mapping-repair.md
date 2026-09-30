# PostgreSQL mapping repair

The read-only development audit found one project and 11 entitlements on
unsupported elements, all withheld on bare numeric. No development catalogue
rows or decisions were edited. Re-introspection performs the explicit repair;
the repair regression proves the decision rows remain byte-for-byte unchanged.

Bare numeric and money map to DECIMAL(38,9). The compiler carries a numericDefault
guard into the sidecar contract even when the treatment changes the output type
to VARCHAR. Guarded columns use the cursor path, not the scanner's casts. Scalar
values are fetched through numeric::text; array values through numeric[]::text[]
and JSON, preserving exact decimal strings and dimensions. Exactness is checked
before masking/tokenization and before DuckDB appends. No customer value appears
in a refusal. Money never passes through formatted currency text.

Timestamp/time precision modifiers, name and internal "char" now map to their
existing supported families. Binary/geometry are explicitly excluded. Other
unimplemented types remain unmapped, not retrospectively labelled excluded.
The coverage test enumerates the live pg_catalog built-ins using format_type,
the same function as the connector, with a separate reviewed unmapped inventory.
Composite types are structurally recognised as unresolved; unknown new scalar
built-ins fail the inventory assertion. Array dispositions and every temporal
precision are checked too. Arbitrary future extension names cannot be enumerated;
they receive unmapped.

Single writes previously accepted readable and withheld decisions on unsupported
elements; bulk allowed withholding; rules rejected them. All three now reject
new decisions including withheld. Historical decisions are not deleted. An
unsupported-to-supported transition with unchanged source type is explicitly
reported as mapping_repaired, never family invalidation. Removing an existing
mapping for the same source type refuses publication atomically.

## Verification

- Final affected regression set: **249 tests passed in 13 files** (127.13s).
  This includes the PostgreSQL inventory, exact numeric unit checks, persisted
  repair/refusal, single/bulk/rule validation, catalogue APIs, compiler,
  connector, treatment reader and MCP refusal rendering.
- After adding name/internal-char to the treatment reader's text-mode allowlist,
  the full source-boundary file passed **13 tests** (12.28s), including both new
  types through real PostgreSQL tokenization, numeric/money SUM and AVG, arrays
  and refusal before all four readable treatments.
- Complete bypass inventory: **97 passing checks, zero open checks, zero
  regressions**. No attack was changed.
- Docker visuals: **9 tests passed** (1.0m) at 390/900/1440, with axe and overflow
  checks. The three repair captures were then rerun against the exact API shape
  including sourceType: **3 passed** (22.2s). New narrow money and final narrow
  repair captures, plus the wide repair layout, were visually inspected.
- Existing entitlement/introspection functional UI: **8 passed** (34.1s).
- Strict typecheck, lint, production build and git diff checks passed. Build
  retains the existing bundle-size warning. No new CSS class, migration or
  handwritten database-scope edit was needed. No full-repository test run is
  claimed.

Intermediate failures were a new test using CAST (deliberately prohibited by the
query contract), a new numeric fixture supplying text-only caseInsensitive,
and an existing catalogue assertion receiving unnecessary new null fields on
non-element nodes. Query tests now use supported SUM/AVG syntax, the fixture
uses numeric declarations, and non-element API nodes remain unchanged.

