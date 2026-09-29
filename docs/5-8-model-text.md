# Item 5.8: the text the model reads

The strings below are the contract. They are exact: item 5.8 implements
these, and a test asserts each one character for character. The judgement is
in the wording, which is why it was hand-written rather than generated.

## The rule these follow

**Say what happened, and what the agent may do instead. Reveal nothing about
what was refused.**

A model that sees a field simply absent concludes the data does not exist
and reasons confidently over a partial picture (§2.6). So a withheld element
is **named**. A refusal, by contrast, says why the shape of the request was
refused and never how close it came: never a group count, never a row count
for a suppressed group, never a value.

**Every message is one paragraph, plain, no markdown.** The model reads it
as prose, not as a structure to parse. The structured fields carry what is
machine-readable.

**Lists are in ordinal order**, comma separated, with no conjunction:
`tax_id, bank_account, salary_band`. Deterministic, so the test can assert
it.

## Successful query

The text always states the row count, then the reductions, in this order:
withheld, then tokenized, then masked, then aggregate-only.

```
38 rows. 3 elements were withheld: tax_id, bank_account, salary_band. email was returned tokenized.
```

Fragments, composed in that order. Singular and plural forms are exact.

| Condition | Fragment |
|---|---|
| Always first | `{n} rows.` / `1 row.` / `No rows.` |
| Truncated | ` The result was truncated at {n} rows; there are more.` |
| Withheld, one | ` 1 element was withheld: {name}.` |
| Withheld, many | ` {n} elements were withheld: {names}.` |
| Tokenized, one | ` {name} was returned tokenized.` |
| Tokenized, many | ` {names} were returned tokenized.` |
| Masked, one | ` {name} was returned masked.` |
| Masked, many | ` {names} were returned masked.` |
| Aggregate-only present | ` {names} can only be read in aggregate.` |

**Nothing is said when there is nothing to say.** A query over entirely
clear columns returns `38 rows.` and no more. A sentence explaining that
nothing was reduced would train the model to skim the text.

**A tokenized element carries one further sentence, once per response**, after
the fragments above:

```
 Tokens are stable: the same value is always the same token, so they can be grouped and joined, but not ordered or compared.
```

That sentence exists because an agent that does not know this will try
`ORDER BY` on a token, be refused, and have no idea why.

## Refusals

Each is `isError: true`, with the code in `_meta`. The text is what the model
reads. **The codes below are the implementation's, not invented here.** Where
a code covers several causes, the text is split by cause: a message that
asserts a cause the system has not established is worse than a vague one.

### By element

| Code | When | Text |
|---|---|---|
| `element_withheld` | Any | `{name} was withheld from this pool. It cannot be returned in any form.` |
| `entitlement_missing` | Any | `{name} has no decision recorded for this pool, so it cannot be returned. An administrator decides each element before an agent can read it.` |
| `unsupported_on_token` | Any | `{name} is tokenized, so it supports equality, grouping and joins, but not {operation}. Tokens preserve which values are the same, not how they order.` |
| `unsupported_on_aggregate_only` | Read row by row | `{name} can only be read in aggregate. This query reads it row by row. Use an aggregate such as SUM, AVG or COUNT over a group.` |
| `unsupported_on_aggregate_only` | Cardinality refused | `{name} can only be read in aggregate, and this query would have described too few records. Group more broadly, or use a less restrictive filter.` |
| `unsupported_on_aggregate_only` | Count invalid | `{name} can only be read in aggregate, and the group sizes for this query could not be checked. Nothing is established about whether the groups are large enough. Try a simpler grouping, or ask an administrator to look at this query.` |
| `unsupported_on_aggregate_only` | Nested aggregation | `{name} can only be read in aggregate, and this query nests one aggregate inside another. The group sizes cannot be checked through the nesting, so the query is refused without judging them. Use a single aggregate.` |

**The aggregate-only cases must be distinguishable.** Row-by-row says
use an aggregate. Cardinality says group more broadly. Nested says the check
declined to look, and explicitly disclaims a verdict about the group sizes,
so an administrator reading an agent's complaint does not lower a threshold
that was never the problem.

Count invalid likewise disclaims a verdict: an invalid count after Stage 2 may
reflect the query's shape or a defect. It suggests a simpler grouping or
administrator review and carries `retryable: false`; repeating the same query
produces the same invalid count.

### By statement

| Code | When | Text |
|---|---|---|
| `sql_not_permitted` | Any | `{construct} is not permitted here. This interface accepts SELECT, WITH, VALUES and DESCRIBE against the objects this pool can reach.` |
| `unsupported_pushdown` | Estimate above the limit | `This query would read more of the source than the limit allows. Add a filter the source can evaluate, or narrow the objects read.` |
| `unsupported_pushdown` | Size unknown | `The size of this read cannot be estimated, so it is refused rather than run. Add a filter the source can evaluate, or narrow the objects read.` |

### By resource

