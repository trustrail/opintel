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
reads.

| Code | Text |
|---|---|
| `element_withheld` | `{name} was withheld from this pool. It cannot be returned in any form. The remaining elements are available.` |
| `entitlement_missing` | `{name} has no decision recorded for this pool, so it cannot be returned. An administrator decides each element before an agent can read it.` |
| `unsupported_on_token` | `{name} is tokenized, so it supports equality, grouping and joins, but not {operation}. Tokens preserve which values are the same, not how they order.` |
| `unsupported_on_aggregate_only` (threshold) | `{name} can only be read in aggregate, and this query would have described too few records. Group more broadly, or use a less restrictive filter.` |
| `unsupported_on_aggregate_only` (nested) | `{name} can only be read in aggregate, and this query nests one aggregate inside another. The group sizes cannot be checked through the nesting, so the query is refused without judging them. Use a single aggregate.` |
| `sql_not_permitted` | `{construct} is not permitted here. This interface accepts SELECT, WITH, VALUES and DESCRIBE against the objects this pool can reach.` |
| `unsupported_pushdown` | `This query would read more of the source than the limit allows. Add a filter the source can evaluate, or narrow the objects read.` |
| `resource_exhausted` (memory) | `This query needed more memory than the limit allows. Reduce the result, or aggregate earlier in the query.` |
| `resource_exhausted` (queue) | `This pool is busy and the queue is full. Retry shortly.` |
| `timeout` | `This query ran longer than the limit allows and was cancelled. Nothing partial was returned.` |
| `source_unavailable` | `A source this query needs cannot be reached, so no result was returned. Results are never served from a stale copy.` |
| `dependency_unavailable` | `The query could not be recorded, so it was not run. Every answer carries a record of what it read.` |

**What none of them say.** No row counts for refused groups. No thresholds.
No element names other than the one refused. No engine text. No file paths,
no host names, no SQL fragments beyond the named construct.

**The threshold refusal deliberately omits the threshold.** Telling an agent
the minimum group size is 5 tells it how to pad a query to 5. The
administrator knows the number; the agent does not need it.

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
