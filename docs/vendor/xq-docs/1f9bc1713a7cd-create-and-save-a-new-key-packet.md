# Create and Save a New Key Packet

Source: https://xq.stoplight.io/docs/xqmsg/1f9bc1713a7cd-create-and-save-a-new-key-packet

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1packet~1add/post`

## Endpoint

`POST https://subscription.xqmsg.net/v2/packet/add`

Takes the secret key that a user wants to protect along with a list of the people that are allowed to access it, and automatically saves it to the keystore associated with the server.

Unlike the `/packet` endpoint, this will both validate the submission and then save it to the keystore in a single request.

This endpoint accepts two forms:

- **Single key** — send `key` with one secret. The response is the locator token as a bare string.
- **Multiple keys** — send `keys` with an array of secrets. One packet is created per key, and the response is `{"tokens": [...]}` with the tokens in the same order as the keys you sent. All of the packets share the recipients, expiry, type, and metadata given in the request.

Send either `key` or `keys`, not both. If each key needs its own metadata, recipients, or expiry, use [`/packet/batch`](../reference/Subscription.json/paths/~1packet~1batch/post) instead.

**Note that you must have a compatible XQ licensing plan for the packet type you specify. For example, a forms plan is required to submit a "forms" packet. More information about our plans is available [here](https://manage.xqmsg.com/pricing).**

**Required API Key Scope:** packet

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "5bbb4f63f7786",
  "method": "post",
  "path": "/packet/add",
  "tags": [
    {
      "id": "c44a9fee156da",
      "name": "Key Management"
    }
  ],
  "extensions": {},
  "iid": "post-packet-add",
  "description": "Takes the secret key that a user wants to protect along with a list of the people that are allowed to access it, and automatically saves it to the keystore associated with the server.\n\nUnlike the `/packet` endpoint, this will both validate the submission and then save it to the keystore in a single request.\n\nThis endpoint accepts two forms:\n\n- **Single key** — send `key` with one secret. The response is the locator token as a bare string.\n- **Multiple keys** — send `keys` with an array of secrets. One packet is created per key, and the response is `{\"tokens\": [...]}` with the tokens in the same order as the keys you sent. All of the packets share the recipients, expiry, type, and metadata given in the request.\n\nSend either `key` or `keys`, not both. If each key needs its own metadata, recipients, or expiry, use [`/packet/batch`](../reference/Subscription.json/paths/~1packet~1batch/post) instead.\n\n**Note that you must have a compatible XQ licensing plan for the packet type you specify. For example, a forms plan is required to submit a \"forms\" packet. More information about our plans is available [here](https://manage.xqmsg.com/pricing).**\n\n**Required API Key Scope:** packet",
  "summary": "Create and Save a New Key Packet",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "8d7646a4790ad",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "b2a5766cbd6dd",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "string",
            "description": "The locator token for the created packet. Returned for single key requests.",
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "61f9af5fd8575"
            }
          }
        },
        {
          "id": "7281e040bd52b",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "description": "Returned for multi-key requests.",
            "properties": {
              "tokens": {
                "type": "array",
                "description": "The locator tokens for the created packets. `tokens[i]` corresponds to `keys[i]`.",
                "items": {
                  "type": "string"
                }
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "7a37c1f2f8bed"
            }
          }
        }
      ],
      "description": "OK - For a single key request, returns the locator token as a bare string. For a multi-key request, returns a JSON object containing one locator token per key, in the same order as the request."
    },
    {
      "id": "f8164613094d3",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request"
    },
    {
      "id": "f80646130951c",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "f7e64613091fa",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "946645bec36b7",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "body": {
      "id": "13f20ccee64f1",
      "contents": [
        {
          "id": "042cda63510a9",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "oneOf": [
              {
                "$ref": "#/__bundled__/KeyManagement"
              },
              {
                "$ref": "#/__bundled__/MultiKeyManagement"
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "a31bb76ffc6a1"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "33d368484a963",
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
            "id": "88e83e89466a7"
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
    "KeyManagement": {
      "title": "KeyManagement",
      "type": "object",
      "properties": {
        "key": {
          "type": "string",
          "description": "The secret key that the user wants to protect."
        },
        "recipients": {
          "type": "string",
          "description": "A comma-delimited list of recipients who are allowed to access the key."
        },
        "expires": {
          "description": "The number of hours that this key will remain valid for. After this time, it will no longer be accessible.",
          "type": "integer"
        },
        "dor": {
          "type": "boolean",
          "description": "Delete on Read. If this is set to true, a recipient will only be able to read a message once.",
          "default": false
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
            "\"data\""
          ],
          "default": 5,
          "description": "A value indicating the type of data that is being encrypted. Values are 1 = “file”, 2 = “msg”, 3 = “chat”, 4 = “form”, 5  “data”"
        },
        "meta": {
          "type": "object",
          "description": "Any additional meta information about the key."
        },
        "fence": {
          "type": "array",
          "description": "An array or comma-delimited list of IP addresses that this key will be accessible from. By default, the key will be retrievable from any address.",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "key",
        "recipients",
        "expires",
        "type"
      ]
    },
    "MultiKeyManagement": {
      "title": "MultiKeyManagement",
      "type": "object",
      "description": "The multi-key form of a key packet submission. Identical to KeyManagement except that `keys` replaces `key`, storing several packets in one request. All packets created this way share the same recipients, expiry, type, and metadata.",
      "properties": {
        "keys": {
          "type": "array",
          "description": "The secret keys that the user wants to protect. Each key should carry its 2-character algorithm prefix. A separate packet is created for each entry, and the returned tokens are in the same order.",
          "items": {
            "type": "string"
          }
        },
        "recipients": {
          "type": "string",
          "description": "A comma-delimited list of recipients who are allowed to access the keys. Applies to every key in the request."
        },
        "expires": {
          "description": "The number of hours that these keys will remain valid for. After this time, they will no longer be accessible. Applies to every key in the request.",
          "type": "integer"
        },
        "dor": {
          "type": "boolean",
          "description": "Delete on Read. If this is set to true, a recipient will only be able to read a message once.",
          "default": false
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
            "\"data\""
          ],
          "default": 5,
          "description": "A value indicating the type of data that is being encrypted. Values are 1 = “file”, 2 = “msg”, 3 = “chat”, 4 = “form”, 5 = “data”"
        },
        "meta": {
          "type": "object",
          "description": "Any additional meta information about the keys. Applies to every key in the request — use the /packet/batch endpoint if each key needs its own metadata."
        },
        "fence": {
          "type": "array",
          "description": "An array or comma-delimited list of IP addresses that these keys will be accessible from. By default, the keys will be retrievable from any address.",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "keys",
        "recipients",
        "expires",
        "type"
      ]
    }
  }
}
```
