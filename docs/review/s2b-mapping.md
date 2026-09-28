# S2b attack identifiers

This is the mapping accepted before tests were written. IDs in
`docs/bypass-attacks.md` remain provisional; they have not been silently
renumbered. The existing sidecar series ended at J-026.

| Provisional attack ID | Canonical ID | Property |
|---|---|---|
| J-001 | J-012 | Database attachment |
| J-002 | J-012 | Extension-backed attachment |
| J-003 | J-016 | read_csv |
| J-004 | J-016 | File-reading function family |
| J-005 | J-015 | COPY TO |
| J-006 | J-027 | Bare-filename reads |
| J-007 | J-017 | INSTALL / LOAD |
| J-008 | J-028 | Loaded-extension routes |
| J-009 | J-014 | Re-enable external access |
| J-010 | J-029 | Unlock configuration |
| J-011 | J-030 | Reinstate spill directory |
| J-012 | J-031 | PRAGMA settings |
| J-013 | J-032 | Raise memory budget |
| J-014 | J-020 | Memory exhaustion without spill |
| J-015 | J-004 | Staging access |
| J-016 | J-004 | Internal catalogue aliases |
| J-017 | J-006, J-008 | Catalogue enumeration / view definitions |
| J-018 | J-006 | Database enumeration |
| J-019 | J-009 | CTE reference |
| J-020 | J-018 | CREATE VIEW |
| J-021 | J-009 | Mixed permitted/prohibited join |
| J-022 | J-033 | Direct withheld column |
| J-023 | J-034 | Direct undecided column |
| J-024 | J-035 | Aggregate post-filter cardinality |
| J-025 | J-036 | Unaggregated aggregate-only column |
| J-026 | J-037 | Token MIN |
| J-027 | J-038 | Token ordering |
| J-028 | J-039 | Token LIKE |
| J-029 | J-040 | Grouping masks |
| J-030 | J-041 | Multiple statements |
| J-031 | J-042 | Comments / whitespace |
| J-032 | J-043 | Keyword case / Unicode |
| J-033 | J-044 | Cross-pool key access |
| J-034 | J-045 | Mid-session expired/revoked key |
| J-035 | J-046 | Positive controls |
| J-036 | J-047 | Broken-hardening control |
| J-037 | J-048 | Structured refusals |
| J-038 | J-010 | Deferred execution |
| J-039 | J-010 | Macro body |
| J-040 | J-049 | COPY FROM |
| J-041 | J-017 | Function-form extension loading |
| J-042 | J-050 | CALL |
| J-043 | J-051 | RESET |
| J-044 | J-052 | PIVOT / UNPIVOT |
| J-045 | J-053 | Spelling suggestions |
| J-046 | J-054 | Runtime-error oracle |
| J-047 | J-055 | Tracker attack (expected success) |

Existing J-005, J-007, J-011 and J-013 additionally retain the base-withheld
route, information_schema enumeration, quoted/case-varied identifiers and
search_path cases. Existing J-001–J-003 remain endpoint-contract,
introspection and validate/source-contact tests, not attack IDs.

Additional attacks: **J-056** exercises `query_table` with a protected object
name; **J-057** exercises `query` with a protected SQL string. They test whether
table-function indirection can escape the pool namespace. Both have same-SQL
positive controls. They do not replace any listed attack.

Implementation: `test/bypass/attacks.test.ts`. J-044 and J-045 explicitly fail
on the absent 5.7 authenticated query path. No skips, expected-failure wrappers,
or production fixes are used. Outcomes are recorded in `s2b-results.md`.
