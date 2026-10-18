# Fetch all hooks for an API key

Source: https://xq.stoplight.io/docs/xqmsg/3154800288b0a-fetch-all-hooks-for-an-api-key

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1hooks/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/hooks`

Fetches the list of all webhooks associated with the current API key.

**Required Scope:** hook

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "f4da99095f2dd",
  "method": "get",
  "path": "/hooks",
  "tags": [
    {
      "id": "15b231d4a5a13",
      "name": "Events"
    }
  ],
  "extensions": {},
  "iid": "GetHooks",
  "description": "Fetches the list of all webhooks associated with the current API key.\n\n**Required Scope:** hook",
  "summary": "Fetch all hooks for an API key",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "7d4db89379a95",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "f6d25ac7baf1d",
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
                  "hooks": {
                    "type": "array",
                    "description": "List of web hooks",
                    "items": {
                      "$ref": "#/__bundled__/HookSummary"
                    }
                  }
                },
                "required": [
                  "hooks"
                ]
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "d8edf3ba89594"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "headers": [],
    "query": [
      {
        "id": "3f69647f103dc",
        "name": "id",
        "style": "form",
        "examples": [],
        "description": "The application ID to filter on. If none is provided, the application ID for the current will be used. Whichever application is specified must belong to the same business as the user making this call.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "d480040e4acc0"
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
      },
      {
        "id": "7552eeb9e4109",
        "key": "Access Token",
        "extensions": {},
        "description": "This is a bearer token required to make most XQ API calls.",
        "type": "http",
        "scheme": "bearer"
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
    "HookSummary": {
      "required": [
        "id",
        "enabled",
        "url"
      ],
      "properties": {
        "id": {
          "type": "integer",
          "description": "The ID of the webhook."
        },
        "url": {
          "type": "string",
          "description": "Webhook URL"
        },
        "enabled": {
          "type": "boolean",
          "description": "Whether or not the webhook is enabled"
        },
        "app": {
          "type": "number",
          "description": "Application ID"
        },
        "events": {
          "type": "string",
          "description": "Events that the webhook is subscribed to"
        }
      }
    }
  }
}
```
