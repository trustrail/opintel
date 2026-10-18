# Delete an existing trusted range

Source: https://xq.stoplight.io/docs/xqmsg/0f0884d9f5b56-delete-an-existing-trusted-range

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1trusted~1{id}/delete`

## Endpoint

`DELETE https://dashboard.xqmsg.net/v2/trusted/{id}`

Deletes an existing trusted range.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "33c85f4e00ed3",
  "method": "delete",
  "path": "/trusted/{id}",
  "tags": [
    {
      "id": "3bfbcc61f009d",
      "name": "Trusted Range"
    }
  ],
  "extensions": {},
  "iid": "DeleteTrusted",
  "description": "Deletes an existing trusted range.",
  "summary": "Delete an existing trusted range",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "5cf5e5a451e7d",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - Key was removed successfully."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "f21b626bb5988",
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
            "id": "3342bc63383ea"
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
        "id": "37aac24dc130f",
        "name": "id",
        "style": "simple",
        "examples": [],
        "description": "The ID of the trusted range to delete.",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "c8870d71fe231"
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
