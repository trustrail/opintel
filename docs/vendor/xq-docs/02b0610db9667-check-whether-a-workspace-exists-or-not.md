# Check whether a workspace exists or not

Source: https://xq.stoplight.io/docs/xqmsg/02b0610db9667-check-whether-a-workspace-exists-or-not

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1workspace~1{workspace}/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/workspace/{workspace}`

This returns a 204 HTTP code if the specified workspace already exists.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "b911a0c3aef7e",
  "method": "get",
  "path": "/workspace/{workspace}",
  "tags": [
    {
      "id": "8f23c60f522bc",
      "name": "Business"
    }
  ],
  "extensions": {},
  "iid": "get-workspace-workspace",
  "description": "This returns a 204 HTTP code if the specified workspace already exists.",
  "summary": "Check whether a workspace exists or not",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "1e3975359c553",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "The workspace exists. Anything else indicates otherwise."
    }
  ],
  "request": {
    "headers": [],
    "query": [],
    "cookie": [],
    "path": [
      {
        "id": "89f2029461bb8",
        "name": "workspace",
        "style": "simple",
        "examples": [],
        "description": "The workspace to search for.",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "44e998cc438f8"
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
