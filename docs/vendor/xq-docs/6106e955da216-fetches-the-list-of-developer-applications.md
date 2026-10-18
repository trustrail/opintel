# Fetches the list of developer applications

Source: https://xq.stoplight.io/docs/xqmsg/6106e955da216-fetches-the-list-of-developer-applications

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1devapps/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/devapps`

Returns a lists of all applications that the current developer ( based off of the access token you use for this request ) has.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "b9a3d6001f8d5",
  "method": "get",
  "path": "/devapps",
  "tags": [
    {
      "id": "3c5ba08f9b0d1",
      "name": "API Keys"
    }
  ],
  "extensions": {},
  "iid": "get-devapps",
  "description": "Returns a lists of all applications that the current developer ( based off of the access token you use for this request ) has.",
  "summary": "Fetches the list of developer applications",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "84803f99a21d7",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "dcc87b064b101",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "apps": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "integer",
                      "description": "The application ID."
                    },
                    "name": {
                      "type": "string",
                      "description": "The name of the application."
                    },
                    "desc": {
                      "type": "string",
                      "description": "A description of the application."
                    }
                  }
                }
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "eb6a548a4b6cd"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "b64e9238985d2",
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
            "id": "e05a876877db9"
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
