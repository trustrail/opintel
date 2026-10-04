# S4 ephemerality: decisions, scope and local results

Recorded 2026-10-03 (Toronto). S4 is delegated under the exact conditions in
[AGENTS.md](../../AGENTS.md). The runner and coverage contract are documented in
[scripts/ephemerality/README.md](../../scripts/ephemerality/README.md).

## Decisions applied

C.5 and §8 now explicitly decide that execution telemetry contains metadata
only: neither SQL text nor statement shape. Aliases can contain values. Any
future shape recording requires its own reviewed sanitisation; the evidence
stripper is not that review or control. Existing execution logging already uses
identifier/outcome metadata; the proof installs no SQL observer. The separate
HTTP exception leak is recorded as S4a immediately after S4 and remains unfixed
here, as requested.

C.5 explains managed-heap reclamation and includes the accepted sentence:
“Immediate erasure would require an execution architecture that does not hold
results in a managed heap. That is a different design, and this proof does not
pretend otherwise.”

The zero-match/immediate-erasure promise audit covers these locations:

| Location | Corrected promise |
|---|---|
| Algorithm specifications C.5 guarantee table and proof | Resource closure and no query-path persistence; complete declared coverage, separate memory findings |
| Algorithm specifications TOK-38 | Treatment checked before append and in both live DuckDB tables; plaintext driver buffers are permitted and reported |
| Algorithm specifications treatment-memory paragraphs (A and C.3) | Reading/treating plaintext does not imply its bytes vanish immediately |
| Test specification J-019 | Zero workload markers only in prohibited persistent sinks; controls and coverage are mandatory |
| Technical documentation ephemerality acceptance paragraph | No universal memory-zero or secure-erasure assertion |
| Technical documentation security table, customer data at rest | Reference release is distinct from collection and byte erasure |
| Engine execution README cleanup paragraph | Removed its previous mapped-memory zero claim; points to the reviewed proof and residual report |

Repository searches found no remaining ephemerality “Zero matches” or “memory
freed before the response” promise. Unrelated landing-rule zero-match descriptions
retain their different meaning. Withheld/undecided markers must still be absent
from target memory: those fields have no permitted read path.

## Validation

The full `npm run test:ephemerality` run passed the scanner gate and all eight
Engine scenarios. Its application case failed during fixture provisioning when
an attempted project-settings update lacked tenant-role permission. The fixture
now configures its permitted tracing time budget during existing provisioning;
a targeted application rerun passed. Thus the nine scenario reports below and
the scanner gate are locally verified across those runs; this is not a claim
that the earlier full invocation exited successfully. Its failure did return
nonzero and clean up the isolated services. The targeted run's services were
also removed afterwards.

Strict typecheck and lint pass. The scanner gate includes eight adversarial
checks for controls, encodings/chunk boundaries, short reads, missing sinks,
truncated writes, split writes, descriptor parsing, thread ordering and
unsupported write backends. The separate Linux CI job has been added; remote
CI has not been run in this session. No production migration, route, CSS or
exception-logging implementation changed.

All nine reports have empty failure and incomplete lists, working live file
and allocation controls, and complete declared scan/write coverage. The success
cases deliver 100,000 clear or treated rows and the expected aggregate. Every
Engine session reports spill disabled; session/handle counts balance before
serialization and source backends are gone after the response. Failure cases
follow partial staging. The application delivers its configured 100 rows and
scans one run, one completion, four stages, three element records and one
redaction record, with no workload markers.

## Memory findings, separately

No forced collection was requested. These are actual immediate post-response
marker-representation occurrences, not distinct rows, live-object counts or
measurements of secure erasure. Full per-family counts, mapping ranges, coverage,
exclusions and observation timestamps remain in the local JSON artifacts.
Counts can vary with ordinary collection and allocator behaviour.

| Scenario | Declared proof coverage | Post-response memory occurrences |
|---|---|---|
| clear | VERIFIED | 629,033 |
| treated | VERIFIED | 1,217,607 |
| aggregate | VERIFIED | 101,636 |
| cancel | VERIFIED | 5,661 |
| deadline | VERIFIED | 5,585 |
| source_failure | VERIFIED | 3,810 |
| staging_failure | VERIFIED | 7,032 |
| memory_pressure | VERIFIED | 25,427 |
| application | VERIFIED | 103,746 |

None of these findings was discarded or converted to zero to pass. SQL-input
marker families and original/treatable row families are distinguished in the
reports. Samples are capped at 12 per range across marker families; counts are
not capped. The file-write positive control was found even though its file had
been unlinked, independently of the final directory scan.

## Limits and implementation finding

There is no configured span exporter, proxy/collector spool or result cache in
this fixture. Spans are reported NOT_CONFIGURED, not as a zero-match export
check; detected tracing without a collection adapter is incomplete. The proof
uses a declared syscall-observable Linux backend. Successful io_uring,
zero-copy writes, shared file mappings, positional writes or overlapping file
writes require further observation and cannot pass as complete. The writable
test image is not S5's production filesystem/egress package. Host swap/dump/logging
controls, physical remnants, kernel buffers and hypervisor memory are separate
deployment concerns.

The 8 MB native limit caused an allocation failure after 50,688 rows had staged.
The proof established native memory exhaustion, refusal without partial rows,
closed resources and no spill. The implementation returned `source_unavailable`
for this wrapped native allocation failure, rather than `budget_exceeded`.
That classification remains a finding, not a corrected contract or a claim that
resource-error classification is correct. S4 records the actual code and requires
native allocation evidence; an arbitrary source failure cannot satisfy this case.
No production error mapping was changed inside the proof.
