# Create and Save Multiple Key Packets With Individual Metadata

Source: https://xq.stoplight.io/docs/xqmsg/8e03fb4bd5ea0-create-and-save-multiple-key-packets-with-individual-metadata

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1packet~1batch/post`

## Endpoint

`POST https://subscription.xqmsg.net/v2/packet/batch`

Stores a list of key packets in a single request, where each packet carries its own metadata, recipients, expiry, and type.

Use this endpoint when the packets differ from one another — most commonly database or field-level encryption, where each key protects a distinct column and needs its own title and labels. If every key shares the same recipients, expiry, and metadata, the multi-key form of [`/packet/add`](../reference/Subscription.json/paths/~1packet~1add/post) is simpler and does the same job in one payload.

The response contains one locator token per entry, in the same order they were submitted. Compare the returned count against the number of entries you sent before using them.

**Note:** this is the only packet endpoint where `expires` is paired with a `unit` field. Everywhere else `expires` is measured in hours.

**Note that you must have a compatible XQ licensing plan for the packet type you specify. More information about our plans is available [here](https://manage.xqmsg.com/pricing).**

**Required API Key Scope:** packet

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "c9e01294c1bbd",
  "method": "post",
  "path": "/packet/batch",
  "tags": [
    {
      "id": "c44a9fee156da",
      "name": "Key Management"
    }
  ],
  "extensions": {},
  "iid": "post-packet-batch",
  "description": "Stores a list of key packets in a single request, where each packet carries its own metadata, recipients, expiry, and type.\n\nUse this endpoint when the packets differ from one another — most commonly database or field-level encryption, where each key protects a distinct column and needs its own title and labels. If every key shares the same recipients, expiry, and metadata, the multi-key form of [`/packet/add`](../reference/Subscription.json/paths/~1packet~1add/post) is simpler and does the same job in one payload.\n\nThe response contains one locator token per entry, in the same order they were submitted. Compare the returned count against the number of entries you sent before using them.\n\n**Note:** this is the only packet endpoint where `expires` is paired with a `unit` field. Everywhere else `expires` is measured in hours.\n\n**Note that you must have a compatible XQ licensing plan for the packet type you specify. More information about our plans is available [here](https://manage.xqmsg.com/pricing).**\n\n**Required API Key Scope:** packet",
  "summary": "Create and Save Multiple Key Packets With Individual Metadata",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "5b5f5a2a2c894",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "d65051830a2d2",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "tokens": {
                "type": "array",
                "description": "The locator tokens for the created packets. `tokens[i]` corresponds to `entries[i]`.",
                "items": {
                  "type": "string"
                }
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "49b31e6e7bd43"
            }
          }
        }
      ],
      "description": "OK - Returns one locator token per submitted entry, in the same order as the request."
    },
    {
      "id": "58bf5accf50d2",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request"
    },
    {
      "id": "58cf5accf5261",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "58ef5accf6fcb",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "8a6f5b0a1fba3",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "body": {
      "id": "8d4319910b61c",
      "contents": [
        {
          "id": "3e4c48612670d",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "entries": {
                "type": "array",
                "description": "The key packets to create. Each entry is stored as its own packet.",
                "items": {
                  "$ref": "#/__bundled__/KeyPacketBatchEntry"
                }
              }
            },
            "required": [
              "entries"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "5dcb777bbb93a"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "d72c661139383",
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
            "id": "08b737b9c1ffd"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "description",
          "name",
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
  ],
  "__bundled__": {
    "KeyPacketBatchEntry": {
      "title": "KeyPacketBatchEntry",
      "type": "object",
      "description": "A single key packet within a /packet/batch submission. Every field is set per entry, so entries in the same request may differ in metadata, recipients, expiry, and type.",
      "properties": {
        "key": {
          "type": "string",
          "description": "The secret key that the user wants to protect, carrying its 2-character algorithm prefix."
        },
        "recipients": {
          "type": "array",
          "description": "The recipients who are allowed to access this key.",
          "items": {
            "type": "string"
          }
        },
        "expires": {
          "type": "integer",
          "description": "How long this key remains valid, expressed in the units given by the `unit` field. Note this differs from every other packet endpoint, where `expires` is always in hours."
        },
        "unit": {
          "type": "string",
          "description": "The time unit that `expires` is measured in, for example \"days\". This field is unique to the batch endpoint.",
          "default": "days"
        },
        "type": {
          "type": [
            "number",
            "string"
          ],
          "enum": [
            1,
            2,
            3,
            4,
            5,
            "\"file\"",
            "\"msg\"",
            "\"chat\"",
            "\"form\"",
            "\"data\"",
            "\"database\""
          ],
          "default": "\"database\"",
          "description": "A value indicating the type of data that is being encrypted. Batch submissions are typically used for \"database\" packets, where each key protects a single field or column."
        },
        "meta": {
          "type": "object",
          "description": "Metadata for this specific key, commonly a title and a set of labels. This is the reason to choose /packet/batch over the multi-key form of /packet/add."
        }
      },
      "required": [
        "key",
        "recipients",
        "expires"
      ]
    }
  }
}
```
