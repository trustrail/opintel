# OAP-01 companion — candidate validation

## Final status

The published amd64/arm64 image `6bce943` is pinned by digest in the OAP manifest:
`ghcr.io/trustrail/opintel-companion@sha256:a6c99b3c72f90b2f48f5dc51de7232009a6112a2193636dce09b6ddada0d14b2`.
Gap 1 (ordinary ephemeral disk) is corrected and verified as recorded below.
The live Intel container check passed. OAP deployment itself remains user-run.
The historical entries below retain failures and subsequent evidence; their
outstanding-work statements describe their respective times, not current status.
The limitations in the final report at the end remain open; this is not a claim
that every original requirement is complete.

Candidate: `51650364e5f987a039f1ff7f7d36f55dbdbe5fee`, branch `feat/oap-companion`.
This is incomplete work, not an acceptance or release claim.

## Local image

`npm run companion:build -- 5165036` passed, producing
`tmp/companion/opintel-companion-5165036.oci.tar` for linux/amd64 and linux/arm64.
OCI index: `sha256:187c58e703d5896b8eb528d4cb5858b9e346d7897fa3dacdac50adb08a32a0f5`.
Nothing was published. The earlier draft build on 6ed6b65 was deliberately
cancelled during emulated arm64 dependency installation. The corrected Dockerfile
bundles the architecture-independent JavaScript once on BUILDPLATFORM and copies
it into each architecture's Node runtime image.

## Validation evidence

The standard development setup restored missing database migrations before tests.
Targeted companion/custody tests: 17 passed. Provisioning runtime contracts: 3
passed. A direct Node test-runner invocation of the provisioning Vitest file was
incorrect and failed before running tests; its standard npm test invocation passed.

The single full gate on 5165036 ran on 2026-11-04, run ID
`5caa00f8-c804-49da-a4ee-7667f5270447`. Log:
`/private/tmp/oap-companion-gate-5165036.log`; structured result:
`test-results/gate.json`. Duration: 3637.94 seconds.

- Strict and conformance typechecks: passed.
- Lint and production artifact exclusion: passed.
- Control conformance: 38 passed, 28/28 screen routes, zero findings.
- Normal suite: 271 files passed, one failed; 2298 tests passed, one failed.
- Smoke: not reached.
- Gate cleanup: passed.

Failure: `test/canonicaliser-assignment.test.ts:30`, case “allows assignment before
tokenization without confirmation and refuses unknown ids or incompatible modes”.
The `beforeEach` registered by `resetDatabaseBeforeEach` at
`test/database-fixture.ts:16` failed with “Hook timed out in 10000ms.” This is a
setup-hook failure, not a failed canonicaliser behaviour assertion. Its cause has
not been established. No gate retry, timeout change or test change was made.
Earlier progress messages incorrectly said no failed file had been reported:
reading only the log tail missed this earlier failure; this was corrected during
the run and is not a green gate claim.

## Outstanding

Image runtime/probe validation, complete companion-specific regression coverage,
updated agent-kit delivery, and the real cloud custody test remain outstanding.
The supplied private env-file path is pending the user's use of the updated kit.
No real credential contents have been read or printed. First publication of the
new GHCR companion package requires explicit approval. No merge was performed.

OAP source inspected: e97928b under ignored tmp/openagentprimitives. Providers are
embedded through providers/embed.go; rebuild OAP after adding the provider. The
bundle uses a single config JSON question and separate setup-identity command as
approved. Stock OAP records allowedHosts but does not enforce hostname-level
restrictions (pkg/controllers/agentsession/cosidecar/cosidecar.go:66).
The configured XQ hosts come from scripts/steps/infrastructure/xq-device.mjs.

## Authorized isolation and smoke follow-up

On 2026-11-04, with image builds finished, the standard command
`npm test -- test/canonicaliser-assignment.test.ts` passed all three tests.
File duration: 5448 ms; previously failing case: 1309 ms; overall runner duration:
10.59 seconds. The reset hook's individual duration is not separately logged.
Log: `/private/tmp/oap-canonicaliser-isolated-3bcc179.log`.

