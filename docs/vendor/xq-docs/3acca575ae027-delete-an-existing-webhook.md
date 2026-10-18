# Delete an existing webhook

Source: https://xq.stoplight.io/docs/xqmsg/3acca575ae027-delete-an-existing-webhook

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1hook~1{webhookId}/delete`

## Endpoint

`DELETE https://dashboard.xqmsg.net/v2/hook/{webhookId}`

````
curl --request DELETE \
  --url https://dashboard.xqmsg.net/v2/hook/HOOK_ID \
  --header 'api-key: YOUR_API_KEY' \
  --header 'authorization: Bearer YOUR_ACCESS_TOKEN' \
  --header 'content-type: application/json' \
````

Deletes an existing webhook.

**Required Scope: ** hook

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "9cdf5703d3c38",
  "method": "delete",
  "path": "/hook/{webhookId}",
  "tags": [
    {
      "id": "15b231d4a5a13",
      "name": "Events"
    }
  ],
  "extensions": {},
  "iid": "delete-hook",
  "description": "````\ncurl --request DELETE \\\n  --url https://dashboard.xqmsg.net/v2/hook/HOOK_ID \\\n  --header 'api-key: YOUR_API_KEY' \\\n  --header 'authorization: Bearer YOUR_ACCESS_TOKEN' \\\n  --header 'content-type: application/json' \\\n````\n\nDeletes an existing webhook.\n\n**Required Scope: ** hook",
  "summary": "Delete an existing webhook",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "5af7aaaa77f3c",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "a216d75e31469",
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
            "id": "cf389b3f98aa7"
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
        "id": "4d071433b56d7",
        "name": "webhookId",
        "style": "simple",
        "examples": [],
        "description": "1",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "a8b3f360a455b"
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
