# List review jobs assigned to a user

Source: https://xq.stoplight.io/docs/xqmsg/31c2a922820ac-list-review-jobs-assigned-to-a-user

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1job~1{id}/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/job/{id}`

Display a list of jobs that are assigned to a user. The specified user must be a member of the authenticated users workspace.

**Required Scope:** read:jobs

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "afe4b3303a70d",
  "method": "get",
  "path": "/job/{id}",
  "tags": [
    {
      "id": "8baff9068ed0f",
      "name": "Monitoring"
    }
  ],
  "extensions": {},
  "iid": "get-job-userId",
  "description": "Display a list of jobs that are assigned to a user. The specified user must be a member of the authenticated users workspace.\n\n**Required Scope:** read:jobs",
  "summary": "List review jobs assigned to a user",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "6d04fd5accb0c",
      "code": "200",
      "headers": [],
      "contents": [],
      "description": "OK -Returns a list of assigned jobs."
    }
  ],
  "request": {
    "headers": [],
    "query": [],
    "cookie": [],
    "path": [
      {
        "id": "0cc0164c0e362",
        "name": "id",
        "style": "simple",
        "examples": [],
        "description": "This must be either a user ID ( when listing reviews), or a job ID ( when resolving a review ).",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "ae1dcbbac3e6e"
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
