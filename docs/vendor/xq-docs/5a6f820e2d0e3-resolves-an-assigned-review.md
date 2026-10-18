# Resolves an assigned review

Source: https://xq.stoplight.io/docs/xqmsg/5a6f820e2d0e3-resolves-an-assigned-review

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1job~1{id}/patch`

## Endpoint

`PATCH https://dashboard.xqmsg.net/v2/job/{id}`

```
curl --request PATCH \
  --url https://dashboard.xqmsg.net/v2/job/7 \
  --header 'accept-language: en_US' \
  --header 'api-key: YOUR_API_KEY' \
  --header 'authorization: Bearer YOUR_ACCESS_TOKEN'
```

Allows you to resolve an open review request. The specified user must be a member of the authenticated users workspace.

**Required Scope: ** resolve:jobs

**Webhook Event: ** resolvejob

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "593d12de41f96",
  "method": "patch",
  "path": "/job/{id}",
  "tags": [
    {
      "id": "8baff9068ed0f",
      "name": "Monitoring"
    }
  ],
  "extensions": {},
  "iid": "patch-job-userId",
  "description": "```\ncurl --request PATCH \\\n  --url https://dashboard.xqmsg.net/v2/job/7 \\\n  --header 'accept-language: en_US' \\\n  --header 'api-key: YOUR_API_KEY' \\\n  --header 'authorization: Bearer YOUR_ACCESS_TOKEN'\n```\n\nAllows you to resolve an open review request. The specified user must be a member of the authenticated users workspace.\n\n**Required Scope: ** resolve:jobs\n\n**Webhook Event: ** resolvejob",
  "summary": "Resolves an assigned review",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "c12943114aea4",
      "code": "200",
      "headers": [],
      "contents": [],
      "description": "OK - The job was resolved successfully."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "923a14605cbc4",
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
            "id": "0095d173829b8"
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
        "id": "b4afed0e17156",
        "name": "id",
        "style": "simple",
        "examples": [],
        "description": "This must be either a user ID ( when listing reviews), or a job ID ( when resolving a review ).",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "e640ed81ff352"
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
