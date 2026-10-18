# Login to the dashboard

Source: https://xq.stoplight.io/docs/xqmsg/8940c90beff8b-login-to-the-dashboard

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1login/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/login`

Logs a user into their dashboard account. On success, an access token is returned that can be used to call other dashboard services.

**Required Scopes:** login

**Webhook Event:** login

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "d5e58286b7814",
  "method": "post",
  "path": "/login",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "Login",
  "description": "Logs a user into their dashboard account. On success, an access token is returned that can be used to call other dashboard services.\n\n**Required Scopes:** login\n\n**Webhook Event:** login",
  "summary": "Login to the dashboard",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "d9f08d0279460",
      "code": "200",
      "headers": [],
      "contents": [],
      "description": "OK - Returns a new access token."
    }
  ],
  "request": {
    "body": {
      "id": "ceff019e6a0b7",
      "contents": [
        {
          "id": "0bbe3d7a1e042",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "required": [
              "pwd"
            ],
            "properties": {
              "email": {
                "type": "string",
                "format": "email",
                "description": "The email address of the user. Required unless the user is logging in with an OAuth Access Token."
              },
              "pwd": {
                "type": "string",
                "description": "A token or password that can be used to log a user in to their account. Depends on the value of `method`"
              },
              "workspace": {
                "type": "string",
                "description": "The account workspace. This field is deprecated and should not be used.",
                "deprecated": true
              },
              "method": {
                "type": "integer",
                "default": 0,
                "enum": [
                  0,
                  1
                ],
                "description": "The method being used to log the user in:\n  `0` -- Password\n  `1` -- OAuth Access Token"
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "ae549784288f0"
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