Then the authorized `npm run test:smoke` ran once. It failed at the 30000 ms test
deadline during `page.goto` at `e2e/smoke.spec.ts:78`, opening the receipt permalink
and waiting for `load`. Reported scenario duration: 31.8 seconds. The preceding
MCP query completed and the persisted receipt row-decision assertion passed.
The engine `/execute` attempt completed successfully in 4219.311 ms, with
7.691 ms TCP and 6.119 ms TLS phase durations. No cause for the browser timeout
has been established; no environment or branch attribution is claimed.
Log: `/private/tmp/oap-smoke-3bcc179.log`. Browser trace and error context are
retained under `test-results/smoke-sign-in-→-pool-→-row-9001e--persisted-receipt-decision-smoke/`.

No full-gate retry or smoke retry was run. Live credential testing has not begun;
no image publication or merge occurred. The installed kit still needs the new
export command delivered before the user can generate the requested env file.

## Agent-kit delivery

The owner accepted the smoke deadline failure as the known Intel Mac environmental
failure and authorized proceeding to credential preparation. No gate or smoke
rerun was made for this script-only packaging step.

The standard image build already supports IMAGE=agent-kit; the standard customer
packager now supports --agent-kit-only so unrelated application images need not be
rebuilt or substituted. Default four-package behaviour is unchanged. Packaging
and provisioning tests: 11 passed; lint and JavaScript/Bash syntax checks passed.

Built locally from d05046edb3aa using IMAGE=agent-kit PLATFORM=linux/amd64
BUILD_CANDIDATE=1 node scripts/images/build.mjs. The candidate marker preserves the
fact that the unrelated untracked editor file remains in the checkout. Layer and
runtime audits passed. No GHCR publication occurred.

Archive: tmp/oap-agent-kit-d05046e/agent-KIT-d05046e-amd64.tar.gz.
SHA-256: 9ab2c47f9406ece8da85f1422db70291f871beb9f950d0666eef3c70aeea8791.
The archive lists only package files, with no identity-bundles, active-identity,
xq-api-key or gateway-ca.pem entry. Extracting over the existing kit leaves these
local identity and trust files untouched. The staged archive's ./identities --help
was executed with its packaged Docker runtime and lists export-companion.

One packaging invocation initially named a nonexistent manifest and failed before
creating output; the corrected invocation used the filename emitted by the build.
The installed kit was not modified by the assistant; the user performs extraction
and private credential creation. The live test waits for their confirmation.

## Live credential test — 2026-11-04

The user supplied the private env file. No credential content, certificates,
keys, team identifiers or row values were printed. Nothing was published to GHCR.

Two companion defects were fixed before the cloud test:

- Bundled SDK schema initialization failed before startup. Importing the used
  Zod binding before the MCP SDK resolves its bundled initialization order
  (195e7f0); the actual bundled probe test now covers startup and all three tools.
- The slim companion image omitted OpenSSL, which the shared agent-kit device
  token unwrap invokes. Sanitized startup-stage diagnostics (7a7d87f) located
  the failure at `XQ identity exchange: K1 refused: XQ token_unwrap`.
  `command -v openssl` in that image exited 1. The corrected image (648ca66)
  installs the same runtime dependency as the agent kit and runs `openssl version`
  as its non-root user during both architecture builds. Both checks passed.

Validation: companion tests 6 passed; provisioning runtime tests 3 passed;
strict typecheck and lint passed. An initial provisioning invocation mistakenly
used Node's test runner and failed before tests because this suite uses Vitest;
the repository's `npm test -- test/provisioning-runtime.test.mjs` then passed.
No full gate was rerun. The accepted smoke decision above remains unchanged.

Local multi-architecture image:
`tmp/companion/opintel-companion-648ca66.oci.tar`, index
`sha256:cfbd8b476e141927b965646b9ce3e47135909b938b5918b8b9e32cbacc0cd733`.
The amd64 container ran read-only, as the packaged non-root user, with a private
writable tmpfs and the supplied mode-600 env file. Startup completed through XQ
exchange, TLS identity loading and gateway MCP initialization.

The committed `scripts/companion/live-check.mjs` initially used SELECT * and
received `unsupported_on_aggregate_only`; no unseal ran. The check was corrected
in 61395e9 to select only the requested custody column and verify its treatment
through describe before querying. Syntax and lint passed. Against the same image:

```text
tools/list: opintel_describe, opintel_query, opintel_unseal
opintel_describe: ok
opintel_describe: custody test column treatment=aggregate_only
Live companion check failed at custody prerequisite; no values were logged.
```

