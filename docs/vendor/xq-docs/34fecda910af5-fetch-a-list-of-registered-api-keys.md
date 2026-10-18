# Fetch a list of registered API keys

Source: https://xq.stoplight.io/docs/xqmsg/34fecda910af5-fetch-a-list-of-registered-api-keys

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1apikey/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/apikey`

Get a list of API key records registered. Note that this does not return the actual API key. The API key is only shown at the time of creation, and cannot be recovered.

**Required Scopes:** read:apikey


## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "a24dbd8de1214",
  "method": "get",
  "path": "/apikey",
  "tags": [
    {
      "id": "3c5ba08f9b0d1",
      "name": "API Keys"
    }
  ],
  "extensions": {},
  "iid": "GetAPIKeys",
  "description": "Get a list of API key records registered. Note that this does not return the actual API key. The API key is only shown at the time of creation, and cannot be recovered.\n\n**Required Scopes:** read:apikey\n",
  "summary": "Fetch a list of registered API keys",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "f82da8e82b4ba",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "582ee6c2d2c26",
          "mediaType": "application/json",
          "examples": [],
          "encodings": [],
          "schema": {
            "allOf": [
              {
                "$ref": "#/__bundled__/BaseResponse"
              },
              {
                "type": "object",
                "properties": {
                  "keys": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "description": "A list of discovered API keys.",
                      "properties": {
                        "id": {
                          "description": "The API key ID",
                          "type": "integer"
                        },
                        "app": {
                          "description": "The ID of the application that the key is allowed to access.",
                          "type": "integer"
                        },
                        "name": {
                          "type": "string",
                          "description": "The name of this API key."
                        },
                        "plat": {
                          "type": "string",
                          "description": "The client platform that the key is registered to."
                        },
                        "hash": {
                          "type": "string",
                          "description": "A hash of the API key. The actual key should be saved by the developer, and is not retrievable."
                        },
                        "fence": {
                          "type": "string",
                          "description": "A single or range of IPs from where this key will be usable. Leaving this blank will allow the API key to be used from any location."
                        },
                        "api": {
                          "type": "integer",
                          "description": "The API type that this key represents ( 1 = General, 2 = Dashboard, 3 = Secure Forms )."
                        },
                        "recipients": {
                          "description": "Valid for SecureForm keys only. A list of recipient email addresses which are authorized to read the form.",
                          "type": "array",
                          "items": {
                            "type": "string"
                          }
                        },
                        "redirectURL": {
                          "type": "string",
                          "description": "URL of the page to which user would like to redirect users after successful form Submission."
                        },
                        "owner": {
                          "type": "string",
                          "description": "Valid for SecureForm keys only. The email address of a validated team administrator that will be tagged as the form sender."
                        },
                        "responses": {
                          "type": "integer",
                          "description": "Valid for SecureForm keys only. The number of times that a form has been submitted with this API key."
                        }
                      }
                    }
                  }
                },
                "required": [
                  "keys"
                ]
              }
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "2d7e904a54f1c"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "e4ac1ef6de1d0",
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
            "id": "e34ff65693b0e"
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
    "query": [
      {
        "id": "c010a3e662043",
        "name": "app",
        "style": "form",
        "examples": [],
        "description": "Optionally provide an id of a developer application to filter by.",
        "schema": {
          "type": "integer",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "54bc7e3aba449"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description"
        ]
      }
    ],
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
  ],
  "__bundled__": {
    "BaseResponse": {
      "description": "",
      "type": "object",
      "properties": {
        "status": {
          "description": "\"OK\" if the response was successful, otherwise it describes the error that occurred",
          "type": "string"
        }
      },
      "required": [
        "status"
      ]
    }
  }
}
```
