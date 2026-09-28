# S2b bypass results

Run against the pinned DuckDB v1.4.3 (`d1dc88f950`) through the published
session interface. No S2a implementation source was read for this item and no
production code was changed. The accepted ID mapping is in
[s2b-mapping.md](s2b-mapping.md); attack meanings remain in the original list.

This is the historical S2a baseline. Subsequent implementation and the current
attack outcomes are recorded in [S2c results](s2c-results.md).

## Execution result

97 tests: **59 passed, 38 failed, 0 skipped**. No `it.skip`, `it.todo`, expected
failure wrapper, or global timeout increase is used. Failure is intentional
where the product has not yet met the specification; the suite is not green.
All same-statement positive controls and the broken-lock mutation control passed.
Repository typecheck/lint and the suite's separate strict typecheck were run.

## Attacks that succeed

| Canonical ID | Successful operation | Observation |
|---|---|---|
| J-018 | CREATE VIEW over permitted objects | View is created and returns rows |
| J-018 | CREATE MACRO over permitted objects | Macro is created and returns a value |
| J-035 | SUM after singleton predicate | Returns 101 with only one contributing row |
| J-036 | Unaggregated amount | Returns all six raw aggregate-only amounts |
| J-037 | MIN(customer_id) | Returns a token |
| J-038 | ORDER BY customer_id, selected | Returns token-ordered rows |
| J-038 | ORDER BY customer_id, unselected | Returns amounts in token order |
| J-039 | Token LIKE predicate | Returns the matching token-prefix row |
| J-050 | CALL duckdb_settings() | Returns settings |
| J-050 | CALL duckdb_tables() | Returns catalogue rows |
| J-050 | CALL pragma_version() | Returns engine version |
| J-055 | Tracker subtraction — expected success | Two answer sets have 6 and 5 rows; subtracting their sums recovers salary 101 |

The first eleven are prohibited-operation successes, not eleven distinct leaks
of base plaintext. The tracker is intentionally asserted to succeed and is
recorded as a limitation in A.7. No fixes were made.

## Refusals and limits of the result

Hardening refuses file reads/writes, attachment, extension loading, configuration
changes and their working PRAGMA/RESET spellings. Base/staging references,
including CTEs, joins, subqueries, UNION, prepared references, macros, qualified
names and dynamic query functions, cannot reach protected fixture objects.
Metadata, typo and runtime-oracle checks did not expose the fixture's withheld
or undecided names/values. Those checks have positive configurations demonstrating
that the objects and SQL can actually resolve. The memory-pressure probe fails
with out-of-memory and creates no spill files in its isolated working directory.

These are native engine refusals, not the required structured agent errors.
J-048 therefore fails and lists every observed unstructured refusal. Tests with
an explicit `sql_not_permitted` requirement also fail rather than treating the
raw exception as sufficient.

Four specified spellings cannot exercise their claimed operation on this build:
`PREPARE p AS 'ATTACH ...'` (J-010), full-width `ＡＴＴＡＣＨ` (J-043), bare
`PRAGMA enable_external_access` (J-031), and `load_extension()` (J-017).
Their exact probes remain in the suite and fail as **INVALID_PROBE**. Parser
errors or absent functions are not counted as security protection; changing the
attack definitions requires review. Working prepared SELECT, macro, mixed-case
ATTACH, PRAGMA assignment, INSTALL and LOAD variants are exercised separately.

J-044/J-045 explicitly fail on the absence of item 5.7's authenticated SQL path.
The prerequisite checks verify the current published runtime interface before
failing; they do not fabricate a key-to-SQL transport. They must be replaced
with real cross-pool and mid-session expiry/revocation tests when 5.7 lands.

The fixture declares aggregate/token policies but S2a has no input for enforcing
them; current successful treatment attacks expose that missing boundary.
J-040 tests grouping of already-masked fixture rows, not S2e's source-to-staging
transformation. No streaming execution path or staged-data ephemerality proof
is claimed. Fixtures are injected through the public SessionEngine port before
hardening; no inspection or enforcement is added by the harness.

