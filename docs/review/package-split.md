# Package split and identity binding — implementation in progress

Branch: `feat/package-split`, from main `933c4ec` (the approved documentation
merge, already pushed). The initial sections below retain the historical probe
results. Current draft implementation and validation are recorded at the end.

## Approved identity semantics

The certificate fingerprint is the identity. Device name and certificate ID
are self-declared labels, never authorization. The retained XQ certificate has
no Key Usage or Extended Key Usage extensions; OpenSSL reports SSL client use
permitted. Its public key is RSA 4096 and its signature is SHA-256 with RSA.
The subject CN is the generic `XQ Trusted Certificate`, not the device label.

## Early ingress prerequisite

Command run once:

```sh
node scripts/images/agent-ingress-handshake.mjs tmp/console-first-run-acceptance-lZjNj0/agent-host/gateway/identity-bundles/device-223
```

The probe uses the pinned nginx image and the actual packaged ingress config,
adding optional client certificates and an overwritten escaped-certificate
header in a temporary copy. A local HTTP echo upstream stands in for the API
for this TLS prerequisite only. The existing XQ device certificate and private
key remain in the agent-side Node client; neither is mounted into nginx.
Temporary nginx mounts contain only its generated server key/certificate and
configuration. The probe intends to check TLS 1.2 and TLS 1.3, then that an
anonymous request cannot inject a certificate header. It does not implement or
prove API-side trusted-ingress enforcement.

Result: exit 1, no completed checks. Native error:

```text
ECONNRESET
Client network socket disconnected before secure TLS connection was established
```

Retained run directory: `tmp/agent-ingress-handshake-RH81sG`.
[Recorded result](package-split/ingress-handshake-result.json).

The script tries a certificate-less startup request before the XQ certificate
requests. The result does not record the failing phase, so it cannot establish
whether the reset occurred during startup or with the XQ certificate. It is not
evidence of a certificate-purpose rejection. The container was removed by the
probe's finally block; nginx logs were not retained. No second probe, product
implementation, packaged acceptance or full gate was run. The requested early
handshake prerequisite remains unproven.

Before any new authorized probe, retain its current phase and nginx logs and
establish nginx readiness separately from the certificate test. Do not change
certificate permissions or TLS verification to conceal the failed result.

## Corrected three-case ingress proof: passed

The earlier stop is historical. The owner authorized a corrected probe that
establishes nginx readiness inside the container over plain HTTP, retains info
level nginx logs, and records client TCP, TLS and HTTP phases per case. The
probe never substitutes its echo upstream for a product acceptance test.

The first corrected attempt (`tmp/agent-ingress-handshake-3BxoKo`) passed cases
a and b, then failed locally while decoding the XQ private key as PEM text:
`ERR_OSSL_UNSUPPORTED`, `DECODER routines::unsupported`. No XQ handshake was
attempted. The actual export is base64-encoded DER PKCS#8. The probe now uses
the same PEM-or-DER parsing as `scripts/operator/identity-import.ts:42–44`,
converting to PEM only in agent process memory; no private material is mounted
into ingress or published in evidence.

The completed repeat is `tmp/agent-ingress-handshake-l0JPQ3`, using the same
command as above. All three requests used the same ingress, in order:

| Case | Negotiated TLS | Handshake | HTTP | nginx ssl_client_verify |
|---|---|---|---|---|
| a: no certificate | TLSv1.3 | completed | 200 | NONE |
| b: fresh self-signed client certificate | TLSv1.3 | completed | 200 | FAILED:self-signed certificate |
| c: actual XQ client certificate | TLSv1.3 | completed | 200 | FAILED:unable to verify the first certificate |

The latter two verification strings describe the intentionally untrusted CA
chain; `optional_no_ca` accepted both requests. Both forwarded certificates
matched the client certificate fingerprint. The injected caller header was
overwritten, including its removal for the certificate-less request.
[Client traces, per-case nginx lines and full nginx log](package-split/ingress-three-cases/).
No failure phase or error occurred in this completed repeat. The original
ECONNRESET's exact cause cannot be recovered from its missing logs; the corrected
probe establishes readiness and certificate compatibility without inferring it.

## Existing custody enrollment decision and proof gap

