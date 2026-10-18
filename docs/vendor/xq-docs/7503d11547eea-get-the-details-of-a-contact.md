# Get the details of a contact

Source: https://xq.stoplight.io/docs/xqmsg/7503d11547eea-get-the-details-of-a-contact

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1contact~1{contactId}/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/contact/{contactId}`

Displays additional information about a business contact. The contact you specify must also be a member of your current workspace.

**Required Scope: ** read:contact

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "14fc5461dfd3f",
  "method": "get",
  "path": "/contact/{contactId}",
  "tags": [
    {
      "id": "83d3d47040032",
      "name": "Contact Management"
    }
  ],
  "extensions": {},
  "iid": "GetContact",
  "description": "Displays additional information about a business contact. The contact you specify must also be a member of your current workspace.\n\n**Required Scope: ** read:contact",
  "summary": "Get the details of a contact",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "50d2fca9bfd68",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "3edbe0d4f6874",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "allOf": [
              {
                "$ref": "#/__bundled__/BaseResponse"
              },
              {
                "$ref": "#/__bundled__/ContactDetails"
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "0e01de7efb829"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "dbe4590ba6882",
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
            "id": "bfc35f115bb47"
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
        "id": "d4014927a5561",
        "name": "contactId",
        "style": "simple",
        "examples": [],
        "description": "The ID of the contact to display. Must belong to your workspace.",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "4f78739822e73"
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
    },
    "ContactDetails": {
      "type": "object",
      "properties": {
        "businessId": {
          "type": "integer",
          "description": "The ID of the business they belong to"
        },
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
        "state": {
          "type": "string",
          "enum": [
            "Invited",
            "Validated",
            "Disabled"
          ],
          "description": "User State"
        },
        "last": {
          "type": "integer",
          "description": "The last time the contact signed in ( in milliseconds since 1970 )."
        },
        "role": {
          "type": "string",
          "description": "User Role",
          "enum": [
            "Admin",
            "User",
            "Vendor",
            "Customer",
            "SuperUser",
            "Device"
          ]
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
      "required": [
        "businessId",
        "firstName",
        "lastName",
        "phone",
        "email",
        "title",
        "state",
        "last",
        "role",
        "n"
      ]
    }
  }
}
```
