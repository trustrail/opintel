# Revoke a message token

Source: https://xq.stoplight.io/docs/xqmsg/c0dba6480b3c6-revoke-a-message-token

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1key~1{token}/delete`

## Endpoint

`DELETE https://dashboard.xqmsg.net/v2/key/{token}`

**Required Scopes:** revoke:key

**Webhook Event:** revokekey

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "34fa9dcc61927",
  "method": "delete",
  "path": "/key/{token}",
  "tags": [
    {
      "id": "c44a9fee156da",
      "name": "Key Management"
    }
  ],
  "extensions": {},
  "iid": "delete-key",
  "description": "**Required Scopes:** revoke:key\n\n**Webhook Event:** revokekey",
  "summary": "Revoke a message token",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "6a64ae0dec731",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - Token was successfully revoked."
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
        "id": "3140b027200a7",
        "name": "token",
        "style": "simple",
        "examples": [],
        "description": "The message token related to the key. Must be URL encoded.",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "70ca24fb2bda5"
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
