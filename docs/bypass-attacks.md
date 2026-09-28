# The bypass suite: attack list

Every attack below is run as agent SQL against the agent session, and **every
one must fail**. A test that asserts an attack was refused with the wrong
error, or that asserts refusal while the session never reached the dangerous
state, proves nothing: each attack states the property it tests and how the
test confirms the attack was genuinely attempted.

Attacks marked **fail-open** are the ones where a wrong implementation
returns data rather than an error. Those are the ones that matter.

## A. Reaching outside the session

| ID | Attack | Property | Expected |
|---|---|---|---|
| J-001 | `ATTACH 'other.db'` | No new catalog can enter the session | `sql_not_permitted`, naming `ATTACH` |
| J-002 | `ATTACH 'postgres://…' (TYPE postgres)` | Nor by extension-backed scanner | `sql_not_permitted` |
| J-003 | `SELECT * FROM read_csv('/etc/passwd')` | No file reads | `sql_not_permitted`, naming the function |
| J-004 | `read_parquet`, `read_json`, `read_text`, `glob`, `read_blob` | The whole family, not just the common three | Each refused by name |
| J-005 | `COPY (SELECT 1) TO '/tmp/x.csv'` | No writes to disk | `sql_not_permitted` |
| J-006 | `SELECT * FROM 'data.csv'` | The bare-filename shorthand is a file read | `sql_not_permitted` |
| J-007 | `INSTALL httpfs; LOAD httpfs;` | No extension loading | `sql_not_permitted` |
| J-008 | `SELECT * FROM duckdb_extensions()` then call anything it lists | Nothing already loaded provides a file or network route | Refused, or the function is absent |

## B. Undoing the hardening

| ID | Attack | Property | Expected |
|---|---|---|---|
| J-009 | `SET enable_external_access = true` | The lock holds | Refused by DuckDB itself, and by the subset check |
| J-010 | `SET lock_configuration = false` | The lock cannot unlock itself | Refused |
| J-011 | `SET temp_directory = '/tmp'` | No spill directory can be reinstated | Refused |
| J-012 | `PRAGMA enable_external_access` and the `PRAGMA` spelling of every setting above | `PRAGMA` is a second route to `SET` | Each refused |
| J-013 | `SET memory_limit = '64GB'` | An agent cannot raise its own budget | Refused |
| J-014 | A query designed to exceed `memory_limit` | Exceeding fails; it does not spill to disk | Fails with an out-of-memory error, and the temp directory stays empty |

## C. Reaching the base data

These are the **fail-open** ones. A wrong implementation answers them.

| ID | Attack | Property | Expected |
|---|---|---|---|
| J-015 | `SELECT * FROM __staging.warehouse__public__orders` | The staging schema is not addressable by the agent | `object_unavailable` or not-found, never rows |
| J-016 | `SELECT * FROM <internal alias>.public.orders`, trying each plausible alias | No internal alias exists in this catalog | Not found |
| J-017 | `SELECT * FROM duckdb_tables()`, `duckdb_views()`, `duckdb_databases()`, `duckdb_columns()` | The catalogue functions expose only the pool's own objects | Rows contain no staging name, no internal alias, no withheld or undecided column |
| J-018 | `SELECT database_name FROM duckdb_databases()` | The agent cannot enumerate attached databases | Only the agent's own |
| J-019 | `WITH x AS (SELECT * FROM __staging.…) SELECT * FROM x` | A CTE is not a way around resolution | Refused |
| J-020 | `CREATE VIEW v AS SELECT * FROM __staging.…` then `SELECT * FROM v` | A view definition is not a way around resolution | `CREATE` refused |
| J-021 | `SELECT * FROM pool.schema.object AS a JOIN __staging.… AS b ON true` | One permitted reference does not license another | Refused |
| J-022 | A withheld column named directly: `SELECT salary FROM records` | Withheld columns are absent from the view | Column not found, and the error does not confirm the column exists |
| J-023 | An undecided column named directly | Undecided columns are absent, and the error is distinguishable from withheld only at the resolver | Not found; the agent-facing error says nothing about why |

