# Manage

Source: https://xq.stoplight.io/docs/xqmsg/a92720bfbb44a-manage

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_service` · Source URI: `/reference/Manage.yml`

The dashboard is used for managing XQ accounts organized into team workspaces. It supports key and usage monitoring, as well as  key export and restoration.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "undefined",
  "version": "2.0",
  "name": "Manage",
  "description": "The dashboard is used for managing XQ accounts organized into team workspaces. It supports key and usage monitoring, as well as  key export and restoration.",
  "termsOfService": "https://xqmsg.co/terms",
  "extensions": {},
  "infoExtensions": {},
  "tags": [
    {
      "id": "83d3d47040032",
      "name": "Contact Management",
      "description": "Services related to contact management."
    },
    {
      "id": "c44a9fee156da",
      "name": "Key Management",
      "description": "Services related to message key storage and retrieval."
    },
    {
      "id": "57393f13e0516",
      "name": "Communications",
      "description": "Services related to communication management"
    },
    {
      "id": "b9f97d4f05234",
      "name": "Authentication",
      "description": "Services related to user token authentication."
    },
    {
      "id": "8f23c60f522bc",
      "name": "Business",
      "description": "Services related to business/workspace management."
    },
    {
      "id": "88a89df982bac",
      "name": "Subscription",
      "description": "Services related to subscription management."
    },
    {
      "id": "4a39e9d5ac28c",
      "name": "Invoice",
      "description": "Services related to invoices"
    },
    {
      "id": "0fa554d1c680d",
      "name": "Pay Method",
      "description": "Services related to pay methods"
    },
    {
      "id": "410306b1291b9",
      "name": "Policy",
      "description": "Services related to policy management."
    },
    {
      "id": "2aee6436e4677",
      "name": "Images",
      "description": "Services related to user avatar and business icon management."
    },
    {
      "id": "3c5ba08f9b0d1",
      "name": "API Keys",
      "description": "Services related to API key management."
    },
    {
      "id": "8baff9068ed0f",
      "name": "Monitoring",
      "description": "Services related to log monitoring."
    },
    {
      "id": "15b231d4a5a13",
      "name": "Events",
      "description": "Services related to event notification."
    }
  ],
  "license": {
    "name": "Copyright (c) XQ Message Inc. 2019-2020. All Rights Reserved."
  },
  "servers": [
    {
      "id": "9c8a6f289ced5",
      "url": "https://dashboard.xqmsg.net/v2",
      "name": "Manage",
      "description": "production"
    }
  ],
  "securitySchemes": [
    {
      "id": "2d608b1d47097",
      "key": "API Key",
      "extensions": {},
      "description": "Required for almost every API call. Developers may provision their own keys from their dashboard account.",
      "type": "apiKey",
      "name": "api-key",
      "in": "header"
    },
    {
      "id": "62a551cdda9e8",
      "key": "Access Token",
      "extensions": {},
      "description": "This is a bearer token required to make most XQ API calls.",
      "type": "http",
      "scheme": "bearer"
    }
  ],
  "security": [
    []
  ]
}
```
