# Subscription

Source: https://xq.stoplight.io/docs/xqmsg/aa6d8de4fa5b2-subscription

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_service` · Source URI: `/reference/Subscription.json`

This API is used for all services related to user subscription.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "undefined",
  "version": "2.0",
  "name": "Subscription",
  "description": "This API is used for all services related to user subscription.",
  "termsOfService": "https://xqmsg.co/terms",
  "contact": {
    "url": "https://xqmsg.co/contact-us",
    "email": "support@xqmsg.com",
    "name": "Support"
  },
  "extensions": {},
  "infoExtensions": {},
  "license": {
    "name": "Copyright (c) XQ Message Inc. 2019-2022. All Rights Reserved.",
    "identifier": ""
  },
  "servers": [
    {
      "id": "4f26feac86d96",
      "url": "https://subscription.xqmsg.net/v2",
      "name": "Subscription"
    }
  ],
  "securitySchemes": [
    {
      "id": "488f99effa5fa",
      "key": "apiKey",
      "extensions": {},
      "description": "Required for almost every API call. Developers may provision their own keys from the XQ Dashboard.",
      "type": "apiKey",
      "name": "api-key",
      "in": "header"
    },
    {
      "id": "4d4c30164e089",
      "key": "accessToken",
      "extensions": {},
      "description": "This is a bearer token required to make most XQ API calls. To get one, a user must request access, upon which they get a pre-auth token. After they confirm their account, they will send the pre-auth token to the server in return for an access token.",
      "type": "http",
      "scheme": "bearer"
    },
    {
      "id": "ea521f6628a35",
      "key": "pre-authToken",
      "extensions": {},
      "description": "This is a token that is returned after an initial request for access. It can only be exchanged for an actual access token, and cannot be used to make any other API calls.",
      "type": "http",
      "scheme": "bearer"
    }
  ]
}
```
