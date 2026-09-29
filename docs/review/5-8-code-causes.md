# Item 5.8 — proposed code/cause contract

**Status: approved, with the producer-information correction below.** This proposal
uses only approved sentences. The existing public code is retained, except for
the explicitly approved nested-aggregation correction to
`unsupported_on_aggregate_only`. Cause values below are proposed API enum values,
not free-form diagnostics. Each `(code, cause)` pair has one message selection.

## Selection and wire rules

- The producer records a cause where it knows the condition. The application
  carries it through the sidecar boundary to MCP; the renderer never classifies
  by searching an error message, SQL text or engine diagnostic.
- Known names/operations/constructs are separate typed rendering inputs. Only
  an established, safe construct may use Q. A missing or invalid rendering
  input uses the safe fallback, never an invented name or raw exception text.
- `_meta` is built from an allowlist: `code`, `cause`, `retryable`, the existing evidence identifier, and
  validated producer-known distinctions (listed below). It never spreads error details.
  Success retains its existing record identifier and structured query result.
  No new evidence id is fabricated for an unrecorded refusal.
- `cause` identifies the actual known condition even when its message is a
  shared fallback. An unknown/unrecognized incoming cause becomes `unclassified`.
  It never silently selects a more specific sentence.
- `inherit` below retains existing retryability. `false` and `true` override it.
  Every use of Version, Result or Unknown forces **false**, including a fallback
  selected because rendering inputs are missing. This is a formatter rule, not
  a change to the administrator/internal DomainError.
- Source contact and successful execution are different facts. Evidence-before
  requires proof that agent SQL did not execute; Evidence-after requires proof
  that it did. Dispatching `/execute` is not such proof. Uncertain progress uses
  Unknown. Version requires a pre-execution contract mismatch and no source
  contact; Result requires established execution and an inconsistent result.

## Exact message catalogue

Labels are review shorthand only and do not appear on the wire. The sentences
below are copied character for character from the approved specification.

| Label | Exact text |
|---|---|
| W | `{name} was withheld from this pool. It cannot be returned in any form.` |
| E | `{name} has no decision recorded for this pool, so it cannot be returned. An administrator decides each element before an agent can read it.` |
| T | `{name} is tokenized, so it supports equality, grouping and joins, but not {operation}. Tokens preserve which values are the same, not how they order.` |
| A-row | `{name} can only be read in aggregate. This query reads it row by row. Use an aggregate such as SUM, AVG or COUNT over a group.` |
| A-direct | `{name} can only be read in aggregate, and this query does not pass it directly to an aggregate. Use SUM, AVG or COUNT over the element itself.` |
| A-small | `{name} can only be read in aggregate, and this query would have described too few records. Group more broadly, or use a less restrictive filter.` |
| A-count-invalid | `{name} can only be read in aggregate, and the group sizes for this query could not be checked. Nothing is established about whether the groups are large enough. Try a simpler grouping, or ask an administrator to look at this query.` |
| A-nested | `{name} can only be read in aggregate, and this query nests one aggregate inside another. The group sizes cannot be checked through the nesting, so the query is refused without judging them. Use a single aggregate.` |
| Q | `{construct} is not permitted here. This interface accepts SELECT, WITH, VALUES and DESCRIBE against the objects this pool can reach.` |
| Q-fallback | `This query cannot be run through this interface. This interface accepts SELECT, WITH, VALUES and DESCRIBE against the objects this pool can reach.` |
| Scan-large | `This query would read more of the source than the limit allows. Add a filter the source can evaluate, or narrow the objects read.` |
| Scan-unknown | `The size of this read cannot be estimated, so it is refused rather than run. Add a filter the source can evaluate, or narrow the objects read.` |
| Memory | `This query needed more memory than the limit allows. Reduce the result, or aggregate earlier in the query.` |
| Queue | `This pool is busy and the queue is full. Retry shortly.` |
| Connections | `The sources this query needs are busy. Retry shortly.` |
| Deadline | `This query ran longer than the limit allows and was cancelled. Nothing partial was returned.` |
| Source-down | `A source this query needs cannot be reached, so no result was returned. Results are never served from a stale copy.` |
| Source-read | `A source this query needs returned an error, so no result was returned. Results are never served from a stale copy.` |
| Evidence-before | `The query could not be recorded, so it was not run. Every answer carries a record of what it read.` |
| Evidence-after | `The query ran but its record could not be completed, so no result was returned. Every answer carries a record of what it read.` |
| Version | `The query could not be run because a component is out of step with this deployment. No source was contacted. This needs an operator; retrying will not help.` |
| Result | `The query ran but returned a result this interface cannot trust, so nothing was released. This needs an operator; retrying will not help.` |
| Unknown | `The query could not be completed. Whether it reached a source is not established. This needs an operator.` |

