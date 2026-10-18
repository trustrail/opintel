# Search the monitor logs

Source: https://xq.stoplight.io/docs/xqmsg/6a56576f1cb4d-search-the-monitor-logs

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1log/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/log`

Searches the logs for content related to your workspace. Will only show content that relates to workspace users who have validated their accounts.

**Required Scopes:** read:logs

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "1bb437049a6cd",
  "method": "get",
  "path": "/log",
  "tags": [
    {
      "id": "8baff9068ed0f",
      "name": "Monitoring"
    }
  ],
  "extensions": {},
  "iid": "SearchEventLogs",
  "description": "Searches the logs for content related to your workspace. Will only show content that relates to workspace users who have validated their accounts.\n\n**Required Scopes:** read:logs",
  "summary": "Search the monitor logs",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "2824efe2be434",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "a6b13594c905d",
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
                  "total",
                  "logs"
                ],
                "properties": {
                  "total": {
                    "type": "integer",
                    "description": "Total number of results"
                  },
                  "logs": {
                    "type": "array",
                    "items": {
                      "$ref": "#/__bundled__/EventSummary"
                    }
                  }
                }
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "2f99c80b5a717"
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
        "id": "ff88447c95871",
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
            "id": "8d3ade697069a"
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
        "id": "b0ca8ab5d1d03",
        "name": "threat",
        "style": "form",
        "examples": [],
        "description": "The threat level to filter on (0 - 3). A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "f72cf55e795fb"
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
        "id": "9f50fdf990759",
        "name": "keyid",
        "style": "form",
        "examples": [],
        "description": "The API key ID to filter on. A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "8781402df1781"
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
        "id": "8e5cc64d8c0a6",
        "name": "appid",
        "style": "form",
        "examples": [],
        "description": "The APP ID to filter on. A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "8f0237925163a"
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
        "id": "e59873ea63d17",
        "name": "action",
        "style": "form",
        "examples": [
          {
            "id": "f1710d42da59f",
            "value": "saas://client/adddevapp",
            "key": "default"
          }
        ],
        "description": "The action/event type to filter on. Supports regular expression syntax",
        "schema": {
          "type": "string",
          "examples": [
            "saas://client/adddevapp"
          ],
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "1a3229e869965"
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
        "id": "4d88637713285",
        "name": "user",
        "style": "form",
        "examples": [],
        "description": "User id to filter on. Supports comma separated values",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "a3db3b103cb33"
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
        "id": "bf00892671316",
        "name": "from",
        "style": "form",
        "examples": [],
        "description": "The starting date to query from in milliseconds",
        "schema": {
          "type": "integer",
          "default": 0,
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "02d0b72e2576a"
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
        "id": "12ad306d33833",
        "name": "to",
        "style": "form",
        "examples": [],
        "description": "The starting date to query from in milliseconds",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "e819c4fb58d01"
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
        "id": "8369938ca256f",
        "name": "limit",
        "style": "form",
        "examples": [],
        "description": "The maximum number of results to return.",
        "schema": {
          "type": "integer",
          "default": 100,
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "20ef975e2b16c"
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
        "id": "e3f5c4b64cc4b",
        "name": "page",
        "style": "form",
        "examples": [],
        "description": "The current page of results, starting from zero.",
        "schema": {
          "type": "integer",
          "default": 0,
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "ff4ffcaf7354d"
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
        "id": "612fbf013ed45",
        "name": "data",
        "style": "form",
        "examples": [],
        "description": "A way to find all events related to another. Pass the `data` field from the EventSummary schema to find all related events.",
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "565110d8d1378"
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
        "id": "1ff7a9cae5e6e",
        "name": "search",
        "style": "form",
        "examples": [],
        "description": "Generic search field to run a backend query with user inputted values. Matches again user email address, and resource name (filename or email subject)",
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "1e894cf3f576f"
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
    "EventSummary": {
      "type": "object",
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
        "appname": {
          "type": "string",
          "description": "Server-supplied application name."
        },
        "keyname": {
          "type": "string",
          "description": "Server-supplied key name."
        }
      },
      "required": [
        "id",
        "action",
        "app",
        "key",
        "val",
        "threat",
        "ip",
        "created",
        "appname",
        "keyname"
      ]
    }
  }
}
```
