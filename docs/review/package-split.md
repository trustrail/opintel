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
