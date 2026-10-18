# Request Access For a User

Source: https://xq.stoplight.io/docs/xqmsg/c290077aff9fd-request-access-for-a-user

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1authorize/post`

## Endpoint

`POST https://subscription.xqmsg.net/v2/authorize`

This endpoint allows a user to request an access token for a particular email address or telephone number.
If successful, the service itself will return a pre-authorization token that can be exchanged
for a full access token after validation is complete.
The user will also receive an email containing:
   1. validation PIN - a two-factor authentication token used as input for the [`CodeValidator`](Subscription.json/paths/~1codevalidation/get) service
   2. validation Link - a two-factor authentication token used as input for the [`ExchangeForAccessToken`](Subscription.json/paths/~1exchange/get) service
The user can then choose to either click the link to complete the process or use the PIN.
The pin serves as the input parameter of the [`CodeValidator`](Subscription.json/paths/~1codevalidation/get) service

**Required API Key Scope:** authorize

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "1140636445517",
  "method": "post",
  "path": "/authorize",
  "tags": [
    {
      "id": "cd921f766d315",
      "name": "User Management"
    },
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "post-authorize",
  "description": "This endpoint allows a user to request an access token for a particular email address or telephone number.\nIf successful, the service itself will return a pre-authorization token that can be exchanged\nfor a full access token after validation is complete.\nThe user will also receive an email containing:\n   1. validation PIN - a two-factor authentication token used as input for the [`CodeValidator`](Subscription.json/paths/~1codevalidation/get) service\n   2. validation Link - a two-factor authentication token used as input for the [`ExchangeForAccessToken`](Subscription.json/paths/~1exchange/get) service\nThe user can then choose to either click the link to complete the process or use the PIN.\nThe pin serves as the input parameter of the [`CodeValidator`](Subscription.json/paths/~1codevalidation/get) service\n\n**Required API Key Scope:** authorize",
  "summary": "Request Access For a User",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "de77753fe3c16",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "a726a750d7e3e",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "": {
                "type": "string",
                "description": "The pre-auth token."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "c683d2413f10b"
            }
          }
        }
      ],
      "description": "OK - Returns a pre-authorization token. Once the account is confirmed, this can be exchanged for an access token.\n\n**Required API Key Scope:** authorize"
    },
    {
      "id": "111774b433bfc",
      "code": "400",
      "headers": [],
      "contents": [
        {
          "id": "b677352f781d3",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "status": {
                "type": "string"
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "3b676289b5e1b"
            }
          }
        }
      ],
      "description": "Bad Request - Usually received when required parameters are not provided. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "112774b433db3",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized - Usually received when an invalid API key is provided. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "110774b433909",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden - Usually caused by using an API key that does not have the required scope, or an invalid token. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "aac77502b6d45",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error - Something unexpected went wrong. The reason for failure is provided in the response's JSON encoded body."
    }
  ],
  "request": {
    "body": {
      "id": "e3222178cf2ee",
      "contents": [
        {
          "id": "c8f987777ef50",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "title": "User",
            "type": "object",
            "description": "",
            "examples": [],
            "properties": {
              "user": {
                "type": "string",
                "description": "The email address or phone number of the account to validate. A confirmation link or code will be sent to this address or number.",
                "default": "test@example.com"
              },
              "firstName": {
                "type": "string",
                "description": "The first name of the user."
              },
              "lastName": {
                "type": "string",
                "description": "The last name of the user."
              },
              "newsletter": {
                "type": "boolean",
                "description": "Should this user receive newsletters or not? This is only valid for new users, and is ignored if the user already exists.",
                "default": false
              },
              "notifications": {
                "type": "integer",
                "description": "Specifies the notifications that the user should receive ( 0 = No Notifications, 1 = Receive Usage Reports, 2 = Receive Tutorials, 3 = Receive Both )",
                "minimum": 0,
                "maximum": 3,
                "default": 0
              }
            },
            "required": [
              "user"
            ],
            "x-internal": false,
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "64592aa729862"
            }
          }
        }
      ],
      "description": "Note that only the user field is required. All other fields are optional and can safely be left out of the request."
    },
    "headers": [
      {
        "id": "6d4cde13b4ef4",
        "name": "Content-Type",
        "style": "simple",
        "examples": [],
        "description": "This request contains a JSON body.",
        "required": true,
        "schema": {
          "type": "string",
          "default": "application/json",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "fe0a7251e1281"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "required",
          "name",
          "description"
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
