# Get current user

Source: https://xq.stoplight.io/docs/xqmsg/e0797f733fbe9-get-current-user

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1user/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/user`

Send login magic link to a users email address

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "082d2d00b4e8d",
  "method": "get",
  "path": "/user",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "GetCurrentUser",
  "description": "Send login magic link to a users email address",
  "summary": "Get current user",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "2e473bc6a60d3",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "26fed68dcabaf",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "allOf": [
              {
                "$ref": "#/__bundled__/BaseResponse"
              },
              {
                "$ref": "#/__bundled__/ContactSummary"
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "df8fc8ffd7c01"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "headers": [],
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
  ],
  "__bundled__": {
    "BaseResponse": {
      "description": "",
      "type": "object",
      "properties": {
        "status": {
          "description": "\"OK\" if the response was successful, otherwise it describes the error that occurred",
          "type": "string"
        }
      },
      "required": [
        "status"
      ]
    },
    "ContactSummary": {
      "type": "object",
      "properties": {
        "id": {
          "type": "integer",
          "description": "Contact ID"
        },
        "fn": {
          "type": "string",
          "description": "First Name"
        },
        "ln": {
          "type": "string",
          "description": "Last Name"
        },
        "phone": {
          "type": "string",
          "description": "Telephone Number"
        },
        "email": {
          "type": "string",
          "description": "Email Address"
        },
        "title": {
          "type": "string",
          "description": "The business title of the contact."
        },
        "state": {
          "type": "string",
          "enum": [
            "Invited",
            "Validated",
            "Disabled"
          ],
          "description": "User State"
        },
        "last": {
          "type": "integer",
          "description": "The last time the contact signed in ( in milliseconds since 1970 )."
        },
        "role": {
          "type": "string",
          "description": "User Role",
          "enum": [
            "Admin",
            "User",
            "Vendor",
            "Customer",
            "SuperUser",
            "Device"
          ]
        },
        "n": {
          "type": "integer",
          "enum": [
            0,
            2,
            3
          ],
          "description": "Level of notifications received:\n  `0` - None\n  `2` - Warnings and Alerts\n  `3` - Alerts Only"
        },
        "more": {
          "type": "string",
          "description": "Additional information about this contact."
        },
        "hasUsedEdgeClient": {
          "type": "boolean",
          "description": "Indicates whether or not the contact has ever used one of the edge clients"
        }
      },
      "required": [
        "id",
        "email",
        "state",
        "last",
        "n"
      ]
    }
  }
}
```
