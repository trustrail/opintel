# List businesses that a current user is part of

Source: https://xq.stoplight.io/docs/xqmsg/3b7aaecb91710-list-businesses-that-a-current-user-is-part-of

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1businesses/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/businesses`

List all the businesses that the current user is a part of.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "62424d37234fd",
  "method": "get",
  "path": "/businesses",
  "tags": [
    {
      "id": "8f23c60f522bc",
      "name": "Business"
    }
  ],
  "extensions": {},
  "iid": "ListBusinesses",
  "description": "List all the businesses that the current user is a part of.",
  "summary": "List businesses that a current user is part of",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "47a4793f177fc",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "62342e1f814a0",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "allOf": [
              {
                "$ref": "#/__bundled__/BaseResponse"
              },
              {
                "type": "object",
                "required": [
                  "businesses"
                ],
                "properties": {
                  "businesses": {
                    "type": "array",
                    "items": {
                      "$ref": "#/__bundled__/BusinessOverview"
                    }
                  }
                }
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "9452065e74fa5"
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
        "id": "1d98790f2678b",
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
            "id": "12baf24c4cc51"
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
  ],
  "__bundled__": {
    "BaseResponse": {
      "description": "",
      "type": "object",
      "properties": {
        "status": {
          "description": "\"OK\" if the response was successful, otherwise it describes the error that occurred",
          "type": "string"
        }
      },
      "required": [
        "status"
      ]
    },
    "BusinessOverview": {
      "required": [
        "id",
        "name",
        "domain",
        "canAccessBusiness",
        "isPersonal"
      ],
      "properties": {
        "id": {
          "type": "integer",
          "description": "The ID of the business."
        },
        "name": {
          "type": "string",
          "description": "The name of the business."
        },
        "domain": {
          "type": "string",
          "description": "The domain of the business."
        },
        "canAccessBusiness": {
          "type": "boolean",
          "description": "Whether or not the user has access to that business' dashboard. For example, if they are a vendor in that business, they don;t have access to the dashboard."
        },
        "isPersonal": {
          "type": "boolean",
          "description": "Whether or not this is a personal dashboard"
        }
      }
    }
  }
}
```
