# Get information About the Current User

Source: https://xq.stoplight.io/docs/xqmsg/0a40764acc475-get-information-about-the-current-user

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1subscriber/get`

## Endpoint

`GET https://subscription.xqmsg.net/v2/subscriber`

This endpoint returns information ( name, email and account status ) about the current user.

**Required API Key Scope:** read:subscriber

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "cfc53d7a1da21",
  "method": "get",
  "path": "/subscriber",
  "tags": [
    {
      "id": "cd921f766d315",
      "name": "User Management"
    }
  ],
  "extensions": {},
  "iid": "get-subscriber",
  "description": "This endpoint returns information ( name, email and account status ) about the current user.\n\n**Required API Key Scope:** read:subscriber",
  "summary": "Get information About the Current User",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "76828257810ad",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "ee5c8aba8f3a6",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "id": {
                "type": "integer",
                "description": "The user ID."
              },
              "firstName": {
                "type": "string",
                "description": "The users first name."
              },
              "lastName": {
                "type": "string",
                "description": "The users last name"
              },
              "user": {
                "type": "string",
                "description": "The email or telphone number beloging to the user."
              },
              "sub": {
                "type": "string",
                "description": "The user subscription status."
              },
              "starts": {
                "type": "integer",
                "description": "The datetime ( in milliseconds ) when the subscription was activated."
              },
              "ends": {
                "type": "integer",
                "description": "The datetime (in milliseconds) when the subscription will end."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "c460d5a8d719d"
            }
          }
        }
      ],
      "description": "OK"
    },
    {
      "id": "769282578117e",
      "code": "201",
      "headers": [],
      "contents": [],
      "description": "Created"
    },
    {
      "id": "793281b4b8f6c",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "791281b4b8a16",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "12d282033b461",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "headers": [],
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
