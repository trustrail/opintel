# Get the dashboard policies for a business

Source: https://xq.stoplight.io/docs/xqmsg/4f206ee19b36e-get-the-dashboard-policies-for-a-business

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1policy/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/policy`

Fetches all the policies associated with this business. These can be used to create client configurations based off of their organizations' dashboard policies.

**Required Scopes:** read:policy

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "e8493b52e23eb",
  "method": "get",
  "path": "/policy",
  "tags": [
    {
      "id": "410306b1291b9",
      "name": "Policy"
    }
  ],
  "extensions": {},
  "iid": "get-policy",
  "description": "Fetches all the policies associated with this business. These can be used to create client configurations based off of their organizations' dashboard policies.\n\n**Required Scopes:** read:policy",
  "summary": "Get the dashboard policies for a business",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "4f1e25c814c72",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "17aac8af3b8d2",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
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
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "b22a7f3e22740"
            }
          }
        }
      ],
      "description": "OK - Returns a JSON encoded list of available policies."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "3ceebe1913a55",
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
            "id": "5b8dc4fdf106d"
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
