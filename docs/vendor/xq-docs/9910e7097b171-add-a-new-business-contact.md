# Add a new business contact

Source: https://xq.stoplight.io/docs/xqmsg/9910e7097b171-add-a-new-business-contact

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1contact/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/contact`

Adds a new business contact to the current workspace. The email address of the contact must be unique within the workspace.

**Required Scope: ** write:contact\n\n**Webhook Event: ** addcontact"

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "d846e01981e60",
  "method": "post",
  "path": "/contact",
  "tags": [
    {
      "id": "83d3d47040032",
      "name": "Contact Management"
    }
  ],
  "extensions": {},
  "iid": "CreateContact",
  "description": "Adds a new business contact to the current workspace. The email address of the contact must be unique within the workspace.\n\n**Required Scope: ** write:contact\\n\\n**Webhook Event: ** addcontact\"",
  "summary": "Add a new business contact",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "28f6fa2882b09",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "608099ea480d6",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "allOf": [
              {
                "$ref": "#/__bundled__/BaseResponse"
              },
              {
                "type": "object",
                "required": [
                  "id"
                ],
                "properties": {
                  "id": {
                    "type": "integer",
                    "description": "Contact ID"
                  }
                }
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "11442bcfd69ae"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "body": {
      "id": "a64c62c47442b",
      "contents": [
        {
          "id": "b204d67503ca5",
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
              "email": {
                "type": "string",
                "description": "Email address"
              },
              "title": {
                "type": "string",
                "description": "Business title"
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
                "description": "The Contacts Role:\n  `1` - Admin\n  `2` - User\n  `3` - Vendor\n  `4` - Customer\n  `5` - Super User\n  `6` - Device"
              },
              "notifications": {
                "type": "integer",
                "enum": [
                  0,
                  2,
                  3
                ],
                "description": "Level of notifications received:\n  `0` - None\n  `2` - Warnings and Alerts\n  `3` - Alerts Only",
                "default": 0
              },
              "overflow": {
                "type": "boolean",
                "description": "Allow the contact to be created, even if the account has reached its seat limit and the contact needs to be created as an overflow contact."
              }
            },
            "required": [
              "email",
              "role"
            ],
            "title": "",
            "description": "",
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "905d205e5e14a"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "f38184435cb3b",
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
            "id": "d57558b3268cd"
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
  ],
  "__bundled__": {
    "BaseResponse": {
      "description": "",
      "type": "object",
      "properties": {
        "status": {
          "description": "\"OK\" if the response was successful, otherwise it describes the error that occurred",
          "type": "string"
        }
      },
      "required": [
        "status"
      ]
    }
  }
}
```
