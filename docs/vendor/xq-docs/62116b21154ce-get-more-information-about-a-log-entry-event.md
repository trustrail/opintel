# Get more information about a log entry event

Source: https://xq.stoplight.io/docs/xqmsg/62116b21154ce-get-more-information-about-a-log-entry-event

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1log~1{logid}/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/log/{logid}`

Fetches details about a particular log entry. The log entry must be associated with the authenticated users workspace.

**Required Scopes:** read:logs

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "a5d78d0d7008e",
  "method": "get",
  "path": "/log/{logid}",
  "tags": [
    {
      "id": "8baff9068ed0f",
      "name": "Monitoring"
    }
  ],
  "extensions": {},
  "iid": "GetLogEvent",
  "description": "Fetches details about a particular log entry. The log entry must be associated with the authenticated users workspace.\n\n**Required Scopes:** read:logs",
  "summary": "Get more information about a log entry event",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "ca7bae6d7e154",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "1948800b39c84",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "allOf": [
              {
                "$ref": "#/__bundled__/BaseResponse"
              },
              {
                "$ref": "#/__bundled__/EventDetails"
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "664cb18433198"
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
        "id": "24ef37e671c5a",
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
            "id": "79bd10be5d8cd"
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
    "path": [
      {
        "id": "c3508f5ce7af4",
        "name": "logid",
        "style": "simple",
        "examples": [],
        "description": "The log event entry ID to check",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "839e005efcca1"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "required",
          "description"
        ]
      }
    ]
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
    "EventDetails": {
      "required": [
        "id",
        "action",
        "threat",
        "ip",
        "val",
        "created",
        "rev"
      ],
      "properties": {
        "id": {
          "type": "integer",
          "description": "The event ID."
        },
        "action": {
          "type": "string",
          "description": "The action identifier path."
        },
        "app": {
          "type": "integer",
          "description": "Application ID"
        },
        "key": {
          "type": "integer",
          "description": "API Key ID"
        },
        "val": {
          "type": "integer",
          "description": "The ID of the related workspace user (or 0 if the entry is not related to a verified message )."
        },
        "threat": {
          "type": "integer",
          "description": "The threat level."
        },
        "data": {
          "type": "string",
          "description": "Additional information about the event. Could be a string, or an stringified object with meta information. If it is a plain string, then we can use this to search for related events."
        },
        "ip": {
          "type": "string",
          "description": "The IP of the location where this log entry was triggered from."
        },
        "location": {
          "type": "string",
          "description": "The name of the location where this log entry was triggered from ( if available )."
        },
        "user": {
          "type": "string",
          "description": "The user name who triggered this entry (if available)."
        },
        "created": {
          "type": "integer",
          "description": "The time ( in milliseconds) when this entry was logged."
        },
        "rev": {
          "type": "boolean",
          "description": "Is this entry revokable or not?"
        },
        "others": {
          "type": "string",
          "description": "No idea what this is for yet."
        }
      }
    }
  }
}
```
