# Revoke Access to a Key

Source: https://xq.stoplight.io/docs/xqmsg/a3f5d1799d408-revoke-access-to-a-key

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Validation.json/paths/~1key~1{Locator}/delete`

## Endpoint

`DELETE https://validation.xqmsg.net/v2/key/{Locator}`

Revokes a key using its token. Only the user who sent the message will be able to revoke it.

**Required API Key Scope:** edit:key

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "34fa9dcc61927",
  "method": "delete",
  "path": "/key/{Locator}",
  "tags": [
    {
      "id": "b54d1d49b4783",
      "name": "KeyManagement"
    }
  ],
  "extensions": {},
  "iid": "delete-key-Locator",
  "description": "Revokes a key using its token. Only the user who sent the message will be able to revoke it.\n\n**Required API Key Scope:** edit:key",
  "summary": "Revoke Access to a Key",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "6a64ae0dec731",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - Indicates that the key was deleted successfully."
    },
    {
      "id": "9234afd3944bb",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "9214afd394005",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "6094af966bd69",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    },
    {
      "id": "60a4af966bebe",
      "code": "501",
      "headers": [],
      "contents": [],
      "description": "Not Implemented"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "563559917d42c",
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
            "id": "2c518859d89af"
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
        "id": "c748d1942d195",
        "name": "Locator",
        "style": "simple",
        "examples": [],
        "description": "A URL encoded version of the key locator token ( the token received after adding a key packet).",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "e11ae136fbb62"
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
