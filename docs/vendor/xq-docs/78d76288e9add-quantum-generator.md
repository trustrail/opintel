# Quantum Generator

Source: https://xq.stoplight.io/docs/xqmsg/78d76288e9add-quantum-generator

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Quantum.json/paths/~1/get`

## Endpoint

`GET https://quantum.xqmsg.net//`

Fetches quantum entropy from the server. When the user makes the request, they must include the number of entropy bits to fetch.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "588efafda9946",
  "method": "get",
  "path": "/",
  "tags": [
    {
      "id": "a3e58072b0e31",
      "name": "Generate"
    }
  ],
  "extensions": {},
  "iid": "get-?ks",
  "description": "Fetches quantum entropy from the server. When the user makes the request, they must include the number of entropy bits to fetch.",
  "summary": "Quantum Generator",
  "securityDeclarationType": "inheritedFromService",
  "responses": [
    {
      "id": "adc5e0a6a2a05",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "fe1299b49df19",
          "mediaType": "text/plain",
          "examples": [],
          "encodings": [],
          "schema": {
            "type": "object",
            "properties": {
              "data": {
                "type": "string"
              }
            },
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "249e07cededcc"
            }
          }
        }
      ],
      "description": "OK"
    }
  ],
  "request": {
    "headers": [],
    "query": [
      {
        "id": "edd2d7af0b57f",
        "name": "ks",
        "style": "form",
        "examples": [],
        "description": "The number of entropy bits to fetch. Value will be returned as a base64-encoded hex string.",
        "required": true,
        "schema": {
          "type": "integer",
          "minimum": 1,
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "70f3ceff8b1aa"
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
    "cookie": [],
    "path": []
  },
  "security": [],
  "servers": [
    {
      "id": "672150f96b007",
      "url": "https://quantum.xqmsg.net/",
      "name": "Quantum"
    }
  ]
}
```
