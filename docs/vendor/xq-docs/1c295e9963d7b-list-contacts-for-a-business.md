# List Contacts for a Business

Source: https://xq.stoplight.io/docs/xqmsg/1c295e9963d7b-list-contacts-for-a-business

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1contact/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/contact`

**Required Scope:** read:contact

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "d16bbac4ccecd",
  "method": "get",
  "path": "/contact",
  "tags": [
    {
      "id": "83d3d47040032",
      "name": "Contact Management"
    }
  ],
  "extensions": {},
  "iid": "ListContacts",
  "description": "**Required Scope:** read:contact",
  "summary": "List Contacts for a Business",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "167ed3397a00d",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "8fde5eacf9abb",
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
                  "total",
                  "contacts"
                ],
                "properties": {
                  "total": {
                    "type": "integer"
                  },
                  "contacts": {
                    "type": "array",
                    "items": {
                      "$ref": "#/__bundled__/ContactSummary"
                    }
                  }
                }
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "fab85bda877a3"
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
        "id": "88bccde6b64e5",
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
            "id": "ee642d915c8f8"
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
        "id": "6bc8c801bbf1b",
        "name": "limit",
        "style": "form",
        "examples": [],
        "description": "The maximum number of results to return.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "8f49b0629770a"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      },
      {
        "id": "e8b003cabb2cc",
        "name": "page",
        "style": "form",
        "examples": [],
        "description": "The current page of results, starting from zero.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "4a3b06cbf4f83"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      },
      {
        "id": "635121805f8aa",
        "name": "role",
        "style": "form",
        "examples": [],
        "description": "The contact role to filter in ( 1 = Admin, 2 = User, 3 = Vendor, 4 = Customer )",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "38da9330dfb63"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      },
      {
        "id": "40b8948ce0e9d",
        "name": "filter",
        "style": "form",
        "examples": [],
        "description": "A general search filter to search against. Filters against the first name, last name and email address. Supports SQL style fuzzy matching.",
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "8b7269e92319b"
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
    },
    "ContactSummary": {
      "type": "object",
      "properties": {
        "id": {
          "type": "integer",
          "description": "Contact ID"
        },
        "fn": {
          "type": "string",
          "description": "First Name"
        },
        "ln": {
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
        },
        "hasUsedEdgeClient": {
          "type": "boolean",
          "description": "Indicates whether or not the contact has ever used one of the edge clients"
        }
      },
      "required": [
        "id",
        "email",
        "state",
        "last",
        "n"
      ]
    }
  }
}
```
