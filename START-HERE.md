# Start here

## 1. Start the development stack

Install Node 20.19+, OpenSSL and Docker Compose v2, then start Docker. On the first checkout:

```sh
npm ci
cp .env.example .env
```

Start or recover the stack with:

```sh
npm run dev:up
```

This starts Compose and waits for Postgres, Redis and SpiceDB readiness, creates
both `opintel` and `opintel_test` if missing, applies all migrations to both, and
loads `docs/opintel-schema.zed`, and starts the local sidecar over pinned mTLS. It is safe to run again: existing databases are
kept and only pending migrations run. SpiceDB dispatch caching remains enabled.

Use this command after `docker compose down` / `up` or a volume reset. Compose
alone does not apply migrations or reload SpiceDB's in-memory schema. Bootstrap
restores the schema, not relationships lost from the in-memory datastore, and
does not restore deleted Postgres data.

Then run the API and frontend in separate terminals:

```sh
npm run dev:api
npm run dev
```

Run all tests with:

```sh
npm test
```

Tests read `.env` (explicit environment variables take precedence) and use
`TEST_DATABASE_URL`; if omitted, it is derived by appending `_test` to the database
name in `DATABASE_URL`. The development and test databases must be distinct.
`MIGRATION_DATABASE_URL` supplies schema-owner credentials for bootstrap; its
credentials are also used to migrate the test database.

Before any suite starts, a read-only preflight checks the test database, migration
checksums, Redis connectivity and the loaded SpiceDB schema. Missing prerequisites
fail once with their names and the recovery command `npm run dev:up`, rather than
producing failures in every suite. Tests do not create databases or load schemas
as a substitute for this preflight. CI uses the same bootstrap and checks.

## Local sidecar (S1)

`npm run dev:up` generates a local CA and separate server/client certificates
under ignored `tmp/sidecar/tls/`, then starts the sidecar as a background Node
process at **https://127.0.0.1:3100**. It waits for an authenticated, pinned
`POST /health` with contract 1. A healthy existing process is reused. This is a
local development process, not a container image or deployment package.

- Server configuration: `tmp/sidecar/service.json`.
- Application client configuration: `tmp/sidecar/client.json`.
- Process log and PID: `tmp/sidecar/service.log`, `tmp/sidecar/sidecar.pid`.
- Durable sampling audit: `tmp/sidecar/sampling-audit.jsonl`, identifiers and
  outcomes only. Source rows and resolved credentials are never written there.

To run in the foreground after stopping the background sidecar with SIGTERM:

```sh
npm run dev:sidecar -- tmp/sidecar/service.json
```

`dev:up` restarts the recorded sidecar: it checks the PID's command, sends SIGTERM,
and waits for process exit and port release before starting a replacement. An
unresponsive PID or occupied port stops bootstrap with a diagnostic; no second
sidecar is launched and no unrecorded listener is killed. Concurrent bootstrap
is guarded by `tmp/sidecar/startup.lock`; remove a stale lock only after verifying
that the previous `dev:up` has exited.

SIGTERM cancels source requests, drains the current durable ingest operation and
flushes the audit. `shutdownTimeoutMs` bounds the whole process. If draining fails
or exceeds it, the sidecar exits nonzero and reports that register locks may need
operator recovery. Configuration changes take effect on the next `dev:up`.
The generated certificates last 30 days; to regenerate them, stop the
sidecar, move `tmp/sidecar/tls` aside, and rerun `dev:up`. Never commit keys.

The startup command accepts a configuration filename; alternatively set
`SIDECAR_CONFIG_FILE`. Relative certificate and audit paths are resolved beside
that file. Server configuration contains the bind host/port, CA/server key and
certificate/client certificate pin, audit path, source connection ceiling,
statement/operation timeouts, request-body bound and shutdown deadline.
Keep `client.json` in sync when changing the server's address or identity.

