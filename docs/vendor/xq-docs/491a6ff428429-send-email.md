# Send Email

Source: https://xq.stoplight.io/docs/xqmsg/491a6ff428429-send-email

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1encryptedmail/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/encryptedmail`

Send an encrypted email on behalf on a user

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "6227105684a5d",
  "method": "post",
  "path": "/encryptedmail",
  "tags": [
    {
      "id": "b3e5f31d72585",
      "name": "Messaging"
    }
  ],
  "extensions": {},
  "iid": "SendEmail",
  "description": "Send an encrypted email on behalf on a user",
  "summary": "Send Email",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "7b144f9389317",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "a2d9dfa66e45a",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
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
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "887661a04cf2d"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "body": {
      "id": "a5053011ed5ad",
      "contents": [
        {
          "id": "796cae9acb963",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "recipients": {
                "type": "array",
                "description": "Comma separated list of recipients to send the email to.",
                "items": {
                  "type": "string"
                }
              },
              "encrypted": {
                "type": "string",
                "description": "The encrypted message"
              },
              "expiration": {
                "type": "number",
                "description": "Expiration in milliseconds"
              },
              "token": {
                "type": "string",
                "description": "Locator token"
              },
              "subject": {
                "type": "string",
                "description": "The subject of the email"
              }
            },
            "required": [
              "recipients",
              "encrypted",
              "expiration",
              "token"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "5bd56c39a4279"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "bcb82959437b4",
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
            "id": "ac3512a63dfe7"
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
  ]
}
```
