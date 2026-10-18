# Get a user avatar or business icon image

Source: https://xq.stoplight.io/docs/xqmsg/359f210c35d11-get-a-user-avatar-or-business-icon-image

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1image~1{type}~1{ref}/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/image/{type}/{ref}`

Fetches the image referenced by the **type** and **ref** parameters. In some cases, if an image is not available, a default image will be returned to the user instead.

**Required Scope:** read:image

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "46e4ea4e03871",
  "method": "get",
  "path": "/image/{type}/{ref}",
  "tags": [
    {
      "id": "83d3d47040032",
      "name": "Contact Management"
    }
  ],
  "extensions": {},
  "iid": "get-image-type-name",
  "description": "Fetches the image referenced by the **type** and **ref** parameters. In some cases, if an image is not available, a default image will be returned to the user instead.\n\n**Required Scope:** read:image",
  "summary": "Get a user avatar or business icon image",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "9789f3ec376ff",
      "code": "200",
      "headers": [],
      "contents": [],
      "description": "OK - Returns the binary image file."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "4407258e647da",
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
            "id": "b4aeebb6e4d6c"
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
        "id": "1bbec508db440",
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
            "id": "f6b2e5df2574c"
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
        "id": "b94cb746e64bc",
        "name": "ref",
        "style": "simple",
        "examples": [],
        "description": "The image reference path. For the \"user\" type, this will be the user ID. For the \"business\", this must be the ID of the business.",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "8e68e7e09a7af"
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
