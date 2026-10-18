# List Communications

Source: https://xq.stoplight.io/docs/xqmsg/6bcf3698bb5b4-list-communications

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1communications~1{id}/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/communications/{id}`

List the all available communications of a workspace.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "4552ed892b695",
  "method": "get",
  "path": "/communications/{id}",
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
  "iid": "ListCommunications",
  "description": "List the all available communications of a workspace.",
  "summary": "List Communications",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "6d2bd7b3eab98",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "0a3774aade64d",
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
                "properties": {
                  "communications": {
                    "type": "array",
                    "items": {
                      "$ref": "#/__bundled__/KeyPacketSummary"
                    }
                  },
                  "total": {
                    "type": "integer",
                    "description": "Total number of communications"
                  }
                },
                "required": [
                  "communications",
                  "total"
                ]
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "afa6c54e5a31d"
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
        "id": "df325d352fee3",
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
            "id": "4a9baff4a4987"
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
        "id": "5651c30ff7c67",
        "name": "from",
        "style": "form",
        "examples": [],
        "description": "The lower boundary time ( in milliseconds ) to search. A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "56685e226ac48"
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
        "id": "bf4250f19c895",
        "name": "to",
        "style": "form",
        "examples": [],
        "description": "The upper boundary time ( in milliseconds ) to search. A zero value will be ignored.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "7f61ec6938191"
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
        "id": "a2a6c2934098c",
        "name": "limit",
        "style": "form",
        "examples": [],
        "description": "Page size",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "8d58ff2599ef2"
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
        "id": "833aa4b4bc8fa",
        "name": "page",
        "style": "form",
        "examples": [],
        "description": "Page number",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "9960c9f2b6303"
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
        "id": "4bff88c201b35",
        "name": "users",
        "style": "form",
        "examples": [],
        "description": "Filter by senders email. Comma separated values will match against any sender in the list",
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "4c4962f40e613"
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
        "id": "2d21807c220f6",
        "name": "recipients",
        "style": "form",
        "examples": [],
        "description": "Filter by recipient email. Comma separated values will match against any recipient in the list",
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "1d68c50eb138c"
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
        "id": "c3386f363dce5",
        "name": "type",
        "style": "form",
        "examples": [],
        "description": "The type of key: `0` - Unknown, `1` - File, `2` - Email. Comma separated values will match against EITHER type.\n",
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "49d472f526c33"
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
        "id": "ae0a3484fe93f",
        "name": "status",
        "style": "form",
        "examples": [],
        "description": "The comma separated status of the key: `0` - Available, `1` - Revoked, `2` - Expired\n",
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "e732ee050ec48"
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
        "id": "1adccbc05a920",
        "name": "search",
        "style": "form",
        "examples": [],
        "description": "Generic search field for search by user defined input. Should match against the resource names (email subject, file name, ...), recipients, and owners.",
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "4981e82f51c0b"
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
        "id": "6c7e9bc1d5f2b",
        "name": "id",
        "style": "simple",
        "examples": [],
        "description": "The communication ID",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "fc82c68eaaf8e"
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
    "KeyPacketSummary": {
      "type": "object",
      "properties": {
        "id": {
          "type": "integer",
          "description": "Key Packet ID"
        },
        "ip": {
          "type": "string",
          "description": "IP for the user"
        },
        "lat": {
          "type": "integer",
          "description": "Latitude based off of IP address"
        },
        "long": {
          "type": "integer",
          "description": "Longitude based off of IP address"
        },
        "location": {
          "type": "string",
          "description": "Location based off of IP address"
        },
        "token": {
          "type": "string",
          "description": "Locator token for the key"
        },
        "user": {
          "type": "string",
          "description": "The email address of the user that stored the key"
        },
        "status": {
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
        "alerts": {
          "type": "integer",
          "description": "The number of times a key has been flagged with an alert threat"
        },
        "warnings": {
          "type": "integer",
          "description": "The number of times a key has been flagged with a warning threat"
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
            2,
            3,
            4
          ],
          "description": "The type of key: `0` - Unknown, `1` - File, `2` - Emailm `3` - Chat, `4` - Form\n"
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
        }
      },
      "required": [
        "id",
        "user",
        "status",
        "accesses",
        "expires",
        "updated",
        "type",
        "recipients",
        "ip",
        "lat",
        "long",
        "location"
      ]
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
