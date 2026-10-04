# S4a exception logging

The HTTP logger formerly passed `Error.stack` to `console.error`, including
the exception message in its header. It now emits one structured JSON event
with only the request id, safe type, allowlisted message and sanitised frames.
The message allowlist consists of four fixed diagnostics authored in the HTTP
server, plus fixed CLI usage and missing-configuration diagnostics. Unreviewed messages, including empty messages, use an explicit
withholding marker. Custom type names are not trusted. Shipped application
file locations are inventoried before requests; unknown locations and all
function labels are withheld. Line and column numbers remain available.
Raw headers, causes and other exception properties are never emitted.

## Exception-output audit before implementation

| Path | Finding |
|---|---|
| `src/platform/http/server.ts` | Raw stack; fixed by S4a |
| `src/platform/db/migrate.ts` | Originally wrote raw exception message to stderr; now uses the shared exception allowlist and directs native diagnosis to the database log |
| `src/modules/authz/infrastructure/load-schema.ts` | Originally wrote raw exception message to stderr; now uses the same allowlist and directs native diagnosis to the SpiceDB server log |
| `sidecar/start.ts` and `sidecar/startup-check.ts` | Startup logger prints generated check diagnostics rather than native exception text. Configuration field paths stay by decision: a path is not a value. Cause is retained internally but is not printed |
| Redis rate limiter, maintenance/recovery jobs, MCP and sidecar request handlers, ingest and tokenization telemetry | Inspected exception-related logs use fixed messages, categories, codes or allowlisted metadata rather than native messages or stacks |

The ingest CLI can print local register contents intentionally; that is
operator output in the customer environment, not an exception logger. The
local mail adapter prints a development login URL; it is also outside this
exception audit. Neither is evidence that all output in the repository is
value-free. S4a does not alter those paths or engine startup diagnostics.

## CLI decision and native-message evidence

The migration runner rethrows native PostgreSQL errors unchanged. The CLI
formerly printed their primary `message`, not their separate `detail` field.
Unique/check violations commonly identify objects and constraints in the
primary message and place row contents in `detail`; this is not a guarantee
for all failures. A read-only synthetic row cast against the current test
database returned SQLSTATE `22P02`, primary message
`invalid input syntax for type integer: "S4A_MIGRATION_ROW_SENTINEL"`, and
no detail. SQL/code backfills accepted by the runner can perform such casts.
This demonstrates the current driver path; it does not claim an applied
migration was observed failing or edit any applied migration.

Therefore both CLI catch handlers now emit the same allowlisted exception
record as HTTP. The schema loader reads the checked-in schema, not customer
rows, but raw RPC diagnostics are not limited to a reviewed set of object
names and can quote schema text. Diagnosis of suppressed native migration
errors requires the database log; schema-loader diagnosis requires the
SpiceDB server log. No server-side diagnostic logging configuration is
changed by this item.

`test/http-server.test.ts` exercises the default logger through a real HTTP
request with a sentinel-bearing exception and checks the unchanged safe 500
envelope. `test/http-exception-log.test.ts` covers exact message allowlisting,
safe code locations, malicious frame labels, native-style messages, custom
types, thrown objects and hostile accessors. No engine classifiers or S4
proof controls are changed.

Validation: both focused HTTP suites passed (21 tests), using an isolated
Vitest configuration without database setup because these tests use fake
ports. Typecheck, lint and `git diff --check` passed. The repository's test
wrapper also started a broader run because it adds the whole `test` directory
to supplied filenames; that unintended run was interrupted and is not
reported as passing.

After extending the shared allowlist to both CLI sinks, the complete suite
passed: 153 files, 1,476 tests. Typecheck and lint passed for the shared
implementation as well. The complete bypass gate passed: 97 passing checks,
zero registered open checks and zero regressions.
