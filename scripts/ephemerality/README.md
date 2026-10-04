# S4: reviewed ephemerality proof

Run `npm run test:ephemerality`. Docker runs the separate, serial
`vitest.ephemerality.config.ts` project on Linux; `/proc`, ptrace and syscall
observation are mandatory. A host invocation fails rather than skipping tests.
The runner builds S5's shipping `engine` target and a separate controller target
from `deploy/engine/Dockerfile`, then starts disposable source/metadata Postgres,
SpiceDB and Redis services, and removes those services and volumes on exit.
It never uses the developer's databases. CI runs this as its own job.

## What is exercised

The inspected target runs the real Engine HTTP host, source connector,
tokenizer and pinned DuckDB 1.4.3 build. Clear, mixed clear/tokenized/masked,
and aggregate-only sources each have 100,000 rows. Independent expected-token
calculation, every treated append batch, and complete distinct-value reads of
both live DuckDB tables verify treatment and authorized delivery. Withheld and
undecided fields have different markers and must not reach target memory.
A literal and an alias in the clear query exercise the decision that telemetry
contains neither SQL text nor statement shape.

Success, caller disconnect, deadline, source failure after a batch, native
staging failure and memory pressure exercise cleanup. The harness counts
sessions and governed prepared handles, checks the actual spill settings of
every opened session, and verifies source backends have gone after the response.
It reports teardown counters before the host receives the execution result.
The tracing fixture configures a 1,000-second permitted operation budget; this is
not a latency benchmark and does not change production defaults. External
attachment cannot use strace's launch-time seccomp-BPF filter; its increased
tracing overhead exhausted the original 500-second fixture budget after 79,872
rows. The higher allowance retains all 100,000-row, live-control, coverage and
write-observation assertions; explicit cancellation/deadline cases retain their
triggered refusal checks. Memory pressure
is applied with an 8 MB native limit after partial staging. A classified native
allocation failure must be observed: an arbitrary source failure cannot satisfy
that scenario. The actual refusal code is retained, including today's
`source_unavailable` classification for some native allocation failures.
The application case exercises the real MCP interface, SpiceDB authorization
and durable Postgres evidence writer. It scans the run's evidence records and requires actual run/completion rows;
its existing 100-row delivery cap is retained. The direct Engine cases prove
100,000-row delivery. The source database is an authorized original-data store,
not a prohibited sink.

Fresh random marker families are generated outside the inspected processes,
not baked into source, arguments or environment. The receiver, scanner and
fixture writer are external to the inspected process tree. The target has no
access to their report mount. A small test-only N-API helper identifies the
retained Buffer allocations; finding another copy of the marker is insufficient
for the heap positive control. UTF-8 and UTF-16 controls stay live throughout
every scan. File controls cross a scanner chunk boundary. A log control proves
capture, and a write-then-unlink control proves write observation.

## Coverage and limits

At each checkpoint the scanner stops the entire target process tree and reads
all readable mappings, with explicit exclusions for non-readable mappings and
kernel clock mappings. It also reads the declared filesystem roots and open
unlinked regular files. Before-query and interruption checkpoints inspect the
control file, logs and shared-memory directory; the post-response checkpoint
walks all container regular files and `/dev/shm`, including temporary directories,
mounted source files and writable layers. Supported gzip/ZIP sinks are also
scanned after decoding. `/proc` and `/sys` virtual files, device nodes and the
external controller's reports are declared exclusions.

`strace` observes successful write payloads during execution, including writes
to files subsequently removed. Payload truncation, unresolved descriptors,
missing traces, positional writes without offset reconstruction, or overlapping file writes
without offset reconstruction report **INCOMPLETE**. Per-thread traces are merged
by syscall timestamp; sequential writes are checked across call boundaries,
including between threads. The outside controller attaches `strace` before
the target imports production modules. Successful io_uring activity,
zero-copy writes and shared writable file mappings likewise require independent
observation and cannot produce a verified result. The test uses Docker's default
seccomp policy and `UV_USE_IO_URING=0`; this is an explicitly declared I/O backend,
not a claim about every deployment backend. Unclassified filesystem writes
also make verification incomplete.

Actual stdout/stderr telemetry is captured and scanned. There is no configured
production span exporter in this code path: its status is **NOT_CONFIGURED**,
not a zero-match span test. Detecting tracing SDKs, instrumentation or tracing
environment configuration without a collection adapter makes coverage incomplete.
There are no configured proxy or collector spools or query-result caches in
this fixture. Adding those requires extending the coverage adapter and its
positive controls. Exception sanitisation is implemented separately as S4a; this proof does not
replace that control.

A verified result requires live positive controls, complete declared coverage,
correct treatment/delivery, cleanup on the tested exits, disabled spill, and no
workload markers in prohibited persistent sinks or observed writes. Permission
errors, short reads and missing files are incomplete, never zero matches. The
scanner's adversarial self-tests verify these distinctions and write parsing.

## Reading the reports

`test-results/ephemerality/<run>/<case>.json` records coverage, exclusions, resource
counters, writes and memory residuals at each checkpoint. Counts include all
matches in the scanned ranges; sample offsets are capped at 12 per range.
Counts are occurrences of marker representations, not distinct rows or values.
The console reports both total checkpoint matches and post-response matches.
No forced collection is performed and no residual match is suppressed to pass.
Response-completion, scan-request and freeze timestamps expose observation delay.
A snapshot is a checkpoint observation, not continuous memory surveillance.

Reports contain marker names, counts, digests and offsets, not matched bytes or
heap dumps. Raw syscall artifacts contain synthetic payloads and remain in the
local report directory; CI uploads JSON reports only. This runner must never
be pointed at actual customer sources.

This proves the declared fixture's query-path persistence properties. It does
not establish immediate erasure in managed heaps, native allocators or transport
buffers. Physical disk remnants, kernel buffers and hypervisor memory are outside
scope. The target is now S5's shipping image, with read-only root, `/tmp` and
`/dev/shm`, non-root UID 65534, no capabilities, zero core limits and no swap.
Only `/audit`, `/custody`, optional `/ingest` are writable; controls reside in
those mounts and workload markers there are never exempted. Forbidden writes
are attempted in every scenario. `shipping-runtime.json` proves actual image
identity and Docker controls; `sd-005.json` records active egress, receipt and
shipping-entry-point probes. Host logging/swap/dump and proxy/collector controls
still require operator evidence. Linux tmpfs size=0 means unlimited, not zero.

The shipping image lacks Python, strace, Vitest, certificate generation, the
Postgres fixture CLI and the address addon. Its outside controller supplies
those tools and reports, with shared PID/network namespaces for attachment and
receiving requests. Only the controller has SYS_PTRACE. Read-only test mounts
supply instrumentation and the allocation addon, while baked production modules
remain unchanged. No controller report mount is accessible in the engine.
The proof declares loopback for variable local test transport ports; the
application fixture adds explicit Redis/SpiceDB destinations to its network
policy; these are test dependencies, not production-engine source hosts.
See [deployment instructions](../../deploy/engine/README.md) for both models.
C.5 explains why immediate erasure needs a different execution architecture.