The owner chose: existing non-custody credentials remain bearer-only; existing
custody credentials become identity-bound/unbound and must retain their previously
associated XQ recipient. Migration 093 preserves the original association fields
and copies the recipient into an enrollment constraint. It has been applied by
`npm run dev:up` to the local development and test databases; its applied bytes
must not be edited.

The draft guard compares the initialize recipient with that retained value and
records `identity_mismatch` when they differ. **This is not yet proof that the
presented certificate belongs to that recipient.** MCP initialize accepts public
metadata supplied by the client (`src/modules/mcp/infrastructure/http.ts:201`).
The guard compares that string (`src/modules/pools/infrastructure/identity-binding.ts:30`).
TLS proves possession of the certificate key; the retained XQ certificate has a
generic subject, not an authenticated recipient claim. The real XQ association
is learned inside the agent process after certificate authorization and private
response/token decryption (`scripts/steps/infrastructure/xq-device.mjs:37–41`).
The gateway receives neither that token nor a verifiable provider attestation.

A different certificate could therefore claim the old public recipient string.
The equality test alone must not be reported as enforcing the owner's stronger
requirement. Approval requested for an XQ-backed, one-time enrollment proof for
migrated custody credentials, before binding the fingerprint. No gate or packaged
acceptance has been run for this draft, and the draft is not committed or pushed.

Targeted progress (not completed-candidate acceptance):
- `test/credential-identity-binding.test.ts` plus `test/http-server.test.ts`:
  19 passed, including claim mismatch and direct-ingress-header spoof rejection.
- `test/credential-identity-migration.test.ts`: up/down/up passed; measured
  fixture setup 8,511 ms; original association metadata preserved.
- MCP describe, protocol and binding: 27 passed.
- Query and agent-local metadata tests: 29 passed.
- Pools console: 42 passed after correcting the draft query-key factory removal.
- Intermediate strict typecheck and lint passed; later edits still require final
  validation. All migration tests, packaging contracts, full gate and packaged
  live-XQ verification remain outstanding.

## Approved XQ-backed proof

The owner approved a one-time escrowed nonce for every identity-bound enrollment
that supplies a recipient, not just migration cases. Draft `1066d37` was committed
and pushed before implementation, as requested. Migration 094 adds an ephemeral
challenge verifier to the credential (hash only, never the nonce). It was applied
through `npm run dev:up`; migration 093 was not edited. The implementation reuses
`ReleaseRuntime` / `ReleaseProvider.escrow` and the agent's existing device share
redemption. Proof binds the credential, certificate fingerprint and recipient;
failed proof is consumed, refused and audited. No query is replayed. Validation
of this addition is in progress; the completed-candidate gate remains unrun.

## Concurrent enrollment and presence correction

The ten-agent V-01 targeted test exposed PostgreSQL deadlocks (`40P01`) after
identity binding was introduced. The credential custody guard originally ran
on every credential update; presence updates `last_used_at` on each request, so
it took a pool-wide lock unnecessarily. Migration 096 limits that trigger to
insertions and changes of credential kind, revocation or pool. It keeps the
custody/bearer invariant while allowing unrelated presence updates to proceed.

Migration 095 provides a narrowly scoped read of the current project's binding
approval flag under a project row lock, avoiding a second pooled connection
inside the tenant transaction. XQ escrow now runs outside database transactions;
established credential checks lock only their credential. A regression holds an
XQ escrow open while issuing another credential, checking it does not hold the
pool lock. The original migration bytes 093 and 094 were not edited. The initial
53-file migration selection passed before 095/096 and must be rerun on the final
migration set. The corrected V-01 ten-agent test and its identity, custody and migration regressions passed (5 files, 21 tests). The complete final migration selection passed: 53 files, 199 tests.

## Release harness and targeted checks

The application gateway and engine, agent kit and internal verification archives
are assembled separately. Release image publication includes the agent-kit image.
The Stage 5 first-hour query uses the agent-kit command; its XQ identity import
runs on the agent host. The verification job runs outside the application Compose
services with only the required TLS files, never the ingress authentication secret.
The custody acceptance uses agent and verification archives independently, exercises
certificate mismatch and a bearer-only first-run credential, and revokes that
credential before adding custody. No device private or transport key is mounted
into an application service.

