# Complete a password reset request

Source: https://xq.stoplight.io/docs/xqmsg/e094cf49f6477-complete-a-password-reset-request

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1reset/patch`

## Endpoint

`PATCH https://dashboard.xqmsg.net/v2/reset`

```
curl --request PATCH \
  --url https://dashboard.xqmsg.net/v2/reset \
  --header 'api-key: YOUR_API_KEY' \
  --header 'content-type: application/json' \
  --data '{
	"uid" : USER_ID,
	"code" : "VERIFICATION_CODE",
	"pwd" : "NEW_PASSWORD"
}'
```

Completes the password reset operation. It takes the validation code sent in the confirmation email, along with the new user password, and updates the credentials. 

A new access token is returned, and all existing ones will be invalid from that point on.

**Required Scopes: ** reset

**Webhook Event: ** completereset

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "c2904a1386abc",
  "method": "patch",
  "path": "/reset",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "patch-reset",
  "description": "```\ncurl --request PATCH \\\n  --url https://dashboard.xqmsg.net/v2/reset \\\n  --header 'api-key: YOUR_API_KEY' \\\n  --header 'content-type: application/json' \\\n  --data '{\n\t\"uid\" : USER_ID,\n\t\"code\" : \"VERIFICATION_CODE\",\n\t\"pwd\" : \"NEW_PASSWORD\"\n}'\n```\n\nCompletes the password reset operation. It takes the validation code sent in the confirmation email, along with the new user password, and updates the credentials. \n\nA new access token is returned, and all existing ones will be invalid from that point on.\n\n**Required Scopes: ** reset\n\n**Webhook Event: ** completereset",
  "summary": "Complete a password reset request",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "733d013f02d0c",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "cdca3764eb63a",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "string",
            "description": "An updated access token.",
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "fc7010602c641"
            }
          }
        }
      ],
      "description": "OK - Returns a new access token."
    }
  ],
  "request": {
    "body": {
      "id": "bc5e86de718e4",
      "contents": [
        {
          "id": "0c593a0608d14",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "uid": {
                "type": "integer",
                "description": "The user ID. Provided in the confirmation email that the user received."
              },
              "code": {
                "type": "string",
                "description": "The verification code. Provided in confirmation email."
              },
              "pwd": {
                "type": "string",
                "description": "The new account password that the user chooses."
              }
            },
            "required": [
              "uid",
              "code",
              "pwd"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "804dc214898ab"
            }
          }
        }
      ]
    },
    "headers": [],
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
