# X-01 — DuckDB construction concurrency and binding findings

21 October 2026. Read-only investigation of product code at `889db032adadc77c253bb07ec3d08d38f51348a7`; disposable harness only. No product/configuration changes, gate, commit or source-data access. The broad changelog investigation was stopped at the reader's instruction; the two specifically requested PRs were checked.

## Construction stability measurements

**No crash reproduced:** all three runs completed and closed 10,000 instances and exited normally with code 0 (30,000 constructions total).

| Parallel lanes | Constructions completed | Instances closed | Normal exit / code | Peak RSS | Wall time |
|---|---:|---:|---|---:|---:|
| 2 | 10,000 | 10,000 | Yes / 0 | 73,441,280 bytes (70.04 MiB) | 56.167 s |
| 4 | 10,000 | 10,000 | Yes / 0 | 79,167,488 bytes (75.50 MiB) | 49.116 s |
| 8 | 10,000 | 10,000 | Yes / 0 | 89,382,912 bytes (85.24 MiB) | 48.300 s |

Each measured run used a fresh Node process and exactly 10,000 total construction attempts shared among the indicated number of asynchronous lanes. A lane awaited creation, connected, closed the connection, and synchronously closed the instance before taking another attempt. The first connection also read the effective settings and engine version. No retries within a run, no early cancellation or time cutoff. Runs were sequential, not simultaneous. “Completed” counts successful instance constructions; the separate closed count confirms teardown finished as well. Peak RSS is the whole child process high-water mark, not a periodic sample or the DuckDB memory limit. Wall time is parent monotonic elapsed time including process launch and exit. Exit code is that returned by `/usr/bin/time -l` for the child; its log independently retains the OS measurements.

Runtime: Node v20.19.3, Darwin x64; `@duckdb/node-api` and `@duckdb/node-bindings` both 1.5.6-r.1; DuckDB v1.5.6/069cc9f9b5. Host: 8 GiB RAM, four logical CPUs. `UV_THREADPOOL_SIZE` and `NODE_OPTIONS` were unset. Parallelism means outstanding JavaScript construction lifecycles; the default four-thread libuv worker pool still schedules native async work, so parallel 8 does not imply eight simultaneous `OpenWorker::Execute` calls. No worker-pool override was introduced.

The query profile passed freshly to each `DuckDBInstance.create(':memory:', options)` was:

```json
{
  "enable_external_access": "true",
  "memory_limit": "256MB",
  "threads": "1",
  "temp_directory": "",
  "max_temp_directory_size": "0B",
  "autoinstall_known_extensions": "false",
  "autoload_known_extensions": "false",
  "allow_unsigned_extensions": "false"
}
```

The API helper additionally sets `duckdb_api=node-neo-api` (installed `node_modules/@duckdb/node-api/lib/createConfig.js:12`; the fetched 1.4.3-r.3 helper does the same). Effective memory is 244.1 MiB, threads 1, empty temp directory and zero spill. This is the seeded demo profile, not a recovered snapshot of the crashing native configuration. No scanner load, hardening SQL, source staging, appender use or result workloads were added to the construction probe.

Artifacts are outside the product in `/private/tmp/opintel-x01-20261021/`: `construct.cjs`, `run.py`, and, for each parallelism P, `query-pP-events.jsonl`, `query-pP-result.json`, `query-pP-process.json`, and `query-pP.log`. Event records preserve begin/construction/close counts. `query-pP-process.json` preserves exit code, OS peak RSS in bytes and monotonic wall time. Harness SHA-256: `797a82544b34b7b20ca4cc1bbe61daf1b7737a1036c30a25bee9ec9910cf6f1c`.

Measurement setup disclosure: an initial serial probe stopped on a harness-only BigInt JSON-serialization error after its first construction; serialization was corrected. A subsequent serial run completed 10,000 constructions. An initial parallel-2 run also completed 10,000, but the sandbox blocked `/usr/bin/time`'s system-statistics query, so that wrapper exited 1 without the required RSS measurement. Its artifacts remain under `sandbox-query-p2*`. The table contains the complete later measurements outside that sandbox, not that failed instrumentation attempt. No native crash occurred in either preliminary loop.

These probes establish only the result of bounded construction/connect/close loops. They do not reproduce the original sustained mixed SQL, scanner, staging and result-processing workload, and do not close X-01.

## Which construction the crash identifies

