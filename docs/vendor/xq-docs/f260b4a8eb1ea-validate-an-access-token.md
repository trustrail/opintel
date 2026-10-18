# Validate an access token

Source: https://xq.stoplight.io/docs/xqmsg/f260b4a8eb1ea-validate-an-access-token

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1session/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/session`

Checks whether the provided access token is a valid one or not. Returns a 204 if valid. Anything else indicates that the check failed.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "e8c3f12a6a160",
  "method": "get",
  "path": "/session",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "GetSession",
  "description": "Checks whether the provided access token is a valid one or not. Returns a 204 if valid. Anything else indicates that the check failed.",
  "summary": "Validate an access token",
  "securityDeclarationType": "inheritedFromService",
  "responses": [
    {
      "id": "18d58560963b5",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - Indicates the token is still valid."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "292c6585cac97",
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
            "id": "49c91417bd988"
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
    []
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
