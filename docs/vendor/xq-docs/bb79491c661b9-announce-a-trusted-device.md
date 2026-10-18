# Announce a trusted device

Source: https://xq.stoplight.io/docs/xqmsg/bb79491c661b9-announce-a-trusted-device

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1trusted~1announce/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/trusted/announce`

Registers a device as a named member of the team so that it appears in the management portal. Intended for devices that authorized with a certificate rather than an email address.

This call is optional — the device access token is fully usable without it. Run it once per device name and skip it on subsequent authorizations.

**Note:** this endpoint is on the dashboard subdomain, so it takes the dashboard API key, while the bearer remains the device access token obtained from the subscription service. Both `200` and `204` indicate success.

See the [Device Certificate Authorization tutorial](../../docs/DeviceCertificateTutorial.md) for the full device onboarding flow.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "40f8db07d4c54",
  "method": "post",
  "path": "/trusted/announce",
  "tags": [
    {
      "id": "3bfbcc61f009d",
      "name": "Trusted Range"
    }
  ],
  "extensions": {},
  "iid": "AnnounceTrusted",
  "description": "Registers a device as a named member of the team so that it appears in the management portal. Intended for devices that authorized with a certificate rather than an email address.\n\nThis call is optional — the device access token is fully usable without it. Run it once per device name and skip it on subsequent authorizations.\n\n**Note:** this endpoint is on the dashboard subdomain, so it takes the dashboard API key, while the bearer remains the device access token obtained from the subscription service. Both `200` and `204` indicate success.\n\nSee the [Device Certificate Authorization tutorial](../../docs/DeviceCertificateTutorial.md) for the full device onboarding flow.",
  "summary": "Announce a trusted device",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "23855ff0b4106",
      "code": "200",
      "headers": [],
      "contents": [],
      "description": "OK - The device was registered."
    },
    {
      "id": "23455ff0b3bda",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - The device was registered."
    },
    {
      "id": "26355f4dea907",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized - Usually received when an invalid API key is provided, or when the general API key was sent instead of the dashboard API key."
    },
    {
      "id": "26155f4dea6fd",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden - Usually caused by an invalid or expired access token."
    },
    {
      "id": "bfd55f9c6dc49",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error - Something unexpected went wrong."
    }
  ],
  "request": {
    "body": {
      "id": "e64172a871a7b",
      "contents": [
        {
          "id": "54e11640e144e",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "afirst": {
                "type": "string",
                "description": "The device name. Use the same value that was sent as the `device` field during certificate authorization."
              },
              "alast": {
                "type": "string",
                "description": "Optional. Send an empty string for a device."
              },
              "aphone": {
                "type": "string",
                "description": "Optional. Send an empty string for a device."
              }
            },
            "required": [
              "afirst"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "a856f6e5ea4ee"
            }
          }
        }
      ],
      "description": "The identifying details to register for this device."
    },
    "headers": [
      {
        "id": "f559e625e2ec7",
        "name": "authorization",
        "style": "simple",
        "examples": [],
        "description": "The device access token returned by the certificate authorization service, sent as a bearer token.",
        "required": true,
        "schema": {
          "type": "string",
          "default": "Bearer xyz123",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "355e6a0e1c47b"
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
    "path": []
  },
  "security": [
    [
      {
        "id": "de1755561948a",
        "key": "API Key",
        "extensions": {},
        "description": "Required for almost every API call. Developers may provision their own keys from their dashboard account.",
        "type": "apiKey",
        "name": "api-key",
        "in": "header"
      }
    ]
  ],
  "servers": [
    {
      "id": "9c8a6f289ced5",
      "url": "https://dashboard.xqmsg.net/v2",
      "name": "Manage",
      "description": "production"
    }
  ]
}
```
