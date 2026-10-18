# Check whether a page has been visited or not.

Source: https://xq.stoplight.io/docs/xqmsg/81ce7a835908f-check-whether-a-page-has-been-visited-or-not

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1visit~1{pageId}/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/visit/{pageId}`

Used for instances where there is a need to detect whether a user is visiting a page for the first time. Should be called whenever a user visits the page in question. Its return value will indicate whether or not the page has been visited or not

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "498bbcfa01fcc",
  "method": "get",
  "path": "/visit/{pageId}",
  "tags": [
    {
      "id": "3bfbcc61f009d",
      "name": "Trusted Range"
    }
  ],
  "extensions": {},
  "iid": "get-visit-pageId",
  "description": "Used for instances where there is a need to detect whether a user is visiting a page for the first time. Should be called whenever a user visits the page in question. Its return value will indicate whether or not the page has been visited or not",
  "summary": "Check whether a page has been visited or not.",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "1e2b37101610b",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "10766d65faf3d",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "first": {
                "type": "boolean",
                "description": "True only if this is the first visit by this user to the page."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "52eb76f57e1dc"
            }
          }
        }
      ],
      "description": "OK - Returns a JSON encoded result."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "fdd12339bf3ab",
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
            "id": "17b8b700e867e"
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
        "id": "1031079ca4ef4",
        "name": "pageId",
        "style": "simple",
        "examples": [],
        "description": "The ID of the page to check. The value of the ID is left completely up to the client application.",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "8b780c7a32dc0"
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