Source credentials belong to the sidecar. In development, supply them through
its environment or ignored `.env.sidecar.local`. For example, the reference
`vault://customer/warehouse` resolves from `OPINTEL_SECRET_CUSTOMER_WAREHOUSE`.
The value is the customer Postgres connection URI. The application sends only
the vault reference. The programmatic host accepts a `VaultPort` for a production
secret manager; the CLI uses the existing development environment adapter.

Application-side setup uses the existing connector:

```ts
import { loadSidecarClientOptions, SidecarSourceConnector } from './src/modules/sources/index.js';

const options = await loadSidecarClientOptions('tmp/sidecar/client.json');
const connector = new SidecarSourceConnector('postgres', sourceContext, options);
```

`sourceContext` supplies the request, project and source IDs and the existing
sampling-consent/catalogue resolver. The client pins the server; the server pins
the application certificate. There is no bearer token. `/health` reports
`duckdb: "not-loaded"` until the separately implemented S2 runtime exists.

The five POST routes are `/health`, `/test-connection`, `/introspect`, `/sample`
and `/estimate`. `/health` has no body; the other routes use §2.7's envelope.
Cancellation is an HTTP request abort, not another endpoint. OpenAPI is in
`sidecar/openapi.json`, generated from the shared Zod schemas with
`npm run sidecar:openapi`. Integration tests start isolated hosts with real
certificates and test Postgres; they do not depend on the background dev sidecar.

## 2. Open Codex

    codex

## 3. First prompt

**The audit is finished.** Six rounds were run against these documents before
any code existed, and the last one returned no contradictions. You do not need
to run another. If you want to, the prompt is in `docs/prompt-library.md`.

**Start a new Codex session** and go straight to the first work item:

    Implement item 1.1 from docs/implementation-plan.md.

    Read: docs/slice1-technical-documentation.md sections 1.1 bounded
    contexts, 5.1 frontend tree, and 9.1 pipeline stages 1 to 3. Read
    AGENTS.md in full.

    Create only: the src tree, tsconfig with strict and
    noUncheckedIndexedAccess, eslint with the module boundary rule and rules
    blocking `any`, raw hex and arbitrary Tailwind values, dependency-cruiser
    config, and CI stages 1 to 3.

    No application code. Modules stay empty folders with an index.ts.

    Done when typecheck, lint and an empty test run pass in CI.
    Do not implement anything from another item.

Deliberately small. It establishes the shape everything else inherits, and it
shows you how the agent behaves on an unambiguous task before anything is at
stake.

Then work through `docs/prompt-library.md` one item at a time, in order,
reviewing each diff before the next.

## 4. Then build, one item at a time

`docs/prompt-library.md` has a prompt for every item, in dependency order.
Start at 1.1. Review each diff before the next.

Six items are marked DO NOT DELEGATE and are written by hand:

| Item | What |
|---|---|
| 1.4 | Tenant isolation wrapper |
| 4.3 | Tokenization |
| 4.4 | View compiler |
| S2 | DuckDB two-session construction |
| S4 | Ephemerality proof |
| C.6 | The bypass suite |

These are where a generator produces plausible wrong answers, and where a
wrong answer fails silently.

## What is here

| Path | What |
|---|---|
| `AGENTS.md` | Rules the agent must not violate |
| `docs/implementation-plan.md` | 91 items, dependency ordered, with gates |
| `docs/slice1-technical-documentation.md` | Domain, API, auth, schema, frontend, errors, testing, observability, CI, security, vocabulary, clarification |
| `docs/algorithm-specifications.md` | Tokenization, view compiler, DuckDB session, tenant wrapper, pipeline |
| `docs/test-specification.md` | 537 cases |
| `docs/opintel-master.css` | The product stylesheet. Ships unchanged |
| `docs/opintel-schema.zed` | SpiceDB schema |
| `docs/prompt-library.md` | A prompt per item. For you, not the agent |
| `reference/console.html` | The UI reference implementation. Open it in a browser |
| `src/` | Empty module tree, four layers per module |

