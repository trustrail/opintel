# List trusted address ranges for a team

Source: https://xq.stoplight.io/docs/xqmsg/a28e50b0a1e8d-list-trusted-address-ranges-for-a-team

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1trusted/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/trusted`

Lists all the address ranges for a team that are trusted. Devices that are within a trusted range can choose to be onboarded based off of their IP alone, without needing additional email confirmation.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "1b1601073d86e",
  "method": "get",
  "path": "/trusted",
  "tags": [
    {
      "id": "3bfbcc61f009d",
      "name": "Trusted Range"
    }
  ],
  "extensions": {},
  "iid": "ListTrusted",
  "description": "Lists all the address ranges for a team that are trusted. Devices that are within a trusted range can choose to be onboarded based off of their IP alone, without needing additional email confirmation.",
  "summary": "List trusted address ranges for a team",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "37045542d4e34",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "99aaba0294736",
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
                "properties": {
                  "ranges": {
                    "type": "array",
                    "items": {
                      "$ref": "#/__bundled__/TrustedRangeSummary"
                    }
                  }
                },
                "required": [
                  "ranges"
                ]
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "e3a5117d6713d"
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
        "id": "4e57f34d9523f",
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
            "id": "448c739dd9a30"
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
