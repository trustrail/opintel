# S2c subset inspection and binding results

Historical implementation verification follows. Subsequently, the user approved
J-052's stronger refusal expectation: dynamic PIVOT is serialization-refused
and UNPIVOT is explicitly tree-refused. The separate `npm run test:bypass` gate
now reports the remaining owned open checks without treating them as new CI
regressions. See [the current runner policy](../../test/bypass/README.md).

Engine: `v1.4.3/d1dc88f950`, through `@duckdb/node-api` 1.4.3-r.3. The original
[S2b results](s2b-results.md) remain the uninspected baseline. Attack SQL was
preserved. The approved control split and refusal proof categories are recorded
in [the attack specification](../bypass-attacks.md).

## Implementation

`sidecar/sql` now performs authoritative subset inspection in the agent session:
parse, serialize, inspect, check containment, prepare, re-inspect without any
rewrite, execute the retained handle. Prohibited statements never reach agent
preparation or execution. The native adapter parses/serializes via a parameterized
call to DuckDB's own serializer, not a text filter or another parser.

Parsing failures and unsupported serialization return `sql_not_permitted` with
distinct proof categories; neither invents a tree. Subset refusals record a
construct present in the tree. Binding failures follow successful subset
inspection and return a refusal without exposing native spelling suggestions.
The driver separately records the failed binding and absence of execution.

The namespace is explicit trusted input. Containment checks reject unexpected
user objects, foreign catalogues (including empty ones), external databases and
user-defined functions/macros before preparation. Matching uses DuckDB's ASCII
case folding; `Ä` and `ä` are distinct. The source/staging construction remains
S2e. No token, aggregate or mask enforcement was implemented here.

The inspector has an explicit statement-family allowlist, strict shape checks,
recursive traversal and explicit builtin-function allowlists. A future engine
that serializes ATTACH cannot authorize it. Unknown or unimplemented shapes
refuse; supported shapes and limitations are described in
[the SQL interface](../../sidecar/sql/README.md).

## Verification

- S2c: **47 passed, 0 failed**. Includes all J-015–J-018 statement families,
  27 prohibited-query cases asserting no prepare or execute, retained-handle
  execution, binding failures, cleanup, build mismatch, future serialized
  ATTACH, unknown tree fields and namespace contamination.
- S2a construction: **7 passed, 0 failed**, including lock-last and real OOM
  without spill.
- Full bypass suite: **87 passed, 10 failed, 0 skipped**.
- Combined run: **151 total, 141 passed, 10 failed, 0 skipped**.
- Repository strict typecheck, strict test typecheck and repository lint passed.
  No migration, route, screen, global timeout or production treatment change.

The combined command intentionally exits nonzero; the complete suite is not
green. Positive controls and the broken-lock control run against the raw session
and pass. Attacks run against inspected execution. The memory attack also uses
the inspected path and proves it reached execution before the allocation failed.

## Closed subset attacks

All J-015–J-018 variants pass: COPY TO, the external-reader family, INSTALL/LOAD,
load_extension, and CREATE VIEW/MACRO. The added S2c cases cover INSERT, UPDATE,
DELETE, DROP and EXPORT as well. No prohibited preparation/execution occurs.

The C.3-owned attack variants also refuse for ATTACH, deferred PREPARE/EXECUTE,
COPY FROM, CALL, SET/PRAGMA/RESET, multi-statements, comments, keyword case,
full-width ATTACH, bare filenames, query/query_table indirection and references
outside the declared namespace. These are canonical J-004/J-005/J-009–J-018,
J-027–J-034, J-041–J-043, J-049–J-051 and J-056/J-057 as applicable to each
variant. The bare PRAGMA is a serialization refusal; load_extension is now an
actual parsed-tree refusal despite that function being absent from DuckDB.
Full-width ATTACH and quoted-string PREPARE have native parser-failure proof.

The prior successful CREATE VIEW/MACRO and all three CALL attacks are closed.
Metadata and inference probes continue to disclose none of the protected fixture
names/values. Some metadata references refuse instead of returning catalogue
rows; the assertions already permit that. There is no metadata-redaction claim.

## Attacks still succeeding

| ID | Variant | Owner / outcome |
|---|---|---|
| J-035 | Post-filter singleton SUM | S2d; returns 101 |
| J-036 | Unaggregated aggregate-only amount | S2d; returns all six amounts |
| J-037 | MIN of token | S2d; returns a token |
| J-038 | Token ordering, selected | S2d; returns ordered rows |
| J-038 | Token ordering, unselected | S2d; returns amounts in token order |
| J-039 | Token LIKE | S2d; returns a matching row |
| J-055 | Tracker subtraction | Expected success; A.7's limitation remains |

The first six remain failing attack tests. The tracker is a passing test of the
documented limitation. No treatment assertion was weakened or implemented.

## Other remaining failures

- J-044 and J-045 retain explicit failing prerequisites for item 5.7's missing
  authenticated query transport. Neither is skipped or replaced with fake auth.
