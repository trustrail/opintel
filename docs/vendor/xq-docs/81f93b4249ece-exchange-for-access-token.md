# Exchange for Access Token

Source: https://xq.stoplight.io/docs/xqmsg/81f93b4249ece-exchange-for-access-token

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1exchange/get`

## Endpoint

`GET https://subscription.xqmsg.net/v2/exchange`

The exchange endpoint is required in order to exchange their pre-auth token for a true access token.

An access token will only be returned if the user has successfully confirmed their account either from the email link they received, or by calling the codevalidator endpoint with their PIN and pre-auth token.

Once a pre-auth token has been exchanged, it cannot be used again.

**Required API Key Scope:** exchange

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "8f266939df5d9",
  "method": "get",
  "path": "/exchange",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "get-exchange",
  "description": "The exchange endpoint is required in order to exchange their pre-auth token for a true access token.\n\nAn access token will only be returned if the user has successfully confirmed their account either from the email link they received, or by calling the codevalidator endpoint with their PIN and pre-auth token.\n\nOnce a pre-auth token has been exchanged, it cannot be used again.\n\n**Required API Key Scope:** exchange",
  "summary": "Exchange for Access Token",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "23102d02d2fc3",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "41b5bf3612315",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "string",
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "ff313bba0f993"
            }
          }
        }
      ],
      "description": "OK - Returns the new access token."
    },
    {
      "id": "83402edfa292c",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "83202edfa2d86",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "b4e02f1ccb2d2",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "49df845ce0e7f",
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
            "id": "7990bf62de0f1"
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
