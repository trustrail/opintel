# VERIFY-01 phase 1

DEMO-01 was merged and pushed to main as
`ac91c4c51ab6d9a63aeb3f000bcb0ae68f565de8`, after the reported native arm64
release pass for `251f0e4`. This phase starts from that merge on
`feat/verify-01-frame`. It changes internal verification and operator harnesses,
not application behavior, migrations, source ingest, or the versioned V-01 answers.

## Frame

`scripts/verification/verifier/` builds internal artifact 1.0.0. The artifact is
self-contained JavaScript with its custody-agent child, version/revision and
source/artifact hashes. Customer bundle construction rejects verifier inputs.
It is not added to any image entry or customer archive.

The registry has 115 stable logical cell IDs, fixture-derived outcomes, dimensions,
prerequisites and expected evidence. Installation-specific source names and
credential UUIDs map to logical names/slots; installed responses never define
expectations. The finite scheduler runs each selected cell once before optional
random traffic. Dependency setup does not enlarge claimed coverage. Selection
supports all, capability, cell and dimension filters. Missing prerequisites,
interruption and an expired retiring credential are not exercised and fail.
Unknown selectors fail before setup. Invalid combinations are separate from cells.

JSON and Markdown record all selected cells, outcomes, dimensions, receipt IDs,
durations and sanitized checks, including cells not reached. Installation revision
and image identities are separate from verifier revision/source hashes. Raw rows,
connection strings, cookies, device tokens and receipt bodies stay out of reports.
Reports fail until complete; optional traffic failures/interruption also fail.

## Customer-path setup and the approved evidence adaptation

External V-01 database writes use the existing standalone synthetic writer with
an explicit target, never metadata or readiness. The real installed `./sources add`
stores credentials on the engine. Public APIs create a dedicated project, register,
verify and designate its paired engine, configure project limits/custody, initialize
the token key, register sources and read their catalogue. Public pool/table APIs
bind all eight tables explicitly. Declarations, treatments, row decisions, threads
budget and normal/lifecycle credentials all use the console's public APIs.
The compatibility operator setup no longer uses service/repository writes for
those operations. There is no public source-binding endpoint.

All 115 query outcomes/row expectations remain unchanged. Only these four cells'
row-scope evidence expectations change:

| Cell | Previous evidence | New evidence | Reason |
|---|---|---|---|
| pool0/v01.soak_recoveries.open_reference/reference_id/clear | unscoped | explicit all-rows decision ID/hash | Customer table binding requires an explicit row decision. |
| pool0/v01.soak_recoveries.open_reference/description/clear | unscoped | explicit all-rows decision ID/hash | Same table/decision, same three answer rows. |
| pool1/v01.soak_recoveries.open_reference/reference_id/clear | unscoped | explicit all-rows decision ID/hash | Customer table binding requires an explicit row decision. |
| pool1/v01.soak_recoveries.open_reference/description/clear | unscoped | explicit all-rows decision ID/hash | Same table/decision, same three answer rows. |

The all-rows predicate is the public editor's nullable-safe predicate on the first
supported column. Pool 0's treaty_reference retains its explicit false predicate;
pool 1 retains its missing row decision and zero rows. Other row predicates and
all treatments are unchanged. The implicit-table mode investigation/removal is
backlogged, not implemented.

The 16 existing custody cells require four certificate exchanges, actual unsealing
against fixture values and no skipped custody. The packaged-mode environment flag
is removed. The legacy exploration pass also refuses incomplete declared coverage.

## Release integration

`native.sh` builds the internal artifact separately and passes it to Stage 5.
Stage 5 runs finite all-cells coverage then the selected timed traffic duration
(default 120 seconds), retaining SMTP/browser/outage/restore checks. It also proves
a missing normal session produces 115 not exercised and a nonzero exit, and runs
custody-only selection. Stage 4 keeps its extra egress-denial and unchanged-rerun
checks, then uses the same fresh-archive Stage 5 acceptance for finite coverage,
receipts, browser and outage rather than a second timed pass rule. That final
Stage 4 step requires CUSTOMER_ARCHIVES, RELEASE_MANIFEST and INTERNAL_VERIFIER.

