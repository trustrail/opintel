# S2c/S2d inspected execution

`InspectedSessionExecutor.execute(sql, limits, namespace, policy)` returns
`Result<InspectedRows, DomainError>`; successful rows include
`queryEngineVersion` and a treatment-evidence snapshot. The namespace is trusted pool configuration with a
default catalogue/schema and exact owned three-part names. It is not supplied
by the agent. This module adds no HTTP route or staging. The required policy supplies the
project threshold, a read plan of staged objects and exposed columns mapped to
element IDs, and the entitlement decisions for those IDs. Missing policy is a
refusal. Column inventory must agree with the read plan.

After S2a's session construction and hardening, the executor:

1. Verifies `v1.4.3/d1dc88f950` in the agent connection.
2. Invokes `json_serialize_sql` with the agent text as a VARCHAR parameter.
   The pinned engine function parses first, then serializes. Its returned
   error type distinguishes parser rejection from unsupported serialization.
3. Inspects the supported JSON shapes recursively, including CTEs, subqueries,
   joins, set operations, predicates, expressions and modifiers. An explicit
   statement-family allowlist remains necessary; unknown nodes/fields refuse.
4. Verifies that user objects belong to the namespace and that no external
   database or user-defined function is present. Identifier matching uses
   DuckDB's ASCII-only case folding. Only then does PREPARE prove resolution.
   Native binding suggestions are not returned to the caller.
5. Re-inspects the unchanged tree after binding and executes the retained
   native handle. No text execution or rewriting follows. The handle and both
   sessions close on success and failure.

SELECT, WITH, VALUES and DESCRIBE are supported named families. Expression
functions have an explicit builtin allowlist; unknown functions, external
readers and dynamic query functions refuse. Pure series generators and
engine-owned catalogue metadata functions have explicit entries. Qualified
functions and user macros are not permitted. Unsupported window operations, recursive
CTEs, casts and other unimplemented shapes refuse rather than receive partial
inspection. Dynamic PIVOT cannot be serialized by this engine and refuses.
UNPIVOT serializes as a PIVOT table reference and is explicitly refused by the
subset check. The approved J-052 assertions prove refusal, not filtered output;
a future change in serialization coverage requires revisiting that proof.

SQL refusals use `sql_not_permitted` with proof categories `parse_failed`,
`serialization_refused`, or `sql_not_permitted`. An inspected statement whose
identifiers do not bind records `binding_failed` and never executes.
The S2e resource boundary maps memory exhaustion to `budget_exceeded` and
other engine failures to a fixed `dependency_unavailable` envelope, after
cleanup. Native diagnostic text is not returned. These are not identifier
refusals; the raw S2a control seam still throws native errors.

Optional `InspectionObserver` callbacks record driver outcomes and inspector
decisions for tests. They are not telemetry: trees contain SQL literals. No
callback, SQL/tree log or row log is installed by default. The serializer's
internal stages are evidenced by its returned engine result, not invented
trees or a second parser. “No prepare/execute” refers to agent SQL; trusted
hardening, version, serializer and catalogue queries still run internally.

The raw `TwoSessionExecutor` remains for S2a and the approved J-046/J-047
controls. It is not an authorization path. S2d enforces treatments, S2e supplies
staging and resource governance, and 5.7 supplies authenticated query transport.


Treatment and cardinality checks run independently of the application. See
[the S2d report](../../docs/review/s2d-results.md) for the supported estimate
path, uncertain-estimate fallback, tree/count transformation, whole-result
refusal and conservative handling of nested protected aggregations.

`validate(sql, limits, namespace, policy)` performs the same structural,
treatment and binding checks without executing agent SQL. Its evidence snapshot
states whether Stage 2 remains necessary. It grants no reusable permission;
`execute` repeats the checks and returns no rows before required counts pass.
Neither method opens a source connection; staging remains S2e.