The original capture is `/Users/rzarita/Library/Logs/DiagnosticReports/node-2026-10-18-140612.ips`, PID 72511, captured 18 October at 14:06:04.2969 EDT (18:06:04 UTC). Faulting thread 7 proceeds through `OpenWorker::Execute` → `duckdb_open_internal` → `DatabaseInstance::Initialize` → `DatabaseInstance::Configure` → `DBConfigOptions::operator=` and an unordered-map node copy. It identifies native database creation, before `connect()` and before the new instance's hardening.

All relevant callers share `sidecar/session/infrastructure/duckdb.ts:21`. The crash contains no JavaScript async stack, session role, request correlation or configuration contents. It therefore **cannot distinguish a query privileged/agent instance from a standalone validation instance**, nor query preflight from query execution. The process launched at 13:45:02.8274 EDT and had already served sustained traffic, so its one-time startup probe is excluded. The concurrent PostgreSQL scanner and `duckdb_functions()` stacks in other threads demonstrate mixed work in progress, but do not identify the crashing worker's caller. Claiming one exact query/validation caller would exceed the evidence.

Historical code at `02f187f` (last commit before the capture) has the same creation options and request-limit injection. The upgrade parent retains these options. Creation/hardening settings are:

| Setting | Configuration copied at creation | Later hardening of that instance |
|---|---|---|
| `enable_external_access` | Explicit `true` | Agent/validation becomes `false`; privileged stays `true` |
| `memory_limit` | Query: request limit; standalone validation: 128 MB | Explicitly set again to that limit |
| `threads` | Query: request limit; standalone validation: 1 | Explicitly set again to that limit |
| `temp_directory` | Explicit empty string | Same value set again |
| `max_temp_directory_size` | Explicit `0B` | Same value set again |
| `autoinstall_known_extensions` | Explicit `false` | Same value set again |
| `autoload_known_extensions` | Explicit `false` | Same value set again |
| `allow_unsigned_extensions` | Explicit `false` | Same value set again |
| `duckdb_api` | API helper adds `node-neo-api` | Not changed by hardening |
| `lock_configuration` | Not explicitly supplied | Set `true` last |

Sources: `sidecar/start.ts:37`, `sidecar/session/infrastructure/duckdb.ts:17`, `sidecar/session/infrastructure/harden.ts:5`, `sidecar/session/infrastructure/validation.ts:8`. Query memory is the lesser of project and optional pool limits; threads is the pool budget (`src/modules/mcp/infrastructure/query-reader.ts:37`). The seeded demo values are 256 MB and one thread; the crash does not prove those were its actual numeric options. Scanner load and `pg_connection_limit=1`, `pg_connection_cache=false`, `pg_use_ctid_scan=false` happen after instance construction (`sidecar/session/infrastructure/duckdb.ts:32`), so are not fields passed by this create call.

Each `TwoSessionExecutor.withAgent` opens privileged then agent (`sidecar/session/infrastructure/two-session.ts:25`, `:29`). A successful query normally invokes that pair for preflight and again for execution (`sidecar/execution/application/execute.ts:54`, `:97`): **four constructions across two successive pairs**, rather than only two total constructions. Standalone `/validate` uses its separate one-instance 128 MB/one-thread path.

The capture's 42.3 GB virtual memory map is not an RSS measurement; it contains no usable system-pressure/RSS/swap sample establishing memory exhaustion. SIGSEGV in a later configuration copy also cannot by itself establish where any preceding heap corruption originated.

## Staging, proof labels, returnedRows and materialisation

The path **does use an appender for native chunk transfer**. It does **not manually populate list child vectors or validity masks from JavaScript through the low-level C API** on the inspected paths. Those are different operations; appender presence alone does not establish that the list-writing bug was exercised.

