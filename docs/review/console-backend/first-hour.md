# First-hour acceptance

The completed targeted first-hour acceptance is **passed**:
[first-hour-passed.json](first-hour-passed.json). Earlier failed attempts below
remain retained as failures.


The historical baseline at `ccb09ae` used the development database and failed at
**bind-source**, HTTP 404, as requested. [Retained result](first-hour-baseline.json).
That baseline predates the later Engine-only-secret/disposable-source decision
and is not evidence that the current workflow passes.

The current harness starts a separate plain official Postgres container on its
own network, initialized only from `test/fixtures/first-hour/customer.sql`. It
runs the Engine archive's `./sources add` command with a mode-600 password file,
then passes only `secret://sources/first-hour` to the public gateway API. Nothing
uses the Engine's bundled readiness database, a seeder or an internal project
provisioning script. The source fixture is external to Opintel's stores.

After normal SMTP owner login, `scripts/images/first-hour.mjs` creates an empty
project, registers/verifies the paired Engine, registers the external source,
waits for normal catalogue discovery, creates a pool with two selected tables
and its own row rule, verifies a Set rows finding for an incompatible table,
saves that table's own rule, and removes/re-adds it. It declares the contributor
and token inputs, saves each of the six treatments, issues a fresh credential,
runs a governed MCP query, and fetches its completed receipt. The query must
respect the row rule and both query response and receipt must carry its decision
evidence. Every step is named in result.json; any absent endpoint fails that step.

The workflow module imports only public transport tooling. A regression test
rejects added internal-store imports and the old readiness reference. During the
first-hour phase, the driver refuses internal operator/Compose/psql commands;
its only host-command exception is the Engine package source command. That
command runs without a network. The gateway transport rejects source connection
URIs and the fixture password; the retained call audit contains method, path and
status only, never request/response bodies, cookies or credentials.

`stage5-smoke.mjs` runs this workflow after login in the normal release acceptance.
Its `--first-hour-only` flag runs the same archive-install/pair/login/first-hour
path and stops before XQ-200, browser and soak phases. A first-hour-only result
is explicitly scoped and must not be described as full Stage 5 acceptance.
Results are written before the disposable fixture is removed. An installed
customer's source data is never torn down by this test.

The operator authorized targeted tests, lint, strict typecheck and first-hour
acceptance for this prompt, explicitly forbidding a full gate. No merge or image
publication is authorized here. The final archived candidate result is recorded below.

The archived candidate attempts are retained without relabelling failures:

- [DELETE framing failure](first-hour-framing-failed.json): the host acceptance
  transport omitted Content-Length for DELETE. The public route correctly
  rejected the malformed request. UTF-8 JSON framing now covers every method.
- [Dashboard assertion failure](first-hour-dashboard-assumption-failed.json):
  the harness incorrectly required an optional dashboard-key field from the
  existing subscription-only provider health endpoint. That extra assertion was
  removed; the separate dashboard-health backend item remains pending.
- [MCP origin failure](first-hour-agent-origin-failed.json): the harness attached
  browser Origin/cookie defaults to agent requests. Default headers now match
  their actual clients. Explicit caller Origin is preserved, including refusals.
- [Client timeout failure](first-hour-client-timeout-failed.json): before the
  first-hour workflow, Node's global HTTPS Agent imposed its default five-second
  idle timeout despite the existing 30-second abort deadline. The request now
  explicitly uses that same 30-second deadline. A short-Agent regression proves
  it; neither product deadlines nor the database reset hook were changed.

The first focused deadline-test invocation was rejected by datastore safety
because it bypassed the normal launcher; the next launcher preflight found an
absent local Redis tag. The successful run uses the exact already-installed
Redis and SpiceDB image IDs. No datastore-safety assertion was bypassed.

## Retained pre-budget archived result

[Latest result](first-hour-missing-budget-failed.json) is **failed**, not a
passing first-hour acceptance. On the v2 archived candidate, both clean installs,
one-code pairing, the real SMTP relay check and normal email login passed.
The first-hour workflow passed 27 setup steps through source import/discovery,
table binding, Set rows, a table-specific rule, remove/re-add, all six treatments
and credential issuance. The MCP query then refused with `validation_failed`,
cause `invalid_settings`, evidence `01a185f6-5b9a-779a-8b29-622e6a5b192f`, at
2026-10-29T04:41:17.531Z. It did not produce a successful query receipt.

