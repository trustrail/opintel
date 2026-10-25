# Stage 4 release at 6962c00

Seven clean linux/amd64 images were built from
`6962c00f06c72fdba8c6fa435e14131f122908f0`, audited, published to GHCR by
verified digest, and packaged. **Published-digest acceptance FAILED.** This is
not an accepted release, and no rerun was used to replace the failure.

The source tree passed all seven gate tiers before its commit: 2,090 tests in
239 files and browser/MCP smoke, 1,434.65 seconds. The unmodified machine record
is `stage4-6962c00-source-gate.json`. Its precommit base field is `e51ff3e`;
the tested tree and committed tree both equal
`6a2dded329913b0278d988eb008644d69554d493`.

## Artifacts and acceptance

- `stage4-6962c00-release-amd64.json`: seven exact published digests, upstream
  pins, source revision, migration identities and runtime artifact hashes.
- `stage4-6962c00-acceptance-amd64.json`: failed acceptance result; the failure text is summarized to exclude synthetic rows.
- `stage4-6962c00-release-result.json`: audit/package provenance, raw evidence
  hashes, final soak totals and the three failing query/receipt identifiers.
- Package: `/private/tmp/opintel-stage4-packages-6962c00-amd64.tar.gz`.
- Private installation and logs:
  `/private/tmp/opintel-stage4-release-6962c00/tmp/stage4-acceptance-bBlcB9`.

Both layer-secret and runtime-allowlist audits passed for API, engine, console,
egress, migrations, provisioning and demo-tools. Publication rechecked audited
image identity and verified each remote digest. Packages contain only pinned
Compose files, wrappers, release manifests and runbooks; private manifests,
credentials, certificates and result rows are not committed.

Fresh package installation, owner claim and normal login, provisioning, seed,
governance and egress-denial positive control passed. Provision/seed/governance
reruns preserved database state and the private credential manifest byte-for-byte.
The packaged API XQ connection check passed; its separate optional dashboard check
reported credentials_missing, retained verbatim. Certificates 223–226 each exchanged
with HTTP 200; preparation verified 11 redeemed values and receipt access.

The 120-second soak ran ten callers at 10,000 ms pacing. It returned 64 successes,
three source_unavailable, two element_withheld and one unsupported_on_aggregate_only.
One declared scenario mismatched (insured_name/masked); the other two unavailable
outcomes were exploratory. There were zero operational errors, zero skipped
receipt checks and ten verified custody values. Only 10 of 85 declared scenarios
were exercised. These results do not establish Stage 5 coverage.

## Execution-path finding from this amd64 run

All three unavailable responses have `cause: interruption_unclassified`,
`retryable: false`, and incomplete receipts with no completed source stages.
Their identifiers are absent from the retained engine execution log, which has
zero execution.refused events. There are zero registry verification/probe refusals.

| Caller | Iteration timestamp UTC (not dispatch) | Receipt started UTC | Measured query latency |
|---|---|---|---|
| soak-1-3, sequence 4 | 22:41:39.765 | 22:41:41.496406 | 32,357 ms |
| soak-1-10, sequence 4 | 22:41:40.299 | 22:41:41.651663 | 32,455 ms |
| soak-1-2, sequence 5 | 22:41:49.419 | 22:41:49.933343 | 32,307 ms |

The query transport in `src/modules/mcp/infrastructure/execution-client.ts`
uses the 30-second execution budget plus two seconds, and maps an aborted signal
to interruption_unclassified. The observed duration and incomplete receipts
support expiration of that execution HTTP request, rather than rejection by the
engine registry. The response metadata does not distinguish its own timer from
a parent cancellation, nor record TCP/TLS/response phase. A pre-TLS connect stall
is plausible, but **not proved**. No source-database failure is established.

Independent health observations continued at 22:41:49.960, 54.953, 59.967,
22:42:05.009, 10.008, 14.955 and 20.046 UTC. Current-policy heartbeats continued
at 22:41:46.065, 51.156, 56.134, 22:42:01.037, 06.132, 11.037, 16.620 and
21.081. One egress-registration connect retry at 22:41:51.074 recovered; it
did not produce a registry refusal. The approved bounded-health change does not
repair an execution socket that fails to complete. No execution retry, timeout
extension or governance change was made for this release attempt.

## Supplied arm64 records and the original 33-second item

The supplied `/Volumes/JZ OS/opintel-stage4` directory was recursively inventoried,
including hidden files and the newer tar. After the user restored both sets it
contains `stage4-arm64-7w4MRp-logs` (original 35610ad) and `arm64-6962c00-logs`
(newer attempt). Each transport.jsonl contains only one healthz ECONNRESET.
Neither set contains the timed soak JSONL. See
`stage4-6962c00-arm64-inventory.json` and the unchanged
`stage4-6962c00-acceptance-arm64-supplied.json`.

The original operator log confirms the 33,109 ms source_unavailable at iteration
21:11:13.340 UTC for soak-1-2, sequence not recorded, a declared line_of_business
query. It names `/output/soak/2026-10-25T21-09-37.456Z-1.jsonl`, which is absent.
Earlier unavailable outcomes took 9,164, 9,172 and 11,068 ms. The original gateway
has twelve probe-connect retries but no verification/probe-refused events; its
probe records lack timestamps and successful heartbeats were not logged at that
revision. The engine has no execution.refused events and one untimestamped
egress_sync_failed. The text summary has no per-query refusal cause or receipt
identifier. Thus the original 33-second path cannot be conclusively attributed
or timestamp-correlated to heartbeat/probes from these retained files. Its timing
is consistent with the 32-second execution HTTP budget plus preparation overhead,
but timing alone is not proof of transport phase or source contact.

The newer arm64 attempt passed explicit preparation, four certificates and
11 redeemed values, then failed the soak job's own preparation with
"Escrow query refused" before any timed soak result. Its latest recorded health
observation is 22:31:47.984 UTC and acknowledged heartbeat 22:31:48.026 UTC;
the subsequent MCP source_unavailable has no timestamp, request identifier or
cause. The engine log has an untimestamped egress_sync_failed. These records
cannot discriminate stale heartbeat, registry admission or execution transport
for that refusal. Absence of verification_refused does not rule out the
registry's heartbeat/age refusal paths. No arm64 rerun was performed here.

The original 33-second arm64 item remains open. This amd64 execution finding
must not be substituted for evidence of the original arm64 cause.

## Evidence commit validation

This evidence-only tree requires a new full `npm run check` before commit.
Raw gate output: `/private/tmp/opintel-stage4-6962c00-evidence-gate.log`;
machine result: `/private/tmp/opintel-stage4-release-6962c00/test-results/gate.json`.
The commit message records the completed result and tested tree. No post-gate
tree edit is permitted without another full gate. A green repository gate does
not change the failed published-digest acceptance recorded above.
