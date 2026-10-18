# Get chartable data from a log slice

Source: https://xq.stoplight.io/docs/xqmsg/f02999ff40ca0-get-chartable-data-from-a-log-slice

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1chart/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/chart`

Enough information to plot the number of notifications that happened in a single day.
The format is:
```
  {
    items: [
      ['YYYY-MM-DD', <num_benign>, <num_info>, <num_warn>, <num_alert>],
      ['YYYY-MM-DD', <num_benign>, <num_info>, <num_warn>, <num_alert>]
    ]
  }
```

**Required Scope: ** read:chart

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "a0a0378e74a6f",
  "method": "get",
  "path": "/chart",
  "tags": [
    {
      "id": "8baff9068ed0f",
      "name": "Monitoring"
    }
  ],
  "extensions": {},
  "iid": "GetChart",
  "description": "Enough information to plot the number of notifications that happened in a single day.\nThe format is:\n```\n  {\n    items: [\n      ['YYYY-MM-DD', <num_benign>, <num_info>, <num_warn>, <num_alert>],\n      ['YYYY-MM-DD', <num_benign>, <num_info>, <num_warn>, <num_alert>]\n    ]\n  }\n```\n\n**Required Scope: ** read:chart",
  "summary": "Get chartable data from a log slice",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "7e7ccd1c9b4c5",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "6c465a785322f",
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
                  "items"
                ],
                "properties": {
                  "items": {
                    "description": "Array of chart points. Format:\n```\n[\n  ['YYYY-MM-DD', <num_benign>, <num_info>, <num_warn>, <num_alert>],\n]\n```",
                    "type": "array",
                    "items": {
                      "$ref": "#/__bundled__/ChartPoint"
                    }
                  }
                }
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "9403ebb4e07c1"
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
        "id": "7effc15aaa952",
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
            "id": "418992c0ada6b"
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
    "query": [
      {
        "id": "9df4486baca85",
        "name": "keyid",
        "style": "form",
        "examples": [],
        "description": "API Key to filter against",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "7c68930e9d0a3"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      },
      {
        "id": "aaeaa5c369bd7",
        "name": "from",
        "style": "form",
        "examples": [],
        "description": "The starting date to query from in milliseconds",
        "schema": {
          "type": "integer",
          "default": 0,
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "db759c5a2a527"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      },
      {
        "id": "e82f51ec984d5",
        "name": "to",
        "style": "form",
        "examples": [],
        "description": "The starting date to query from in milliseconds",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "3949a6605cbc3"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      },
      {
        "id": "78b247128aa50",
        "name": "action",
        "style": "form",
        "examples": [
          {
            "id": "938f936f69aa4",
            "value": "saas://client/adddevapp",
            "key": "default"
          }
        ],
        "description": "The action/event type to filter on. Supports regular expression syntax.",
        "schema": {
          "type": "string",
          "examples": [
            "saas://client/adddevapp"
          ],
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "88b555d71cdd8"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description",
          "example"
        ]
      },
      {
        "id": "3bdc8e8b3ce0b",
        "name": "appid",
        "style": "form",
        "examples": [],
        "description": "The APP ID to filter on. A zero value will be ignored. Supports comma separated values",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "6f10885881e4a"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      }
    ],
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
    "ChartPoint": {
      "type": "array",
      "example": [
        "2020-09-29",
        1,
        23,
        22,
        0
      ],
      "items": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "integer"
          }
        ]
      }
    }
  }
}
```
