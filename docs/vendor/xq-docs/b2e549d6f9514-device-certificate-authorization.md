# Device Certificate Authorization

Source: https://xq.stoplight.io/docs/xqmsg/b2e549d6f9514-device-certificate-authorization

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/DeviceCertificateIntroduction.md`

## Published article

# Device Certificate Authorization

Devices, services, and headless workloads cannot complete a two-factor challenge. Device certificate authorization gives them a first-class path to an XQ access token: the device presents an X.509 certificate that was issued to it, and XQ returns an access token bound to that device.

There is no email, no PIN, and no human in the loop — the certificate **is** the credential.

## When to use this

| Method | Credential | 2FA | Typical caller |
|--------|-----------|-----|----------------|
| [`/authorize`](../reference/Subscription.json/paths/~1authorize/post) | Email address or phone number | Yes — PIN or validation link | A person |
| [`/authorize/certificate/{cert_id}`](../reference/Subscription.json/paths/~1authorize~1certificate~1{cert_id}/post) | X.509 certificate + private key | No — the certificate is the second factor | An edge device, sensor, gateway, or service |

Use device certificate authorization when:

- The workload runs unattended and cannot receive or enter a PIN.
- You want each device to hold a distinct, individually revocable credential.
- You need the device to appear as a named member of your team in the [XQ Dashboard](https://manage.xqmsg.com).

The resulting token is a full access token. The device can store key packets, retrieve keys, grant and revoke recipients, and manage user groups exactly like an authorized user.

## What you need before you start

Certificate issuance and API key provisioning happen in the management portal and are outside the scope of this section. By the time you make your first call, your device should already hold:

| Item | Description |
|------|-------------|
| General API key | Created in the [XQ Dashboard](https://manage.xqmsg.com/applications) |
| Dashboard API key | Only needed for the optional announce and user group calls |
| Certificate ID | The integer id of the certificate, used in the request path |
| Certificate | The client certificate, PEM text |
| Private key | The RSA private key matching the certificate |
| Transport key | The transport secret issued alongside the certificate |

Certificates are long-lived. Provision them once per device and re-use them for every authorization.

## How the exchange is protected

The certificate exchange is wrapped in two layers of encryption, so neither secret alone is sufficient to obtain a token.

1. **Transport layer.** The request payload — and the response — are encrypted with AES-256-GCM under a key derived from the transport key. A device without the transport key cannot form a valid request.
2. **Device layer.** The access token inside the response is additionally encrypted with the certificate's public key. Only the holder of the matching private key can read it.

An attacker who obtains the transport key still cannot recover a token, because the token is sealed to the device's private key.

<!-- theme: info -->
> #### Replay protection
>
> The encrypted payload carries a timestamp taken from XQ's own clock, not the device's. Fetch it immediately before each authorization — a stale or locally generated timestamp is rejected.

## Which API key goes with which call

The `api-key` header is determined by the **subdomain** you are calling, not by the operation. Getting this wrong is the most common source of unexpected `401` responses.

| Subdomain | `api-key` header | `authorization` header |
|-----------|------------------|------------------------|
| `subscription` | General API key | Bearer device token — except the two authorization calls |
| `validation` | General API key | Bearer device token |
| `quantum` | General API key | Bearer device token |
| `dashboard` | Dashboard API key | Bearer device token |

The device token is valid on **all four** subdomains. One token, two API keys — switch the `api-key` header per call and keep the same bearer.

## Token lifecycle

There is no refresh endpoint. When the device token expires, repeat the two authorization calls with the same certificate. Do not re-issue a certificate in order to refresh a token — certificates are expected to outlive many tokens.

Continue to the [tutorial](./DeviceCertificateTutorial.md) for the call-by-call walkthrough.

