# Validate Access Request With a PIN

Source: https://xq.stoplight.io/docs/xqmsg/7160ffa67e2af-validate-access-request-with-a-pin

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1codevalidation/get`

## Endpoint

`GET https://subscription.xqmsg.net/v2/codevalidation`

This endpoint authenticates a PIN that was sent to a users email or phone number after requesting access via the authorize endpoint.

If successful this service returns a `ServerResponse` containing the access token.

**Required API Key Scope:** (None)

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "ff6cd4308a310",
  "method": "get",
  "path": "/codevalidation",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "get-codevalidation",
  "description": "This endpoint authenticates a PIN that was sent to a users email or phone number after requesting access via the authorize endpoint.\n\nIf successful this service returns a `ServerResponse` containing the access token.\n\n**Required API Key Scope:** (None)",
  "summary": "Validate Access Request With a PIN",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "d695b700f9a0b",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content"
    },
    {
      "id": "aeb5b53b50652",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request"
    },
    {
      "id": "e265b5787d583",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "headers": [],
    "query": [
      {
        "id": "1b824b16b5c6e",
        "name": "pin",
        "style": "form",
        "examples": [],
        "description": "PIN that was sent to a users email",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "ae526564704c4"
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
    "cookie": [],
    "path": []
  },
  "security": [
    [
      {
        "id": "813bdc8d6615b",
        "key": "pre-authToken",
        "extensions": {},
        "description": "This is a token that is returned after an initial request for access. It can only be exchanged for an actual access token, and cannot be used to make any other API calls.",
        "type": "http",
        "scheme": "bearer"
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
