# Register a new business

Source: https://xq.stoplight.io/docs/xqmsg/fb1fd23394522-register-a-new-business

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1business/post`

## Endpoint

`POST https://dashboard.xqmsg.net/v2/business`

Create a new business. The workspace must be unique, unless registration will fail. If an access token is provided, it will log the user in to the new workspace automatically and return the new access token.

** Required Scopes: ** write:business
**Webhook Event: ** registerbusiness

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "c6db6b7e9d781",
  "method": "post",
  "path": "/business",
  "tags": [
    {
      "id": "8f23c60f522bc",
      "name": "Business"
    }
  ],
  "extensions": {},
  "iid": "CreateBusiness",
  "description": "Create a new business. The workspace must be unique, unless registration will fail. If an access token is provided, it will log the user in to the new workspace automatically and return the new access token.\n\n** Required Scopes: ** write:business\n**Webhook Event: ** registerbusiness",
  "summary": "Register a new business",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "ac7266c55d55d",
      "code": "200",
      "headers": [],
      "contents": [],
      "description": "OK - Returns a new access token."
    }
  ],
  "request": {
    "body": {
      "id": "3cf48c7988fc2",
      "contents": [
        {
          "id": "bd73c2776e76f",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "properties": {
              "email": {
                "type": "string",
                "description": "The main business email address"
              },
              "workspace": {
                "type": "string",
                "description": "The desired workspace for this business. Must be unique."
              },
              "name": {
                "type": "string",
                "description": "The full name of this business."
              },
              "aemail": {
                "type": "string",
                "description": "The email for the main administrator of this business. May be the same as the business email."
              },
              "afirst": {
                "type": "string",
                "description": "The first name of the main administrator"
              },
              "alast": {
                "type": "string",
                "description": "The last name of the main administrator"
              },
              "street": {
                "type": "string",
                "description": "The street address of the business."
              },
              "city": {
                "type": "string",
                "description": "The business city."
              },
              "state": {
                "type": "string",
                "description": "The business state."
              },
              "country": {
                "type": "string",
                "description": "The business country."
              },
              "telephone": {
                "type": "string",
                "description": "The business telephone number."
              },
              "postal": {
                "type": "string",
                "description": "The zip code of the business."
              },
              "tag": {
                "type": "string",
                "description": "A short business tagline."
              },
              "convertFromExisting": {
                "type": "boolean",
                "description": "Whether or not to convert the existing dashboard into the newly created dashboard. This will copy over all the contacts and data and then delete the old dashboard."
              }
            },
            "required": [
              "email",
              "workspace",
              "name",
              "aemail"
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "33aae2d777a5d"
            }
          }
        }
      ]
    },
    "headers": [
      {
        "id": "90700a8e9bee6",
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
            "id": "b66baf302958e"
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
