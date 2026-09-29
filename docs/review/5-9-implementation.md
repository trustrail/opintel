# Item 5.9 implementation

`opintel.explain` shares query preparation and item 5.8's refusal formatter,
then calls the existing pinned-mTLS `/validate` endpoint. The sidecar remains
responsible for parsing, treatment inspection and preparation against empty pool
tables. No sidecar enforcement was changed.

The response follows §2.6's explain contract. Successful plans report exposed
objects, fully qualified planned source columns and reduction notes. They state
that no source was contacted and nothing was read. Group-size checks, source
connectivity, scan admission and execution limits remain execution-time concerns;
a successful dry run does not promise successful execution. Refusal codes and
text match query, including refusals originating in sidecar validation.

Explain remains callable with query mode disabled and needs no evidence writer.
It receives a validation port with no execute method. Query retains its existing
evidence gate. No work from 5.7a, 5.10 or 5.11 is implemented.

## Verification

- N-003: all 10 tests in `test/mcp-explain.test.ts` pass. Real authenticated MCP
  and pinned sidecar calls assert zero source-connection scopes, credential
  resolutions, source estimates, source reads and agent SQL executions. Query
  provides a positive control for the source instrumentation.
- Coverage includes reductions, CTE lineage, star expansion, source-free VALUES,
  pending aggregate cardinality, query-mode independence, missing evidence
  implementation, current decisions/bindings, authoritative rejection despite a
  permissive application pre-filter, unavailable sidecar, invalid arguments and
  downstream cancellation.
- MCP query, formatter and transport regressions pass. The initial four-file run
  passed 86 tests; the final explain/transport run, including two additional
  N-003 cases, passed all 16 tests.
- Complete `npm run test:bypass`: 97 passing checks, zero registered open checks,
  zero regressions. No bypass test or exemption changed.
- `npm run typecheck`, `npm run lint` and `git diff --check` pass.
- No migration, route, stylesheet or screen changes.

## Execution-limit independence and validation capability correction

N-003's privacy sentinel is now 937, within the subsequently approved 1–1,000
aggregate threshold bound; its SQL and assertion structure are unchanged.
Explain no longer requires the four project hardware/execution limits or pool
threads budget. It reports each missing field in an execution-refusal note after
completing structural and entitlement checks. Query still refuses without limits.

The sidecar validation service is separate from the execution service, with a
fixed, non-configurable budget of 128 MB, one thread and two seconds. Its session
capability exposes parse and binding, not execute, source access or executable
prepared handles. Trusted empty-schema setup and metadata inspection stay inside
the adapter. PREPARE proves binding after inspection; its handle is destroyed
without being run. Validation performs neither cardinality estimates nor group
counts. C.4 records the distinction from customer-controlled execution limits.
The validation wire accepts absent execution limits; /execute continues to
require them. The generated OpenAPI contract is updated.

Focused verification: six files, 68 tests passed (49.22 seconds), covering MCP
explain/query, sidecar HTTP, staged execution, validation capabilities/deadline
and session construction. J-003 verifies no source resolution or execution call,
only parse/prepare/release events, fixed memory/thread limits, and rejection of an
execution request lacking limits. The validation session exposes no execution
method and returns only a binding verdict. The deadline test verifies the fixed
2,000 ms deadline, cancellation and cleanup despite supplied execution limits.
Typecheck and lint passed. The complete bypass gate passed all 97 checks with
zero registered open checks and zero regressions; no attack or exemption changed.

Final full repository run after the correction: **135 files passed, 1,347 tests
passed**, zero failures, in 481.20 seconds. Both settings migrations rolled down
and back up successfully. Production build passed with the existing >500 kB
bundle warning. `git diff --check` passed.
