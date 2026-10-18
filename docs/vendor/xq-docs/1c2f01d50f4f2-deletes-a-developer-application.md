# Deletes a developer application

Source: https://xq.stoplight.io/docs/xqmsg/1c2f01d50f4f2-deletes-a-developer-application

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1devapp~1{appId}/delete`

## Endpoint

`DELETE https://dashboard.xqmsg.net/v2/devapp/{appId}`

````
curl --request DELETE \
  --url https://dashboard.xqmsg.net/v2/devapp/6 \
  --header 'api-key: YOUR_API_KEY' \
  --header 'authorization: Bearer YOUR_ACCESS_TOKEN' \
````

Deletes a developer application. Note that all API keys linked to this application will also be deleted, meaning any apps that use them will no longer work.

Required Scope: **devapp**

**Webhook Event: ** removedevapp

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "c18db37071851",
  "method": "delete",
  "path": "/devapp/{appId}",
  "tags": [
    {
      "id": "3c5ba08f9b0d1",
      "name": "API Keys"
    }
  ],
  "extensions": {},
  "iid": "delete-devapp-appId",
  "description": "````\ncurl --request DELETE \\\n  --url https://dashboard.xqmsg.net/v2/devapp/6 \\\n  --header 'api-key: YOUR_API_KEY' \\\n  --header 'authorization: Bearer YOUR_ACCESS_TOKEN' \\\n````\n\nDeletes a developer application. Note that all API keys linked to this application will also be deleted, meaning any apps that use them will no longer work.\n\nRequired Scope: **devapp**\n\n**Webhook Event: ** removedevapp",
  "summary": "Deletes a developer application",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "8e712a04a9c9e",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "OK"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "d8bf2910667e8",
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
            "id": "ec576cc487e5a"
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
        "id": "c2392afe44bcc",
        "name": "appId",
        "style": "simple",
        "examples": [],
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "315efd1f0dbfc"
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
