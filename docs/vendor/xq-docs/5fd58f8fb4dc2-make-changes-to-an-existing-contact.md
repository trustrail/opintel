# Make changes to an existing contact

Source: https://xq.stoplight.io/docs/xqmsg/5fd58f8fb4dc2-make-changes-to-an-existing-contact

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1contact~1{contactId}/patch`

## Endpoint

`PATCH https://dashboard.xqmsg.net/v2/contact/{contactId}`

Modify information about a business contact who is in your workspace.

**Required Scopes:** write:contact

**Webhook Event:** updatecontact"

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "0ac488abc6b0f",
  "method": "patch",
  "path": "/contact/{contactId}",
  "tags": [
    {
      "id": "83d3d47040032",
      "name": "Contact Management"
    }
  ],
  "extensions": {},
  "iid": "UpdateContact",
  "description": "Modify information about a business contact who is in your workspace.\n\n**Required Scopes:** write:contact\n\n**Webhook Event:** updatecontact\"",
  "summary": "Make changes to an existing contact",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "14c232f8a14eb",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content"
    }
  ],
  "request": {
    "body": {
      "id": "5d60b4ef9b310",
      "contents": [
        {
          "id": "07399b8b39c89",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "firstName": {
                "type": "string",
                "description": "First Name"
              },
              "lastName": {
                "type": "string",
                "description": "Last Name"
              },
              "phone": {
                "type": "string",
                "description": "Telephone Number"
              },
              "email": {
                "type": "string",
                "description": "Email Address"
              },
              "title": {
                "type": "string",
                "description": "The business title of the contact."
              },
              "role": {
                "type": "integer",
                "enum": [
                  1,
                  2,
                  3,
                  4,
                  5,
                  6
                ],
                "description": "The Contacts Role:\n  `1` - Admin\n  `2` - User\n  `3` - Vendor\n  `4` - Customer\n  `5` - SuperUser"
              },
              "n": {
                "type": "integer",
                "enum": [
                  0,
                  2,
                  3
                ],
                "description": "Level of notifications received:\n  `0` - None\n  `2` - Warnings and Alerts\n  `3` - Alerts Only"
              },
              "more": {
                "type": "string",
                "description": "Additional information about this contact."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "6afa315b1044b"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "92817574f7cfe",
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
            "id": "d6dad3ec1ce70"
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
        "id": "cf3322e29aa07",
        "name": "contactId",
        "style": "simple",
        "examples": [],
        "description": "The ID of the contact to display. Must belong to your workspace.",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "2dc3cbcf578ed"
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
