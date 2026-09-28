# Item 5.8 — refusal message applicability audit

Scope: the current authenticated query path, including its pre-filter,
compilation, sidecar HTTP client/server, SQL inspector, staged execution,
source connector, tokenization, engine error mapping and evidence port.
This is a static producer-and-propagation audit, not a change to codes,
refusal behavior or attacks. Unrelated console/describe/custody routes do not
inherit query-result text merely because they share a code.

The two newly supplied dependency sentences are recorded verbatim in
`docs/5-8-model-text.md`. Its original evidence sentences are now explicitly
labelled as evidence failures. The following applicability gaps remain.

## Codes with additional causes or overclaims

| Code | Current cause or condition | Why the specified text does not cover it |
|---|---|---|
| `element_withheld` | The first named withheld element is refused, without proving the availability of other elements | “The remaining elements are available” is not guaranteed. Other elements may also be withheld or undecided. |
| `unsupported_on_aggregate_only` | A protected reference occurs outside the check's accepted direct aggregate argument/context | This is broader than returning raw rows. `SELECT SUM(amount+1) FROM orders` is an existing refusal test: the query already aggregates, but its argument shape is unsupported. Aggregate references in predicates, grouping, windows and some aggregate ORDER BY expressions also enter this branch. A single “reads it row by row” sentence does not accurately distinguish all of these. |
| `unsupported_on_aggregate_only` (approved nested-code correction) | An aggregate over a protected element belongs to a query node other than the root | The guard does not require an outer aggregate. For example, an outer constant projection over an inner protected SUM also hits it. “Nests one aggregate inside another” is narrower than the guard. The existing S2d internal message describes inability to preserve inner counts more broadly. |
| `unsupported_on_aggregate_only` | Stage 1's supported estimate is below the minimum; Stage 2's count is below the minimum **or invalid** | Stage 1 is an estimate rather than a measured verdict. An invalid/missing instrumented count or wrong row width also fails `validGroupCount`/the row-width check, without establishing “too few records.” The measured-low-count case fits the sentence. |
| `sql_not_permitted` | Parser/build mismatch; missing inspection capability; unexpected session objects; staged-schema/read-plan/entitlement mismatch; failure to inspect an internally rewritten statement | These are deployment/invariant failures, not proof that a user SQL construct is prohibited. “This interface accepts SELECT…” does not explain them and can contradict a refusal naming SELECT_NODE after a binding failure. |
| `sql_not_permitted` | Parse failure, serialization refusal, unresolved/ambiguous binding or loss of a source binding | These differ from a prohibited construct. Several producers supply no construct at all; the formatter cannot assume a tree exists or infer a safe named construct from raw error text. The source-unbinding producer also has no construct. |
| `unsupported_pushdown` | Actual staging rows exceed the cap after an estimate admitted the scan | The scan-limit sentence can cover this, but the table labels it only “Estimate above the limit.” The “Size unknown” sentence must not be used: rows have already been read. Negative/non-finite estimates are also rejected; these are unusable estimates, not evidence of a large scan. |
| `budget_exceeded` | The per-source connection ceiling is reached | This is neither memory exhaustion, a full per-pool queue nor a deadline. The pool queue need not be full. |
| `budget_exceeded` | Caller cancellation, queued cancellation, native interruption or service shutdown | None proves a deadline expired or the queue filled. This belongs with the first-cause work in 5.7a; do not select the deadline/queue-full sentences solely from this code or `resource: queue/time`. |
| `source_unavailable` | A reachable source rejects a query, its schema changed, source metadata/result decoding fails, or native staging/appending throws a non-memory error inside the source wrapper | The connector's generic catch maps these to this code. “Cannot be reached” is not established. |
| `source_unavailable` | Sidecar connection/TLS failure, malformed JSON/content type/error envelope, incomplete response or response-size limit | The source itself may be healthy or never contacted. The response may be untrustworthy even though the sidecar was reached. These are additional causes beyond the already documented deadline/cancellation over-reporting. |
| `source_unavailable` | Stored source status is not connected, or its credential reference is absent | No live reachability test is required before this refusal. A missing credential reference is a configuration failure, not a measured outage. |
| `dependency_unavailable` | Missing/malformed source or token-key secrets; tokenization failure; absent signed scanner or staging capability; incomplete read plan/settings | These are neither evidence failures nor necessarily a sidecar wire-contract mismatch. Some occur after estimates or earlier objects' reads have contacted sources, making “No source was contacted” unsafe as a blanket fallback. |
| `dependency_unavailable` | Unclassified engine failure, metadata/authorization/parser exception, staged-executor catch or MCP/sidecar HTTP catch | Execution progress and retryability are not established by the code. The query may never have run, or may have failed while running; there need not be an inconsistent returned result or failed evidence write. Neither new dependency sentence is a truthful generic fallback. |

