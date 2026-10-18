# Update the current user settings

Source: https://xq.stoplight.io/docs/xqmsg/03f0143ba5904-update-the-current-user-settings

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1settings/patch`

## Endpoint

`PATCH https://subscription.xqmsg.net/v2/settings`

Updates the notification and newsletter settings for the current user.

**Required API Key Scope:** edit:settings

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "2db43762ba3fa",
  "method": "patch",
  "path": "/settings",
  "tags": [
    {
      "id": "cd921f766d315",
      "name": "User Management"
    }
  ],
  "extensions": {},
  "iid": "patch-settings",
  "description": "Updates the notification and newsletter settings for the current user.\n\n**Required API Key Scope:** edit:settings",
  "summary": "Update the current user settings",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "5c8625add057b",
      "code": "200",
      "headers": [],
      "contents": [],
      "description": "OK"
    }
  ],
  "request": {
    "body": {
      "id": "71e4403c9ce4a",
      "contents": [
        {
          "id": "0560dee9fc6ab",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "title": "Newsletter",
            "type": "object",
            "properties": {
              "notifications": {
                "type": "integer",
                "description": "Specifies the notifications that the user should receive ( 0 = No Notifications, 1 = Receive Usage Reports, 2 = Receive Tutorials, 3 = Receive Both )",
                "minimum": 0,
                "maximum": 3
              },
              "newsletter": {
                "description": "Should this user receive newsletters or not? This is only valid for new users, and is ignored if the user already exists.",
                "type": "boolean"
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "b7eca4d2b59f6"
            }
          }
        }
      ],
      "description": ""
    },
    "headers": [
      {
        "id": "059671fd14fb3",
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
            "id": "0ae72a6064481"
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
        "id": "ad56c2099191c",
        "key": "apiKey",
        "extensions": {},
        "description": "Required for almost every API call. Developers may provision their own keys from the XQ Dashboard.",
        "type": "apiKey",
        "name": "api-key",
        "in": "header"
      }
    ]
  ],
  "servers": [
    {
      "id": "4f26feac86d96",
      "url": "https://subscription.xqmsg.net/v2",
      "name": "Subscription"
    }
  ]
}
```