## Verification record

- Initial packaged-lab diagnostic: all 115 selected cells passed, zero failed,
  zero not exercised; `tmp/verify01-debug/all-public/result.json`.
- A preserved lab's self-advertised LAN engine address was unreachable from Docker;
  a certificate-valid `engineAddress` override used the normal registration API.
  No engine validation was changed. Original authorised XQ exports were used.
- Targeted checks: 41 distinct tests across the verifier, standalone artifact,
  provisioning isolation, deployment contracts, native release preconditions,
  first-hour contract and existing V-01 oracle/workflow files pass. Strict
  typecheck and lint pass on verifier candidate `7f2fa37`.
- All seven amd64 images at `80c42a3` pass layer/secret/runtime audits; fresh
  offline gateway and engine archives install successfully. The independently
  versioned verifier is `7f2fa37`. The intervening change touches only the
  internal verifier, its test and gate-tier documentation; customer payload
  source inputs are unchanged.
- Fresh archive verification: all 115 selected cells passed, zero failed and
  zero not exercised. All 114 admitted-query receipts passed caller, literal
  exclusion and scope checks. The revoked credential cell correctly refuses
  authentication before opening a receipt. All 16 custody cells perform real
  unsealing. Optional 120-second traffic completes 54 requests with zero failures.
- Deliberately missing normal session: exit 1, 115 not exercised, zero passed.
- Custody-only selection: exit 0, exactly 16 selected/passed cells, no extra
  claimed coverage. It resumes the owned public setup with its private source
  registration record; unrelated engine source references are never adopted.
- Fresh install run: `tmp/verify01-packaged-DDHKJM/install-result.json`.
  Compact review copies and complete matrices are committed beside this report
  in `verify-01-phase1/{all,missing,custody}.{json,md}`. Compact copies omit
  fixture row bodies, not outcomes or checks; full local reports remain in the
  run directory. No credentials, team identifier or receipt bodies are copied.
- The first fresh-install harness attempt incorrectly used a Docker alias for
  one-code pairing. The unchanged installer correctly refused its mismatch with
  the advertised registration address. Documented recovery with the advertised
  address succeeds through the already recorded gateway identity. Public engine
  editing then applies the certificate-valid reachable address to the fixture's
  auto-attached engine. The internal verifier now tests that path and refuses a
  different pin. The original harness failure record/log remains in the lab.
- The owned fresh lab is stopped after verification. Its expanded image-cache
  tar files were removed after retaining the compressed archives; state, volumes
  and verification records remain.
- The single completed-candidate full gate on `7f2fa37` **failed**. Typecheck,
  conformance typecheck, lint, production exclusion and all 36 console conformance
  checks passed. Normal tests: 265 files / 2,206 tests passed; one test failed.
  The browser/MCP smoke tier did not run. Cleanup passed. Total wall time:
  2,259.86 seconds. No gate retry, test rerun or code correction followed.

### Full-gate failure

`test/reinsurance-conformance.test.ts:45`, tokenized cross-source join for
`v01-cedant-1-agent-5`, expected success (`isError: false`) but received
`isError: true`. Its retained diagnostic is:

```json
{
  "code": "source_unavailable",
  "cause": "source_read_failed",
  "sourceFailure": {
    "operation": "connect",
    "nativeCode": "ETIMEDOUT",
    "sqlState": null,
    "attempt": 2
  },
  "evidenceId": "01a194fc-b4de-7ee9-b3e3-af32c1ee22d1"
}
```

The response-contract assertion at line 54 consequently expected true and
received false. The persisted-count assertion at line 107 expected an empty
count map (no successful response decoded) and received two object IDs with
null counts. These are follow-on assertions in the same test. The retained
`test-results/v01/report.json` also marks the unexpected refusal check failed.
The timeout's underlying cause is not established by this run; it is not
classified as a branch or environment defect. No application backend file or
migration changed. Fresh packaged finite V-01 verification passed, but does not
replace this failing concurrent ten-agent normal test.

