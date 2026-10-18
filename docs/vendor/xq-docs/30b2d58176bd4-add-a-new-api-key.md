# Add a new API key

Source: https://xq.stoplight.io/docs/xqmsg/30b2d58176bd4-add-a-new-api-key

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1apikey/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/apikey`

Add a new API key that the developer can use for accessing the specified application. The number of keys a single developer can have are limited - If the limit is reached, older keys may be removed in order to add new ones.

**Required Scopes:** write:apikey

**Webhook Event:** newapikey

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "8f22e5c1c74bd",
  "method": "post",
  "path": "/apikey",
  "tags": [
    {
      "id": "3c5ba08f9b0d1",
      "name": "API Keys"
    }
  ],
  "extensions": {},
  "iid": "CreateAPIKey",
  "description": "Add a new API key that the developer can use for accessing the specified application. The number of keys a single developer can have are limited - If the limit is reached, older keys may be removed in order to add new ones.\n\n**Required Scopes:** write:apikey\n\n**Webhook Event:** newapikey",
  "summary": "Add a new API key",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "ac5af6c202d0c",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "f37713e12ffe4",
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
                  "id",
                  "key"
                ],
                "properties": {
                  "id": {
                    "type": "integer",
                    "description": "API Key ID"
                  },
                  "key": {
                    "type": "string",
                    "description": "The API Key"
                  }
                }
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "ab8aed67cfd4a"
            }
          }
        }
      ],
      "description": "OK - Returns the new API key."
    }
  ],
  "request": {
    "body": {
      "id": "bc3ef3c081261",
      "contents": [
        {
          "id": "c3057af7f5e11",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "app": {
                "type": "integer",
                "description": "The ID of the developer application that this API key will have access to. See the **/devapp** endpoint."
              },
              "platform": {
                "type": "integer",
                "description": "The platform where this API key is intended to be used from. Currently, this is only used for reporting, and does not prevent usage on other platforms.\n\n0 = Generic\n1 = iOS\n2 = Chrome\n3 = gSuite\n4 = Website\n5 = Android\n6 = Outlook\n7 = iMessage\n8 = Slack\n10 = PHP",
                "default": 0
              },
              "name": {
                "type": "string",
                "description": "Any name that can be used to identify this particular API key.",
                "maxLength": 100
              },
              "fence": {
                "type": "string",
                "description": "A comma-delimited list of IP addresses or ranges from where this API key will be usable. If left empty, the key will be usable from any location.",
                "examples": [
                  "192.168.1.0/24,10.0.0.10"
                ]
              },
              "api": {
                "type": "integer",
                "description": "The server API that this application will be using. For now, set to either 1 for the XQ API, or 2 for the dashboard API."
              },
              "recipients": {
                "description": "Used for the SecureForm API keys only. A space-delimited list of email addresses of users allowed to read the form response. Defaults to the the owner.",
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "redirectURL": {
                "type": "string",
                "description": "URL of the page to which user would like to redirect after successful form Submission."
              }
            },
            "required": [
              "app",
              "name",
              "api",
              "recipients"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "22ec86f28e913"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "5e22df7067170",
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
            "id": "6011655290daf"
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
    }
  }
}
```