- J-052's dynamic PIVOT is refused because the pinned serializer cannot represent
  it. This is closed to execution, but the unchanged positive-result assertion
  fails. Simple UNPIVOT passes. The approved blanket serialization-refusal rule
  is not silently overridden to satisfy this assertion.
- J-048's final aggregate assertion still identifies J-020's raw OOM exception.
  J-020 itself passes: the permitted query executes, exceeds its budget and
  creates no spill files. The remaining governed resource-error envelope is
  S2e/C.4. The subset refusal envelope test passes. J-021 cancellation was not
  implemented; it belongs to that resource-governance work.

The proof report contains 106 inspected requests: two parse failures, 46
serialization refusals, 32 subset tree refusals, four binding failures after
permitted inspection, and 22 executed queries. Those executed queries include
legitimate reads and fixture counts, not just attack successes. Raw controls and
the isolated OOM child are not included in those 106 records.

## Reproduction

```sh
BYPASS_REPORT=/tmp/opintel-s2c-findings.json BYPASS_PROOF_REPORT=/tmp/opintel-s2c-proofs.json npx vitest run test/sql-subset.test.ts test/session-construction.test.ts test/bypass/attacks.test.ts
npm run typecheck
npx tsc --noEmit -p test/bypass/tsconfig.json
npm run lint
```

The evidence callbacks and report files are test-only and contain synthetic SQL
and parsed forms. The production adapter does not install a tree/SQL observer
or retain values by default.

## Complete observation matrix

`REFUSED_STRUCTURED` includes the approved parser and serialization categories
as well as tree/binding refusals. It does not imply that every statement had a
tree. `REFUSED_RAW` is the remaining resource-envelope gap; `CONTROL` identifies
the raw positive/mutation controls.

