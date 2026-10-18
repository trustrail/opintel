# Revoke User Access

Source: https://xq.stoplight.io/docs/xqmsg/7d2c51b0b2890-revoke-user-access

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Validation.json/paths/~1revoke~1{token}/patch`

## Endpoint

`PATCH https://validation.xqmsg.net/v2/revoke/{token}`

A service which is utilized to revoke access to keys for specific recipients without revoking the entire token.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "e12f1c13359ee",
  "method": "patch",
  "path": "/revoke/{token}",
  "tags": [
    {
      "id": "b54d1d49b4783",
      "name": "KeyManagement"
    }
  ],
  "extensions": {},
  "iid": "patch-revoke-token",
  "description": "A service which is utilized to revoke access to keys for specific recipients without revoking the entire token.",
  "summary": "Revoke User Access",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "39aa14018a2cb",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content"
    },
    {
      "id": "6c9a1358f4661",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "6c7a1358f45cb",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "d03a13ad3a338",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "body": {
      "id": "ce71a9f32cdab",
      "contents": [
        {
          "id": "f5b49a84a8db0",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "recipients": {
                "type": "array",
                "description": "The list of emails of users intended to have read access to the encrypted content removed.",
                "items": {
                  "type": "string"
                }
              }
            },
            "required": [
              "recipients"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "4541c5ef72b36"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "897273a472a8e",
        "name": "authorization",
        "style": "simple",
        "examples": [],
        "description": "This is a bearer token required to make most XQ API calls. To get one, a user must first request access, upon which they get a pre-auth token. After they confirm their account, they will send the pre-auth token to the server in return for an access token.",
        "required": true,
        "schema": {
          "type": "string",
          "default": "Bearer xyz123",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "f5bd9c38830f3"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "description",
          "name",
          "required"
        ]
      }
    ],
    "query": [],
    "cookie": [],
    "path": [
      {
        "id": "639fe2e708276",
        "name": "token",
        "style": "simple",
        "examples": [],
        "description": "Locator token",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "fded71766c51c"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "required",
          "description"
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
        "description": "Required for almost every API call. Developers may provision their own keys from the XQ dashboard.",
        "type": "apiKey",
        "name": "api-key",
        "in": "header"
      }
    ]
  ],
  "servers": [
    {
      "id": "2ee50d3997cac",
      "url": "https://validation.xqmsg.net/v2",
      "name": "Validation"
    }
  ]
}
```