Evidence: cloud describe reports the requested `claim_amount` column as
`aggregate_only`. This is not the custody prerequisite specified for the live
acceptance. The corrected check stopped before another query. Twelve sealed rows,
local unseal, and repeated-redemption refusal remain unverified. No pool decision
was changed. The test container was stopped and removed to discard its secret
container environment. The user must set the intended column to custody before
continuing this acceptance. GHCR first-publication approval remains outstanding.

## Live custody acceptance after the user restored the decision

The user restored `claim_amount` to custody and authorized resumption. The same
locally built image, `648ca66`, ran on Intel with the committed live check from
0445b70. No product changes or pool-decision changes were made for this run.
The check exited 0:

```text
tools/list: opintel_describe, opintel_query, opintel_unseal
opintel_describe: ok
opintel_describe: custody test column treatment=custody
opintel_query: rows=12 evidenceId=01a1a78e-4486-7c20-9be9-2394d2569bc6
opintel_unseal: rows=12 evidenceId=01a1a78e-4486-7c20-9be9-2394d2569bc6
opintel_unseal repeated: refused code=forbidden
```

The assertions verified that every returned amount was sealed, every locally
unsealed amount was present and no longer sealed, and the second redemption was
refused by the gateway. No row values or secrets were printed. Retained sanitized
output: `/private/tmp/oap-companion-live-custody-0445b70.log`.
The container was stopped and removed after the check. The OAP manifest now
references the tested image tag `648ca66`; that image remains local pending
explicit approval for the first GHCR publication. OAP itself was not run, as
requested; the Air run is still user verification. No full gate was rerun.
Lint and the updated SidecarToolbox YAML syntax check passed.

## Final report

### 1. Evidence and inference

Publication initially failed with registry `denied`; after the owner's explicit
retry instruction, `docker push ghcr.io/trustrail/opintel-companion:648ca66`
exited 0. `docker buildx imagetools inspect` confirmed the published index above,
with linux/amd64 manifest `sha256:77cff1fa1dcf6dcb7a670003d74559d698ecfc1c7f90e4de628256b811be17a4`
and linux/arm64 manifest `sha256:acc5f125cc2f19083d4f672c86b6673fd32201ca61f431a1315e89f77fd777fb`.
The manifest uses the index digest, not a mutable tag.
Final digest-pinning validation: lint passed; every manifest YAML parsed, and the
SidecarToolbox image reference matched that exact published index digest.

Live output (values and secrets never printed):

```text
tools/list: opintel_describe, opintel_query, opintel_unseal
opintel_describe: ok
opintel_query: rows=12 evidenceId=01a1a78e-4486-7c20-9be9-2394d2569bc6
opintel_unseal: rows=12 evidenceId=01a1a78e-4486-7c20-9be9-2394d2569bc6
opintel_unseal repeated: refused code=forbidden
```

Targeted tests, packaging/provisioning checks, strict typecheck and lint passed
as recorded above. The full gate was not green: its canonicaliser setup timeout
passed in the authorized isolated test; the subsequent smoke deadline was
accepted by the owner as environmental. No full gate retry occurred. These facts
prove the recorded Intel container path, not an OAP deployment or arm64 runtime
acceptance. Both architecture images built; OAP remains user verification.

### 2. Provider loading

OAP revision e97928b embeds provider YAML with `//go:embed *.yaml` in
`providers/embed.go:9`; `pkg/platform/identity/provider/loader.go:47` loads
`embedfs.FS`. Add the supplied provider to the OAP checkout's `providers/` and
rebuild. No runtime provider-directory loader was found in the inspected code.
The approved bundle flow uses the default whole-config JSON question followed
by `oap agent setup-identity opintel-analyst` for credential entry.

### 3. Egress hosts

The manifest lists `opintel.trustrail.io:443`, `subscription.xqmsg.net:443` and
`validation.xqmsg.net:443`. The kit checks the two XQ endpoint bases in
`scripts/steps/infrastructure/xq-device.mjs:17`; its request boundary restricts
requests to those bases. The gateway host comes from the approved cloud config.

### 4. Limitations and unsatisfied requirements

- OAP's inspected stock controller explicitly does not enforce AllowedHosts:
  `pkg/controllers/agentsession/cosidecar/cosidecar.go:66-69` permits coarse
  TCP 80/443. The manifest records hosts but does not supply hostname enforcement.