| Code | When | Text |
|---|---|---|
| `budget_exceeded` | Memory | `This query needed more memory than the limit allows. Reduce the result, or aggregate earlier in the query.` |
| `budget_exceeded` | Queue full | `This pool is busy and the queue is full. Retry shortly.` |
| `budget_exceeded` | Deadline | `This query ran longer than the limit allows and was cancelled. Nothing partial was returned.` |

### By dependency

| Code | When | Text |
|---|---|---|
| `source_unavailable` | Source unreachable | `A source this query needs cannot be reached, so no result was returned. Results are never served from a stale copy.` |
| `dependency_unavailable` | Evidence failure before execution | `The query could not be recorded, so it was not run. Every answer carries a record of what it read.` |
| `dependency_unavailable` | Evidence failure after execution | `The query ran but its record could not be completed, so no result was returned. Every answer carries a record of what it read.` |
| `dependency_unavailable` | Sidecar contract mismatch, before execution | `The query could not be run because a component is out of step with this deployment. No source was contacted. This needs an operator; retrying will not help.` |
| `dependency_unavailable` | Inconsistent sidecar result, after execution | `The query ran but returned a result this interface cannot trust, so nothing was released. This needs an operator; retrying will not help.` |

### Approved fallbacks and additional causes

The caller receives a structured `cause` alongside `code` in `_meta`. The
approved mapping and its information-preservation correction are in
[the code/cause review table](review/5-8-code-causes.md). These strings are exact.

| Code | When | Text |
|---|---|---|
| `sql_not_permitted` | No construct established | `This query cannot be run through this interface. This interface accepts SELECT, WITH, VALUES and DESCRIBE against the objects this pool can reach.` |
| `unsupported_on_aggregate_only` | Not a direct aggregate argument | `{name} can only be read in aggregate, and this query does not pass it directly to an aggregate. Use SUM, AVG or COUNT over the element itself.` |
| `budget_exceeded` | Source connections saturated | `The sources this query needs are busy. Retry shortly.` |
| `source_unavailable` | Reachable but failed | `A source this query needs returned an error, so no result was returned. Results are never served from a stale copy.` |
| `dependency_unavailable` | Cause not established | `The query could not be completed. Whether it reached a source is not established. This needs an operator.` |

**No aggregate threshold is exposed in any agent-facing payload**, including
`_meta`. Internal diagnostics may retain it. Tests must cover the complete MCP
response, not only its text.

**Every message saying an operator is needed carries `retryable: false`.**
This is tested against the rendered message and its structured retry advice.

**What none of them say.** No row counts for refused groups. No thresholds.
No element names other than the one refused. No engine text. No file paths,
no host names, no SQL fragments beyond the named construct.

**The threshold refusal deliberately omits the threshold.** Telling an agent
the minimum group size is 5 tells it how to pad a query to 5. The
administrator knows the number; the agent does not need it.

## Two defects this specification exposed

**Nested aggregation returns `sql_not_permitted`.** It should return
`unsupported_on_aggregate_only`: the SQL is permitted, and the same query
over a clear element would run. This is an S2d omission rather than a later
regression, and item 5.8 corrects it, keeping the message S2d wrote.

**A deadline at the source boundary reports `source_unavailable`.** A query
that took too long and a source that cannot be reached are different events,
and only the first means ask something smaller. Distinguishing them needs the
first cause preserved across queueing, source reads, engine interruption and
transport, which is more than 5.8 should carry. **Item 5.7a owns it**, and
until then `source_unavailable` is over-reported: the message above is
correct for the unreachable case and misleading for the deadline case. That
is recorded rather than papered over.

## A non-existent column

An ordinary binder error, unchanged. It must be distinguishable from
`element_withheld` and `entitlement_missing`, which it is by code.

## One contradiction to resolve first

I-010 says naming a withheld column returns `element_withheld`, and §2.6
names withheld elements openly. Bypass attack J-022 expects that the error
**does not** confirm the column exists. Both currently pass, so they must be
exercising different routes: the base catalogue, where nothing may be
confirmed, and the pool's own view, where withholding is stated.

**Confirm that is the distinction before implementing.** If a single route
satisfies both by accident, one of the two is not testing what it claims.

### Resolved boundary distinction and implementation

The provisional J-022 in the attack list maps to implemented J-033. It tests
the inspected sidecar directly; I-010 tests MCP's entitlement-aware pre-filter.
Both may address the pool view. The distinction is the boundary, not base
catalogue versus pool view. Canonical J-022 is the sidecar-death test. Neither
attack SQL nor its assertions changed for 5.8.

Item 5.8 corrects the nested case to `unsupported_on_aggregate_only` while
retaining S2d's internal message. Known parser, binding, treatment and dependency
causes select the approved sentences above. Unknown interruptions use the
approved generic fallback until 5.7a establishes the first cause. The caller
receives the known cause and safe producer distinctions even when the prose is
generic. No sentence in this contract was reworded by implementation.
