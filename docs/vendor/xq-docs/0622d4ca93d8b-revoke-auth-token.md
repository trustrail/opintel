# Revoke AuthToken

Source: https://xq.stoplight.io/docs/xqmsg/0622d4ca93d8b-revoke-auth-token

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1authorization/delete`

## Endpoint

`DELETE https://subscription.xqmsg.net/v2/authorization`

 A service which is utilized to revoke a key using its token.
 Only the user who sent the message will be able to revoke it.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "bc4bccec6c722",
  "method": "delete",
  "path": "/authorization",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "delete-authorization",
  "description": " A service which is utilized to revoke a key using its token.\n Only the user who sent the message will be able to revoke it.",
  "summary": "Revoke AuthToken",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "5c75c58a3fc26",
      "code": "200",
      "headers": [],
      "contents": [],
      "description": "OK"
    },
    {
      "id": "0465c3ad7c25d",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "0485c3ad7dec7",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "6605c401bf784",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "fcc041e2e1fc4",
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
            "id": "98c235bfabec5"
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
        "id": "ad56c2099191c",
        "key": "apiKey",
        "extensions": {},
        "description": "Required for almost every API call. Developers may provision their own keys from the XQ Dashboard.",
        "type": "apiKey",
        "name": "api-key",
        "in": "header"
      }
    ]
  ],
  "servers": [
    {
      "id": "4f26feac86d96",
      "url": "https://subscription.xqmsg.net/v2",
      "name": "Subscription"
    }
  ]
}
```
