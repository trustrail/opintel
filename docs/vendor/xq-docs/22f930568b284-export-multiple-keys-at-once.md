# Export multiple keys at once

Source: https://xq.stoplight.io/docs/xqmsg/22f930568b284-export-multiple-keys-at-once

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1keys/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/keys`

Exports multiple keys related to the token. The token must belong to a registered member of the authenticated users workspace. Exported keys can be backed up and restored from the dashboard at a later time, even after the token expires.

**Required Scopes:** export:multikey

**Webhook Event:** exportkeys

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "1fd9d60b5a9d8",
  "method": "get",
  "path": "/keys",
  "tags": [
    {
      "id": "c44a9fee156da",
      "name": "Key Management"
    }
  ],
  "extensions": {},
  "iid": "get-keys",
  "description": "Exports multiple keys related to the token. The token must belong to a registered member of the authenticated users workspace. Exported keys can be backed up and restored from the dashboard at a later time, even after the token expires.\n\n**Required Scopes:** export:multikey\n\n**Webhook Event:** exportkeys",
  "summary": "Export multiple keys at once",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "81cdefbae8e6f",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "69bd39eb3d511",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "b766d14c19905"
            }
          }
        }
      ],
      "description": "OK - Returns the keys in the requested file format."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "ccd25a978106a",
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
            "id": "09e11899d0bc3"
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
    "query": [
      {
        "id": "c1ad50686c344",
        "name": "from",
        "style": "form",
        "examples": [],
        "description": "The lower boundary time ( in milliseconds ) to search. A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "default": 0,
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "4d4e1ec336061"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      },
      {
        "id": "da664eca40cf6",
        "name": "to",
        "style": "form",
        "examples": [],
        "description": "The upper boundary time ( in milliseconds ) to search. A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "default": 0,
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "40bd2e269ad9d"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      },
      {
        "id": "10d087ea91994",
        "name": "format",
        "style": "form",
        "examples": [],
        "description": "Specifies how results should be return. Must be either **json** or **csv**.",
        "schema": {
          "type": "string",
          "default": "csv",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "bceb03e8ea3e8"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      },
      {
        "id": "59b40cf3b4174",
        "name": "user",
        "style": "form",
        "examples": [],
        "description": "Filter by a specific users email. The email must belong to a member of the authenticated users workspace.",
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "ffec910a42fb6"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      }
    ],
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
