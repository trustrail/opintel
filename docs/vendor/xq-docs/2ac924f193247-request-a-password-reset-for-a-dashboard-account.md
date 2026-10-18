# Request a password reset for a dashboard account

Source: https://xq.stoplight.io/docs/xqmsg/2ac924f193247-request-a-password-reset-for-a-dashboard-account

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1reset/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/reset`

Reset a users password. A confirmation email will be sent to them, which they will need to click in order to change their passsword.

**Required Scopes:** reset

**Webhook Event:** requestreset

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "8b36a9a0a23fc",
  "method": "post",
  "path": "/reset",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "post-reset",
  "description": "Reset a users password. A confirmation email will be sent to them, which they will need to click in order to change their passsword.\n\n**Required Scopes:** reset\n\n**Webhook Event:** requestreset",
  "summary": "Request a password reset for a dashboard account",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "b9dae24d9c7b0",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - Indicates the reset request was successful."
    }
  ],
  "request": {
    "body": {
      "id": "986ee5726f933",
      "contents": [
        {
          "id": "233ec3ba7c65c",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "email": {
                "type": "string",
                "description": "The email address to reset.",
                "format": "email"
              },
              "workspace": {
                "type": "string",
                "description": "The workspace where the specified address is registered."
              }
            },
            "required": [
              "email",
              "workspace"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "d7c146680b347"
            }
          }
        }
      ]
    },
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
  ]
}
```
