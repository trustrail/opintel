# Create a Hook

Source: https://xq.stoplight.io/docs/xqmsg/069fc5540d8c6-create-a-hook

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1hook/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/hook`

Creates a new webhook registered to the API key used to make this request. Once registered, the hook will be called whenever any of the listed events occured. If the events field is left blank, it will be called on every event.

**Required Scope:** hook

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "9a73114cfe715",
  "method": "post",
  "path": "/hook",
  "tags": [
    {
      "id": "15b231d4a5a13",
      "name": "Events"
    }
  ],
  "extensions": {},
  "iid": "post-hook",
  "description": "Creates a new webhook registered to the API key used to make this request. Once registered, the hook will be called whenever any of the listed events occured. If the events field is left blank, it will be called on every event.\n\n**Required Scope:** hook",
  "summary": "",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "d2737d071917d",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "47e2f48f6c71f",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "allOf": [
              {
                "$ref": "#/__bundled__/BaseResponse"
              },
              {
                "$ref": "#/__bundled__/HookSummary"
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "bf1836590ae61"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "body": {
      "id": "ffed36c769a70",
      "contents": [
        {
          "id": "8eb1918dc1536",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "url": {
                "type": "string",
                "description": "The URL that will be called when an event occurs. Must be a full and valid URL."
              },
              "events": {
                "type": "array",
                "description": "The list of events that this hook will listen for. If not specified or left blank, then the hook will respond to all events.",
                "items": {
                  "type": "string"
                }
              },
              "enabled": {
                "description": "Should this event be enabled after creation? Defaults to true.",
                "type": "boolean"
              },
              "id": {
                "description": "The ID of the application. If one is not provided, the application ID of the current request will be used instead.",
                "type": "integer"
              }
            },
            "required": [
              "url"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "8872e24900f1a"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "2bd1b0d7aba1b",
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
            "id": "a9400cc5e8481"
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
