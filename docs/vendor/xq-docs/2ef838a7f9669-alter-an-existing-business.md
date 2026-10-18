# Alter an existing business

Source: https://xq.stoplight.io/docs/xqmsg/2ef838a7f9669-alter-an-existing-business

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1business/patch`

## Endpoint

`PATCH https://dashboard.xqmsg.net/v2/business`

Modifies the business of the currently authenticated user. You can specify any one or more fields to be modified.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "0447084af53ff",
  "method": "patch",
  "path": "/business",
  "tags": [
    {
      "id": "8f23c60f522bc",
      "name": "Business"
    }
  ],
  "extensions": {},
  "iid": "UpdateBusiness",
  "description": "Modifies the business of the currently authenticated user. You can specify any one or more fields to be modified.",
  "summary": "Alter an existing business",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "288f39916e7bf",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - The modifications succeeded."
    }
  ],
  "request": {
    "body": {
      "id": "b4e64d4d5104b",
      "contents": [
        {
          "id": "f9dd7c7204fb7",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "properties": {
              "email": {
                "type": "string",
                "description": "The main business email address"
              },
              "name": {
                "type": "string",
                "description": "The full name of this business."
              },
              "street": {
                "type": "string",
                "description": "The street address of the business."
              },
              "city": {
                "type": "string",
                "description": "The business city."
              },
              "state": {
                "type": "string",
                "description": "The business state."
              },
              "country": {
                "type": "string",
                "description": "The business country."
              },
              "telephone": {
                "type": "string",
                "description": "The business telephone number."
              },
              "postal": {
                "type": "string",
                "description": "The zip code of the business."
              },
              "tag": {
                "type": "string",
                "description": "A short business tagline."
              },
              "locked": {
                "type": "boolean",
                "description": "Whether or not the business is locked. If it is locked, all keys are no longer accessible."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "69e32a81c5a2c"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "f0988b4312a8c",
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
            "id": "c93beb96d803c"
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
