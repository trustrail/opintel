# Validation

Source: https://xq.stoplight.io/docs/xqmsg/eebfb7f9fc3ca-validation

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_service` · Source URI: `/reference/Validation.json`

All services related to validation

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "undefined",
  "version": "2.0",
  "name": "Validation",
  "description": "All services related to validation",
  "termsOfService": "https://xqmsg.co/terms",
  "contact": {
    "name": "Support",
    "url": "https://xqmsg.co/contact-us",
    "email": "support@xqmsg.com"
  },
  "extensions": {},
  "infoExtensions": {},
  "license": {
    "name": "Copyright (c) XQ Message Inc. 2019-2022. All Rights Reserved.",
    "identifier": ""
  },
  "servers": [
    {
      "id": "2ee50d3997cac",
      "url": "https://validation.xqmsg.net/v2",
      "name": "Validation"
    }
  ],
  "securitySchemes": [
    {
      "id": "488f99effa5fa",
      "key": "apiKey",
      "extensions": {},
      "description": "Required for almost every API call. Developers may provision their own keys from the XQ dashboard.",
      "type": "apiKey",
      "name": "api-key",
      "in": "header"
    },
    {
      "id": "4d4c30164e089",
      "key": "accessToken",
      "extensions": {},
      "description": "This is a bearer token required to make most XQ API calls. To get one, a user must first request access, upon which they get a pre-auth token. After they confirm their account, they will send the pre-auth token to the server in return for an access token.",
      "type": "http",
      "scheme": "bearer"
    }
  ]
}
```
