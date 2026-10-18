# V-01 — ten-agent, two-pool reinsurance conformance

Version: 1.0 — 2026-10-17

## Scope and reproduction

Run `npm test -- test/reinsurance-conformance.test.ts` on the isolated normal-test
Postgres/SpiceDB environment. This uses ten separate MCP HTTP clients, each with its
own issued pool credential, the real Application and TLS-connected Engine, real
Postgres source reads, real DuckDB execution, and persisted evidence. It makes no
XQ calls and does not enable custody. V-02 remains separate.

The run follows the amended 1a/1b contract: decisions are per pool; it makes no
source-level column-inheritance claim. Expectations are computed from the explicit
synthetic rows in `src/modules/sources/demo/reinsurance.json#conformance`, never
from an Application response, source query, count estimate or receipt.

## Fixture before and after

The existing pack has twelve cedant premium objects, twelve declared rows per
object, a six-value shared Treaty Ref generator, twelve original spreadsheet
filings with varied sheet/header/locale declarations, one restatement, and one
merged-header quarantine case. Those definitions and their generator are unchanged.

The extension adds explicit policy, claim and treaty-reference rows to that same
JSON fixture. The runner materialises them under two source identities in its
isolated Postgres schema; both participating pools bind both sources. It reuses
the existing query fixture's server/Engine plumbing. The generic warehouse supplied
by that helper is unbound from both participating pools and is not queried. Its
unused setup pool is not a participant.

| Dataset | Total | Cedant 01 / Pool A | Cedant 02 / Pool B | Neither pool |
|---|---:|---:|---:|---:|
| Policies | 12 | 6 | 5 | 1 |
| Claims | 12 | 6 | 5 | 1 |
| Entities present in both sources | 7 | 3 | 3 | 1 |
| Policy-only entities | 5 | 3 | 2 | 0 |
| Claim-only entities | 5 | 3 | 2 | 0 |
| Claim-amount sum | 77,359 | 42,858 | 32,838 | 1,663 |

Policy IDs use the same explicit `policy` token domain in both sources and both
pools. Insured names use the documented last4 mask (fixed `••••` prefix). Treaty
reference, line of business and claim loss date are clear. Claim amount is
aggregate-only; the minimum group size remains five. Underwriter note is withheld.
Risk code is clear in A and masked in B. Broker reference is clear in A and has
no decision in B. Row predicates select `cedant_01` and `cedant_02` respectively.

The two-row treaty reference object has no cedant column. An explicit deny-all
row decision for A establishes that it is scoped; B has no applicable decision.
A receives zero rows by its decision, and B receives zero by missing-decision
fail-closed behavior. Exactly one Needs You item is expected, for B. Absence of a
cedant column alone is not claimed to create row scope automatically.

## Assertions and focused result

Eight batches each issue ten concurrent client requests (five per pool); batches
are sequential. There are 80 receipts, not ten receipts total. The fixture admits
five concurrent executions per pool and ten source connections; source statement
and operation timeouts remain the harness defaults of 10 and 15 seconds.

| Assertion | Expected | Actual in final focused run | Result |
|---|---|---|---|
| 1a Pool isolation | A risk codes clear; B last4-masked for all five callers each | Exact fixture-derived values/shapes for every caller | Pass |
| 1b Bound is not decided | A returns 6 broker references; all 5 B callers get entitlement_missing with no delivered result | As expected, with refused evidence | Pass |
| 2 Row filtering | A/B policies 6/5, claims 6/5; exact selected rows, neither sees cedant 03 | Exact fixture-derived rows/counts | Pass |
| 3 Token joins | 3 matching entities per pool, token IDs remain nonliteral | Exact claim/treaty join pairs; token-shaped keys | Pass |
| 3 Masks | Insured names are fixed-prefix last4 placeholders | Exact documented mask shape, both pools | Pass |
| 3 Aggregate-only | Counts 6/5; sums 42,858/32,838; row listing refused | Exact totals; all 10 row listings refused | Pass |
| 3 Withholding | No note values/column in star output; model text names omission; explicit references refused | All 10 callers satisfy each check | Pass |
| 4 Missing predicate | B returns zero without error and missingDecision=true; one Needs You item | All five B callers; exactly one finding | Pass |
| 5 Concurrency/evidence | 10 concurrent requests and unique receipts per batch; 80 unique receipts overall | 80 unique stored completions, exact agent/credential/pool attribution | Pass |
| 5 Counts/non-disclosure | Successful receipts carry entitled counts; no fixture literals in scope metadata or complete detail | 55 successful receipts with exact counts; all 80 complete details checked | Pass |

The 25 expected pre-execution refusals do not claim measured entitled-row counts:
they record the refusal rather than inventing a source-read count. They return no
structured result. The final focused run passed 1,006 checks in one test (42.00s;
Vitest wall time 46.56s). Machine-readable checks are emitted to
`test-results/v01/report.json` on every run. Gate validation is recorded below
when complete; this focused result is not a gate claim.

## Development failures retained

- Initial fixture setup used the tenant role to update project settings and was
  denied. Corrected to the existing platform scope; no conformance assertion ran.
- The first complete attempt failed: 29 unexpected requests hit the reused
  harness's two-connection source cap; 10 date-listing requests were refused
  because CAST is outside the supported SQL subset. The refused receipts supplied
  `source_connections_saturated` and `prohibited_construct / expression CAST`.
  The test reported 117 failed checks, including downstream count checks.
- Corrected fixture capacity to ten connections for ten callers and selected the
  date directly. No expected result, governance assertion, timeout or production
  implementation changed. That run passed 926 checks. The final addition checks
  complete receipt detail as well as scope metadata; all 1,006 checks passed.
- Targeted strict TypeScript checking of the new test files passed after adding
  the JSON import attribute and validating MCP content before accessing it.

## Change ledger

| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1.0 | 2026-10-17 | Extend existing reinsurance fixture and record amended V-01 focused conformance. | Test/fixture work only; no entitlement, custody or execution behavior changed. |
