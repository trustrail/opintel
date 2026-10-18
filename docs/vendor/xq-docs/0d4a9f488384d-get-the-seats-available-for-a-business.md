# Get the seats available for a business

Source: https://xq.stoplight.io/docs/xqmsg/0d4a9f488384d-get-the-seats-available-for-a-business

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1seats/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/seats`

Fetches the number of seats a business has in total, as well as the number that have been used.

**Required Scopes:** seats


## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "177bcf2bb5333",
  "method": "get",
  "path": "/seats",
  "tags": [
    {
      "id": "8f23c60f522bc",
      "name": "Business"
    },
    {
      "id": "88a89df982bac",
      "name": "Subscription"
    }
  ],
  "extensions": {},
  "iid": "GetSeatsUsage",
  "description": "Fetches the number of seats a business has in total, as well as the number that have been used.\n\n**Required Scopes:** seats\n",
  "summary": "Get the seats available for a business",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "37ceea780ce53",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "d17d9f0969dcd",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "allOf": [
              {
                "$ref": "#/__bundled__/BaseResponse"
              },
              {
                "$ref": "#/__bundled__/SeatsUsageSummary"
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "2602a7fe7c911"
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
        "id": "947b717a8523a",
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
            "id": "cb19bafbbf7d9"
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
    "SeatsUsageSummary": {
      "description": "Number of seats used/available for a business",
      "required": [
        "plan",
        "overflow",
        "used"
      ],
      "properties": {
        "plan": {
          "type": "integer",
          "description": "Number of regular seats in plan"
        },
        "overflow": {
          "type": "integer",
          "description": "Number of overflow seats available"
        },
        "used": {
          "type": "integer",
          "description": "Total number of seats in used (regular and overflow)"
        }
      }
    }
  }
}
```
