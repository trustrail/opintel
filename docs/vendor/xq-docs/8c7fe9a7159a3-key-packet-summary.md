# KeyPacketSummary

Source: https://xq.stoplight.io/docs/xqmsg/8c7fe9a7159a3-key-packet-summary

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/KeyPacketSummary`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
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
  ],
  "__bundled__": {
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
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
