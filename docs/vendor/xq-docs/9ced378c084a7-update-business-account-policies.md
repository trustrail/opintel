# Update business account policies

Source: https://xq.stoplight.io/docs/xqmsg/9ced378c084a7-update-business-account-policies

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1policy/patch`

## Endpoint

`PATCH https://dashboard.xqmsg.net/v2/policy`

```
--header 'api-key: YOUR_API_KEY' \
curl --request PATCH \
  --url https://dashboard.xqmsg.net/v2/policy \
    --header 'authorization: Bearer YOUR_ACCESS_TOKEN' \
  --header 'content-type: application/json' \
  --data '{
	"policy": [ { "category": 2, "item": 1, "active": false } ]
}'
```

Updates policies associated with this business. These can be used to create client configurations based off of their organizations' dashboard policies.

**Required Scopes: ** write:policy

**Webhook Event: ** updatepolicy



## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "0bd586a740aba",
  "method": "patch",
  "path": "/policy",
  "tags": [
    {
      "id": "410306b1291b9",
      "name": "Policy"
    }
  ],
  "extensions": {},
  "iid": "patch-policy",
  "description": "```\n--header 'api-key: YOUR_API_KEY' \\\ncurl --request PATCH \\\n  --url https://dashboard.xqmsg.net/v2/policy \\\n    --header 'authorization: Bearer YOUR_ACCESS_TOKEN' \\\n  --header 'content-type: application/json' \\\n  --data '{\n\t\"policy\": [ { \"category\": 2, \"item\": 1, \"active\": false } ]\n}'\n```\n\nUpdates policies associated with this business. These can be used to create client configurations based off of their organizations' dashboard policies.\n\n**Required Scopes: ** write:policy\n\n**Webhook Event: ** updatepolicy\n\n",
  "summary": "Update business account policies",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "564188d539bd7",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - The policy update succeeded."
    }
  ],
  "request": {
    "body": {
      "id": "566354b846244",
      "contents": [
        {
          "id": "7517ced5eab1e",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "policy": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "category": {
                      "type": "integer",
                      "description": "The application category."
                    },
                    "item": {
                      "type": "integer",
                      "description": "The item in the category that this policy is targeting."
                    },
                    "active": {
                      "type": "boolean",
                      "description": "Is this policy active or not?"
                    }
                  },
                  "required": [
                    "category",
                    "item",
                    "active"
                  ]
                }
              }
            },
            "required": [
              "policy"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "e0f1ed7f6ac7f"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "f7e7222e7dd99",
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
            "id": "eed5854abe659"
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
  ]
}
```