## Complete observation matrix

`CONTROL` identifies a positive or deliberately broken fixture. `NO_LEAK`
means the particular metadata/value attack disclosed none of its protected
fixture content. `REFUSED_RAW` is insufficient for the structured-error
contract. `ATTACK_SUCCEEDED`, `INVALID_PROBE` and `BLOCKED` remain red;
`EXPECTED_SUCCESS` is the documented tracker limitation.

| ID | Variant | Observed outcome |
|---|---|---|
| J-012 | other | REFUSED_RAW |
| J-012 | pg_warehouse | REFUSED_RAW |
| J-012 | postgres scanner | REFUSED_RAW |
| J-016 | read_csv | REFUSED_RAW |
| J-016 | read_parquet | REFUSED_RAW |
| J-016 | read_json | REFUSED_RAW |
| J-016 | read_text | REFUSED_RAW |
| J-016 | read_blob | REFUSED_RAW |
| J-016 | glob | REFUSED_RAW |
| J-016 | passwd | REFUSED_RAW |
| J-027 | bare filename | REFUSED_RAW |
| J-015 | COPY TO | REFUSED_RAW |
| J-017 | INSTALL httpfs | REFUSED_RAW |
| J-017 | LOAD httpfs | REFUSED_RAW |
| J-017 | INSTALL httpfs; LOAD httpfs | REFUSED_RAW |
| J-017 | SELECT load_extension('httpfs') | INVALID_PROBE |
| J-028 | extension inventory | REFUSED_RAW |
| J-028 | glob | REFUSED_RAW |
| J-028 | read_blob | REFUSED_RAW |
| J-028 | read_csv | REFUSED_RAW |
| J-028 | read_json | REFUSED_RAW |
| J-028 | read_parquet | REFUSED_RAW |
| J-028 | read_text | REFUSED_RAW |
| J-014 | enable_external_access | REFUSED_RAW |
| J-029 | lock_configuration | REFUSED_RAW |
| J-030 | temp_directory | REFUSED_RAW |
| J-032 | memory_limit | REFUSED_RAW |
| J-031 | temp_directory | REFUSED_RAW |
| J-051 | temp_directory | REFUSED_RAW |
| J-031 | max_temp_directory_size | REFUSED_RAW |
| J-051 | max_temp_directory_size | REFUSED_RAW |
| J-031 | enable_external_access | REFUSED_RAW |
| J-051 | enable_external_access | REFUSED_RAW |
| J-031 | autoinstall_known_extensions | REFUSED_RAW |
| J-051 | autoinstall_known_extensions | REFUSED_RAW |
| J-031 | autoload_known_extensions | REFUSED_RAW |
| J-051 | autoload_known_extensions | REFUSED_RAW |
| J-031 | allow_unsigned_extensions | REFUSED_RAW |
| J-051 | allow_unsigned_extensions | REFUSED_RAW |
| J-031 | memory_limit | REFUSED_RAW |
| J-051 | memory_limit | REFUSED_RAW |
| J-031 | threads | REFUSED_RAW |
| J-051 | threads | REFUSED_RAW |
| J-031 | lock_configuration | REFUSED_RAW |
| J-051 | lock_configuration | REFUSED_RAW |
| J-031 | bare spelling | INVALID_PROBE |
| J-020 | memory pressure | REFUSED_RAW |
| J-046 | staging | CONTROL |
| J-004 | staging | REFUSED_RAW |
| J-046 | internal alias | CONTROL |
| J-004 | internal alias | REFUSED_RAW |
| J-046 | withheld via base | CONTROL |
| J-005 | withheld via base | REFUSED_RAW |
| J-046 | quoted case | CONTROL |
| J-011 | quoted case | REFUSED_RAW |
| J-046 | CTE | CONTROL |
| J-009 | CTE | REFUSED_RAW |
| J-046 | subquery | CONTROL |
| J-009 | subquery | REFUSED_RAW |
| J-046 | UNION | CONTROL |
| J-009 | UNION | REFUSED_RAW |
| J-046 | join | CONTROL |
| J-009 | join | REFUSED_RAW |
| J-046 | view body | CONTROL |
| J-018 | view body | REFUSED_RAW |
| J-046 | macro body | CONTROL |
| J-010 | macro body | REFUSED_RAW |
| J-046 | prepared reference | CONTROL |
| J-010 | prepared reference | REFUSED_RAW |
| J-046 | dynamic query_table | CONTROL |
| J-056 | dynamic query_table | REFUSED_RAW |
| J-046 | dynamic query | CONTROL |
| J-057 | dynamic query | REFUSED_RAW |
| J-046 | _warehouse | CONTROL |
| J-004 | _warehouse | REFUSED_RAW |
| J-046 | internal_warehouse | CONTROL |
| J-004 | internal_warehouse | REFUSED_RAW |
| J-046 | base_warehouse | CONTROL |
| J-004 | base_warehouse | REFUSED_RAW |
| J-046 | source_warehouse | CONTROL |
| J-004 | source_warehouse | REFUSED_RAW |
| J-006 | SELECT * FROM duckdb_tables() | NO_LEAK |
| J-006 | SELECT * FROM duckdb_columns() | NO_LEAK |
| J-006 | SELECT * FROM duckdb_databases() | NO_LEAK |
| J-006 | SELECT database_name FROM duckdb_databases() | NO_LEAK |
| J-008 | SELECT * FROM duckdb_views() | NO_LEAK |
| J-007 | SELECT * FROM information_schema.tables | NO_LEAK |
| J-007 | SELECT * FROM information_schema.columns | NO_LEAK |
| J-013 | search_path | REFUSED_RAW |
| J-033 | salary | REFUSED_RAW |
| J-034 | undecided_col | REFUSED_RAW |
| J-035 | post-filter singleton | ATTACK_SUCCEEDED |
| J-036 | unaggregated amount | ATTACK_SUCCEEDED |
| J-037 | MIN token | ATTACK_SUCCEEDED |
| J-038 | ORDER token | ATTACK_SUCCEEDED |
| J-038 | ORDER unselected token | ATTACK_SUCCEEDED |
| J-039 | LIKE token | ATTACK_SUCCEEDED |
| J-040 | group mask | NO_LEAK |
| J-018 | permitted view | ATTACK_SUCCEEDED |
| J-018 | permitted macro | ATTACK_SUCCEEDED |
| J-041 | stacked SET | REFUSED_RAW |
| J-042 | commented ATTACH | REFUSED_RAW |
| J-043 | aTtAcH | REFUSED_RAW |
| J-043 | ＡＴＴＡＣＨ | INVALID_PROBE |
| J-044 | prerequisite | BLOCKED |
| J-045 | prerequisite | BLOCKED |
| J-047 | omitted lock | CONTROL |
| J-048 | envelope | MISSING_ENVELOPE |
| J-010 | quoted PREPARE ATTACH | INVALID_PROBE |
| J-049 | COPY FROM | REFUSED_RAW |
| J-049 | COPY FROM passwd | REFUSED_RAW |
| J-050 | CALL duckdb_settings() | ATTACK_SUCCEEDED |
| J-050 | CALL duckdb_tables() | ATTACK_SUCCEEDED |
| J-050 | CALL pragma_version() | ATTACK_SUCCEEDED |
| J-052 | PIVOT records ON transaction_id USING sum(amount) | NO_LEAK |
| J-052 | UNPIVOT records ON id,amount INTO NAME column_name VALUE value | NO_LEAK |
| J-053 | salry | REFUSED_RAW |
| J-054 | runtime oracle | REFUSED_RAW |
| J-055 | tracker subtraction | EXPECTED_SUCCESS |

## Reproduction

```sh
BYPASS_REPORT=/tmp/opintel-bypass-results.json npx vitest run test/bypass/attacks.test.ts
npx tsc --noEmit -p test/bypass/tsconfig.json
```

The first command exits nonzero. The JSON observation report is written even
when assertions fail. Synthetic fixture files are removed at teardown.
