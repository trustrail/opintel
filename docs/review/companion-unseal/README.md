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
reading a resource and readwrite as mutating it. Describe/query declare readonly;
unseal declares readwrite because redeem consumes the server-side grant. No
`external` permission is requested.

Initial validation: companion tests 8/8; strict typecheck; lint; live-check syntax
check passed. Packaging/runtime and custody tests are recorded below when done.
No image publication is authorized for this revision yet.

Packaging/runtime validation passed: `npm test --
test/provisioning-runtime.test.mjs test/companion-runtime.test.mjs
test/steps-custody.test.ts` — 21/21 tests across three files.
