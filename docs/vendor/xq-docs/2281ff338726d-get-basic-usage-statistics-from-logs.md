# Get basic usage statistics from logs

Source: https://xq.stoplight.io/docs/xqmsg/2281ff338726d-get-basic-usage-statistics-from-logs

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1stats/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/stats`

Fetches basic usage statistics across any registered applications, based on the time period the authenticated user specifies.

**Required Scopes:** stats


## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "3d332f16d6363",
  "method": "get",
  "path": "/stats",
  "tags": [
    {
      "id": "8baff9068ed0f",
      "name": "Monitoring"
    }
  ],
  "extensions": {},
  "iid": "GetStats",
  "description": "Fetches basic usage statistics across any registered applications, based on the time period the authenticated user specifies.\n\n**Required Scopes:** stats\n",
  "summary": "Get basic usage statistics from logs",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "ef22588a45445",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "f2b2237f6603a",
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
                  "msg",
                  "val",
                  "expired",
                  "good",
                  "alert",
                  "warnings",
                  "communications"
                ],
                "properties": {
                  "msg": {
                    "type": "integer",
                    "description": "The total number of messages"
                  },
                  "communications": {
                    "type": "integer",
                    "description": "The number of communications"
                  },
                  "val": {
                    "type": "integer",
                    "description": "The number of `validated` messages. Meaning between only verified users of the workspace"
                  },
                  "expired": {
                    "type": "integer",
                    "description": "The number of `expired` messages"
                  },
                  "good": {
                    "type": "integer",
                    "description": "The number of `good` activities that have happened. IE: a message has been read"
                  },
                  "alert": {
                    "type": "integer",
                    "description": "The number of alerts"
                  },
                  "warnings": {
                    "type": "integer",
                    "description": "The number of warnings"
                  }
                }
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "36891544d9c69"
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
        "id": "796f62d95a705",
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
            "id": "120e1a314f9bb"
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
        "id": "ba4f01aa2248e",
        "name": "from",
        "style": "form",
        "examples": [],
        "description": "The lower boundary time ( in milliseconds ) to search. A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "188fcf23f19c1"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "description"
        ]
      },
      {
        "id": "5e1ae368b2860",
        "name": "to",
        "style": "form",
        "examples": [],
        "description": "The upper boundary time ( in milliseconds ) to search.A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "f7cd0eb3dbe68"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "description"
        ]
      },
      {
        "id": "740c3ec51a8a9",
        "name": "threat",
        "style": "form",
        "examples": [],
        "description": "The threat level to filter on. A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "fc36b265ce1bd"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "description"
        ]
      },
      {
        "id": "c41f172963376",
        "name": "keyid",
        "style": "form",
        "examples": [],
        "description": "The API key ID to filter on. A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "c65c6eb24fe1f"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "description"
        ]
      },
      {
        "id": "07c6122dba4f2",
        "name": "user",
        "style": "form",
        "examples": [],
        "description": "The User ID to filter on. If left absent, stats against the whole workspace will be returned.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "f533b29c56030"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "description"
        ]
      },
      {
        "id": "cd8aced67d787",
        "name": "action",
        "style": "form",
        "examples": [],
        "description": "Action types to filter by. Supports regular expression syntax.",
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "fe0313dc6631a"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "description"
        ]
      },
      {
        "id": "5f4ae368b482b",
        "name": "tz",
        "style": "form",
        "examples": [],
        "description": "Timezone offset (in hours)",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "ed9926863b3c2"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
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
    }
  }
}
```
