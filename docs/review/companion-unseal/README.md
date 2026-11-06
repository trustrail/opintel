# OAP-04 — companion unseal

Diagnostic candidate: the tool handler now records a sanitized error name/message
and the shared redemption step (lookup, K2 redeem, K1 fetch, unseal). Opaque
exception text, stacks and values never enter logs. Schema failures report only
issue codes and schema paths. The agent kit still owns the redemption logic.

The live checker now covers the requested row projection and grouped SUM,
checking sealed cells, local plaintext recovery and refused replay for each,
without printing values. Optional case/report files let packaged acceptance use
its ordinary independent fixture.

Evidence before live reproduction: `git diff 369cf0c..42391a3 --
src/shared/release-contract.ts scripts/steps/service.ts
src/shared/infrastructure/sealed-cell.ts` is empty. This does not establish the
runtime cause.

OAP `SidecarToolboxSpec.Tools` reuses `MCPServerTool`
(`pkg/apis/v1alpha1/sidecartoolbox_types.go:80-82`), whose permission is at
`mcpserver_types.go:558-561`. `pkg/authz/authz.go:45-50` defines readonly as
reading a resource and readwrite as mutating it. Both readonly and readwrite require a non-null SpiceDB resource check
(`authz.go:56-62, 80-83`). This bundle has no OAP resource mapping. The correct
value is therefore passthrough for all three tools (`authz.go:42-44`), matching
OAP's websearch/workshop sidecars. Governance remains enforced at the gateway.
MCP readOnlyHint marks describe/query true and unseal false (redemption consumes
a grant); destructiveHint is false. No resource check is invented.

Initial validation: companion tests 8/8; strict typecheck; lint; live-check syntax
check passed. Packaging/runtime and custody tests are recorded below when done.
No image publication is authorized for this revision yet.

Packaging/runtime validation passed: `npm test --
test/provisioning-runtime.test.mjs test/companion-runtime.test.mjs
test/steps-custody.test.ts` — 21/21 tests across three files.

## Evidence: reproduced failure and control

Local amd64 container built at 912d5f0, supplied only the private mode-600 env file
through `--env-file`, against the cloud gateway. Row query: 12 sealed rows,
unsealed 12, replay `forbidden` (evidence
01a1ae67-8c7d-7a28-9b07-9cce9ac89449). Grouped SUM: 3 sealed rows (evidence
01a1ae67-977f-74e9-b233-60dd1ed3cdcb); sending **both** result IDs reproduced:

```json
{"event":"companion.internal_error","tool":"opintel_unseal","step":"lookup","name":"ZodError","message":"Response schema validation failed: custom at "}
```

The same aggregate with evidenceId alone unsealed 3 rows, replay `forbidden`
(evidence 01a1ae68-a159-717b-98d1-1354b3bc0f19).
Sanitized terminal and container records are in `evidence/`.
The regression test failed before the fix: 1 failed / 12 passed;
`core.ts:25` was the exclusive-or refinement. No K2 call occurs on that failure.

## Cause and correction

The advertised input shape allowed both optional IDs, but core's XOR refinement
rejected both. The bare tool-handler catch converted that validation exception to
`internal_error`. Grant lookup now takes precedence; if evidenceId is supplied
it must match the grant's saved receipt. Either alone and matching IDs together
work; neither returns `validation_failed`; mismatched IDs are refused before
redemption. One shared input definition and explicit tool description describe
this contract. A genuine unexpected failure is logged with its sanitized step,
name and message. The crypto, grants, authentication and gateway are unchanged.
`git diff main -- src sidecar` is empty; no cloud gateway upgrade is needed.

Original OAP arguments were not captured in the supplied logs. The owner accepted
this diagnosis, noting that the provider changed to Anthropic and both IDs were
available to the model. That correlation is not independently proven. The live
controlled reproduction and failing regression establish the companion defect.
OAP source stores raw tool arguments in persisted `memory.Turn` content
(`pkg/memory/memory.go:32-33,80-86`), read by the sessions transcript
(`pkg/web/webui/chat/transcript.go:25-35`). This Intel host's
`kubectl config get-contexts -o name` is empty; the Air transcript itself was not
accessible and its original argument fields have not been independently read.

## Permanent release acceptance

Both console-first-run-install and Stage 5 now run the custody extension after
the browser stage. It uses the shipped kit commands for a six-row projection and
SUM, independent fixture answers (including SUM's recorded string `645`), and
refused replay. Then it exports a credential with the kit command and runs the
companion's official-SDK checker for rows and aggregate (both IDs), local unseal,
and refused replay. Counts, evidence IDs and sanitized failures are retained.
Application archives remain free of companion/agent key material.

The existing main f1887d1 lab K4ofDr is stopped: all seven gateway services were
Exited at inspection. It was not restarted; these new candidate checks run on
the next release, per the request. Their wiring is covered by unit tests; an
installed-candidate pass is **not claimed** in this round.

Validation so far: six targeted files, 39 tests passed. A concurrent-build test
bootstrap earlier reported a missing Redis image/pull failure; direct inspection
confirmed the pinned image present. That setup failure is retained and no
product behavior was changed for it. Final live/build and validation results
follow below.

Final fix validation: all six targeted files passed (39 tests). The final
companion/wiring assertions were rerun after the last test refinements: 13/13
passed. Strict typecheck, repository lint and all changed .mjs syntax checks
passed. The first direct Vitest invocation had refused a non-owned SpiceDB
configuration; validation was corrected to the standard `npm test` launcher,
which creates its isolated services. No datastore guard was changed. No full
gate was run for these script-only changes, following AGENTS.md.

The source checkout inspected for OAP is e97928b, matching the reported Air
checkout. The exported unseal description, schema property descriptions and MCP
read-only annotations are verified by the bundled runtime test. Original OAP
session arguments remain unverified remotely; no Kubernetes context is installed
on this Intel host.