## D. Defeating the treatments

| ID | Attack | Property | Expected |
|---|---|---|---|
| J-024 | `SELECT SUM(amount) FROM t WHERE transaction_id = 'x'` on an aggregate-only column | Post-filter cardinality, not group definition | Refused, per B.4 stage 1 or 2 |
| J-025 | `SELECT amount FROM t` on an aggregate-only column | No unaggregated read | Refused |
| J-026 | `SELECT MIN(customer_id) FROM t` on a tokenized column | Tokens preserve equality only | `unsupported_on_token` |
| J-027 | `SELECT * FROM t ORDER BY customer_id` on a tokenized column | Ordering is refused even when the column is not selected | `unsupported_on_token` |
| J-028 | `SELECT * FROM t WHERE customer_id LIKE 'v1_c_A%'` | A token prefix means nothing | `unsupported_on_token` |
| J-029 | A masked column reconstructed by grouping: `SELECT card_number, COUNT(*) FROM t GROUP BY 1` | Masking is applied before staging, so the grouped value is the mask | Rows contain masks, never the source value |

## E. Crossing the boundary sideways

| ID | Attack | Property | Expected |
|---|---|---|---|
| J-030 | Two statements in one request: `SELECT 1; SET enable_external_access = true` | Multi-statement requests are refused or each statement is inspected | Refused |
| J-031 | A comment or unusual whitespace hiding a refused construct: `SELECT/*x*/1; /*…*/ATTACH…` | Inspection is on the parsed statement, not the text | Refused |
| J-032 | Unicode or case variation of a refused keyword: `aTtAcH`, full-width characters | Keyword matching is not textual | Refused |
| J-033 | A pool's key used against another pool's objects | A key authorises one pool | Not found, and the error does not confirm the object exists elsewhere |
| J-034 | An expired or revoked key mid-session | Authorisation is per request, not per session | Refused on the next request |

## F. What the suite must also prove about itself

These are not attacks. They are the checks that stop the suite passing
vacuously.

**Execution boundary (S2c decision).** The positive controls (canonical J-046)
and broken-lock control (canonical J-047) run against the raw session. They
prove the session's behaviour, not the inspector's: inspection would refuse
CREATE even in a positive fixture, and SET even with the lock omitted. The
attacks run through the inspected path. These canonical IDs are mapped from
this document's provisional IDs in [the accepted mapping](review/s2b-mapping.md).

Every refused attack must prove that an engine parse was attempted. Merely
reaching an inspection entry point is insufficient: a text-based refusal before
parsing would satisfy that weaker check. There are three proof categories:

- **`parse_failed`:** the engine could not parse the text. Record the parse
  attempt and returned error, and assert that no agent statement was prepared
  or executed. There is no tree to inspect. Full-width `ＡＴＴＡＣＨ` and
  `PREPARE p AS 'ATTACH ...'` belong here; do not fabricate a parsed form.
- **`sql_not_permitted`:** the statement parsed and inspection of its tree
  refused it. Record the parsed form and assert that the refusal names a
  construct found in that tree.
- **`serialization_refused`:** parsing succeeded, serialization was attempted
  and failed, and no agent statement was prepared or executed. Record those
  outcomes and assert that no prepare or execute call was made. This is neither
  a parser failure nor a tree-inspection refusal; no tree can be required here.

Accepted statements still require explicit tree inspection, binding and
execution of the retained prepared handle. No prohibited statement may reach
prepare or execute. Serialization success must never replace the subset check.
Construct-name matching applies to tree refusals. Parser and serialization
refusals have engine failure evidence instead; never infer a construct from the
raw text. A tree that passes the subset check can still fail PREPARE's binding
proof; retain the passed inspection and failed binding evidence and assert that
execution did not occur.

