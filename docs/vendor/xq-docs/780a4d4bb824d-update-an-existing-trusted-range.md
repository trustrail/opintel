# Update an existing trusted Range

Source: https://xq.stoplight.io/docs/xqmsg/780a4d4bb824d-update-an-existing-trusted-range

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1trusted~1{id}/patch`

## Endpoint

`PATCH https://dashboard.xqmsg.net/v2/trusted/{id}`

Update an existing trusted range.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "27c8bd1e9dd60",
  "method": "patch",
  "path": "/trusted/{id}",
  "tags": [
    {
      "id": "3bfbcc61f009d",
      "name": "Trusted Range"
    }
  ],
  "extensions": {},
  "iid": "UpdateTrusted",
  "description": "Update an existing trusted range.",
  "summary": "Update an existing trusted Range",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "c1b4f5f45ccfb",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - Trusted range was updated successfully."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "fa4ba621e4b0a",
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
            "id": "cc6006c70e793"
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
        "id": "8db25e9c9052c",
        "name": "id",
        "style": "simple",
        "examples": [],
        "description": "The ID of the trusted range to delete.",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "5c0fef172a265"
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
