# S2c parser-interface verification

Verified locally against `@duckdb/node-api` 1.4.3-r.3, reporting engine
`v1.4.3/d1dc88f950`. These findings preceded implementation; the implementation
and verification are recorded in [S2c results](s2c-results.md).
No attack SQL was executed by these probes. SQL was
passed as a bound VARCHAR argument to `json_serialize_sql`; separate probes
used `extractStatements` and its native prepared handles, destroyed without
execution. The preparation probes used external access disabled and configuration
locked.

## Observed coverage

| Form probed | JSON serialization |
|---|---|
| SELECT, WITH, VALUES, object DESCRIBE | Tree returned, rooted at SELECT_NODE |
| SELECT from read_csv; SELECT load_extension(...) | Tree returned; successful serialization does not mean permitted |
| ATTACH, DETACH | `not implemented`; no tree |
| COPY TO, COPY FROM | `not implemented`; no tree |
| INSTALL, LOAD | `not implemented`; no tree |
| Bare PRAGMA, PRAGMA assignment, SET, RESET | `not implemented`; no tree |
| CALL, EXPORT DATABASE | `not implemented`; no tree |
| CREATE VIEW, CREATE MACRO | `not implemented`; no tree |
| PREPARE of a SELECT, EXECUTE | `not implemented`; no tree |
| INSERT, UPDATE, DELETE, DROP TABLE, ALTER TABLE | `not implemented`; no tree |
| Full-width ATTACH; PREPARE of a quoted ATTACH string | Parser error; no tree |
| Dynamic PIVOT from the bypass suite | `not implemented`; no tree |
| Simple UNPIVOT from the bypass suite | Tree returned, rooted at SELECT_NODE with PIVOT table reference |

For the unserializable forms, the serializer reports: `Only SELECT statements
can be serialized to json!`. This is distinct from a parser rejection. The
representative coverage above is not an exhaustive grammar proof.

## What PREPARE proves and does not prove

Parse success plus PREPARE cannot authorize a statement without subset
inspection. Preparation resolves identifiers; it does not establish that an
operation is permitted. Native prepared handles can identify a top-level
statement type, but do not expose the complete syntax tree. The extraction
interface exposes a count and preparation, not an inspectable tree.

Preparation is also too late to serve as an unconditional classification probe:
the COPY TO, COPY FROM and EXPORT probes reached filesystem permission checks
during preparation and were refused by hardening before returning a handle.
No filesystem operation completed. Preparing every statement merely to obtain
its type would therefore rely on hardening before the subset check.

The bare `PRAGMA enable_external_access` additionally fails native extraction
with a missing pragma-function catalogue error; it must not be relabelled as
a syntax error just because extraction rejected it.

## Fail-closed rule and resolved proof requirement

Refusing every unserializable statement is acceptable as a fail-closed security
rule under C.3.1's requirement to refuse constructs the inspector cannot
interpret. It cannot authorize anything. For accepted statements, inspection
of the complete supported tree, preparation in the contained agent session,
and execution of that retained handle are still required.

The approved third category, `serialization_refused`, resolves the original
proof gap: successful parsing, an attempted and failed serialization, and zero
agent prepare/execute calls. The pinned serializer performs parsing before
serialization; its `parser` and `not implemented` results distinguish the
outcomes. Bare PRAGMA is therefore a serialization refusal, not a syntax error.
A serializer error is never recorded as a tree.

The subset check stays explicit after serialization. The named serialized
families are convenient coverage, not permission. A future serialized ATTACH
root is refused by a regression test. A subsequent explicit J-052 decision
changes its original positive-result assertion to the stronger refusal proof:
dynamic PIVOT is `serialization_refused`; serializable UNPIVOT is explicitly
tree-refused. See [the approved attack expectations](../bypass-attacks.md).

The upstream [SQL/JSON interface documentation](https://duckdb.org/docs/stable/data/json/sql_to_and_from_json)
and [C API reference](https://duckdb.org/docs/stable/clients/c/api) describe the
serialization and extraction interfaces; the version-specific findings above
come from the local pinned-engine probes.
