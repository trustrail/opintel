# Self Sign up

Source: https://xq.stoplight.io/docs/xqmsg/1306a81a01b1e-self-sign-up

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1signup/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/signup`

Sign up for an account in the XQ Platform

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "d1e2de977bbef",
  "method": "post",
  "path": "/signup",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "SignUp",
  "description": "Sign up for an account in the XQ Platform",
  "summary": "Self Sign up",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "13bcf6d0dd381",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "OK - No Content. The welcome email is sent."
    }
  ],
  "request": {
    "body": {
      "id": "a4f8aa9af00d0",
      "contents": [
        {
          "id": "9b5e5779b4382",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "required": [
              "email",
              "optIn"
            ],
            "properties": {
              "email": {
                "type": "string",
                "format": "email",
                "description": "The email address of the user."
              },
              "pwd": {
                "type": "string",
                "description": "Optional password that can be used to later login without going through the email authentication.\n\n** This should only be used by developers to bypass email factor authentication **"
              },
              "optIn": {
                "type": "boolean",
                "description": "Whether or not the user opts in to receiving email notifications"
              },
              "state": {
                "type": "string",
                "description": "Optional parameter that would pass through from the frontend and get placed as query parameter in the magic link that is in the email.\n\nThis can be used for the front end to determine which flow the user is coming from, and therefore which screen the user should be\nsent to after they have successfully logged in."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "d66861f182e3a"
            }
          }
        }
      ]
    },
    "headers": [],
    "query": [],
    "cookie": [],
    "path": []
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