## Proposed mapping

Each cause label groups failures with the same established fact; it does not
expose source names, hostnames, secrets, thresholds or suppressed counts.

| Code | Cause | Established condition / applicability | Message | Retryable |
|---|---|---|---|---|
| `element_withheld` | `withheld` | The named element has a withheld decision | W | false |
| `entitlement_missing` | `undecided` | The named element has no entitlement row for this pool | E | false |
| `unsupported_on_token` | `unsupported_operation` | The named tokenized element is used with the identified prohibited operation | T | false |
| `unsupported_on_aggregate_only` | `row_access` | A protected value is requested outside an aggregate, including use as an unaggregated predicate/group/order/join operand | A-row | false |
| `unsupported_on_aggregate_only` | `not_direct_aggregate_argument` | An aggregate receives an expression containing the element instead of the element itself, e.g. SUM(amount+1) | A-direct | false |
| `unsupported_on_aggregate_only` | `unsupported_aggregate_context` | A direct aggregate argument is present, but its context is unsupported, e.g. a rejected aggregate ORDER BY expression | Q-fallback | false |
| `unsupported_on_aggregate_only` | `nested_aggregation` | The protected inner aggregation actually feeds an outer aggregation; inner counts cannot be verified | A-nested | false |
| `unsupported_on_aggregate_only` | `inner_group_counts_unverifiable` | Protected aggregation is below the root, but there is no established outer aggregation | Q-fallback | false |
| `unsupported_on_aggregate_only` | `cardinality_estimate_low` | A supported estimate is below the minimum; actual group size has not been measured | Q-fallback | false |
| `unsupported_on_aggregate_only` | `cardinality_count_low` | A valid Stage 2 count proves at least one group is below the minimum | A-small | false |
| `unsupported_on_aggregate_only` | `cardinality_count_invalid` | An instrumented count or row shape is invalid, so no group-size verdict is justified | A-count-invalid | false |
| `sql_not_permitted` | `prohibited_construct` | Inspection establishes the named construct is prohibited; includes protected DISTINCT and other explicitly unsupported forms | Q | false |
| `sql_not_permitted` | `parse_failed` | The engine cannot parse the statement; no construct/tree is invented | Q-fallback | false |
| `sql_not_permitted` | `serialization_refused` | Parsing succeeded but serialization did not produce an inspectable tree | Q-fallback | false |
| `sql_not_permitted` | `binding_failed` | An identifier is absent, ambiguous or cannot bind; do not say SELECT itself is prohibited | Q-fallback | false |
| `sql_not_permitted` | `source_not_bound` | The referenced source fails the current pool binding check | Q-fallback | false |
| `sql_not_permitted` | `parser_engine_mismatch` | Parser/engine build mismatch, retaining the existing code | Unknown | false |
| `sql_not_permitted` | `inspection_unavailable` | The engine lacks the required inspection capability | Unknown | false |
| `sql_not_permitted` | `inspection_inconsistent` | Unexpected session objects, inconsistent policy/read plan/staged schema, or failed internal rewrite inspection | Unknown | false |
| `unsupported_pushdown` | `scan_estimate_large` | A usable post-pushdown estimate exceeds the scan cap | Scan-large | false |
| `unsupported_pushdown` | `scan_observed_large` | Actual staging exceeds the cap; rows may already have been read | Scan-large | false |
| `unsupported_pushdown` | `scan_size_unknown` | The estimate is missing, negative, non-finite or otherwise unusable; row fetching has not begun | Scan-unknown | false |
| `budget_exceeded` | `memory_exhausted` | An established memory-exhaustion failure | Memory | false |
| `budget_exceeded` | `queue_full` | The per-pool waiting queue is actually full | Queue | true |
| `budget_exceeded` | `source_connections_saturated` | A per-source connection ceiling is reached | Connections | true |
| `budget_exceeded` | `deadline_exceeded` | Deadline established independently of caller cancellation; reserved until 5.7a supplies reliable first-cause provenance | Deadline | false |
| `budget_exceeded` | `interruption_unclassified` | Existing conflated execution/queue abort or native interruption; no deadline or queue-full claim | Unknown | false |
| `source_unavailable` | `source_unreachable` | The source connection attempt establishes that the source is unreachable | Source-down | inherit |
| `source_unavailable` | `source_read_failed` | A reached source explicitly returns an error, including a rejected query or access attempt | Source-read | inherit |
| `source_unavailable` | `source_response_unusable` | A source returned data or metadata, but local decoding/validation fails; the source did not necessarily return an error | Unknown | false |
| `source_unavailable` | `source_not_ready` | Stored source status or missing credential reference prevents attempting the read; live reachability is not established | Unknown | false |
| `source_unavailable` | `sidecar_transport_failed` | Sidecar connection/TLS failure; source reachability/progress are not established | Unknown | false |
| `source_unavailable` | `sidecar_response_unusable` | Malformed/incomplete/oversized response or invalid error envelope; execution is not established | Unknown | false |
| `source_unavailable` | `staging_failed` | An error is known to come from local staging/appending inside the source wrapper, rather than from the reached source | Unknown | false |
| `source_unavailable` | `interruption_unclassified` | Existing source/client deadline-cancellation conflation; classification is deferred to 5.7a | Unknown | false |
| `dependency_unavailable` | `evidence_before_execution` | Evidence fails and execution is known not to have occurred | Evidence-before | inherit |
| `dependency_unavailable` | `evidence_after_execution` | Evidence fails after execution is established | Evidence-after | inherit |
| `dependency_unavailable` | `evidence_execution_unknown` | Evidence fails while recording a refusal whose execution progress is unknown | Unknown | false |
| `dependency_unavailable` | `sidecar_contract_mismatch` | Known incompatible/invalid health contract before source contact or execution | Version | false |
| `dependency_unavailable` | `inconsistent_result` | Execution is established, but returned types/shape/version/policy/result contract are inconsistent | Result | false |
| `dependency_unavailable` | `component_configuration` | Missing/malformed secrets, unavailable signed scanner/staging capability, or incomplete execution plan/settings | Unknown | false |
| `dependency_unavailable` | `tokenization_failed` | Tokenization fails, without enough provenance to make a narrower claim | Unknown | false |
| `dependency_unavailable` | `engine_failed` | Unclassified engine failure, without a trustworthy completed result | Unknown | false |
| `dependency_unavailable` | `unclassified` | Application, metadata, authorization, HTTP or other unclassified failure | Unknown | false |

