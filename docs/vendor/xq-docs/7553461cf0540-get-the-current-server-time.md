# Get the Current Server Time

Source: https://xq.stoplight.io/docs/xqmsg/7553461cf0540-get-the-current-server-time

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Subscription.json/paths/~1time/get`

## Endpoint

`GET https://subscription.xqmsg.net/v2/time`

Returns the current server time as a Unix timestamp in seconds. The response body is a bare integer, not JSON.

This value is used as a replay guard in the payload sent to `/authorize/certificate/{cert_id}`. Fetch it immediately before building that payload and use it verbatim — a locally generated timestamp will be rejected if the device clock has drifted, and a cached value will be rejected as stale.

No bearer token is required on this call.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "a9fd8d78bf7ea",
  "method": "get",
  "path": "/time",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "get-time",
  "description": "Returns the current server time as a Unix timestamp in seconds. The response body is a bare integer, not JSON.\n\nThis value is used as a replay guard in the payload sent to `/authorize/certificate/{cert_id}`. Fetch it immediately before building that payload and use it verbatim — a locally generated timestamp will be rejected if the device clock has drifted, and a cached value will be rejected as stale.\n\nNo bearer token is required on this call.",
  "summary": "Get the Current Server Time",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "c48fcf51bc41e",
      "code": "200",
      "headers": [],
      "contents": [
        {
          "id": "b02e32dadd6df",
          "mediaType": "text/plain",
          "examples": [
            {
              "id": "72ac8a32747e9",
              "value": 1754300000,
              "key": "default"
            }
          ],
          "encodings": [],
          "schema": {
            "type": "integer",
            "description": "The current server time in seconds since the Unix epoch.",
            "examples": [
              1754300000
            ],
            "$schema": "http://json-schema.org/draft-07/schema#",
            "x-stoplight": {
              "id": "102a962899433"
            }
          }
        }
      ],
      "description": "OK - Returns the current server time in seconds since the Unix epoch."
    },
    {
      "id": "6c5fcd74fab15",
      "code": "401",
      "headers": [],
      "contents": [],
      "description": "Unauthorized - Usually received when an invalid API key is provided. The reason for failure is provided in the response's JSON encoded body."
    },
    {
      "id": "08bfcd20b35bc",
      "code": "500",
      "headers": [],
      "contents": [],
      "description": "Internal Server Error - Something unexpected went wrong. The reason for failure is provided in the response's JSON encoded body."
    }
  ],
  "request": {
    "headers": [],
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