Targeted checks: V-01, credential identity, custody and migration regression:
5 files, 21 passed; remaining custody tests: 6 files, 28 passed; complete
console unit suite: 13 files, 157 passed. The isolated Docker-input agent bundle
check caught missing XQ helper COPYs; after adding them, provisioning runtime
passed 3 tests. The final installer test passed all 18 cases; strict application and conformance typechecks and lint passed.

## Gate decision

The gate on `b15b4e1` passed both typechecks, lint, production artifact checks,
all 38 browser conformance checks and all 2,286 normal tests. Its smoke test
timed out at 30 seconds waiting for Set rows. Back-to-back smoke runs on the
same Intel Mac then timed out on main `933c4ec` and passed on `b15b4e1` in
14.4 seconds. The owner approved accepting the `b15b4e1` gate on this evidence,
attributing the deadline failure to the environment. The exact cause of the
delay was not established. The fresh packaged live-XQ run remains pending.

## Verification package configuration correction

Arm64 native acceptance of `0559922` stopped at `customer-demo-soak` with
`Missing operator setting: ENGINE_HEARTBEAT_URL`. The old Compose verification
job supplied that setting, but the separate verification wrapper reads only its
private `verification.env`. Stage 5 had copied the gateway operator environment
without the Compose-only additions. It also failed to provide the Compose-only
`OPINTEL_PACKAGED_SOAK=1` stronger custody criterion and explicit CA/HOME values.

The verification configuration now explicitly includes:

- `ENGINE_HEARTBEAT_URL` and `APPLICATION_TLS_CONFIG` for engine registration
  and governance (`scripts/operator/provision-service.ts:32`,
  `scripts/operator/demo.ts:24`); `NODE_EXTRA_CA_CERTS` for TLS trust.
- `DATABASE_URL`, `REDIS_URL`, `SPICEDB_ENDPOINT` and `SPICEDB_TOKEN` for the
  current provisioner, observer and authorization (`src/platform/db/scope.ts:10`,
  `scripts/operator/run-soak.ts:21`, `scripts/operator/common.ts:24`).
- `OPINTEL_CUSTODY_MASTER_KEY`, the XQ API, dashboard, sender, team and redeem
  settings, `OPINTEL_API_BASE_URL` and `APP_BASE_URL` for custody setup
  (`src/modules/release-custody/infrastructure/availability.ts:8`,
  `scripts/operator/customer-demo.ts:33`, `scripts/operator/xq-roundtrip.ts:41`).
- `OWNER_EMAIL`, `OPINTEL_DEPLOYMENT_PACKAGE`, `OPINTEL_CUSTOMER_JOB`, private
  operator/provision/soak/seed/certificate/output paths, duration and rate, and
  the normal signed-in session file (`scripts/operator/customer-demo.ts:19`,
  `scripts/operator/common.ts:16`, `scripts/operator/demo.ts:15`,
  `scripts/operator/run-soak.ts:11`, `scripts/operator/seed-options.ts:5`).
- `OPINTEL_OPERATOR_API_TARGET`, `HOME`, `STEPS_XQ_API_KEY_FILE` and
  `OPINTEL_PACKAGED_SOAK=1` for API access, private agent identity lookup and
  the existing mandatory custody pass criterion (`scripts/operator/common.ts:30`,
  `scripts/soak/external.ts:19`, `scripts/soak/reinsurance.ts:219`).

The release harness constructs its own mode-600 verification config from an
explicit allowlist of installation connection credentials and the supplied XQ
settings, rather than copying `operator.env`. The old verification Compose
descriptors now point to verification-specific configuration. The moved
`sign-in` and `grant-access` steps use explicit flags, a private session file and
the package's optional gateway CA (`scripts/verification/steps/main.ts:24`,
`deploy/verification/command:27`); seed uses an explicit private target file.
No secret is printed or passed as a command argument. Package-entrypoint tests
use a simulated Docker command to verify the soak launch receives only its
config and signed-in session; they do not claim a live or packaged soak.

Targeted packaging, provisioning and workflow contracts passed: 4 files,
21 tests. Syntax checks and lint passed. No packaged install was run on this host.
