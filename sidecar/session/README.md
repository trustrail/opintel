# Session construction (S2a)

Public execution seam: `TwoSessionExecutor` from `sidecar/session/index.ts`.

```ts
const executor = new TwoSessionExecutor();
const result = await executor.execute(sql, { memoryMb: 32, threads: 1 });
// result: { columns: string[], rows: unknown[][] }
```

Each call opens two independent, uncached in-memory DuckDB instances on the
pinned v1.4.3 engine. The privileged instance receives only hardening statements;
external access remains enabled at construction for future trusted scanners.
The agent instance receives C.2's complete ordered sequence, ending with
`SET lock_configuration = true`, immediately followed by the caller's SQL.
Neither instance attaches a source or installs a token/mask function or key.
Both instances and their connections close before success or failure returns.

The input SQL is executed unchanged, without inspection, rewriting, subset
checks, treatment enforcement or staging. Engine errors reject the promise;
there is no `sql_not_permitted` mapping. Even in-memory writes currently run.
This seam is intentionally available for independent session testing, and is
not mounted on the sidecar's HTTP listener. It is not a governed query endpoint.
Rows use the engine's JSON conversion (including strings for large integers).

`new DuckDBSessionEngine(observer)` optionally reports actual completed/failed
driver statements with a unique session id and role. Pass that engine into
`new TwoSessionExecutor(engine)` to collect a caller-owned statement log. The
default engine retains no log and emits no rows or SQL to telemetry. The
`SessionEngine` port also supports injected engines for setup/teardown tests;
it is a trusted dependency, never a request-supplied option.

S2a proves J-013, J-014, and J-020, plus the runtime last-statement assertion.
J-020 forces a real engine memory-limit failure in an isolated working directory
and checks that no spill files were created. This is not S4's sentinel scan of
disk and mapped memory. J-015–J-018 remain S2c; J-019 remains S4 after staging.
The independent S2b suite is not part of these construction tests.