An attack refused without a parse attempt remains a failure. Attack SQL and
refusal assertions otherwise remain unchanged.

| ID | Check | Why |
|---|---|---|
| J-035 | Each attack in group C is run against a session **with** the object present and entitled, and returns rows | Proves the refusals in C are refusals, not the object being absent for an unrelated reason |
| J-036 | A deliberately broken hardening configuration makes at least one attack in group B succeed | Proves group B tests the hardening rather than DuckDB's defaults |
| J-037 | Every attack's refusal names a code from the error envelope, not a raw engine message | An agent must be able to act on the refusal |

## G. Deferred execution and alternate spellings

Each of these separates a prohibited operation from the statement that
appears to be running, or spells it a second way. An inspector that checks
only the immediate statement, or matches one spelling, passes them.

| ID | Attack | Property | Expected |
|---|---|---|---|
| J-038 | `PREPARE p AS 'ATTACH ...'; EXECUTE p` | Deferred execution is inspected, not only the `EXECUTE` | Refused at prepare or at execute |
| J-039 | `CREATE MACRO m() AS (SELECT * FROM __staging....); SELECT m()` | A macro body cannot hide a prohibited reference | `CREATE` refused |
| J-040 | `COPY t FROM '/etc/passwd'` | File reads are blocked in every syntax form, not only `COPY TO` | `sql_not_permitted` |
| J-041 | `SELECT load_extension('httpfs')` | The function form of `LOAD` is blocked | `sql_not_permitted` |
| J-042 | `CALL duckdb_settings()`, and `CALL` of anything else | `CALL` is subject to the same rules as `SELECT` | Refused |
| J-043 | `RESET lock_configuration`, and `RESET` of every setting in C.2 | `RESET` is a second spelling of `SET` | Each refused |
| J-044 | `PIVOT` and `UNPIVOT` over a permitted object | Dynamically generated columns cannot introduce an unentitled one | Only entitled columns appear |

**This group exists because C.3.1 rests on `PREPARE`.** If a prepared
statement or a macro body escapes inspection, the binding argument has a
hole in it, and the attack succeeds without touching anything the inspector
looked at.

## H. Inference, and what is not closed

| ID | Attack | Property | Expected |
|---|---|---|---|
| J-045 | `SELECT salry FROM t` where a withheld column is `salary` | DuckDB's did-you-mean suggester must not name a column the agent may not see | The error names no column the agent cannot see. Disable or filter the suggester |
| J-046 | `SELECT 1/0 FROM t WHERE withheld_col = 'x'` | A runtime error cannot be used as an existence oracle | Column not found, because withheld columns are absent from the view. The defence is absence, not error sanitisation |
| J-047 | The tracker attack: `SELECT SUM(salary) FROM t WHERE (age = 42 AND zip = '12345') OR random_col > 0.999` | Padding a query with noise to satisfy the cardinality floor | **Expected to succeed.** Query inspection cannot close this: it needs analysis across a session's query history, which Slice 1 does not have. The test asserts the current behaviour and names the limitation |

**J-045 is the sharpest of these.** A spelling suggestion that names a
withheld column defeats J-022 entirely: the agent never selects the column,
and the engine tells it the column exists.

**J-047 is recorded rather than closed.** Add to A.7, with the other things
the model does not protect against:

> **Query-padding attacks are not closed.** An analyst who can combine
> permitted predicates can isolate an individual while satisfying the
> minimum group size, then subtract the known noise. Defending against that
> needs analysis across a session's query history, which Slice 1 does not
> have. The minimum group size is a floor against the obvious case, not a
> disclosure guarantee.

## Out of scope for this suite

**CPU exhaustion** — recursive CTEs, explosive cross joins — is real but it
is resource governance, not a bypass. It belongs with C.4's wall-clock
cancellation and concurrency limits in item S2e.
