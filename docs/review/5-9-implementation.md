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
