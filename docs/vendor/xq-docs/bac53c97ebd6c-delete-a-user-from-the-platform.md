# Delete a User From the Platform

Source: https://xq.stoplight.io/docs/xqmsg/bac53c97ebd6c-delete-a-user-from-the-platform

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1subscriber/delete`

## Endpoint

`DELETE https://subscription.xqmsg.net/v2/subscriber`

Deletes the user specified by the access token.

After an account is deleted, the subscriber will be sent an email notifying them of its deletion.

**Required API Key Scope:** edit:subscriber

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "79848718d4a93",
  "method": "delete",
  "path": "/subscriber",
  "tags": [
    {
      "id": "cd921f766d315",
      "name": "User Management"
    }
  ],
  "extensions": {},
  "iid": "delete-subscriber",
  "description": "Deletes the user specified by the access token.\n\nAfter an account is deleted, the subscriber will be sent an email notifying them of its deletion.\n\n**Required API Key Scope:** edit:subscriber",
  "summary": "Delete a User From the Platform",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "c5709db8e4d02",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - Indicates that the account has been successfully validated."
    },
    {
      "id": "f8609d104ee36",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "f8409d104d39c",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "5c009d6494df0",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "a48b98c521d75",
        "name": "authorization",
        "style": "simple",
        "examples": [],
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "8ef6c86ce57cb"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name"
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
