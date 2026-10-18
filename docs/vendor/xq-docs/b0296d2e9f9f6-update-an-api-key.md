# Update an API Key

Source: https://xq.stoplight.io/docs/xqmsg/b0296d2e9f9f6-update-an-api-key

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1apikey~1{keyId}/patch`

## Endpoint

`PATCH https://dashboard.xqmsg.net/v2/apikey/{keyId}`

Updates the name, geofence and/or recipients (SecureForm keys only) properties of an API key. 

**Required Scopes:** write:apikey

**Webhook Event:** updateapikey

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "9de5c547cdd7a",
  "method": "patch",
  "path": "/apikey/{keyId}",
  "tags": [
    {
      "id": "3c5ba08f9b0d1",
      "name": "API Keys"
    }
  ],
  "extensions": {},
  "iid": "UpdateApiKey",
  "description": "Updates the name, geofence and/or recipients (SecureForm keys only) properties of an API key. \n\n**Required Scopes:** write:apikey\n\n**Webhook Event:** updateapikey",
  "summary": "Update an API Key",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "10ddf764e72a4",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - Key was removed successfully."
    }
  ],
  "request": {
    "body": {
      "id": "f10d47be527d1",
      "contents": [
        {
          "id": "679f45cb0b3b7",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string",
                "description": "The updated name of this API key."
              },
              "fence": {
                "type": "string",
                "description": "The updated space-delimited list of address that use of this key will be restricted to."
              },
              "recipients": {
                "type": "array",
                "description": "For SecureForm keys only. A list of email addresses that are authorized to read encrypted forms.",
                "items": {
                  "type": "string"
                }
              },
              "redirectURL": {
                "type": "string",
                "description": "URL of the page to which user would like to redirect after successful form Submission."
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "525158eb46a67"
            }
          }
        }
      ]
    },
    "headers": [],
    "query": [],
    "cookie": [],
    "path": [
      {
        "id": "3f16ca5c672b2",
        "name": "keyId",
        "style": "simple",
        "examples": [],
        "description": "The ID of the API key to use in this request.",
        "required": true,
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "3b6683061a472"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "required",
          "description"
        ]
      }
    ]
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
