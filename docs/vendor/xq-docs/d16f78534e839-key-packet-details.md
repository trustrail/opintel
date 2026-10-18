# KeyPacketDetails

Source: https://xq.stoplight.io/docs/xqmsg/d16f78534e839-key-packet-details

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/KeyPacketDetails`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
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
  },
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
