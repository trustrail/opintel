# Upload a user avatar or business icon

Source: https://xq.stoplight.io/docs/xqmsg/b4dc4f487a81c-upload-a-user-avatar-or-business-icon

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1image~1{type}/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/image/{type}`

Uploads an image of the specified type.

**Required Scopes:** write:image

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "a046e1fff9ad0",
  "method": "post",
  "path": "/image/{type}",
  "tags": [
    {
      "id": "2aee6436e4677",
      "name": "Images"
    }
  ],
  "extensions": {},
  "iid": "post-image-type",
  "description": "Uploads an image of the specified type.\n\n**Required Scopes:** write:image",
  "summary": "Upload a user avatar or business icon",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "ddd91776d2391",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - The image upload succeeded."
    }
  ],
  "request": {
    "body": {
      "id": "058d77dd7df98",
      "contents": [
        {
          "id": "d7c8836e32476",
          "mediaType": "multipart/form-data",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "image": {
                "type": "string",
                "description": "The image file to upload.",
                "contentMediaType": "application/octet-stream"
              }
            },
            "required": [
              "image"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "5bc80a68fee81"
            }
          }
        }
      ],
      "description": ""
    },
    "headers": [
      {
        "id": "56ba33c1d77fc",
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
            "id": "fb5d6afc408c7"
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
        "id": "a869c8f2ecaa7",
        "name": "type",
        "style": "simple",
        "examples": [],
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "af60395aee790"
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
