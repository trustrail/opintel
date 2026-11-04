# OAP-01 companion — candidate validation

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
