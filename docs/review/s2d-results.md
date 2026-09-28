# S2d authoritative treatment enforcement

`sidecar/sql` now enforces B.4 and B.4a independently on its own DuckDB parse.
The application pre-filter supplies no authorization. Its aggregate-only code
was corrected to `unsupported_on_aggregate_only`, as were B.4 and the explicitly
approved J-035/J-036 code expectations. No attack SQL changed and
`docs/bypass-attacks.md` was not modified.

## Request and binding

Execution and validation take the namespace plus a required treatment policy:
project `aggregateMinGroupSize`, a read plan mapping each staged table's exposed
columns to element IDs, and the entitlement decisions for those IDs. Zod
validates this boundary. Missing/withheld decisions, duplicate declarations and
mismatches with the actual session column inventory refuse. This is the SQL
inspection projection of the trusted read plan; S2e still owns source reads,
transformation and staging.

The sidecar resolves column lineage through aliases, ordinals, joins, CTEs and
subqueries, conservatively refusing ambiguity or unsupported constructs. Its
own treatment check runs before preparation and again after binding. Binding
is proved by the retained prepared handle in the contained session; only that
handle executes. The tests include an application pre-filter accepting a clear
column while the sidecar independently sees aggregate-only and refuses it.

## Two stages

Stage 1 refuses illegal aggregate references and token operations before
preparation. Aggregate arguments must be direct column references. Refusals
name the element and an alternative operation; aggregate refusals also carry
the threshold and stage.

The native estimator uses EXPLAIN, never EXPLAIN ANALYZE, for the supported
single unfiltered base-table group. A supported estimate below the threshold
refuses; one at or below twice the threshold requires Stage 2. Above twice the
threshold, the original statement executes with no count instrumentation.
Grouped, filtered, CTE and join shapes have no supported per-group estimate in
this adapter. They require Stage 2, per the approved uncertain-estimate rule.
It never divides estimated rows by estimated groups to authorize execution.

Stage 2 adds COUNT(*) to the parsed projection, renders and reparses that tree,
repeats subset and treatment inspection, binds and executes the retained
transformed handle. The added alias cannot collide with query identifiers or
staged columns. Counts stay internal. Any returned group's count below the
threshold refuses the entire result; no compliant groups or counts are released.
Successful results carry a threshold/stage snapshot for the eventual run record.
Validation returns that snapshot and whether Stage 2 is required, but never
executes agent SQL and never substitutes for execution-time checks.

Nested protected aggregations and DISTINCT over protected aggregation refuse
explicitly: this implementation does not propagate internal counts through
those transformations. Aggregate FILTER and other unsupported forms also
refuse, rather than lose the cardinality obligation. These restrictions do not
implement S2e staging, resource governance or query transport.

## Verification and bypass results

`test/sql-treatments.test.ts` covers VC-10–VC-14 and VC-23–VC-30 against the real
engine, including skew, post-filter singleton, mixed compliant/noncompliant
groups, uncertain joins, the factor-of-two boundary, threshold changes,
application/sidecar disagreement, and retained-handle execution after rewriting.
VC-24 injects an inaccurate estimate through the engine port while executing
real DuckDB rows; it does not stub the count or refusal.

J-035, J-036, J-037, both J-038 variants and J-039 now refuse. Their six S2d
exceptions were removed from the bypass registry, so recurrence fails CI.
The harness supplies trusted fixture policies. Its Stage 2 proof requires
preparation, execution, a failed count check, handle release and no returned
value; syntax/parser/serialization refusal proofs remain in place.

The full bypass gate reports 94 passing checks, three registered open checks,
and zero regressions. Remaining work:

- J-044/J-045: item 5.7's authenticated query transport.
- J-048's resource envelope for J-020's raw out-of-memory error: S2e.

J-055's tracker subtraction remains the documented expected success: both
queries meet k=5, yet their difference isolates a value. S2d does not claim to
solve that A.7 limitation.