Compact gate/failure evidence is in `verify-01-phase1/gate.json`; full local log:
`/private/tmp/verify01-full-gate-7f2fa37.log`. The phase is **not gate-green** and
is not merged.

No migration is touched, so no migration-test exemption or applied-migration edit
is involved. No issued evidence is edited. The four requested backlog follow-ups
are recorded in `docs/master-backlog.md`.

Native release must be run by hand on the arm64 MacBook Air; this Intel host cannot
execute the native-arm64 script. Fetch and switch to the pushed branch so the
updated release driver is used, then run the immutable revision from the handoff:

```sh
git fetch origin
git switch feat/verify-01-frame
scripts/release/native.sh "$(git rev-parse origin/feat/verify-01-frame)"
```

The default timed traffic remains 120 seconds, after finite coverage. The native
release path, including the updated Stage 5 browser/outage integration, has not
been executed in this Intel verification round. Internal artifact 1.0.0 built at
`7f2fa37` is retained separately as
`tmp/opintel-installation-verifier-1.0.0-7f2fa37.tar.gz`; no verifier is inside the
customer archives. Final report-only changes do not alter the tested executables.


## Approved source-connect correction (from d1fb550)

The single gate failure is a product connection-cutoff defect, superseding the
initial unclassified diagnosis above. Attempt 1 ran 02:42:34.166–35.167Z and
attempt 2 ran 02:42:35.356–36.364Z. All nine peer executions remained in flight.
A peer timed out at 02:42:36.311Z; Postgres logged “expected SASL response, got
message type 88” at 02:42:36.315Z (Terminate during authentication). This temporal
correlation supports the approved diagnosis that our one-second timer interrupted
healthy authentication. The server line has no request ID, so correlation is not
an independently proven request-to-backend mapping. Retained logs:
`/private/tmp/verify01-full-gate-7f2fa37.log:70599` and
`/private/tmp/verify01-postgres-failure-window.log:1`.

Step 0: `84b9503bd3723f243806f79f4b4213c13860e842` is “fix(stage5): bound
recovery and pair customer installs with one code”, dated 2026-10-27. It is an
ancestor of `5300c82` (`git merge-base --is-ancestor` exit 0). Its Stage 5 recovery
requirement is at most one connect-only retry before SQL with bounded diagnostics
(`docs/review/stage5-install.md:296`). Its source-scope tests require two attempts,
no SQL replay and no retry for authentication refusals; none requires the one-second
cap. The existing G-018 2.5-second abort-cleanup assertion starts after connecting;
its control-connection limits are unchanged. No conflicting requirement was found.

The approved correction centralizes the per-attempt allowance, default 10,000 ms,
bounded by remaining operation time. A full second allowance must fit before a
retry starts; retryable codes and the two-attempt maximum remain unchanged. Native
scanner configuration uses the same allowance rounded up to seconds, at least two,
with shared operation cancellation still active. Installation `limits.connectTimeoutMs`
is adjacent to existing source operation/statement limits; legacy configs use the
same default. Connect records include non-secret source ID and allowance; scanner
records identify its configured allowance without pretending native connect timing
is separately observable. Cancellation and cleanup limits are unchanged.

Three earlier diagnostic isolated V-01 runs passed; their slowest logged source
connects were 361, 494 and 471 ms. Those runs did not establish historical resource
load. The original gate failure and reports remain retained.

Correction checks: 128 tests in 12 targeted files passed (137.03 seconds), including
source-scope timing/refusal cases, source connector and staging, engine transport,
readiness/admission, V-01, installer defaults and provisioning-runtime. Strict
typecheck passed. Lint passed after removing the import made unused by centralizing
scanner telemetry. The first test-launch attempt was blocked by sandbox IPC before
any test ran; the actual targeted run used normal Docker/socket access.

Fresh archive verification and the single new-candidate gate are pending. At this
point host disk free space was below the image builder's 4 GiB minimum; regenerable
unused Docker cache is being reclaimed. No gate has been started for this correction.