## One thing to know

`reference/console.html` is not a mockup to be improved on. The shipped UI is
meant to look identical to it, and `docs/opintel-master.css` is its stylesheet,
extracted and shipped unchanged. React components are written to its existing
class names.

## Corrections applied

This package incorporates the findings of a specification audit run before any
code was written. Eleven cross-document contradictions were resolved, the
SpiceDB schema was corrected (it carried a superseded agent-admission model),
a migration ordering bug was fixed, fourteen previously undefined types were
specified, and every section citation in the prompt library was corrected.

## Audit history

Three rounds were run against these documents before any code existed.

| Round | Found | Notable |
|---|---|---|
| 1 | 24 | A superseded agent-admission model in the SpiceDB schema, a broken migration, a prompt library citing a document that is not in this repository |
| 2 | 11 | The route permission inventory, the Tailwind theme mapping, MailPort, the device-confirmation endpoint |
| 3 | 8 | The embedded authorization graph diverging from the `.zed` file, protocol tests that belong to Slice 3, `Clock`, `IdFactory`, `SchemaSpec`, `GeneratorSpec` |
| 4 | 12 | **The unqualified "nothing is copied" claim**, which stopped being true once spreadsheet ingest existed, plus nine implementation types used in interfaces but never defined |
| 5 | 15 | Twelve more types, including several published module interfaces, plus the branded id inventory made formal rather than prose |
| 6 | 5 | **No contradictions.** The last five published interfaces, plus four more the audit missed that a systematic check found |

**Section 1 came back empty on round 6.** Every published interface in the
bounded-context map now has a signature, and a check across every code block in
both specifications finds no type used without a declaration.

**On rounds 4 to 6.** Each defined types, and the next round found the types
used inside those definitions. Round 6 closed it by construction rather than by
list: 18 published interfaces, 112 declared types, and an automated check that
every PascalCase name appearing in a code block resolves to a declaration.

**Section 2 is not a defect list and never was.** Package manager, UUID library,
Redis key layout, snapshot baselines and OIDC clock skew are decisions for
whoever builds. They have been stable and correct across all six rounds. Make
them as you go and record them in the specification as you do.

Round 4 found the most commercially important defect of the four: the product
was claiming, in customer-facing material, that nothing is copied. Landing
writes a file into the customer's Postgres, so the defensible claims are that
**the query path copies nothing** and **nothing leaves the customer's
environment**. Both hold; the unqualified version did not.

For item 3.7 landing-zone configuration, rule snapshot provisioning, and local
registration/quarantine state, see [the sidecar ingest instructions](sidecar/README.md#landing-watch-and-identify-37).
The watcher only identifies and hashes files; extraction and Postgres landing are later items.

## Isolated authorization timing check

`npm test` retains the E-015/E-016 functional comparison of the project list with
SpiceDB LookupResources across 200 projects. Run the unchanged **under 100ms**
E-016 budget separately, after other tests finish:

```sh
npm run test:performance
```

This uses a dedicated Vitest configuration with one worker and no concurrency;
`test/performance/` is excluded from the main suite. CI runs it as a separate step
after `npm test`. Do not run the two commands concurrently. Both use the normal
service-readiness checks; bootstrap with `npm run dev:up` first.

The reinsurance demo pack and its local preparation/provisioning commands are
documented in [the sidecar demo instructions](sidecar/README.md#reinsurance-demo-pack-311).
`dev:up` also creates the separate `opintel_demo` landing database; application
migrations run only on the application and test databases.

Open `/projects/<project-id>/data-sources` to test and connect a Vault-backed
Postgres source. For demo data, run the documented preparation command and
`dev:up` first, then choose **Connect** on the industry demo card. A prepared
project remains empty until that action. Unprepared cards explain the required
operator step.
