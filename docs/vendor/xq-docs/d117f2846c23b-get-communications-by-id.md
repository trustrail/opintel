# Get Communications by ID

Source: https://xq.stoplight.io/docs/xqmsg/d117f2846c23b-get-communications-by-id

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1communication/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/communication`

Get a single communication by its ID

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "d885835146c4f",
  "method": "get",
  "path": "/communication",
  "tags": [
    {
      "id": "57393f13e0516",
      "name": "Communications"
    },
    {
      "id": "c44a9fee156da",
      "name": "Key Management"
    }
  ],
  "extensions": {},
  "iid": "GetCommunication",
  "description": "Get a single communication by its ID",
  "summary": "Get Communications by ID",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "ae6b7111f2537",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "3fa8612b169ac",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "allOf": [
              {
                "$ref": "#/__bundled__/BaseResponse"
              },
              {
                "$ref": "#/__bundled__/KeyPacketDetails"
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "fb6b572fdef02"
            }
          }
        }
      ],
      "description": "OK."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "62fe8b96b0fd8",
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
            "id": "03c14af84d802"
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
    },
    "KeyPacketDetails": {
      "required": [
        "id",
        "user",
        "cstatus",
        "type",
        "recipients",
        "expires",
        "updated",
        "accesses",
        "ip",
        "lat",
        "long",
        "location"
      ],
      "properties": {
        "id": {
          "type": "integer",
          "description": "Key Packet ID"
        },
        "token": {
          "type": "string",
          "description": "Locator token for the key"
        },
        "user": {
          "type": "string",
          "description": "The email address of the user that stored the key"
        },
        "cstatus": {
          "type": "integer",
          "enum": [
            0,
            1,
            2
          ],
          "description": "The status of the key: `0` - Available, `1` - Revoked, `2` - Expired\n"
        },
        "accesses": {
          "type": "integer",
          "description": "The number of times that a keys has been accessed"
        },
        "expires": {
          "type": "integer",
          "description": "The time that a key will expire in milliseconds epoch"
        },
        "updated": {
          "type": "integer",
          "description": "The time that a was created in milliseconds epoch"
        },
        "type": {
          "type": "integer",
          "enum": [
            0,
            1,
            2
          ],
          "description": "The type of key: `0` - Unknown, `1` - File, `2` - Email\n"
        },
        "recipients": {
          "type": "array",
          "items": {
            "$ref": "#/__bundled__/KeyPacketRecipientInfo"
          }
        },
        "meta": {
          "type": "string",
          "description": "Any meta information about the key. Typically a stringified JSON object with information about email subject, fileName, fileType, etc..."
        },
        "ip": {
          "type": "string",
          "description": "IP for the user"
        },
        "lat": {
          "type": "string",
          "description": "Latitude based off of IP address"
        },
        "long": {
          "type": "string",
          "description": "Longitude based off of IP address"
        },
        "location": {
          "type": "string",
          "description": "Location based off of IP address"
        }
      }
    },
    "KeyPacketRecipientInfo": {
      "required": [
        "user",
        "key"
      ],
      "properties": {
        "user": {
          "type": "string",
          "description": "If a recipient is not visible to the requester, this will be set to \"External User\". Otherwise, will be set to the the recipient email/phone."
        },
        "key": {
          "type": "string",
          "description": "A key representing the user. For known recipients, this will be their email/phone number. For external users, this will be a unique hash."
        }
      }
    }
  }
}
```
