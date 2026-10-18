# Add a New Key Packet

Source: https://xq.stoplight.io/docs/xqmsg/fcad4f6954e75-add-a-new-key-packet

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Validation.json/paths/~1packet/post`

## Endpoint

`POST https://validation.xqmsg.net/v2/packet`

This endpoint takes a key packet (encrypted by the subscription server), and inserts the embedded secret into the XQ database.

It returns a locator token that can be used to retrieve the secret in the future.

**Required API Key Scope:** packet

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "3428f2392030e",
  "method": "post",
  "path": "/packet",
  "tags": [
    {
      "id": "b54d1d49b4783",
      "name": "KeyManagement"
    }
  ],
  "extensions": {},
  "iid": "post-packet",
  "description": "This endpoint takes a key packet (encrypted by the subscription server), and inserts the embedded secret into the XQ database.\n\nIt returns a locator token that can be used to retrieve the secret in the future.\n\n**Required API Key Scope:** packet",
  "summary": "Add a New Key Packet",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "d2610d172c774",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "d12c25f95ae96",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "string",
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "e38ce8511ab15"
            }
          }
        }
      ],
      "description": "OK - Returns the locator token."
    },
    {
      "id": "d5010c746397a",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request"
    },
    {
      "id": "d5110c7463f35",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "d4f10c74638cf",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "6eb10cc2e6206",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "body": {
      "id": "67a1f16950139",
      "contents": [
        {
          "id": "547fcc16b86c0",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "string",
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "9b1b4b2e05a40"
            }
          }
        },
        {
          "id": "972937848b459",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {},
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "4da5cea45ddce"
            }
          }
        }
      ],
      "description": "The encrypted packet data."
    },
    "headers": [
      {
        "id": "90e0a3c449446",
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
            "id": "5aff0971ed059"
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
