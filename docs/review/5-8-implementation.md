# Item 5.8 implementation

The approved exact text is composed by `mcp/application/response.ts`. The existing
structured query result remains unchanged. The application supplies reporting
lineage from its parse and compilation; this never authorizes execution. The
sidecar remains authoritative.

Withheld names are supplied from decided columns of referenced objects.
Undecided elements never enter reductions. The compiler's source-column ordinal
order is retained. Returned token and mask lineage survives aliases and CTEs;
COUNT of a treated element is not reported as returning that treatment. MIN/MAX
of a masked element retain masked lineage. Aggregate-only use is named without
its threshold.

The corrected metadata contract is a Zod allowlist, also published in the MCP
OpenAPI schemas. It retains resolver states and safe producer-known distinctions
listed in `5-8-code-causes.md`. There is no arbitrary error-detail spread. Numeric
aggregate thresholds, estimates, suppressed counts and raw engine diagnostics
remain internal. Resource setting limits and queue depth are distinct from
aggregate disclosure thresholds and remain available.

Causes are annotated at their origin, not inferred by searching error prose.
Stable typed source-driver codes establish source connection/read failures;
unclassified native scanner failures remain unknown. Interrupted work remains
`interruption_unclassified`; 5.7a still owns first-cause provenance. Evidence
failures distinguish known pre-execution, known post-execution and unknown
progress. Dispatch alone is not treated as proof of execution.

The nested aggregate refusal now has the approved treatment code. Its S2d
internal sentence and refusal predicate are unchanged. The caller's exact
sentence distinguishes a real outer aggregation from an inner aggregation whose
counts cannot be verified. Every operator-needed sentence sets retryable false.
No bypass attack SQL, expected refusal or specification was changed.

## Verification

Verification completed on 2026-09-28 with fresh, sequential reruns of commit
`b7474d5` after the machine crash. All three commands exited 0. The earlier
focused MCP/formatter/resolver run passed 93 tests.

| Check | Command | Final result |
|---|---|---|
| Full suite | `npm test` | 116 files, 1,260 tests passed; zero failed or skipped. Duration: 342.05 seconds. |
| Isolated ING-17 | `npx vitest run test/ingest-extract.test.ts -t ING-17` | Both streaming tests passed; the other 11 tests were excluded by the name filter. Duration: 38.93 seconds. |
| Complete bypass gate | `npm run test:bypass` | 97 passing checks, zero registered open checks, zero regressions. |

The earlier full attempt encountered the existing ING-17 XLSX and CSV
60-second timeouts. In the final full run, XLSX passed in 13.549 seconds and CSV
in 39.500 seconds; in isolation they passed in 8.653 and 28.399 seconds,
respectively. Their code and timeout limits were unchanged. No bypass attack
SQL, expected refusal, specification or exemption was changed for verification.

The full and isolated runs also used default and JSON reporters to retain their
results; the table omits those reporting-only flags. Logs and JSON reports were
saved as `/private/tmp/opintel-5-8-{full,isolated}.{log,json}`, with the bypass log at
`/private/tmp/opintel-5-8-bypass.log`.
