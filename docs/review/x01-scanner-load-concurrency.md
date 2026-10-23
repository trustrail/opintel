# X-01 — scanner-load construction concurrency

21 October 2026. Product tree inspected at `889db032adadc77c253bb07ec3d08d38f51348a7`. Disposable harness only; no product or runtime-setting change, gate, commit or source database connection.

## Results

**No crash reproduced.** Both runs completed all 5,000 iterations, closed every connection and instance, and exited normally with code 0.

| Parallel lanes | Completed iterations | Constructions | Instances closed | Normal exit / code | Peak RSS | Wall time |
|---|---:|---:|---:|---|---:|---:|
| 4 | 5,000 | 5,000 | 5,000 | Yes / 0 | 283,045,888 bytes (269.93 MiB) | 726.259 s |
| 8 | 5,000 | 5,000 | 5,000 | Yes / 0 | 375,730,176 bytes (358.32 MiB) | 754.094 s |

Completed iterations means successful create → connect → signed scanner LOAD → scanner settings → `duckdb_functions()` query and result conversion. The closed count separately confirms connection and instance teardown. Construction counts are also retained in the raw artifacts. Each run used a fresh process, ran sequentially after the preceding run, and shared 5,000 total iterations among the specified asynchronous lanes. There was no early cancellation, retry within a run, or timeout.

Peak RSS is the OS process high-water mark reported by macOS `/usr/bin/time -l`, in bytes with binary MiB conversion. Wall time is parent monotonic elapsed time including process startup and exit. Exit code is the measured command's exit code. RSS covers the whole Node/native process; it is not DuckDB buffer-manager usage.

## Workload and configuration

The extended harness is `/private/tmp/opintel-x01-scanner-20261021/construct.cjs`; the sequential measurement runner is `run.py` in that directory. It imports only the installed DuckDB dependency, not product feature code. The query profile is unchanged from the preceding construction probe:

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

Each fresh connection loads `/Users/rzarita/opintel/tmp/duckdb-extensions/postgres_scanner.duckdb_extension` using the same quoted `LOAD` and three follow-up statements as `sidecar/session/infrastructure/duckdb.ts:32`:

```sql
LOAD '/Users/rzarita/opintel/tmp/duckdb-extensions/postgres_scanner.duckdb_extension';
SET pg_connection_limit=1;
SET pg_connection_cache=false;
SET pg_use_ctid_scan=false;
SELECT * FROM duckdb_functions();
```

The query uses `runAndReadAll(...).getRowsJson()`, including conversion of list-valued function metadata. Each connection is closed before its instance is closed. No ATTACH, source credentials, source reads, SQL hardening, staging or appender workloads are used. The first connection additionally reads version and effective settings. With unsigned extensions disallowed and autoinstall/autoload off, successful explicit LOAD exercises the local signed scanner, without downloading an extension.

Runtime: Node v20.19.3, Darwin x64, installed API and bindings both 1.5.6-r.1, DuckDB v1.5.6/069cc9f9b5. Host: 8 GiB RAM and four logical CPUs. `UV_THREADPOOL_SIZE` and `NODE_OPTIONS` are unset. Parallel 4/8 means outstanding asynchronous lane lifecycles; native async work is still scheduled through the default four-thread libuv pool. Parallel 8 does not prove eight simultaneous native constructor or loader calls.

Artifacts in `/private/tmp/opintel-x01-scanner-20261021/`: for each P, `query-pP-events.jsonl` records attempted, constructed, loaded, queried and closed counts; `query-pP-result.json` records child completion; `query-pP-process.json` records exit code, OS peak RSS and wall time; `query-pP.log` retains progress and raw `/usr/bin/time -l` output.

Harness SHA-256: `866cdeca768a8bcccf222dfa16173339685bfb9f3e56a0fa77299c7a25215f43`.
Scanner SHA-256: `df00846cc68d99970a1088c654b98297de11148c7293c970877ea9c2fd9099b1`.

This bounded workload adds scanner loading and catalogue enumeration to construction/teardown. It still does not reproduce the original sustained mixed source-query/staging workload or establish X-01's root cause. X-01 remains open.

## Release-note entries after v1.4.3 through v1.5.6

Source: the already-fetched `/private/tmp/opintel-x01-20261021/duckdb-releases.json`. Titles and links below retain release grouping, including duplicate backport entries and test-only changes.

### v1.4.4

- [Give preference do variables set in config](https://github.com/duckdb/duckdb/pull/20396)
- [Skip concurrent_encrypted_attach due to race in autoloading httpfs](https://github.com/duckdb/duckdb/pull/20471)

### v1.4.5

- [Backport various race condition fixes to v1.4](https://github.com/duckdb/duckdb/pull/20804)

### v1.5.0

- [Move storage block prefetching to an option instead of baking in testing during ALTERNATIVE_VERIFY + add a test config for this option](https://github.com/duckdb/duckdb/pull/19146)
- [\[C-API\] Add support for defining config options (settings)](https://github.com/duckdb/duckdb/pull/19473)
- [CLI: Make startup-text display configurable using the .startup_text](https://github.com/duckdb/duckdb/pull/19584)
- [CLI: Make the progress bar configurable](https://github.com/duckdb/duckdb/pull/19650)
- [fix(#18481): Avoid to overwrite secret_directory configuration by it default value](https://github.com/duckdb/duckdb/pull/19448)
- [Checkpoint: prevent adding blocks to the `free_list` that are still being used by concurrent readers](https://github.com/duckdb/duckdb/pull/19928)
- [Fix race condition in piecewise merge join](https://github.com/duckdb/duckdb/pull/20059)
- [Fix concurrent test failure](https://github.com/duckdb/duckdb/pull/20129)
- [\[Dev\] Fix concurrent test failure (followup)](https://github.com/duckdb/duckdb/pull/20140)
- [Fix last parallel destructor race condition (hopefully)](https://github.com/duckdb/duckdb/pull/20251)

### v1.5.1

- [fix(storage): prevent TrimFreeBlocks from zeroing concurrently alloca…](https://github.com/duckdb/duckdb/pull/21146)
- [fix(adbc): support concurrent statements on the same connection](https://github.com/duckdb/duckdb/pull/21415)
- [Add allowed_configs option for allow-listing configs when setting lock_configurations](https://github.com/duckdb/duckdb/pull/20938)

### v1.5.2

- [Backport various race condition fixes to v1.4](https://github.com/duckdb/duckdb/pull/20804)
- [Add setting for limiting the number of threads launched concurrently in the test runner (`max_test_threads`)](https://github.com/duckdb/duckdb/pull/21520)
- [Fix ADBC data race](https://github.com/duckdb/duckdb/pull/21800)

### v1.5.5

- [Fix concurrent ALTER and INSERT crash](https://github.com/duckdb/duckdb/pull/23861)

### v1.5.6

- [Fix active query race](https://github.com/duckdb/duckdb/pull/24123)
