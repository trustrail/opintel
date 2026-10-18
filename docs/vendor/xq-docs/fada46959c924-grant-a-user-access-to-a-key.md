# Grant a User Access to a Key

Source: https://xq.stoplight.io/docs/xqmsg/fada46959c924-grant-a-user-access-to-a-key

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Validation.json/paths/~1grant~1{token}/options`

## Endpoint

`OPTIONS https://validation.xqmsg.net/v2/grant/{token}`

This endpoint is used to grant a list of users access to a key

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "a04c0fd6ebd0c",
  "method": "options",
  "path": "/grant/{token}",
  "tags": [
    {
      "id": "b54d1d49b4783",
      "name": "KeyManagement"
    }
  ],
  "extensions": {},
  "iid": "options-grant-token",
  "description": "This endpoint is used to grant a list of users access to a key",
  "summary": "Grant a User Access to a Key",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "2ad81aa5da092",
      "code": "201",
      "headers": [],
      "contents": [],
      "description": "Created"
    },
    {
      "id": "2b281aa5da80d",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content"
    },
    {
      "id": "82f81c829cd1a",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "82d81c829c064",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "21581c2e5986d",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "body": {
      "id": "4969911267fc3",
      "contents": [
        {
          "id": "aab695d89bea7",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "recipients": {
                "type": "array",
                "description": "The list of emails of users intended to have read access to the encrypted content removed.",
                "items": {
                  "type": "string"
                }
              }
            },
            "required": [
              "recipients"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "5dd6137db734c"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "ab51328356939",
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
            "id": "a9fdf43aa0db1"
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
        "id": "4d2b88e32ac3d",
        "name": "token",
        "style": "simple",
        "examples": [],
        "description": "Locator token",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "45a282ad1a76a"
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
        "id": "ad56c2099191c",
        "key": "apiKey",
        "extensions": {},
        "description": "Required for almost every API call. Developers may provision their own keys from the XQ dashboard.",
        "type": "apiKey",
        "name": "api-key",
        "in": "header"
      }
    ]
  ],
  "servers": [
    {
      "id": "2ee50d3997cac",
      "url": "https://validation.xqmsg.net/v2",
      "name": "Validation"
    }
  ]
}
```
