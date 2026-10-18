# Assign a log item for review

Source: https://xq.stoplight.io/docs/xqmsg/e2133d1bbd0fd-assign-a-log-item-for-review

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1job/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/job`

Assign a log to a user for review. Both the log and the user must be part of the authenticated users workspace.

**Required Scope:** write:jobs

**Webhook Event:** assignjob

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "6c047deb2e663",
  "method": "post",
  "path": "/job",
  "tags": [
    {
      "id": "8baff9068ed0f",
      "name": "Monitoring"
    }
  ],
  "extensions": {},
  "iid": "post-job",
  "description": "Assign a log to a user for review. Both the log and the user must be part of the authenticated users workspace.\n\n**Required Scope:** write:jobs\n\n**Webhook Event:** assignjob",
  "summary": "Assign a log item for review",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "45b29cefb4632",
      "code": "200",
      "headers": [],
      "contents": [],
      "description": "OK - Returns the new job ID."
    }
  ],
  "request": {
    "body": {
      "id": "1dea0314d2ea8",
      "contents": [
        {
          "id": "19ae79342a96a",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "logid": {
                "type": "integer",
                "description": "The ID of the log entry to assign."
              },
              "to": {
                "type": "integer",
                "description": "The ID of the user to assign to."
              },
              "note": {
                "type": "string",
                "description": "Additional information about the entry."
              }
            },
            "required": [
              "logid",
              "to",
              "note"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "08a5791a273d7"
            }
          }
        }
      ],
      "description": ""
    },
    "headers": [
      {
        "id": "e2bb153cb3a99",
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
            "id": "b1c0a75ca5585"
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
