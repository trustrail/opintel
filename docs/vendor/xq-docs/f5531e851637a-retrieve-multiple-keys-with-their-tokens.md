# Retrieve Multiple Keys With Their Tokens

Source: https://xq.stoplight.io/docs/xqmsg/f5531e851637a-retrieve-multiple-keys-with-their-tokens

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Validation.json/paths/~1keys/post`

## Endpoint

`POST https://validation.xqmsg.net/v2/keys`

Fetches several keys in a single request, given a list of locator tokens.

This is the bulk counterpart to [`/key/{Locator}`](../reference/Validation.json/paths/~1key~1{Locator}/get). Use it when decrypting a set of records that were stored together, so that N keys cost one round trip rather than N.

The request body is a **bare JSON array** of locator tokens, not an object wrapping them.

The same access rules as the single key endpoint apply to every token individually — the caller must be a listed recipient, the packet must not have expired or been revoked, and any geofence must be satisfied.

**Tokens that fail those checks are omitted from the response rather than reported as errors.** A successful response can therefore contain fewer keys than you requested, with no failure signal. Compare the returned count against the number of tokens you sent.

**Required API Key Scope:** read:key

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "2ed183892c75c",
  "method": "post",
  "path": "/keys",
  "tags": [
    {
      "id": "b54d1d49b4783",
      "name": "KeyManagement"
    }
  ],
  "extensions": {},
  "iid": "post-keys",
  "description": "Fetches several keys in a single request, given a list of locator tokens.\n\nThis is the bulk counterpart to [`/key/{Locator}`](../reference/Validation.json/paths/~1key~1{Locator}/get). Use it when decrypting a set of records that were stored together, so that N keys cost one round trip rather than N.\n\nThe request body is a **bare JSON array** of locator tokens, not an object wrapping them.\n\nThe same access rules as the single key endpoint apply to every token individually — the caller must be a listed recipient, the packet must not have expired or been revoked, and any geofence must be satisfied.\n\n**Tokens that fail those checks are omitted from the response rather than reported as errors.** A successful response can therefore contain fewer keys than you requested, with no failure signal. Compare the returned count against the number of tokens you sent.\n\n**Required API Key Scope:** read:key",
  "summary": "Retrieve Multiple Keys With Their Tokens",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "5eb9e2d6cfc25",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "f1c5d6a2eef26",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "exported": {
                "type": "array",
                "description": "One single-entry object per retrievable key, in the form {\"<locatorToken>\": \"<key>\"}. Tokens the caller is not authorized for are absent.",
                "items": {
                  "type": "object"
                }
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "258a15effd9fd"
            }
          }
        }
      ],
      "description": "OK - Returns the keys the caller is authorized for. Each element is a single-entry object mapping a locator token to its key, so the list must be flattened into a token-to-key map on receipt."
    },
    {
      "id": "bed9e4b39ff39",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request"
    },
    {
      "id": "bec9e4b39f8ee",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized"
    },
    {
      "id": "bea9e4b39f440",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden"
    },
    {
      "id": "5b29e45f59a61",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "body": {
      "id": "652fe7597cbee",
      "contents": [
        {
          "id": "612f0b4c956a9",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "array",
            "description": "The locator tokens of the keys to retrieve.",
            "items": {
              "type": "string"
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "06145762ea39d"
            }
          }
        }
      ],
      "description": "A bare JSON array of locator tokens."
    },
    "headers": [
      {
        "id": "f236418b16c6c",
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
            "id": "d06c4b058b70d"
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
        "description": "Required for almost every API call. Developers may provision their own keys from the XQ dashboard.",
        "type": "apiKey",
        "name": "api-key",
        "in": "header"
      }
    ]
  ],
  "servers": [
    {
      "id": "2ee50d3997cac",
      "url": "https://validation.xqmsg.net/v2",
      "name": "Validation"
    }
  ]
}
```
