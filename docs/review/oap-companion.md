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
