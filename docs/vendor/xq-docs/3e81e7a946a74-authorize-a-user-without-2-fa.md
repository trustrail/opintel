# Authorize a User Without 2FA

Source: https://xq.stoplight.io/docs/xqmsg/3e81e7a946a74-authorize-a-user-without-2-fa

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1authorizealias/post`

## Endpoint

`POST https://subscription.xqmsg.net/v2/authorizealias`

This restricted endpoint allows a user to immediately authorize an access token for a particular email address or telephone number. It should only be considered in situations wher 2FA is problematic/unecessary, such as IoT devices or trusted applications that have a different method for authenticating user information.

If successful, the user will receive an access token without needing 2 factor authentication.

**Note:** This method only works for new email addresses/phone numbers that are not registered with XQ. If a previously registered account is used, an error will be returned.

**Required API Key Scope:** authorizealias

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "92e28871ce359",
  "method": "post",
  "path": "/authorizealias",
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
  "iid": "post-authorizealias",
  "description": "This restricted endpoint allows a user to immediately authorize an access token for a particular email address or telephone number. It should only be considered in situations wher 2FA is problematic/unecessary, such as IoT devices or trusted applications that have a different method for authenticating user information.\n\nIf successful, the user will receive an access token without needing 2 factor authentication.\n\n**Note:** This method only works for new email addresses/phone numbers that are not registered with XQ. If a previously registered account is used, an error will be returned.\n\n**Required API Key Scope:** authorizealias",
  "summary": "Authorize a User Without 2FA",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "b534792971fbf",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "99f70da4019a7",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "": {
                "type": "string",
                "description": "The new access token."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "96ec51c0aec9a"
            }
          }
        }
      ],
      "description": "OK - Returns a new user access token."
    },
    {
      "id": "dd547aef1a4a8",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request - Usually received when required parameters are not provided. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "dd647aef1a61f",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized - Usually received when an invalid API key is provided. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "dd447aef1a375",
      "code": "403",
      "headers": [],
      "contents": [],
      "description": "Forbidden -Usually caused by using an API key that does not have the required scope, or an invalid token. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "dce47aef19887",
      "code": "409",
      "headers": [],
      "contents": [],
      "description": "Conflict - This is returned if the address is already registered."
    },
    {
      "id": "47047b436ab41",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error - Something unexpected went wrong. The reason for failure is provided in the response's JSON encoded body."
    }
  ],
  "request": {
    "body": {
      "id": "01d34e42f021d",
      "contents": [
        {
          "id": "e881c93aee0ef",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "user": {
                "type": "string",
                "description": "Email of the user to be validated."
              },
              "firstName": {
                "type": "string",
                "description": "First name of the user."
              },
              "lastName": {
                "type": "string",
                "description": "Last name of the user."
              }
            },
            "required": [
              "user"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "597d0053e3078"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "006abd4c2646f",
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
            "id": "76b01a8e5db47"
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
