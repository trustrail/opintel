# Authorize a Device With a Certificate

Source: https://xq.stoplight.io/docs/xqmsg/eb5ecb08a475f-authorize-a-device-with-a-certificate

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1authorize~1certificate~1{cert_id}/post`

## Endpoint

`POST https://subscription.xqmsg.net/v2/authorize/certificate/{cert_id}`

Exchanges an X.509 device certificate for a full access token. This is the authorization route for unattended devices and services that cannot complete a two-factor challenge — the certificate is the credential, so no email, PIN, or validation link is involved.

The exchange is protected in two layers. The request body is a base64 encoded AES-256-GCM envelope, encrypted under a key derived from the transport key issued with the certificate. The access token inside the response is additionally encrypted with the certificate's public key, so only the holder of the matching private key can read it.

**Request body:** a bare base64 string, not JSON and not a wrapping object. Before encryption the payload is the JSON object `{"crt", "device", "ver", "ts"}`, where `crt` is the full PEM text of the certificate, `device` is a 1–48 character device name, `ver` is the constant `3`, and `ts` is the value returned by `/time`.

**Envelope format:** base64 of `"Salted__" || salt(16) || iv(12) || ciphertext || gcm_tag(16)`, with the key derived as `PBKDF2-HMAC-SHA256(transport_key, salt, 1024 iterations, 32 bytes)`. The response uses its own fresh salt and IV.

**Response:** a base64 encoded AES envelope of the same form. Decrypting it yields `{"access_token": "<base64 RSA ciphertext>"}`. Decrypt that value with the device private key using **PKCS#1 v1.5** padding to recover the access token string.

No bearer token is required on this call. There is no refresh endpoint — repeat `/time` and this call with the same certificate when the token expires.

See the [Device Certificate Authorization tutorial](../../docs/DeviceCertificateTutorial.md) for a step by step walkthrough.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "9c9c0d627f364",
  "method": "post",
  "path": "/authorize/certificate/{cert_id}",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "post-authorize-certificate",
  "description": "Exchanges an X.509 device certificate for a full access token. This is the authorization route for unattended devices and services that cannot complete a two-factor challenge — the certificate is the credential, so no email, PIN, or validation link is involved.\n\nThe exchange is protected in two layers. The request body is a base64 encoded AES-256-GCM envelope, encrypted under a key derived from the transport key issued with the certificate. The access token inside the response is additionally encrypted with the certificate's public key, so only the holder of the matching private key can read it.\n\n**Request body:** a bare base64 string, not JSON and not a wrapping object. Before encryption the payload is the JSON object `{\"crt\", \"device\", \"ver\", \"ts\"}`, where `crt` is the full PEM text of the certificate, `device` is a 1–48 character device name, `ver` is the constant `3`, and `ts` is the value returned by `/time`.\n\n**Envelope format:** base64 of `\"Salted__\" || salt(16) || iv(12) || ciphertext || gcm_tag(16)`, with the key derived as `PBKDF2-HMAC-SHA256(transport_key, salt, 1024 iterations, 32 bytes)`. The response uses its own fresh salt and IV.\n\n**Response:** a base64 encoded AES envelope of the same form. Decrypting it yields `{\"access_token\": \"<base64 RSA ciphertext>\"}`. Decrypt that value with the device private key using **PKCS#1 v1.5** padding to recover the access token string.\n\nNo bearer token is required on this call. There is no refresh endpoint — repeat `/time` and this call with the same certificate when the token expires.\n\nSee the [Device Certificate Authorization tutorial](../../docs/DeviceCertificateTutorial.md) for a step by step walkthrough.",
  "summary": "Authorize a Device With a Certificate",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "248bb5d92311e",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "8bd3f755a0bc6",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "string",
            "description": "The encrypted response envelope.",
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "aecc183132269"
            }
          }
        }
      ],
      "description": "OK - Returns a base64 encoded AES envelope. Decrypting it yields a JSON object containing the RSA-wrapped access token."
    },
    {
      "id": "84abb7b5f3616",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request - Usually received when the payload could not be decrypted, the timestamp is stale, `ver` is not 3, or the device name exceeds 48 characters. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "849bb7b5f37c1",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized - Usually received when an invalid API key is provided. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "847bb7b5f3b6f",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden - Usually caused by a certificate that is unknown, expired, or revoked, or by an API key that does not have the required scope. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "20fbb761ad548",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error - Something unexpected went wrong. The reason for failure is provided in the response's JSON encoded body."
    }
  ],
  "request": {
    "body": {
      "id": "4e7e5354bc802",
      "contents": [
        {
          "id": "37c8b026c2aa5",
          "mediaType": "application/json",
          "examples": [
            {
              "id": "700c775c9c7ff",
              "value": "U2FsdGVkX1+abc123...",
              "key": "default"
            }
          ],
          "encodings": [],
          "schema": {
            "type": "string",
            "description": "The base64 encoded AES envelope wrapping the JSON authorization payload. Sent as a bare string, not as a JSON object.",
            "examples": [
              "U2FsdGVkX1+abc123..."
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "2784fe7bbfdd3"
            }
          }
        }
      ],
      "description": "The encrypted authorization payload."
    },
    "headers": [
      {
        "id": "0726ceccad37c",
        "name": "Content-Type",
        "style": "simple",
        "examples": [],
        "description": "The encrypted payload is sent with a JSON content type even though the body itself is a bare base64 string.",
        "required": true,
        "schema": {
          "type": "string",
          "default": "application/json",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "3d434bf3b2629"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description",
          "required"
        ]
      }
    ],
    "query": [],
    "cookie": [],
    "path": [
      {
        "id": "a0886d5ec69f0",
        "name": "cert_id",
        "style": "simple",
        "examples": [],
        "description": "The integer id of the certificate issued to this device.",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "d8e77ec0c20cb"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description",
          "required"
        ]
      }
    ]
  },
  "security": [
    [
      {
        "id": "ad56c2099191c",
        "key": "apiKey",
        "extensions": {},
        "description": "Required for almost every API call. Developers may provision their own keys from the XQ Dashboard.",
        "type": "apiKey",
        "name": "api-key",
        "in": "header"
      }
    ]
  ],
  "servers": [
    {
      "id": "4f26feac86d96",
      "url": "https://subscription.xqmsg.net/v2",
      "name": "Subscription"
    }
  ]
}
```
