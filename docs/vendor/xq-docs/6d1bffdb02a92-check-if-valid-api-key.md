# Check if Valid API Key

Source: https://xq.stoplight.io/docs/xqmsg/6d1bffdb02a92-check-if-valid-api-key

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1apikey/get`

## Endpoint

`GET https://subscription.xqmsg.net/v2/apikey`

A service which is utilized to validate an API key and returns the scopes associated with it.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "a24dbd8de1214",
  "method": "get",
  "path": "/apikey",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "get-apikey",
  "description": "A service which is utilized to validate an API key and returns the scopes associated with it.",
  "summary": "Check if Valid API Key",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "f82da8e82b4ba",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "8e887d70346c4",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "": {
                "type": "string"
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "e71701feb4e7c"
            }
          }
        }
      ],
      "description": "OK"
    },
    {
      "id": "8d8da9799b0e4",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request"
    },
    {
      "id": "8d7da9799b6b7",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "8d9da9799b129",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "5bdda93c71f11",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "e4ac1ef6de1d0",
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
            "id": "e34ff65693b0e"
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
