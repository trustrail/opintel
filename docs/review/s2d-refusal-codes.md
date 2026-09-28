# S2d refusal-code correction

The approved aggregate-only refusal code is `unsupported_on_aggregate_only`.
An entitlement exists; it is the treatment that prevents the operation. B.4,
J-035/J-036 and the application pre-filter now agree. The attack SQL and all
other attack assertions are unchanged. The shared error contract accepts the
new code, and the pre-filter tells the agent to use an aggregate over a
sufficiently large group. Its acceptance still never authorizes execution.

## Remaining `entitlement_missing` uses

Repository search after the correction found:

- `src/modules/pools/application/binding.ts`: the only remaining runtime
  producer, when the repository returns a null entitlement. It does not use
  the code for a treatment violation. `test/pool-binding.test.ts` asserts this
  twice, including when a decision exists only for another pool.
- `src/shared/kernel/types.ts` and `src/shared/error-contract.ts`: the retained
  error-code union and boundary validation.
- `docs/implementation-plan.md`: Slice 1a gate describes undecided columns.
- `docs/test-specification.md`: I-011 expects this code for an undecided column.
- `docs/slice1-technical-documentation.md`: error-code type, §2.2's example
  saying a column has no entitlement, and §6.3's action for the code.
- `test/bypass/attacks.test.ts`: a negative assertion that unavailable-column
  errors do not disclose this entitlement distinction to an agent.

The SQL identifier resolver uses `object_unavailable` for its undecided case;
the older pool-element resolver and I-011 still name `entitlement_missing`.
These are reported rather than silently changing another item's API contract.
No remaining producer uses `entitlement_missing` for aggregate-only.

The completed treatment enforcement and six closed bypass checks are recorded
in [S2d results](s2d-results.md).
