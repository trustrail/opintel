# List event types

Source: https://xq.stoplight.io/docs/xqmsg/c543b524ef0bd-list-event-types

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1eventtypes/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/eventtypes`

Get a list of all possible event types in a workspace. This includes any custom events that have been defined by the user.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "01bdd409e3920",
  "method": "get",
  "path": "/eventtypes",
  "tags": [
    {
      "id": "15b231d4a5a13",
      "name": "Events"
    }
  ],
  "extensions": {},
  "iid": "ListEventTypes",
  "description": "Get a list of all possible event types in a workspace. This includes any custom events that have been defined by the user.",
  "summary": "List event types",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "a04bb66710456",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "858e95dd9b562",
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
                  "data"
                ],
                "properties": {
                  "data": {
                    "type": "array",
                    "description": "List of events",
                    "items": {
                      "$ref": "#/__bundled__/EventType"
                    }
                  }
                }
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "90be70cea93fd"
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
        "id": "0e6d0b2030ba5",
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
            "id": "65c57e8117dbb"
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
    "EventType": {
      "required": [
        "action",
        "title"
      ],
      "properties": {
        "action": {
          "type": "string",
          "description": "Identifier for the event. Typically in the format of saas://..."
        },
        "title": {
          "type": "string",
          "description": "The readable name of the event"
        }
      }
    }
  }
}
```
