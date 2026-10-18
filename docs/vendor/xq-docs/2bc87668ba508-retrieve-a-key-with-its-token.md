# Retrieve a Key With Its Token

Source: https://xq.stoplight.io/docs/xqmsg/2bc87668ba508-retrieve-a-key-with-its-token

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Validation.json/paths/~1key~1{Locator}/get`

## Endpoint

`GET https://validation.xqmsg.net/v2/key/{Locator}`

This endpoint fetches the key associated with the token provided.

The key will only be returned if the following hold true:

- The access token of the requesting user is valid and unexpired.
- The expiration time specified for the key has not elapsed.
- The person requesting the key was listed as a valid recipient by the sender.
- The key is either not geofenced, or is being accessed from an authorized location.
If any of these is not true, an error will be returned instead.

**Required API Key Scope:** read:key

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "bcd5fb9612757",
  "method": "get",
  "path": "/key/{Locator}",
  "tags": [
    {
      "id": "b54d1d49b4783",
      "name": "KeyManagement"
    }
  ],
  "extensions": {},
  "iid": "get-key",
  "description": "This endpoint fetches the key associated with the token provided.\n\nThe key will only be returned if the following hold true:\n\n- The access token of the requesting user is valid and unexpired.\n- The expiration time specified for the key has not elapsed.\n- The person requesting the key was listed as a valid recipient by the sender.\n- The key is either not geofenced, or is being accessed from an authorized location.\nIf any of these is not true, an error will be returned instead.\n\n**Required API Key Scope:** read:key",
  "summary": "Retrieve a Key With Its Token",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "c73e921a7adad",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "4d33151aff3f1",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "string",
            "description": "The secret key referenced by the submitted token.",
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "eb47aaeb04162"
            }
          }
        }
      ],
      "description": "OK - Returns the requested secret data."
    },
    {
      "id": "c49e92bd44b9b",
      "code": "400",
      "headers": [],
      "contents": [],
      "description": "Bad Request"
    },
    {
      "id": "c45e92bd434a7",
      "code": "404",
      "headers": [],
      "contents": [],
      "description": "Not Found"
    },
    {
      "id": "fcfe92bd75512",
      "code": "410",
      "headers": [],
      "contents": [],
      "description": "Gone"
    },
    {
      "id": "f64e92fa6d4fa",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error"
    }
  ],
  "request": {
    "headers": [
      {
        "id": "96ac79cf16e25",
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
            "id": "33aebcea67cc0"
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
    "path": [
      {
        "id": "5b639b48422b6",
        "name": "Locator",
        "style": "simple",
        "examples": [],
        "description": "A URL encoded version of the key locator token ( the token received after adding a key packet).",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "48fe906024ea5"
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
