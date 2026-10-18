# Check whether a key is expired

Source: https://xq.stoplight.io/docs/xqmsg/e5b0d6e2b5f5f-check-whether-a-key-is-expired

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Validation.json/paths/~1expiration~1{Locator}/get`

## Endpoint

`GET https://validation.xqmsg.net/v2/expiration/{Locator}`

This endpoint is used to check whether a particular key is expired or not, without actually fetching it.

The same key token that is received after adding a packet

**Required API Key Scope:** read:key

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "03c8a76237594",
  "method": "get",
  "path": "/expiration/{Locator}",
  "tags": [
    {
      "id": "b54d1d49b4783",
      "name": "KeyManagement"
    }
  ],
  "extensions": {},
  "iid": "get-expiration",
  "description": "This endpoint is used to check whether a particular key is expired or not, without actually fetching it.\n\nThe same key token that is received after adding a packet\n\n**Required API Key Scope:** read:key",
  "summary": "Check whether a key is expired",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "4707835dfce4c",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "ddd824724c342",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "expiresOn": {
                "type": "integer",
                "minimum": 0,
                "description": "The number of seconds before this token expires. If the token is already expired, this will be zero."
              }
            },
            "required": [
              "expiresOn"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "2cabe1ae4aefa"
            }
          }
        }
      ],
      "description": "OK"
    },
    {
      "id": "1ee781985353d",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request - Usually received when required parameters are not provided. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "1ed781985378e",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "1ef78198534e8",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "bb3781440d804",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "af5400adad8cb",
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
            "id": "aaf302c63da00"
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
        "id": "67576553ab630",
        "name": "Locator",
        "style": "simple",
        "examples": [],
        "description": "A URL encoded version of the key locator token ( the token received after adding a key packet).",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "fd9d21394b156"
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
