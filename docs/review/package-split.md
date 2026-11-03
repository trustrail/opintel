# Package split and identity binding — prerequisite stopped

Branch: `feat/package-split`, from main `933c4ec` (the approved documentation
merge, already pushed). No application, bundle, ingress or migration change has
been made.

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
