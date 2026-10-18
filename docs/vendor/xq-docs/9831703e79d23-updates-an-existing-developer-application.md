# Updates an existing developer application

Source: https://xq.stoplight.io/docs/xqmsg/9831703e79d23-updates-an-existing-developer-application

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1devapp~1{appId}/patch`

## Endpoint

`PATCH https://dashboard.xqmsg.net/v2/devapp/{appId}`

Updates an existing developer application.

Required Scope: **devapp**

**Webhook Event:** updatedevapp

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "cf6ee733084be",
  "method": "patch",
  "path": "/devapp/{appId}",
  "tags": [
    {
      "id": "3c5ba08f9b0d1",
      "name": "API Keys"
    }
  ],
  "extensions": {},
  "iid": "patch-devapp-appId",
  "description": "Updates an existing developer application.\n\nRequired Scope: **devapp**\n\n**Webhook Event:** updatedevapp",
  "summary": "Updates an existing developer application",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "8a5bcf53b67fb",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content"
    }
  ],
  "request": {
    "body": {
      "id": "3ead3393f00ed",
      "contents": [
        {
          "id": "afbb02b48b1ec",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string",
                "description": "The updated application name."
              },
              "desc": {
                "type": "string",
                "description": "The updated application description."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "d228f83202c85"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "a8d21f3d31714",
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
            "id": "c35cb330e7b2b"
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
        "id": "710771c0655f1",
        "name": "appId",
        "style": "simple",
        "examples": [],
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "5a7557d9853f7"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "required"
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
