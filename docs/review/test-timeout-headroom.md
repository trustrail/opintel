# CPU and I/O test timeout sweep

The full functional run reported 936 passes and one ING-17 XLSX timeout; the
isolated ING-17 rerun passed. The XLSX case already had **30 seconds**, rather
than the Vitest default. Its 20,000-row workbook creation, hashing, inspection,
shared-string disk index and row emission now get **60 seconds**, matching the
existing 100,000-row CSV case.

The following default-timeout cases now explicitly get **30 seconds**, following
the earlier migration-test headroom convention. These are workload-based choices,
not claims that every listed case has previously timed out.

| File | Cases / hook | Substantial work |
|---|---|---|
| `test/ingest-extract.test.ts` | ING-09/11, ING-10, ING-13, cached formulas | Write and reopen compressed XLSX workbooks, including twelve-sheet selection and multiple workbook variants |
| `test/ingest-extract.test.ts` | ING-02/16; arrival registration and restart | Repeated filesystem scans, extraction, durable register writes and recovery |
| `test/ingest-land.test.ts` | ING-07 concurrent filings/rollback; ING-07/12/26 watcher/restart | Concurrent landing transactions, row streaming, DDL rollback, repeated scans and restart |
| `test/module-boundary.test.mjs` | Four parameterized layer cases and three cross-module cases | Initialize ESLint and load configuration/plugins to lint real fixtures |
| `test/canonicaliser-registry.test.mjs` | Clock/forbidden-capability lint case | Initialize ESLint and lint the fixture plus multiple source samples |
| `test/tokenization-boundary.test.ts` | Application import/key-resolution boundary | Recursively read and parse the entire application source tree with TypeScript |
| `test/tokenization.test.ts` | TOK-03 | 10,000 cryptographic transformations and equality assertions |
| `test/tokenization.test.ts` | TOK-20 | Launch two fresh Node/TypeScript processes in different timezones |
| `test/tokenization.test.ts` | Committed Unicode fold-map case | Read and compare the full Unicode C/F mapping corpus |
| `test/project-members.test.ts` | E-015/E-016, 200 projects | Populate projects/memberships, write SpiceDB relationships, perform lookup and paginated HTTP requests |
| `test/tenancy-list-routes.test.ts` | Full denied-candidate batch | Populate 103 projects and walk authorization-filtered pages |
| `test/identifier-resolver.test.ts` | VC-22 | Start native DuckDB, create fixture tables/views, run DESCRIBE and catalogue queries |
| `test/demo-pack.test.ts` | `beforeAll` | Generate development certificates and sidecar configuration |
| `test/filing-register.test.ts` | `beforeAll` | Generate certificates/configuration and start the TLS receipt server |
| `test/landing-receipt.test.ts` | `beforeAll` | Generate certificates/configuration and start the TLS receipt server |
| `test/source-connector.test.ts` | `beforeAll` | Run OpenSSL to generate a CA and client/server RSA keys and certificates |

Only individual test/hook timeout arguments change. Assertions, fixture sizes,
product deadlines, polling assertions, performance thresholds, retry counts and
the global Vitest default remain unchanged. Already explicit migration,
subprocess, large CSV and performance/stress-suite budgets remain unchanged.
Small single-request and in-memory cases retain their defaults.

Validation: the full functional suite passed **937 tests in 87 files**, including
both large ING-17 cases, in 281.79 seconds. Strict typecheck passed. A comparison
against the files before this sweep verified that every test and hook body is
byte-for-byte unchanged across the 13 edited test files.
