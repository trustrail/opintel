# Send login magic link to a user

Source: https://xq.stoplight.io/docs/xqmsg/5cde236a164ba-send-login-magic-link-to-a-user

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1login~1link/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/login/link`

Send login magic link to a users email address

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "6979aa392d5fe",
  "method": "post",
  "path": "/login/link",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "SendLoginLink",
  "description": "Send login magic link to a users email address",
  "summary": "Send login magic link to a user",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "16280c83f802d",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "OK - Email has been sent"
    }
  ],
  "request": {
    "body": {
      "id": "6fa44ed5e10b8",
      "contents": [
        {
          "id": "17187913437e2",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "email": {
                "type": "string",
                "format": "email",
                "description": "The email address of the user."
              },
              "state": {
                "type": "string",
                "description": "Optional parameter that would pass through from the frontend and get placed as query parameter in the magic link that is in the email.\n\nThis can be used for the front end to determine which flow the user is coming from, and therefore which screen the user should be\nsent to after they have successfully logged in."
              },
              "host": {
                "type": "string",
                "description": "The host domain that login links will target. If not provided, the server instance default will be used."
              }
            },
            "required": [
              "email"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "83605475f615b"
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
