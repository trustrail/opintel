# Explicit pool budgets

The query-path inventory before this change is six fields. Positive integers
are the accepted public representation for all six; none has a numeric backend
default. Units and current behavior:

| Field | Unit | Required by the current query path | Packaged demo pools |
|---|---|---|---|
| `threads` | DuckDB threads | **Yes**; absence/invalid value refuses | `1` |
| `rowsPerRequest` | rows | No; optional downward override of project row limit | Unset |
| `timeoutMs` | milliseconds | No; optional downward override of project timeout | Unset |
| `memoryMb` | MiB | No; optional downward override of project memory limit | Unset |
| `concurrency` | executions | No; optional downward override of project concurrency | Unset |
| `rowsPerDay` | rows/day | No; defined storage only, Q-020 accounting/enforcement deferred | Unset |

Execution requirements/caps: `src/modules/mcp/infrastructure/query-reader.ts`.
The older domain snapshot omitted `threads`; it now retains all six optional
explicit fields. Its validation and the shared Zod/API schemas reject nonpositive
or noninteger values. The public schemas also reject unsafe integers, unknown
fields, null and strings. No execution requirement or refusal was relaxed.

The exact demo values come from `scripts/operator/reinsurance.ts` (Cedant 01 and
Cedant 02). It sets only threads to one and refuses conflicting resource
decisions. `scripts/dev-demo.ts`, `scripts/dev-demo-soak.ts`,
`scripts/images/stage3-seed.ts` and `scripts/images/seed-smoke.ts` likewise set
only threads to one. These are pool budgets, separate from project query limits.
The future Create pool dialog may suggest the demo values for a person to
confirm. No UI or backend suggestion/default was implemented here.

Creation: `POST /api/v1/projects/P/pools`, optional `budgets` with the six
explicit fields, under existing project administration permission.
Read: `GET /api/v1/pools/P/budgets?projectId=PROJECT` (project view).
Change: `PATCH /api/v1/pools/P/budgets`, body `{projectId,budgets}` (project
administration). A patch must supply at least one field, merges only those
fields and never clears an omitted value. Tenant RLS and a row lock protect the
read-modify-write. Numeric budgets are not source secrets or customer row data.

Effective changes append immutable `PoolBudgetsChanged` audit entries with
project, actor, pool target, before and after in the same transaction, matching
the audit trail used by pool table changes. Unchanged patches add no duplicate
change. An explicit creation decision is audited from an empty object;
idempotent creation replay cannot overwrite a later change or repeat its audit.
A different creation budget with the same idempotency key conflicts.

The archived first-hour acceptance explicitly chooses `threads:1` at creation,
reads it back, then patches `rowsPerRequest:50` and verifies both fields before
querying. It still uses Engine-host secret import followed only by public
Opintel APIs/MCP; there is no direct-store budget setup.
