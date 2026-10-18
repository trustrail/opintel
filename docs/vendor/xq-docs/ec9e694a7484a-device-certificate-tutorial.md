# Device Certificate Tutorial

Source: https://xq.stoplight.io/docs/xqmsg/ec9e694a7484a-device-certificate-tutorial

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/DeviceCertificateTutorial.md`

## Published article

# Device Certificate Tutorial
<!-- theme: warning -->
> #### This tutorial is not a sandbox!
>
> Any operations here behave as if you executed them from our own server.

This tutorial takes a device from a provisioned certificate to a usable access token, then shows the token in use against a key packet.

The tutorial is divided into 4 sections:

- **Section 1** — Retrieve the server timestamp used as a replay guard.
- **Section 2** — Build and encrypt the authorization payload, then exchange the certificate for a device token.
- **Section 3** — Announce the device so it appears in the dashboard (optional).
- **Section 4** — Use the device token to store and retrieve a key.

Before starting, make sure you have the six items listed in the [introduction](./DeviceCertificateIntroduction.md#what-you-need-before-you-start).

<!-- theme: warning -->
> #### Two steps happen on your device, not in the browser
>
> The payload in Section 2 must be encrypted locally before it is sent, and the response must be decrypted locally after it arrives. Those steps cannot be performed from the API request interface on this page — use the reference algorithms below, or one of the [XQ client SDKs](./AvailableResources.md), which implement them for you.

## Section 1 - Retrieving the Server Timestamp

The authorization payload is stamped with XQ's clock, not the device's. This prevents a captured payload from being replayed later.

Reference: [`GET /time`](../reference/Subscription.json/paths/~1time/get)

Use the following steps with the API request interface:

1. Create an **API key** from the [XQ Dashboard](https://manage.xqmsg.com/applications).
2. Copy and paste the **API key** in the required **api-key** field.
3. Click **Send API Request**.

```params json_schema
{
  "title": "/time",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[General API key](https://manage.xqmsg.com/applications)"
    }
  },
  "required": ["api-key"]
}
```
----
```request http
{
  "method": "GET",
  "url": "https://subscription.xqmsg.net/v2/time",
  "headers": {
    "api-key": "123"
  }
}
```

> A successful response is a bare integer such as `1754300000` — not JSON. Store this value for the next section.

<!-- theme: danger -->
> #### Do not substitute your local clock
>
> Use the returned value verbatim, and fetch a fresh one immediately before each authorization. Clock skew between the device and XQ causes the certificate exchange to be rejected. Do not cache the timestamp between authorizations.

No bearer token is required for this call.

## Section 2 - Exchanging the Certificate for a Device Token

This is the call that authenticates the device. It has three parts: build the payload, encrypt it, and decrypt what comes back.

Reference: [`POST /authorize/certificate/{cert_id}`](../reference/Subscription.json/paths/~1authorize~1certificate~1{cert_id}/post)

### Step 1 - Build the payload

Assemble the following JSON object:

```json
{
  "crt": "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
  "device": "edge-node-01",
  "ver": 3,
  "ts": 1754300000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `crt` | string | The full PEM text of the client certificate, trimmed |
| `device` | string | A name for this device, **1–48 characters** |
| `ver` | integer | Required constant, always `3` |
| `ts` | integer | The timestamp from Section 1, used verbatim |

### Step 2 - Encrypt the payload

Serialize the object to JSON and encrypt it with AES-256-GCM under a key derived from the transport key. The result is wrapped in an OpenSSL-lookalike envelope and base64 encoded.

Byte layout before base64 encoding:

```
offset  size  field
------  ----  --------------------------------
0       8     "Salted__"   literal ASCII
8       16    salt         random, fresh per message
24      12    IV / nonce   random, fresh per message
36      n     ciphertext
36+n    16    GCM authentication tag
```

Key derivation:

```
key = PBKDF2_HMAC_SHA256(
        password   = transport_key,   # the string, trimmed — NOT base64-decoded
        salt       = salt,            # the 16 bytes above
        iterations = 1024,
        dkLen      = 32               # AES-256
      )
```

Encrypting:

```
salt   = random(16)
iv     = random(12)
key    = PBKDF2(transport_key, salt, 1024, 32)
ct, tag = AES_256_GCM_encrypt(key, iv, plaintext)
output = base64("Salted__" || salt || iv || ct || tag)
```

### Step 3 - Send the request

The request body is the **bare base64 string** produced above — not JSON, not quoted, and not wrapped in an object. `Content-Type` remains `application/json`.

```params json_schema
{
  "title": "/authorize/certificate/{cert_id}",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[General API key](https://manage.xqmsg.com/applications)"
    },
    "cert_id": {
      "type": "integer",
      "description": "The integer id of the certificate issued to this device."
    },
    "body": {
      "type": "string",
      "description": "The base64 encoded AES envelope containing the crt, device, ver, and ts fields."
    }
  },
  "required": ["api-key", "cert_id", "body"]
}
```
----
```request http
{
  "method": "POST",
  "url": "https://subscription.xqmsg.net/v2/authorize/certificate/{cert_id}",
  "headers": {
    "Content-Type": "application/json",
    "api-key": "123"
  },
  "body": "U2FsdGVkX1+abc123..."
}
```

> A successful response is another base64 encoded AES envelope. No bearer token is required for this call — the certificate is the credential.

### Step 4 - Decrypt the response

Reverse the envelope from Step 2, using the same transport key:

```
raw  = base64_decode(response)
assert raw[0:8] == "Salted__"
salt = raw[8:24]
iv   = raw[24:36]
tag  = raw[-16:]
ct   = raw[36:-16]
key  = PBKDF2(transport_key, salt, 1024, 32)
plaintext = AES_256_GCM_decrypt(key, iv, ct, tag)   # the tag MUST be verified
```

<!-- theme: danger -->
> #### Derive the response key from the response salt
>
> The response carries its own fresh salt and IV. Deriving the key from the salt you sent in the request is a common mistake and produces a decryption failure.

The plaintext is a small JSON object:

```json
{"access_token": "<base64 of RSA ciphertext>"}
```

### Step 5 - Unwrap the access token

The token is sealed to this device's certificate. Decrypt it with the matching private key:

```
ciphertext   = base64_decode(response_json["access_token"])
token_utf8   = RSA_decrypt(client_private_key, ciphertext, padding = PKCS#1 v1.5)
device_token = utf8_decode(token_utf8)
```

<!-- theme: warning -->
> #### Padding is PKCS#1 v1.5, not OAEP
>
> This matches OpenSSL's `EVP_PKEY_decrypt` defaults. Using OAEP will fail to unwrap. The private key may be supplied as PEM, or as base64 encoded DER if the text does not contain `BEGIN`.

The result is your device access token. Keep it in memory and send it as `Authorization: Bearer <device token>` on every call that follows.

## Section 3 - Announcing the Device (Optional)

Announcing registers the device as a named team member so it is visible in the management portal. It is not required in order to use the token.

Reference: [`POST /trusted/announce`](../reference/Manage.yml/paths/~1trusted~1announce/post)

<!-- theme: info -->
> #### Note the API key switch
>
> This call is on the **dashboard** subdomain, so it takes the **Dashboard API key** — while the bearer stays the device token you just obtained.

```params json_schema
{
  "title": "/trusted/announce",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[Dashboard API key](https://manage.xqmsg.com/applications)"
    },
    "authorization":{
      "type": "string",
      "description": "The device access token obtained in Section 2. Prefix the token with \"Bearer\""
    },
    "afirst": {
      "type": "string",
      "description": "The device name — use the same value sent as `device` in Section 2."
    },
    "alast": {
      "type": "string",
      "description": "Optional. Send an empty string."
    },
    "aphone": {
      "type": "string",
      "description": "Optional. Send an empty string."
    }
  },
  "required": ["api-key", "authorization", "afirst"]
}
```
----
```request http
{
  "method": "POST",
  "url": "https://dashboard.xqmsg.net/v2/trusted/announce",
  "headers": {
    "Content-Type": "application/json",
    "api-key": "123",
    "authorization":"Bearer xyz123"
  },
  "body": {
    "afirst": "edge-node-01",
    "alast": "",
    "aphone": ""
  }
}
```

> A successful response is either a `200` or a `204` with no content. Both indicate success.

Run this once per device name. Skip it on subsequent authorizations to save a round trip.

## Section 4 - Using the Device Token

The device token behaves like any other XQ access token. The two calls below confirm the whole flow end to end by storing a key and reading it back.

For the full key management surface — batch stores, granting and revoking recipients, and user groups — see [Key Authorization Policies](./KeyAuthorization.md) and the [Encryption](./EncryptionApiTutorial.md) and [Decryption](./DecryptionApiTutorial.md) tutorials.

### Step 1 - Store a key packet

Reference: [`POST /packet/add`](../reference/Subscription.json/paths/~1packet~1add/post)

<!-- theme: info -->
> #### Store keys with their algorithm prefix
>
> Keys are stored with a 2-character prefix identifying the algorithm: `.B` for OTP, `.1` for AES-256-GCM, `.2` for AES-256-CTR. On retrieval the prefix is authoritative. Omitting it forces a fallback that can silently select the wrong algorithm for your ciphertext.

```params json_schema
{
  "title": "/packet/add",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[General API key](https://manage.xqmsg.com/applications)"
    },
    "authorization":{
      "type": "string",
      "description": "The device access token obtained in Section 2. Prefix the token with \"Bearer\""
    },
    "key": {
      "type": "string",
      "description": "The encryption key, prefixed with its 2-character algorithm identifier."
    },
    "recipients": {
      "type": "string",
      "description": "Comma-delimited list of email addresses or phone numbers who are allowed to access the key."
    },
    "expires": {
      "type": "string",
      "description": "Number of hours that this key will remain valid for. After this time, it will no longer be accessible."
    },
    "type": {
      "type": "string",
      "description": "A value indicating the type of data that is being encrypted. Accepts either the string form (\"file\", \"msg\", \"chat\", \"form\", \"data\") or the numeric equivalent (1 = \"file\", 2 = \"msg\", 3 = \"chat\", 4 = \"form\", 5 = \"data\")."
    },
    "meta": {
      "type": "object",
      "description": "Any additional meta information about the key."
    }
  },
  "required": ["api-key", "authorization", "key", "recipients", "expires"]
}
```
----
```request http
{
  "method": "POST",
  "url": "https://subscription.xqmsg.net/v2/packet/add",
  "headers": {
    "Content-Type": "application/json",
    "api-key": "123",
    "authorization":"Bearer xyz123"
  },
  "body": {
    "meta": {
      "subject": "sensor-reading-2024-Q1",
      "title": "sensor-reading-2024-Q1",
      "labels": ["telemetry"]
    },
    "type": "msg",
    "recipients": "alice@example.com",
    "expires": "24",
    "key": ".1a1b2c3d4e5f..."
  }
}
```

> A successful response is a 43-character locator token. The locator token is not secret — store it alongside your ciphertext. The key itself never leaves XQ except to an authorized recipient.

<!-- theme: info -->
> #### Prefer group recipients for long-lived devices
>
> A group address of the form `{group_id}@_` is resolved at key-retrieval time rather than at packet-creation time. Adding someone to the group grants them access to every packet ever issued to it, with no re-encryption and no per-packet grant calls. Enumerated email recipients are fixed at creation. See [Key Authorization Policies](./KeyAuthorization.md).

### Step 2 - Retrieve the key

Reference: [`GET /key/{Locator}`](../reference/Validation.json/paths/~1key~1{Locator}/get)

```params json_schema
{
  "title": "/key/{locatorToken}",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[General API key](https://manage.xqmsg.com/applications)"
    },
    "authorization":{
      "type": "string",
      "description": "The device access token obtained in Section 2. Prefix the token with \"Bearer\""
    },
    "locatorToken": {
      "type": "string",
      "description": "The locator token returned when the key packet was stored. Make sure to URI encode the locatorToken."
    }
  },
  "required": ["api-key", "authorization", "locatorToken"]
}
```
----
```request http
{
  "method": "GET",
  "url": "https://validation.xqmsg.net/v2/key/{locatorToken}",
  "headers": {
    "api-key": "123",
    "authorization":"Bearer xyz123"
  }
}
```

> A successful response returns the key with its algorithm prefix intact. Strip the first two characters to recover the raw key, and use the prefix to select the cipher.

<!-- theme: warning -->
> #### URL-encode the locator token
>
> Locator tokens can contain characters that require escaping in a URL path. Encode the token before inserting it into the request.

Retrieval is where access control is enforced: the caller's identity must match one of the packet's recipients. A device that is not a recipient receives a `4xx` response, and this is not retryable.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `401` on a dashboard call that works on subscription | The general API key was sent instead of the Dashboard API key |
| The certificate exchange rejects a payload that looks correct | The local clock was used for `ts`, or `ts` was cached from an earlier run |
| AES decryption of the response fails | The key was derived from the request's salt instead of the response's salt |
| RSA unwrap of the access token fails | OAEP padding was used instead of PKCS#1 v1.5 |
| Decryption produces garbage | The algorithm prefix was stripped before the key was stored |
| A recipient cannot decrypt | A group was addressed by name rather than as `{group_id}@_` |

### Status codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `204` | Success with no body — the announce call returns this |
| `401` | Invalid API key, expired token, or the wrong API key for that subdomain |
| `4xx` on the certificate exchange | Certificate rejected, stale `ts`, wrong `ver`, or a device name longer than 48 characters |
| `4xx` on key retrieval | The caller is not a recipient, or the packet expired or was revoked |