The existing query reader requires an explicit `pool.budgets.threads` value
(technical documentation, execution limits). Public pool creation accepts no
budget and no public pool-budget write API exists. This is a named missing public
configuration step, not a source failure or an excuse to write the database.
The operator has been asked whether to add an explicit positive threads input
to creation, with the acceptance choosing one, while preserving the refusal
when absent. No default, direct-store write, or refusal weakening was added.

[Interactive package proof](engine-sources-interactive.json) separately passed:
real terminal prompts, hidden password, reference-only stdout, names-only list
and explicit removal, running the packaged operator image with no host Node.
[Targeted checks](first-hour-checks.json) record the successful unit/integration,
lint, typecheck, syntax, migration round-trip and image/package audit checks.
No full gate, merge or publication was run for this prompt. At that checkpoint the implementation
was retained pending resolution of the public budget input. The approved budget
input and final acceptance below supersede that incomplete checkpoint.


## Approved budget input and fixture correction

The operator approved all six explicit pool budget inputs and public read/change
APIs. [Budget inventory, requirements and seeder values](pool-budgets.md).
The missing-budget result above is retained as history; the first-hour now sets
threads to one explicitly, reads it back and changes an optional limit through
the public API. No numeric backend default or internal-store setup was added.

The next v3 archived attempt passed both installs, pairing, real SMTP relay,
normal email login and all 29 setup checks, including budget creation/read/change.
It **failed** the MCP query with `unsupported_pushdown` / `scan_size_unknown`,
evidence `01a18613-ebde-7372-8fb0-c8456b2a38c4`, at 2026-10-29T05:13:36.323Z.
[Retained result](first-hour-scan-estimate-failed.json). The new plain Postgres
fixture had not been analyzed, so `pg_class.reltuples` remained unknown. The
checked-in external fixture now explicitly analyzes both tables after loading.
This makes source metadata deterministic without waiting for autovacuum; no
product estimate, source consent or staging refusal was changed. Runtime images
are unchanged by this external fixture correction.

The old harness marked the MCP request as a passed step before checking isError.
Thus the raw pre-budget result reports 28 steps and the scan-estimate result 30,
each including its refused query. Neither is a passing acceptance. The harness
now marks a query passed only after its response and row-rule assertions pass.
Future refusals retain bounded code/cause/evidence fields, never free-form
response content. The original failed JSON records remain unchanged.


## Final targeted acceptance — passed

[Archived result](first-hour-passed.json): scope **first-hour**, native amd64,
local unpublished candidate `candidate-console-first-hour-v3`, based on a3f3e34
plus the staged implementation. Both customer archives installed into an empty
Docker daemon. Pairing, permissions, HTTPS default, real SMTP accepted response
and normal owner SMTP login passed. The independent checked-in SQL fixture was
started on its own network and imported through the packaged Engine command.
All **31** first-hour steps passed, ending with a governed answer and its
completed receipt; recorded latency was **1,882 ms**, with row-rule decision
evidence present. The run lasted 260.841 seconds from start to completed result.
Its private run directory is `tmp/stage5-acceptance-2H2lpy/`. The result was written
before fixture cleanup; private credentials, bodies and service diagnostics are
not copied into this review record.

The acceptance explicitly supplied every execution-required pool budget
(`threads:1`), verified the public read result, then changed an optional row
limit through the public PATCH endpoint. No seeder, internal project script or
direct write to an Opintel store was used in the first-hour phase. Only the
approved Engine-host source-secret write precedes the public API workflow.

This is **not** a full Stage 5 acceptance: no XQ-200 phase, browser tier or soak
was run by `--first-hour-only`. Targeted unit/integration tests, strict typecheck,
lint, syntax checks, migration round-trip and image/package audits are recorded
in [checks](first-hour-checks.json). No full gate, merge, tag or publication was
performed. The earlier red results remain red and retained.