- The plain ephemeral-disk fallback is not satisfied by the published image:
  the reused kit helper `scripts/infrastructure/xq-token-unwrap.mjs:14` requires
  Linux tmpfs. The live check used tmpfs. Earlier README wording implied disk
  support and was incorrect; no disk-backed OAP success is claimed.
- Tool registrations declare input schemas but omit explicit output schemas
  (`scripts/companion/main.ts:53`). Structured tool results were verified live,
  but this does not satisfy the requested output-schema declaration.
- OAP lint/install, toolbox conditions and an Air agent session were not run,
  per the instruction that the user performs OAP verification.

These are disclosed gaps, not evidence of successful OAP acceptance. No runtime
changes or further runs were made in this final digest-pinning/report step.

### 5. Branch commits

All changes are on `feat/oap-companion`; no merge. Implementation and tooling:
`6ed6b65`, `5165036`, `d05046e`, `6cec8f7`, `3d83a28`, `195e7f0`, `7a7d87f`,
`648ca66`, `61395e9`. Prior evidence/report commits: `3bcc179`, `33a1cd8`,
`4b70288`, `0445b70`, `3784881`. The final digest-pinning/report commit is reported
in the accompanying response.

## Gap 1 correction: ordinary ephemeral disk

Answer for published 648ca66: **no**, it does not start successfully on a
Linux disk-backed `/tmp`. `main.ts` starts `device.exchange`; the worker's
`xqDevice.exchange` calls `unwrapDeviceToken`. That helper's tmpfs check rejected
ordinary disk before OpenSSL could decrypt the XQ token. The observed startup
stage would be XQ identity exchange / token_unwrap, not a ready MCP server.

The correction accepts ordinary ephemeral disk in the shared agent-side unwrap
helper. A fresh private directory is mode 700 and its key file is mode 600.
Files are overwritten, fsynced and unlinked after success or failure; input key
buffers are zeroed. Companion worker TMPDIR points inside its private session
root, including workers used for enrollment. It waits for the device worker to
exit before wiping that root; signal cleanup is registered before startup and
startup failures also clean up. The existing read-only identity mounts used by
other agent-kit commands are unchanged.

The wipe guarantees apply to live files on orderly cleanup, not physical SSD,
copy-on-write or snapshot history. SIGKILL and host failure cannot execute an
exit handler; the ephemeral volume lifecycle remains the backstop.

Targeted command:
`npm test -- test/xq-token-unwrap.test.mjs test/companion-runtime.test.mjs test/companion.test.ts test/steps-custody.test.ts test/provisioning-runtime.test.mjs`.
All 25 tests passed on the final worker wiring, including permissions, an open
file descriptor proving overwrite before unlink, failure cleanup, symlink
non-traversal, custody regressions, packaged probe and provisioning contracts.
One intermediate typecheck found a missing declaration for the new MJS cleanup
helper; its explicit declaration was added. No full gate is required for this
script-only correction under the standing rule.
Final listener-start cleanup adjustment: bundled probe regression passed again;
strict typecheck passed on the final source. Lint and MJS syntax checks passed.

### Disk-backed image acceptance

Candidate `6bce943` built for linux/amd64 and linux/arm64 with the standard
`npm run companion:build -- 6bce943`. Local index:
`sha256:a6c99b3c72f90b2f48f5dc51de7232009a6112a2193636dce09b6ddada0d14b2`.
Publication and manifest replacement await approval of this new revision.

The Intel container used a Docker named volume mounted at `/tmp` (not tmpfs),
read-only image filesystem, packaged non-root user, and the existing private
credential env file. `node scripts/companion/live-check.mjs` exited 0:

```text
tools/list: opintel_describe, opintel_query, opintel_unseal
opintel_describe: ok
opintel_query: rows=12 evidenceId=01a1a7aa-674b-7d63-bbcf-2ed1e1d2bdf8
opintel_unseal: rows=12 evidenceId=01a1a7aa-674b-7d63-bbcf-2ed1e1d2bdf8
opintel_unseal repeated: refused code=forbidden
```

The committed `scripts/companion/check-private-storage.mjs`, run through Docker
exec, checks the actual filesystem type and metadata only:

```text
Disk-backed storage: private directories mode 700; files mode 600.
```

After `docker stop`, the container exit code was 0. A new non-root check container
mounted the same volume read-only, with CHECK_REMOVED=1, and reported:

```text
Disk-backed storage: empty after SIGTERM.
```

