# Modify an existing webhook

Source: https://xq.stoplight.io/docs/xqmsg/40fe3b3f43ba1-modify-an-existing-webhook

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1hook~1{webhookId}/patch`

## Endpoint

`PATCH https://dashboard.xqmsg.net/v2/hook/{webhookId}`

```
curl --request PATCH \
  --url https://dashboard.xqmsg.net/v2/hook/WEBHOOK_ID \
  --header 'api-key: YOUR_API_KEY' \
  --header 'authorization: Bearer YOUR_ACCESS_TOKEN' \
  --header 'content-type: application/json' \
  --data '{
	"url" : "http://your.updated-endpoint.com",
}'
```

Modifies an existing webhook.

**Required Scope: ** hook

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "cd3efe4b99c44",
  "method": "patch",
  "path": "/hook/{webhookId}",
  "tags": [
    {
      "id": "15b231d4a5a13",
      "name": "Events"
    }
  ],
  "extensions": {},
  "iid": "patch-hook",
  "description": "```\ncurl --request PATCH \\\n  --url https://dashboard.xqmsg.net/v2/hook/WEBHOOK_ID \\\n  --header 'api-key: YOUR_API_KEY' \\\n  --header 'authorization: Bearer YOUR_ACCESS_TOKEN' \\\n  --header 'content-type: application/json' \\\n  --data '{\n\t\"url\" : \"http://your.updated-endpoint.com\",\n}'\n```\n\nModifies an existing webhook.\n\n**Required Scope: ** hook",
  "summary": "Modify an existing webhook",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "918c798f5b05a",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content"
    }
  ],
  "request": {
    "body": {
      "id": "802a1e7c6b2f4",
      "contents": [
        {
          "id": "382384ca556fd",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "url": {
                "type": "string",
                "description": "The URL that will be called when an event occurs. Must be a full and valid URL."
              },
              "events": {
                "type": "array",
                "description": "The list of events that this hook will listen for. If not specified or left blank, then the hook will respond to all events.",
                "items": {
                  "type": "string"
                }
              },
              "enabled": {
                "type": "boolean",
                "description": "Should this event be enabled after creation? Defaults to true."
              },
              "id": {
                "type": "integer",
                "description": "The ID of the application."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "3330298412a90"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "c3a6d5808697e",
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
            "id": "ce8ad5ba54402"
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
        "id": "9f9a6d9c8f9a7",
        "name": "webhookId",
        "style": "simple",
        "examples": [],
        "description": "1",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "cba1e5e34a6d2"
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
