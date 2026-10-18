# Grant a User Access to a Key

Source: https://xq.stoplight.io/docs/xqmsg/4b3c0bd9a1f63-grant-a-user-access-to-a-key

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Validation.json/paths/~1grant~1{token}/post`

## Endpoint

`POST https://validation.xqmsg.net/v2/grant/{token}`

This endpoint is used to grant a list of users access to a key

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "e6068539c0bed",
  "method": "post",
  "path": "/grant/{token}",
  "tags": [
    {
      "id": "b54d1d49b4783",
      "name": "KeyManagement"
    }
  ],
  "extensions": {},
  "iid": "post-grant-token",
  "description": "This endpoint is used to grant a list of users access to a key",
  "summary": "Grant a User Access to a Key",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "418ad229bf596",
      "code": "201",
      "headers": [],
      "contents": [],
      "description": "Created"
    },
    {
      "id": "41dad229bfd09",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content"
    },
    {
      "id": "99aad40681a1e",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "998ad40681f60",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "380ad3b23f761",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "body": {
      "id": "03d5eb3ca0cb7",
      "contents": [
        {
          "id": "c8128c3c945b0",
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
              "id": "25525bd77d74d"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "1b3fb50dd7251",
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
            "id": "2543847eebfa0"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "description",
          "name",
          "required"
        ]
      }
    ],
    "query": [],
    "cookie": [],
    "path": [
      {
        "id": "603c7b15a5c5b",
        "name": "token",
        "style": "simple",
        "examples": [],
        "description": "Locator token",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "1e7efdeda8cb5"
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