The container and volume were then removed. No secret or row values were logged.
Retained value-free live output:
`/private/tmp/oap-companion-disk-6bce943-live.log`.
This resolves the ordinary-disk runtime defect in the candidate; it does not
claim an OAP deployment or change the separate output-schema gap.


### Approved publication of disk-support revision

After explicit owner approval, `docker push
ghcr.io/trustrail/opintel-companion:6bce943` exited 0. Remote
`docker buildx imagetools inspect` confirmed index
`sha256:a6c99b3c72f90b2f48f5dc51de7232009a6112a2193636dce09b6ddada0d14b2`,
linux/amd64 manifest
`sha256:186ffa4af2624dcbf6aa8ac45c38ae985741fa7de34a00fc5ef598d4c1411a34`,
and linux/arm64 manifest
`sha256:df41a560c4b4696ebf7202cf492832e0a6b3dd29b33ac6726c83a2075aa59c08`.
The OAP manifest is re-pinned to that index; the README now describes the
published disk-backed support, private modes and cleanup limits. No runtime
changes, additional live runs or merge were made in this publication step.
Publication-step lint and YAML/digest validation passed.

## OAP-02 bundle and describe corrections

The user's first Air/OAP run on e97928b completed describe, policy refusals,
grouped query, unseal and an answer after manual workarounds. This is user-supplied
runtime evidence, not a local OAP acceptance claim. The bundle now declares the
sidecar's static secretRef, an overridable sandbox image and harmless noop tool,
and explicit 50-turn / 500000-token / 30m budgets. The run sheet uses put-token,
explicit scoped RBAC commands, private-image import and the verified run command.

Source checks: put-token resolves the declared secretRef and WriteSecretKey
creates a missing Secret; Role/RoleBinding are excluded by OAP's bundle kind
allowlist. Consequently no RBAC or Secret resource is placed in the bundle.
See `docs/review/oap-defects.md` for exact OAP paths and the distinction between
observed failures and source-based explanations.

Companion describe now whitelists only custody provider and credentialRequired;
it omits tenant and keys. sqlRules and the AgentClass prompt agree. Rules are
based on `src/modules/entitlements/application/aggregate.ts:51-58` (aggregate-only
and equality-only token operations), `:119` (SUM/AVG/COUNT instead of MIN/MAX),
`:87-170` (expression allowlist excludes CAST), and
`src/modules/mcp/application/response.ts:21-22` (statement families). No gateway
policy, treatment or refusal behaviour was changed.

Targeted tests: 24 passed across companion, bundled probe, steps custody and
provisioning runtime suites. New tests cover private describe-field removal,
SQL guidance, prompt consistency, static secret reference, sandbox question,
budgets and absence of disallowed bundle resources. Strict typecheck, lint and
live-check syntax check passed. The live checker also asserts that describe has
four SQL rules and no custody tenant or keys, without printing any values.

### OAP-02 local image and Intel live evidence

Implementation commit `369cf0c` is pushed. Standard dual-architecture build:
`npm run companion:build -- 369cf0c` passed. Local index digest:
`sha256:2f3cc453765f03a0301c7cd51bc7a83592f89c150f2246f204c4fb2ebbe53d13`.
This is not a publication claim; the previous published digest remains pinned
until approval and successful publication of this revision.

The committed live checker ran against the non-root, read-only amd64 image with
ordinary disk-backed `/tmp`, using the existing private env file. It exited 0.
Describe assertions confirmed exactly four SQL rules and no custody tenant or
keys. Value-free output:

```text
tools/list: opintel_describe, opintel_query, opintel_unseal
opintel_describe: ok
opintel_query: rows=12 evidenceId=01a1a905-66bb-7cd0-abbf-6c872913bd62
opintel_unseal: rows=12 evidenceId=01a1a905-66bb-7cd0-abbf-6c872913bd62
opintel_unseal repeated: refused code=forbidden
```

Log: `/private/tmp/oap02-live-369cf0c.log`. Private disk checks confirmed directory
mode 700 and file mode 600; SIGTERM exited 0 and the persistent volume was empty
on inspection. The test container and volume were removed. No secrets or row
values were printed. No local OAP install/run was performed, and no full gate
was rerun for these script/bundle changes. Updated Air installation remains user
verification; source inspection and the Intel container result are the evidence,
not proof that upstream OAP's other defects are resolved.