| ID | Variant | Outcome |
|---|---|---|
| J-012 | other | REFUSED_STRUCTURED |
| J-012 | pg_warehouse | REFUSED_STRUCTURED |
| J-012 | postgres scanner | REFUSED_STRUCTURED |
| J-016 | read_csv | REFUSED_STRUCTURED |
| J-016 | read_parquet | REFUSED_STRUCTURED |
| J-016 | read_json | REFUSED_STRUCTURED |
| J-016 | read_text | REFUSED_STRUCTURED |
| J-016 | read_blob | REFUSED_STRUCTURED |
| J-016 | glob | REFUSED_STRUCTURED |
| J-016 | passwd | REFUSED_STRUCTURED |
| J-027 | bare filename | REFUSED_STRUCTURED |
| J-015 | COPY TO | REFUSED_STRUCTURED |
| J-017 | INSTALL httpfs | REFUSED_STRUCTURED |
| J-017 | LOAD httpfs | REFUSED_STRUCTURED |
| J-017 | INSTALL httpfs; LOAD httpfs | REFUSED_STRUCTURED |
| J-017 | SELECT load_extension('httpfs') | REFUSED_STRUCTURED |
| J-028 | extension inventory | REFUSED_STRUCTURED |
| J-028 | glob | REFUSED_STRUCTURED |
| J-028 | read_blob | REFUSED_STRUCTURED |
| J-028 | read_csv | REFUSED_STRUCTURED |
| J-028 | read_json | REFUSED_STRUCTURED |
| J-028 | read_parquet | REFUSED_STRUCTURED |
| J-028 | read_text | REFUSED_STRUCTURED |
| J-014 | enable_external_access | REFUSED_STRUCTURED |
| J-029 | lock_configuration | REFUSED_STRUCTURED |
| J-030 | temp_directory | REFUSED_STRUCTURED |
| J-032 | memory_limit | REFUSED_STRUCTURED |
| J-031 | temp_directory | REFUSED_STRUCTURED |
| J-051 | temp_directory | REFUSED_STRUCTURED |
| J-031 | max_temp_directory_size | REFUSED_STRUCTURED |
| J-051 | max_temp_directory_size | REFUSED_STRUCTURED |
| J-031 | enable_external_access | REFUSED_STRUCTURED |
| J-051 | enable_external_access | REFUSED_STRUCTURED |
| J-031 | autoinstall_known_extensions | REFUSED_STRUCTURED |
| J-051 | autoinstall_known_extensions | REFUSED_STRUCTURED |
| J-031 | autoload_known_extensions | REFUSED_STRUCTURED |
| J-051 | autoload_known_extensions | REFUSED_STRUCTURED |
| J-031 | allow_unsigned_extensions | REFUSED_STRUCTURED |
| J-051 | allow_unsigned_extensions | REFUSED_STRUCTURED |
| J-031 | memory_limit | REFUSED_STRUCTURED |
| J-051 | memory_limit | REFUSED_STRUCTURED |
| J-031 | threads | REFUSED_STRUCTURED |
| J-051 | threads | REFUSED_STRUCTURED |
| J-031 | lock_configuration | REFUSED_STRUCTURED |
| J-051 | lock_configuration | REFUSED_STRUCTURED |
| J-031 | bare spelling | REFUSED_STRUCTURED |
| J-020 | memory pressure | REFUSED_RAW |
| J-046 | staging | CONTROL |
| J-004 | staging | REFUSED_STRUCTURED |
| J-046 | internal alias | CONTROL |
| J-004 | internal alias | REFUSED_STRUCTURED |
| J-046 | withheld via base | CONTROL |
| J-005 | withheld via base | REFUSED_STRUCTURED |
| J-046 | quoted case | CONTROL |
| J-011 | quoted case | REFUSED_STRUCTURED |
| J-046 | CTE | CONTROL |
| J-009 | CTE | REFUSED_STRUCTURED |
| J-046 | subquery | CONTROL |
| J-009 | subquery | REFUSED_STRUCTURED |
| J-046 | UNION | CONTROL |
| J-009 | UNION | REFUSED_STRUCTURED |
| J-046 | join | CONTROL |
| J-009 | join | REFUSED_STRUCTURED |
| J-046 | view body | CONTROL |
| J-018 | view body | REFUSED_STRUCTURED |
| J-046 | macro body | CONTROL |
| J-010 | macro body | REFUSED_STRUCTURED |
| J-046 | prepared reference | CONTROL |
| J-010 | prepared reference | REFUSED_STRUCTURED |
| J-046 | dynamic query_table | CONTROL |
| J-056 | dynamic query_table | REFUSED_STRUCTURED |
| J-046 | dynamic query | CONTROL |
| J-057 | dynamic query | REFUSED_STRUCTURED |
| J-046 | _warehouse | CONTROL |
| J-004 | _warehouse | REFUSED_STRUCTURED |
| J-046 | internal_warehouse | CONTROL |
| J-004 | internal_warehouse | REFUSED_STRUCTURED |
| J-046 | base_warehouse | CONTROL |
| J-004 | base_warehouse | REFUSED_STRUCTURED |
| J-046 | source_warehouse | CONTROL |
| J-004 | source_warehouse | REFUSED_STRUCTURED |
| J-006 | SELECT * FROM duckdb_tables() | NO_LEAK |
| J-006 | SELECT * FROM duckdb_columns() | NO_LEAK |
| J-006 | SELECT * FROM duckdb_databases() | NO_LEAK |
| J-006 | SELECT database_name FROM duckdb_databases() | NO_LEAK |
| J-008 | SELECT * FROM duckdb_views() | NO_LEAK |
| J-007 | SELECT * FROM information_schema.tables | REFUSED_STRUCTURED |
| J-007 | SELECT * FROM information_schema.columns | REFUSED_STRUCTURED |
| J-013 | search_path | REFUSED_STRUCTURED |
| J-033 | salary | REFUSED_STRUCTURED |
| J-034 | undecided_col | REFUSED_STRUCTURED |
| J-035 | post-filter singleton | ATTACK_SUCCEEDED |
| J-036 | unaggregated amount | ATTACK_SUCCEEDED |
| J-037 | MIN token | ATTACK_SUCCEEDED |
| J-038 | ORDER token | ATTACK_SUCCEEDED |
| J-038 | ORDER unselected token | ATTACK_SUCCEEDED |
| J-039 | LIKE token | ATTACK_SUCCEEDED |
| J-040 | group mask | NO_LEAK |
| J-018 | permitted view | REFUSED_STRUCTURED |
| J-018 | permitted macro | REFUSED_STRUCTURED |
| J-041 | stacked SET | REFUSED_STRUCTURED |
| J-042 | commented ATTACH | REFUSED_STRUCTURED |
| J-043 | aTtAcH | REFUSED_STRUCTURED |
| J-043 | ＡＴＴＡＣＨ | REFUSED_STRUCTURED |
| J-044 | prerequisite | BLOCKED |
| J-045 | prerequisite | BLOCKED |
| J-047 | omitted lock | CONTROL |
| J-048 | envelope | REFUSED_STRUCTURED |
| J-010 | quoted PREPARE ATTACH | REFUSED_STRUCTURED |
| J-049 | COPY FROM | REFUSED_STRUCTURED |
| J-049 | COPY FROM passwd | REFUSED_STRUCTURED |
| J-050 | CALL duckdb_settings() | REFUSED_STRUCTURED |
| J-050 | CALL duckdb_tables() | REFUSED_STRUCTURED |
| J-050 | CALL pragma_version() | REFUSED_STRUCTURED |
| J-052 | PIVOT records ON transaction_id USING sum(amount) | REFUSED_STRUCTURED |
| J-052 | UNPIVOT records ON id,amount INTO NAME column_name VALUE value | NO_LEAK |
| J-053 | salry | REFUSED_STRUCTURED |
| J-054 | runtime oracle | REFUSED_STRUCTURED |
| J-055 | tracker subtraction | EXPECTED_SUCCESS |