| Path | Actual mechanism | File and line |
|---|---|---|
| Contributor proof labels | Fresh per-scan HMAC key; each non-null entity becomes a hexadecimal string, otherwise null; hidden proof column is VARCHAR | `sidecar/execution/infrastructure/postgres-source.ts:86`, `:134`, `:139`; `src/shared/execution-contract.ts:44` |
| Treated rows, including proof labels | Callback sends rows to `staging.append`; implementation prepares scalar parameterized INSERTs, binds string/number/boolean/bigint/null and runs each row | `sidecar/execution/application/execute.ts:80`, `:86`; `sidecar/session/infrastructure/duckdb.ts:51`, `:54` |
| Complex types on that INSERT path | Bind JSON text and cast through JSON in SQL; no JS list-vector writer | `sidecar/session/infrastructure/duckdb.ts:53`; `src/shared/staging-types.ts:7` |
| Clear/aggregate-only scanner materialisation | Native PostgreSQL scanner plus `CREATE TABLE ... AS SELECT`; no JS-populated vector buffer | `sidecar/execution/application/execute.ts:78`; `sidecar/execution/infrastructure/postgres-source.ts:73`, `:79`; `sidecar/session/infrastructure/duckdb.ts:61`, `:65` |
| `returnedRows` | `SELECT COUNT(*)` over the privileged staged table, converted to a JS number in receipt metadata; zero for the empty denied-scope branch | `sidecar/execution/application/execute.ts:75`, `:90`, `:92` |
| Privileged-to-agent transfer | Stream DuckDB-owned data chunks; destination `createAppender`, `appendDataChunk(chunk)`, `flushSync`, `closeSync` | `sidecar/session/infrastructure/duckdb.ts:56`, `:58`, `:59`; caller `sidecar/execution/application/execute.ts:93` |
| Final query result materialisation | `prepared.runAndReadAll()` then `getRowsJson()`; reads result vectors into JS rows; optional custody sealing follows | `sidecar/session/infrastructure/duckdb.ts:159`, `:161`; `sidecar/execution/application/execute.ts:99`, `:103` |

The installed appender's `appendDataChunk` forwards the chunk handle to native `append_data_chunk` without calling `DuckDBListVector.flush` (`node_modules/@duckdb/node-api/lib/DuckDBAppender.js:157`). Appender `flushSync` calls `appender_flush_sync` (`:23`); it is not the JavaScript list-vector `flush` method. Result conversion reads the existing chunks (`node_modules/@duckdb/node-api/lib/DuckDBResultReader.js:187`; `lib/convertRowsFromChunks.js:4`). No calls to low-level `validity_set_*`, `validity_row_is_valid`, `list_vector_set_size` or `list_vector_reserve` were found in product `sidecar/` or `src/` code.

This is a source-path assessment, not a native heap trace proving every internal allocation safe. DuckDB itself necessarily manipulates native list and null data; that does not show use of the faulty JavaScript vector-population path.

## Binding versions and the two requested fixes

Before upgrade commit `02a47783d829c0a48973519f43fbf86c3b7f147a`, `package.json` pinned `@duckdb/node-api` **1.4.3-r.3** and `package-lock.json` resolved `@duckdb/node-bindings` **1.4.3-r.3**, native DuckDB 1.4.3. The current installed API and bindings are both **1.5.6-r.1**.

| PR | In 1.4.3-r.3? | In 1.5.6-r.1? | Relevance |
|---|---|---|---|
| [447 — reserve list child vector capacity](https://github.com/duckdb/duckdb-node-neo/pull/447) | No | Yes | Fixes JS `DuckDBListVector.flush()` writing beyond child data/validity capacity when list children exceed initial allocation. The inspected staging path passes existing native chunks and does not call that writer. |
| [495 — bound validity mask writes and improve bind errors](https://github.com/duckdb/duckdb-node-neo/pull/495) | No | Yes | Bounds low-level validity-mask accessors. PR explicitly states the high-level API uses its JS validity implementation instead; product code does not call these low-level accessors. |

Ancestry was checked, not inferred from version ordering. Public source metadata was fetched solely to answer the specifically requested PR-inclusion question; no broader changelog conclusion is claimed. The old version bump is `3e1f5e63566cba3646da675b206cd81cc8e004bc`; PR 447 merge is `21808e344131b038b19ed9c9c72213d0628f7fb6`, PR 495 merge is `51723cfa9ed27782221ad90c5aa1a8d223c70898`. GitHub comparisons put each merge strictly after the old bump and both as ancestors of tag `v1.5.6-r.1` (118 and 11 commits ahead respectively, zero behind). Raw responses are retained as `old-to-447.json`, `old-to-495.json`, `447-to-current.json`, `495-to-current.json` in the artifact directory. Release announcements also identify PR 447 in [1.5.5-r.2](https://github.com/duckdb/duckdb-node-neo/discussions/450) and the validity fix in the [1.5.5-r.5 release history](https://github.com/duckdb/duckdb-node-neo/discussions/497).

Installed confirmation: `node_modules/@duckdb/node-api/lib/vectors/DuckDBListVector.js:121` reserves before setting size; `DuckDBValidity.js:53` edits JS validity data and `:81` copies it through the API's own flush route. Neither fix names configuration copying as its target. Their inclusion does not establish the cause or resolution of X-01.
