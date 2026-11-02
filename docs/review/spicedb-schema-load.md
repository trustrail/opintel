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

Completed-candidate gate and fresh packaged results are recorded below
when available. The gate will run once, after the focused fix is committed and
pushed; fresh amd64 images and archives follow only if that gate passes.
