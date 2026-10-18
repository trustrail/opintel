# Delete a registered API key

Source: https://xq.stoplight.io/docs/xqmsg/f98f0f17f693e-delete-a-registered-api-key

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1apikey~1{keyId}/delete`

## Endpoint

`DELETE https://dashboard.xqmsg.net/v2/apikey/{keyId}`

```
curl --request DELETE \
  --url https://dashboard.xqmsg.net/v2/apikey/API_KEY_ID \
  --header 'api-key: YOUR_API_KEY' \
  --header 'authorization: Bearer YOUR_ACCESS_TOKEN'
```

Deletes an API key. Note that any applications that rely on that API key will no longer work.

**Required Scopes: ** delete:apikey

**Webhook Event:** removeapikey

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "29dab0f821c55",
  "method": "delete",
  "path": "/apikey/{keyId}",
  "tags": [
    {
      "id": "3c5ba08f9b0d1",
      "name": "API Keys"
    }
  ],
  "extensions": {},
  "iid": "delete-apikey-keyId",
  "description": "```\ncurl --request DELETE \\\n  --url https://dashboard.xqmsg.net/v2/apikey/API_KEY_ID \\\n  --header 'api-key: YOUR_API_KEY' \\\n  --header 'authorization: Bearer YOUR_ACCESS_TOKEN'\n```\n\nDeletes an API key. Note that any applications that rely on that API key will no longer work.\n\n**Required Scopes: ** delete:apikey\n\n**Webhook Event:** removeapikey",
  "summary": "Delete a registered API key",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "f9aab6d5d0bde",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - Key was removed successfully."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "d24100a53cd54",
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
            "id": "6b2769ddeb9b9"
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
        "id": "c4436e2535f23",
        "name": "keyId",
        "style": "simple",
        "examples": [],
        "description": "The ID of the API key to use in this request.",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "4c37c04163127"
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
