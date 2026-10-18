# Create a Short-Lived Access Token

Source: https://xq.stoplight.io/docs/xqmsg/bd1adb075b346-create-a-short-lived-access-token

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1delegate/get`

## Endpoint

`GET https://subscription.xqmsg.net/v2/delegate`

The delegate endpoint allows a user to create a very short-lived version of their access token in order to access certain services (such as file encryption/decryption on the XQ website) without having to transmit their main access token.

**Required API Key Scope:** delegate

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "c2733d556562b",
  "method": "get",
  "path": "/delegate",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "get-delegate",
  "description": "The delegate endpoint allows a user to create a very short-lived version of their access token in order to access certain services (such as file encryption/decryption on the XQ website) without having to transmit their main access token.\n\n**Required API Key Scope:** delegate",
  "summary": "Create a Short-Lived Access Token",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "67ef623ebb5b9",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "9ea9bb6685f57",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "": {
                "type": "string",
                "description": "The short-term delegate access token."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "2b241f9051375"
            }
          }
        }
      ],
      "description": "OK - Returns the a version of the access token that can only be used for a very brief period."
    },
    {
      "id": "c01f641b7d1ea",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized - Usually received when an invalid API key is provided. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "bfff641b7dc80",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden - Usually caused by using an API key that does not have the required scope, or an invalid token. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "21bf646fc0d3c",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error - Something unexpected went wrong. The reason for failure is provided in the response's JSON encoded body."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "e9e1a27d54ae4",
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
            "id": "1ceaf3e64e912"
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