### Fallback coverage

For codes above, an absent or unrecognized cause uses `unclassified`:

| Code(s) | Fallback selection | Retryable |
|---|---|---|
| `element_withheld`, `entitlement_missing`, `unsupported_on_token` | W, E or T respectively, only if the required safe name/operation is available; otherwise Unknown | false |
| `sql_not_permitted`, `unsupported_on_aggregate_only` | Q-fallback, making no claim about a particular construct or group size | false |
| `unsupported_pushdown`, `budget_exceeded`, `source_unavailable`, `dependency_unavailable` | Unknown, making no unsupported size/resource/reachability/evidence claim | false |

If a recognized cause lacks required rendering inputs, its safe fallback is
used while retaining the recognized cause; a known cause does not justify an
invented name. Unknown's operator rule still applies.

Other existing query refusal codes keep their existing safe public messages.
`object_unavailable` retains `all_withheld`, `all_undecided` or
`mixed_withheld_undecided` as both cause and reason. Other known producer
conditions receive explicit causes; only genuinely unknown causes are unclassified. This does not
restore raw binder errors, source errors or engine diagnostics. The metadata
allowlist and operator/retryability rule apply to those responses too.

## Deliberate shared-fallback choices for review

1. Q-fallback is reused for aggregate restrictions whose approved specific
   sentence would overclaim. This preserves the treatment code and precise
   cause while the prose stays general. In particular, an estimate is not
   described as a measured count, and an inner aggregation is not described as
   two aggregations unless both are established.
2. Unknown is reused across codes for uncertain infrastructure failures and
   interruptions. This is deliberately conservative operator-facing advice,
   rather than claiming a source outage, full queue or deadline. It is less
   helpful for a caller cancellation; 5.7a owns the provenance and eventual
   cancellation-specific contract. 5.8 neither changes those codes nor tries to
   reconstruct which abort won.
3. Distinguishing reliable causes requires small typed producer annotations and
   preserving them through transport. This does not change whether SQL executes
   or is refused. If the origin is lost in an existing broad catch, classify it
   as unclassified rather than guessing from the exception's message.

## Threshold and retryability defects: implementation and proof

**Exact-text test limitation.** `test/mcp-response.test.ts` reads its expected
messages and code/cause selections from this table and message catalogue. A
green run proves the implementation and the table agree; it cannot catch a
table whose wording or mapping is wrong. Semantic correctness still requires
review against the facts established by the producer.

Implementation and verification requirements for the approved mapping:

- Build every agent-facing query refusal from its approved template and the
  metadata allowlist. Never copy `aggregateMinGroupSize`, thresholds, estimates,
  suppressed counts, treatmentEvidence, arbitrary nested details, stack traces
  or internal messages into text, structuredContent, resources or `_meta`.
  Keep such diagnostics on the trusted/internal side only. Successful reduction
  metadata can name treatments but never their aggregate thresholds.
