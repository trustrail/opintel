# Create a new developer application

Source: https://xq.stoplight.io/docs/xqmsg/bd0060c499f5a-create-a-new-developer-application

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1devapp/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/devapp`

Creates a new developer application. Once created, API keys can be grouped under application.

**Required Scope:** devapp

**Webhook Event:** adddevapp

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "afa7b42bc47d5",
  "method": "post",
  "path": "/devapp",
  "tags": [
    {
      "id": "3c5ba08f9b0d1",
      "name": "API Keys"
    }
  ],
  "extensions": {},
  "iid": "post-devapp",
  "description": "Creates a new developer application. Once created, API keys can be grouped under application.\n\n**Required Scope:** devapp\n\n**Webhook Event:** adddevapp",
  "summary": "Create a new developer application",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "77ec56d71ec9d",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "efeb7731a0a5a",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "id": {
                "type": "integer",
                "description": "The ID of the new application."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "c89332bde6867"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "body": {
      "id": "3eaddcf6ea814",
      "contents": [
        {
          "id": "9c486644358c6",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string",
                "description": "The new application name."
              },
              "desc": {
                "type": "string",
                "description": "A description of the application."
              }
            },
            "required": [
              "name"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "4a701ec87b7e0"
            }
          }
        }
      ],
      "description": ""
    },
    "headers": [
      {
        "id": "87fe017f35238",
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
            "id": "41130a24b7ea7"
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