No additional cause mismatch was found for `entitlement_missing` or
`unsupported_on_token` in the reviewed query path. Their dynamic names and
operations still need safe structured inputs, as described below.

## Cause information needed by the formatter

These are implementation/data requirements, separate from decisions about wording:

- Evidence completion can fail while recording a **refused** execution. A
  sidecar refusal may precede execution or follow execution (for example Stage
  2). “Before/after dispatch” alone cannot establish “the query ran.” The
  current generic error paths do not always retain execution progress.
- Unknown, unusable, estimated-large and observed-large scan refusals currently
  share setting/value metadata without a structured discriminator for the
  estimate's condition. Do not choose messages by parsing their prose.
- Some aggregate refusal branches identify stage/operation; the nested branch
  currently identifies only SELECT_NODE. Name and cause need to be retained
  explicitly when making its approved code correction.
- Application withheld/undecided refusals currently put the requested name in
  their message, not a structured name field. Token comparison operations also
  differ between application enum labels and sidecar SQL symbols. The formatter
  needs explicit safe values rather than parsing/interpolating engine text.
- MCP currently copies error details into `_meta`, including aggregate
  thresholds. If “no thresholds” applies to the entire agent response, text
  formatting alone does not enforce it; the response needs an explicit metadata
  allowlist. Internal diagnostics can retain administrator-facing information.
- The new operator-only dependency sentences say retrying will not help, but
  existing generic engine/HTTP dependency failures may carry `retryable: true`.
  Cause-specific classification must keep the structured advice consistent;
  changing every dependency failure to non-retryable would be unjustified.

## Related existing contract discrepancies

The file's “ordinary binder error, unchanged” is not the current public behavior:
I-012 is a pre-filter `not_found` message. Sidecar binding failures are sanitized
`sql_not_permitted` messages; forwarding raw binder diagnostics would undo the
protection against engine suggestions revealing unavailable columns.

Two read-only probes parsed SQL with the real DuckDB parser and passed the trees
to the sidecar treatment inspector. They confirmed that `SUM(amount+1)` returns
the row-reference refusal, and that an outer `SELECT 1` over an inner protected
SUM returns the nested guard's current `sql_not_permitted`. Neither probe ran
agent SQL or contacted a source. The supplied dependency sentences were also
checked character for character in the specification.

The last section's provisional J-022 is implemented as J-033. It directly tests
the inspected sidecar's pool view; I-010 tests MCP's entitlement-aware
pre-filter. The distinction is between boundaries, not base catalogue versus
pool view. Canonical J-022 tests sidecar death. This remains the previously
reported distinction; no attack was changed.

## Evidence locations

- `src/modules/entitlements/application/aggregate.ts`: first withheld/undecided
  lookup refusal, protected-expression checks and parser-build refusal.
- `src/modules/entitlements/infrastructure/duckdb-query-parser.ts`: serialization
  failure classification.
- `sidecar/sql/application/treatments.ts`: protected-expression and nested guards.
- `sidecar/sql/application/execute.ts`, `cardinality.ts`, `treatment-policy.ts`:
  inspection/binding invariants, estimates and count validation.
- `sidecar/execution/application/execute.ts`, `queue.ts`: scan, queue and abort
  conditions.
- `sidecar/execution/infrastructure/postgres-source.ts`: source-busy and generic
  source-wrapper exception mapping.
- `sidecar/tokenize/tokenizer.ts`, `src/platform/secrets/`: secret resolution and
  tokenization dependency failures.
- `sidecar/session/infrastructure/duckdb.ts`, `failure.ts`: scanner configuration,
  native interruption and unclassified engine failure.
- `src/modules/mcp/application/query.ts`: evidence lifecycle, plan/result checks
  and broad exception mapping.
- `src/modules/mcp/infrastructure/execution-client.ts`, `http.ts`,
  `sidecar/http/server.ts`: transport, decoding, envelope and outer catch paths.
