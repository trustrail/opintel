# SpiceDB schema-load recovery

Branch: `feat/console-followups-1`, starting at `bbdc74b`.
Main checkout only: `/Users/rzarita/opintel`. This product fix is committed
separately from the console work; no merge.

## Step 0 — ordering before the change

The packaged gateway already waits for SpiceDB health. In
`deploy/customer/command:32–38`, startup waits for PostgreSQL, Redis and the
SpiceDB database; runs application migrations; runs SpiceDB datastore migrations;
starts SpiceDB with `compose up --wait`; runs the schema job; installs the
application database role; then starts API, console and ingress. Jobs use
`compose run --no-deps` at line 19. The schema and SpiceDB service definitions
(`deploy/gateway/services/schema.json`, `spicedb.json`) have no `depends_on`;
the shell enforces the ordering.

The base SpiceDB definition has a TLS gRPC health probe at
`deploy/gateway/services/spicedb.json:25–37`. The customer installer replaces
that healthcheck at `scripts/operator/customer-install.ts:150`: TLS probe to
localhost:50051, CA file and server name, 10-second interval, 5-second timeout,
six retries. The installed probe checks gRPC health, not a successful schema
write. The prior loader made one schema RPC with a 5-second deadline at
`src/modules/authz/infrastructure/load-schema.ts:30` in `bbdc74b`.

Retained packaged run `tmp/console-first-run-acceptance-zG8LxJ` reached SpiceDB
Healthy before `schema_load.failed`. Its server reported WriteSchema `Canceled`
with `context canceled` near the request deadline. This establishes a failed
write after the health wait; it does not establish why the RPC was delayed.
The full retained timestamps and image identities are recorded in
[the console report](console-followups-1.md).

## Change

Only the schema-loader product behavior changes. A monotonic 120-second write
budget contains RPC attempts of at most 5 seconds, with 250 ms backoff. The final
RPC and backoff are capped to remaining time. Only native gRPC UNAVAILABLE (14),
DEADLINE_EXCEEDED (4) and CANCELED (1) retry. Schema, permission, authentication,
unknown and all other failures stop immediately. The same client and identical
schema are used on each attempt; the client still closes in `finally`.

Every actual retry logs `schema_load.retry`, the upcoming attempt number and
the allowlisted status name. Exhaustion or non-transient failure exits nonzero
with an authored message naming SpiceDB and the last code. Native exception
messages, schema text, endpoint and token are never interpolated into these
diagnostics. Unrelated exception handling retains the existing sanitizer.

No migration, permission, route, schema content, Compose order, healthcheck or
other timeout changes. The existing timeout-audit backlog section records the
former single 5-second attempt as fixed in this branch.

## Targeted validation

```sh
npm test -- test/authz-spicedb.test.ts test/customer-command.test.mjs test/provisioning-runtime.test.mjs
```

Exit 0: **18 tests, 3 files**, 13.64 seconds. Existing authz tests remain green.
New tests in `authz-spicedb.test.ts` cover all three transient codes before
success; immediate failure on invalid schema, permission denied, bad token,
resource exhaustion and unknown codes; retry diagnostics without native secret
text; and deterministic 120-second exhaustion with 22 full RPC allowances plus
one final 4.5-second allowance. The latter uses an injected clock/sleep and
honours the supplied RPC allowance rather than waiting two real minutes.
DEP-008 and packaged startup failure-propagation assertions passed unchanged.
Log: `/private/tmp/console-followups-schema-retry-targeted.log`.

Strict `npm run typecheck`: exit 0.
Log: `/private/tmp/console-followups-schema-retry-typecheck.log`.

`npm run lint`: exit 0; no dependency violations (579 modules, 1,917 dependencies).
Log: `/private/tmp/console-followups-schema-retry-lint.log`.

Completed-candidate gate and fresh packaged results are recorded below. The gate
ran once after the focused fix was committed and pushed; fresh amd64 images and
archives followed that passing gate.


## Completed-candidate gate

Focused product fix: **efd5f207c9a9149ba7503a4eddd1864d7727956f**, committed and
pushed separately as `fix(authz): retry transient SpiceDB schema writes during
installation`. No subsequent product or test changes were made.

