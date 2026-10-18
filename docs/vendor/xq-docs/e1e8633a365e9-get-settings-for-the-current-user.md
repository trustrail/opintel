# Get Settings For the Current User

Source: https://xq.stoplight.io/docs/xqmsg/e1e8633a365e9-get-settings-for-the-current-user

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1settings/get`

## Endpoint

`GET https://subscription.xqmsg.net/v2/settings`

Gets the notification and newsletter settings for the current user.

**Required API Key Scope:** read:settings

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "c6f0339fbbbc5",
  "method": "get",
  "path": "/settings",
  "tags": [
    {
      "id": "cd921f766d315",
      "name": "User Management"
    }
  ],
  "extensions": {},
  "iid": "get-settings",
  "description": "Gets the notification and newsletter settings for the current user.\n\n**Required API Key Scope:** read:settings",
  "summary": "Get Settings For the Current User",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "485dac01a7022",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "ca88f6232bf0b",
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
      "description": "OK"
    },
    {
      "id": "a86dadde77495",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "a84dadde7780b",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden - Usually caused by using an API key that does not have the required scope, or an invalid token. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "3ecdad8a27b4c",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error - Something unexpected went wrong. The reason for failure is provided in the response's JSON encoded body."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "370d11f33b36e",
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
            "id": "bcc96b35edb24"
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
