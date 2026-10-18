# Delete a user avatar or business icon

Source: https://xq.stoplight.io/docs/xqmsg/20fbfdc50ce4e-delete-a-user-avatar-or-business-icon

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1image~1{type}~1{ref}/delete`

## Endpoint

`DELETE https://dashboard.xqmsg.net/v2/image/{type}/{ref}`

```
curl --request DELETE \
  --url https://dashboard.xqmsg.net/v2/image/business/1 \
  --header 'api-key: YOUR_API_KEY' \
  --header 'authorization: Bearer YOUR_ACCESS_TOKEN' \
  --header 'content-type: application/json'
```

Deletes the image referenced by the **type** and **ref** parameters, as long as the currently authenticated user has permissions to do so.

**Required Scope: ** delete:image

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "5d2299b2794e6",
  "method": "delete",
  "path": "/image/{type}/{ref}",
  "tags": [
    {
      "id": "2aee6436e4677",
      "name": "Images"
    }
  ],
  "extensions": {},
  "iid": "delete-image-type-name",
  "description": "```\ncurl --request DELETE \\\n  --url https://dashboard.xqmsg.net/v2/image/business/1 \\\n  --header 'api-key: YOUR_API_KEY' \\\n  --header 'authorization: Bearer YOUR_ACCESS_TOKEN' \\\n  --header 'content-type: application/json'\n```\n\nDeletes the image referenced by the **type** and **ref** parameters, as long as the currently authenticated user has permissions to do so.\n\n**Required Scope: ** delete:image",
  "summary": "Delete a user avatar or business icon",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "6def2756073f2",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "47063aa5778f3",
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
            "id": "90b1efd47f438"
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
        "id": "219e4bd05bcfd",
        "name": "type",
        "style": "simple",
        "examples": [],
        "description": "The type of image in question. Must be either \"user\" ( for avatars ), or \"business\" (for business logos/icons).",
        "required": true,
        "schema": {
          "type": "string",
          "enum": [
            "user",
            "business"
          ],
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "384186d8c6f37"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "required",
          "description"
        ]
      },
      {
        "id": "7fddc143f8e41",
        "name": "ref",
        "style": "simple",
        "examples": [],
        "description": "The image reference path. For the \"user\" type, this will be the user ID. For the \"business\", this must be the ID of the business.",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "d2845eee67751"
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
