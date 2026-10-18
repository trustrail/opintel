# Create a New Key Packet

Source: https://xq.stoplight.io/docs/xqmsg/a593767490467-create-a-new-key-packet

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1packet/post`

## Endpoint

`POST https://subscription.xqmsg.net/v2/packet`

Takes the secret key that a user wants to protect along with a list of the people that are allowed to access it, and creates a new encrypted packet ready to be submitted to the key server.

The main purpose of this step is to validate the users credentials. Once validated, a short-lived encrypted packet containing the same information is created and returned to the user.

In order to complete the submission, the user will need to send the packet they receive to key server. After doing that, they will receive a locator token that can be used by them (or the recipients they listed) to retrieve the secret key.

**Note that you must have a compatible XQ licensing plan for the packet type you specify. For example, a forms plan is required to submit a "forms" packet. More information about our plans is available [here](https://manage.xqmsg.com/pricing).**

**Required API Key Scope:** packet

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "3428f2392030e",
  "method": "post",
  "path": "/packet",
  "tags": [
    {
      "id": "c44a9fee156da",
      "name": "Key Management"
    }
  ],
  "extensions": {},
  "iid": "post-packet",
  "description": "Takes the secret key that a user wants to protect along with a list of the people that are allowed to access it, and creates a new encrypted packet ready to be submitted to the key server.\n\nThe main purpose of this step is to validate the users credentials. Once validated, a short-lived encrypted packet containing the same information is created and returned to the user.\n\nIn order to complete the submission, the user will need to send the packet they receive to key server. After doing that, they will receive a locator token that can be used by them (or the recipients they listed) to retrieve the secret key.\n\n**Note that you must have a compatible XQ licensing plan for the packet type you specify. For example, a forms plan is required to submit a \"forms\" packet. More information about our plans is available [here](https://manage.xqmsg.com/pricing).**\n\n**Required API Key Scope:** packet",
  "summary": "Create a New Key Packet",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "d2610d172c774",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "d12c25f95ae96",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {},
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "e38ce8511ab15"
            }
          }
        }
      ],
      "description": "OK - Returns the encrypted packet. This should be sent to the key server as soon as it is received."
    },
    {
      "id": "d5010c746397a",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request"
    },
    {
      "id": "d5110c7463f35",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "d4f10c74638cf",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "6eb10cc2e6206",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "body": {
      "id": "67a1f16950139",
      "contents": [
        {
          "id": "972937848b459",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
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
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "f97fa76d790bd"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "90e0a3c449446",
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
            "id": "5aff0971ed059"
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
  ]
}
```