`COMPOSE_PROJECT_NAME=opintel npm run check` ran **once**, exit **0**,
**2119.97 seconds** (35 minutes 20 seconds). All seven tiers and cleanup passed.
Normal tests: **2,214 passed in 265 files**. Conformance: **36 passed**, 28/28
screen routes, zero findings. Smoke: **1 passed**, continuous browser/MCP path
27.1 seconds, including the real query, receipt and historical decision checks.
[Structured gate result](spicedb-schema-load/gate-efd5f20.json).
Log: `/private/tmp/console-followups-schema-retry-gate-efd5f20.log`.

## Fresh packaged verification and screenshots

All steps used the unchanged standard scripts, sequentially, on the same
`efd5f20` candidate:

```sh
BUILD_CANDIDATE=1 TAG=candidate-console-followups-efd5f20 PLATFORM=linux/amd64 IMAGE=all node scripts/images/build.mjs
PLATFORM=linux/amd64 node scripts/images/customer-package.mjs tmp/images/releases/candidate-console-followups-efd5f20-api-engine-console-egress-migrations-provisioning-demo-tools.json tmp/console-followups-efd5f20-packages --candidate
node scripts/images/console-first-run-install.mjs tmp/console-followups-efd5f20-packages efd5f207c9a9149ba7503a4eddd1864d7727956f
```

Image build and archive commands exited **0**. All **7 amd64 images** passed
secret/layer, runtime allowlist and runtime-user readability checks. Fresh gateway
and engine offline archives were created. [Image identities](spicedb-schema-load/images-efd5f20.json).
The candidate/dirty flags reflect the pre-existing unrelated untracked documents
in the main checkout; they were preserved and not included in the fix commit.

Fresh packaged acceptance ran **once** in
`tmp/console-first-run-acceptance-MRIa7D`, exit **0**, final status **passed**.
[Install result](spicedb-schema-load/install-efd5f20.json),
[browser result](spicedb-schema-load/browser-efd5f20.json).

| Step | Result |
|---|---|
| Fresh archive extraction | Passed |
| Gateway installation and schema load | Passed; API, console and ingress healthy |
| Engine installation | Passed |
| One-code pairing | Passed |
| Ordinary external source stored with engine `./sources add` | Passed |
| Fresh owner SMTP magic-link sign-in | Passed |
| Project creation / paired-engine attachment | Passed; exactly one paired engine attached unverified |
| Engine verification through console | Passed |
| Save source, choose schemas, scan through console | Passed; 2 tables, 8 columns, ~11 rows |
| Project query limits | Saved through console |
| Create pool with compound AND rule | Passed |
| Explicit Clear column decision | Passed |
| Issue first agent credential | Passed |
| Agent MCP request | Answered, exactly 6 permitted rows |
| Activity receipt | `Answered · 6 rows from table records` |
| Permanent first-receipt marker | Recorded; first-hour tracker disappeared |
| Per-table rule editors | Both visible; one condition and one explicit All rows |
| Browser errors | Zero |
| Harness cleanup | Completed; retained installation state and logs |

The new schema loader's actual packaged output contains
`Loaded opintel-schema.zed into SpiceDB.` after SpiceDB becomes healthy, followed
by API/console/ingress health. This run emitted **no schema retry**, so it proves
successful packaged execution of the new loader, not reproduction of the earlier
transient failure. Retry recovery and exhaustion are established by the targeted
cases. No claim is made that the prior cancellation's underlying cause is known.

Logs: `/private/tmp/console-followups-image-build-efd5f20.log`,
`/private/tmp/console-followups-archives-efd5f20.log`, and
`/private/tmp/console-followups-packaged-efd5f20.log`. Private install logs and
credentials remain in the retained run directory; no archives, keys, cookies,
certificates or private logs are committed. The committed JSON contains only
verification results and public image identities.

Eleven screenshots from this packaged console were captured by the committed
`scripts/images/console-first-run-browser.mjs` and copied unchanged to
[the screenshot directory](console-followups-1/screenshots-efd5f20/).
The console report links the requested views and lists remaining review notes.
No product styling was added after the gate. Only the main checkout remains;
no worktree was created, no branch was merged. The final report/screenshots commit
is documentation/evidence only and is pushed immediately. The MacBook Air command
reported in chat targets that final revision; native arm64 release verification
has not been run on this Intel host.
