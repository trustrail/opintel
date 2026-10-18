# Log a user out of the dashboard

Source: https://xq.stoplight.io/docs/xqmsg/5535a10ed45fb-log-a-user-out-of-the-dashboard

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1logout/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/logout`

Logs a user out of the dashboard. Once logged out, the access token will no longer one, and another will need to be issued to use the dashboard again.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "c67cc8fa2a2b7",
  "method": "post",
  "path": "/logout",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "post-logout",
  "description": "Logs a user out of the dashboard. Once logged out, the access token will no longer one, and another will need to be issued to use the dashboard again.",
  "summary": "Log a user out of the dashboard",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "2d4d12a09fd6e",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - Logout was successful."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "877562028fe31",
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
            "id": "ebc8fe9a096d7"
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
