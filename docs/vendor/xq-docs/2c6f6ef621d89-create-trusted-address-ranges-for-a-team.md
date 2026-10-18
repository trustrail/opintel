# Create trusted address ranges for a team

Source: https://xq.stoplight.io/docs/xqmsg/2c6f6ef621d89-create-trusted-address-ranges-for-a-team

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1trusted/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/trusted`

Create a new trusted range. Devices that are within a trusted range can choose to be onboarded based off of their IP alone, without needing additional email confirmation.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "8f4951371959e",
  "method": "post",
  "path": "/trusted",
  "tags": [
    {
      "id": "3bfbcc61f009d",
      "name": "Trusted Range"
    }
  ],
  "extensions": {},
  "iid": "CreateTrusted",
  "description": "Create a new trusted range. Devices that are within a trusted range can choose to be onboarded based off of their IP alone, without needing additional email confirmation.",
  "summary": "Create trusted address ranges for a team",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "e24fb247541dd",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "17d67379d22a1",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "allOf": [
              {
                "$ref": "#/__bundled__/BaseResponse"
              },
              {
                "$ref": "#/__bundled__/TrustedRangeSummary"
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "0f16d122a5bba"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "body": {
      "id": "168e267d9849d",
      "contents": [
        {
          "id": "eb19dfc7057dc",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "title": "CreateTrustedRangeBody",
            "type": "object",
            "properties": {
              "tag": {
                "type": "string",
                "description": "A tag name used to identify this range."
              },
              "fence": {
                "type": "string",
                "description": "A space delimited list of trusted IP addresses."
              },
              "channel": {
                "type": "integer",
                "maximum": 2,
                "minimum": 0
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "400e04398c7bc"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "cc094cbe1a2b5",
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
            "id": "9b8f03ec32d3c"
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
    "TrustedRangeSummary": {
      "title": "TrustedRangeSummary",
      "type": "object",
      "properties": {
        "id": {
          "type": "integer"
        },
        "businessId": {
          "type": "integer",
          "description": "The ID of the workspace that this range belongs to."
        },
        "tag": {
          "type": "string",
          "description": "A tag name used to identify this range."
        },
        "fence": {
          "type": "string",
          "description": "A space delimited list of trusted IP addresses."
        },
        "channel": {
          "type": "integer",
          "maximum": 2,
          "exclusiveMinimum": false,
          "minimum": 0
        },
        "secureKey": {
          "type": "string",
          "description": "The key used to secure the access token before sending it back to the client."
        }
      },
      "required": [
        "id",
        "businessId",
        "tag",
        "fence",
        "secureKey"
      ]
    }
  }
}
```
