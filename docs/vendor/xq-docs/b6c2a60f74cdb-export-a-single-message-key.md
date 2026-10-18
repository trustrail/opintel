# Export a single message key

Source: https://xq.stoplight.io/docs/xqmsg/b6c2a60f74cdb-export-a-single-message-key

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1key~1{token}/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/key/{token}`

Exports the single key related to the token. The token must belong to a registered member of the authenticated users workspace. Exported keys can be backed up and restored from the dashboard at a later time, even after the token expires.

**Required Scopes:** export:singlekey

**Webhook Event:** exportkey

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "bcd5fb9612757",
  "method": "get",
  "path": "/key/{token}",
  "tags": [
    {
      "id": "c44a9fee156da",
      "name": "Key Management"
    }
  ],
  "extensions": {},
  "iid": "get-key",
  "description": "Exports the single key related to the token. The token must belong to a registered member of the authenticated users workspace. Exported keys can be backed up and restored from the dashboard at a later time, even after the token expires.\n\n**Required Scopes:** export:singlekey\n\n**Webhook Event:** exportkey",
  "summary": "Export a single message key",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "c73e921a7adad",
      "code": "200",
      "headers": [],
      "contents": [],
      "description": "OK - Returns the message key."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "96ac79cf16e25",
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
            "id": "33aebcea67cc0"
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
        "id": "500c42cc6e586",
        "name": "token",
        "style": "simple",
        "examples": [],
        "description": "The message token related to the key. Must be URL encoded.",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "b526b51c792cb"
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
