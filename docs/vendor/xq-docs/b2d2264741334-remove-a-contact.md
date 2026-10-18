# Remove a contact

Source: https://xq.stoplight.io/docs/xqmsg/b2d2264741334-remove-a-contact

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1contact~1{contactId}/delete`

## Endpoint

`DELETE https://dashboard.xqmsg.net/v2/contact/{contactId}`

Disable or removes a contact from your portal.

**Webhook Event: ** removecontact

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "11849800c2c75",
  "method": "delete",
  "path": "/contact/{contactId}",
  "tags": [
    {
      "id": "83d3d47040032",
      "name": "Contact Management"
    }
  ],
  "extensions": {},
  "iid": "DeleteContact",
  "description": "Disable or removes a contact from your portal.\n\n**Webhook Event: ** removecontact",
  "summary": "Remove a contact",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "e1231688042a6",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "adf310b549c6a",
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
            "id": "1abbed9fe91f9"
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
    "query": [
      {
        "id": "79cf6460c5cea",
        "name": "delete",
        "style": "form",
        "examples": [],
        "description": "A flag indicating whether a contact should be deleted permanently, or simply disabled",
        "schema": {
          "type": "boolean",
          "default": false,
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "a580cea7a2d6a"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      }
    ],
    "cookie": [],
    "path": [
      {
        "id": "9f1bb244d615c",
        "name": "contactId",
        "style": "simple",
        "examples": [],
        "description": "The ID of the contact to display. Must belong to your workspace.",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "cc8fed8d99de1"
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
