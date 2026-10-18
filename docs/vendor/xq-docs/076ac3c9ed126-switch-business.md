# Switch Business

Source: https://xq.stoplight.io/docs/xqmsg/076ac3c9ed126-switch-business

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1business~1{businessId}~1auth/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/business/{businessId}/auth`

Switch the business that the current user is logged in to. Returns a new access token to use.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "c159d6a4ff99f",
  "method": "get",
  "path": "/business/{businessId}/auth",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    },
    {
      "id": "8f23c60f522bc",
      "name": "Business"
    }
  ],
  "extensions": {},
  "iid": "SwitchCurrentBusiness",
  "description": "Switch the business that the current user is logged in to. Returns a new access token to use.",
  "summary": "Switch Business",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "9f0426fa84856",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "7b1d5be74ab20",
          "mediaType": "text/plain",
          "examples": [
            {
              "id": "5fdfa4d6a3a76",
              "value": "<published-example-token-redacted>",
              "key": "default"
            }
          ],
          "encodings": [],
          "schema": {
            "type": "string",
            "examples": [
              "<published-example-token-redacted>"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "72ee713b7e912"
            }
          }
        }
      ],
      "description": "The access token to use for that business"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "7c88af6891b30",
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
            "id": "832f1aaa97908"
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
        "id": "e6a4c5470672a",
        "name": "businessId",
        "style": "simple",
        "examples": [],
        "description": "The ID of the business to switch to",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "adcf4cafc284a"
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
  ]
}
```

Archive note: complete JWT-shaped example tokens published by XQ were replaced with `<published-example-token-redacted>`; no contract fields were removed.
