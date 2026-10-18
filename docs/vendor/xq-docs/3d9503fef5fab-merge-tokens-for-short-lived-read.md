# Merge Tokens for Short-Lived Read

Source: https://xq.stoplight.io/docs/xqmsg/3d9503fef5fab-merge-tokens-for-short-lived-read

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1combined/post`

## Endpoint

`POST https://subscription.xqmsg.net/v2/combined`

This endpoint is useful for merging two or more valid access tokens ( along with the access token used to make the call ) into a single one that can be used for temporary read access.

This is useful in situations where a user who has authenticated with multiple accounts wants to get a key for a particular message without needing to know exactly which of their accounts is a valid recipient. As long as one of the accounts in the merged token have access, they will be able to get the key.

The merged token has three restrictions:

1. It cannot be used to send messages
2. It can only be created from other valid access tokens.
3. It is only valid for a short amount of time.

**Required API Key Scope:** combine

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "74ca4f386fe64",
  "method": "post",
  "path": "/combined",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "post-combined",
  "description": "This endpoint is useful for merging two or more valid access tokens ( along with the access token used to make the call ) into a single one that can be used for temporary read access.\n\nThis is useful in situations where a user who has authenticated with multiple accounts wants to get a key for a particular message without needing to know exactly which of their accounts is a valid recipient. As long as one of the accounts in the merged token have access, they will be able to get the key.\n\nThe merged token has three restrictions:\n\n1. It cannot be used to send messages\n2. It can only be created from other valid access tokens.\n3. It is only valid for a short amount of time.\n\n**Required API Key Scope:** combine",
  "summary": "Merge Tokens for Short-Lived Read",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "d4fb30cac1954",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "c637a8cab1725",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "token": {
                "type": "string",
                "description": "The merged token."
              },
              "merged": {
                "type": "number",
                "description": "The number of tokens that were successfully merged into the token."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "d5e2b68d9f953"
            }
          }
        }
      ],
      "description": "OK - Returns the combined token that can be used for temporary read access only."
    },
    {
      "id": "d7ab3027f71d5",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized - Usually received when an invalid API key is provided. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "d78b3027f762f",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden -Usually caused by using an API key that does not have the required scope, or an invalid token. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "714b30767bde6",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error - Something unexpected went wrong. The reason for failure is provided in the response's JSON encoded body."
    }
  ],
  "request": {
    "body": {
      "id": "b84f90bc171de",
      "contents": [
        {
          "id": "69fce010522d8",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "tokens": {
                "type": "array",
                "description": "The list of tokens to merge.",
                "items": {
                  "type": "string"
                }
              }
            },
            "required": [
              "tokens"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "8680003b528eb"
            }
          }
        }
      ],
      "description": ""
    },
    "headers": [
      {
        "id": "a7dbb315c626c",
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
            "id": "65f224cc423d0"
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