- Test the full serialized MCP response using distinctive configured threshold
  values absent from fixture data. Cover application refusal, sidecar Stage 1,
  Stage 2, nested refusal, invalid-count handling, success, and fallback/error
  paths. Include poisoned nested detail fields so a shallow omission cannot
  pass. Exercise listing/describe and unavailable tools as well as query;
  inspect both field names and scalar/text values. A changed threshold must
  never be echoed in any agent-visible response.
- Preserve legitimate result values, even if a value happens to equal a
  threshold numerically. These assertions prove configuration is not disclosed;
  they do not rewrite customer data or row counts.
- Test every table entry's entire paragraph character for character, together
  with `_meta.code`, `_meta.cause` and retryability. Test unknown/missing causes,
  missing rendering inputs and pass-through query refusals.
- For every message requiring an operator, seed an upstream error with
  `retryable: true` and assert the complete MCP response has `retryable: false`.
  Add a cross-cutting assertion over every operator-bearing response so a new
  template cannot bypass this rule.
- Add actual MCP I-009 coverage: exact row/reduction text, ordinal lists,
  truncation, singular/plural/zero forms and the single token explanation.
  Undecided columns must remain absent from every response representation.
- Correct only the approved nested refusal code; retain its internal S2d
  message and refusal behavior. Keep the bypass attack specification and SQL
  unchanged. Re-run the relevant treatment/MCP checks and bypass gate.

Item 5.8 implements threshold removal, operator retryability, cause propagation,
the approved nested-code correction and exact model text. Verification results
are recorded in `5-8-implementation.md`.

## Review decision and corrected information-preservation rule

The original table has 23 generic-message entries out of 43 currently applicable
entries (53%); the 44th entry is reserved for 5.7a. This was weighed and accepted
where causes are genuinely indistinguishable at the point of refusal. Generic
text must not erase a distinction the producer already knows.

`interruption_unclassified` belongs to 5.7a: do not guess cancellation versus
deadline. `unclassified` is honest when the origin is unknown; do not give an
unknown cause a more specific label.

The allowlist may not discard a producer-known distinction. The resolver's
withheld/undecided/mixed states were an avoidable defect in this proposal, not a
vocabulary limitation. The audit also identified stage, proof category, resource,
operation, construct, object/element identity, parser version, configured queue
depth/limit and evidence dependencies. These survive through validated fields.
Aggregate thresholds, estimates, suppressed counts, credentials and raw engine
diagnostics remain internal: preserving a condition does not disclose its secret
parameters.

Broad categories retain a structured `reason` when the producer knows more:
source status versus missing credential reference; response decoding versus
shape/version/policy mismatch; absent versus malformed secret; missing staging
capability versus scanner versus incomplete plan; session namespace versus staged
schema versus policy versus rewrite inconsistency. Each uses its approved parent
cause's text; the renderer never reconstructs these from error prose. Conditions
not distinguishable at a catch remain unclassified.

Known validation/lookup conditions outside the primary table retain their safe
existing messages, with explicit causes (object/column absent, ambiguous object,
invalid query/settings/plan, query disabled, and invalid token declaration).
Missing rendering inputs do not replace a known cause.

### Audit disposition

| Previously discarded information | Corrected MCP representation |
|---|---|
| Resolver withheld/undecided/mixed | Distinct `cause` and retained `reason` |
| Application/sidecar stage, parser failure versus serialization failure, binding and Stage 2 proof | Validated `stage` and `proofCategory` |
| Protected element, token operation, inspected construct, missing/ambiguous object | Safe `name`, `elementId`, `operation`, `construct`, `object`; distinct lookup causes |
| Memory, queued interruption, execution interruption | `resource`, retaining `interruption_unclassified` where the winner is unknown |
| Queue depth and configured scan/queue setting | `setting`, `value`, `depth`; scan object address retained |
| Known build, schema, policy and rewrite inconsistency | `queryEngineVersion` and specific `reason` under the approved parent cause |
| Source status versus absent credential reference | `source_status`, `credential_missing`, or their combined reason |
| Known response failures | Incomplete, oversized, content-type, JSON, error-envelope and result-contract reasons |
| Configuration failures | Absent/malformed/storage secret, token-key size, scanner, staging and read-plan reasons; no secret reference |
| Evidence dependency items and execution progress | `requiredItems`, evidence before/after/unknown cause; a Stage 2 refusal establishes execution |

A known cause is never replaced with `unclassified` merely because its text is
generic. An unrecognized cause is not echoed as a new public enum. Unknown
engine/transport origins are not reconstructed from prose. Secret parameters
and suppressed counts are deliberately excluded, as required by the disclosure
contract, rather than silently discarded as unrecognized metadata.
