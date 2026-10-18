# BusinessSummary

Source: https://xq.stoplight.io/docs/xqmsg/1a6331e00ecb4-business-summary

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/BusinessSummary`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "integer",
      "description": "The ID of the business."
    },
    "name": {
      "type": "string",
      "description": "The name of the business."
    },
    "workspace": {
      "type": "string",
      "description": "The unique business workspace."
    },
    "email": {
      "type": "string",
      "description": "The primary business email address."
    },
    "phone": {
      "type": "string",
      "description": "The business telephone number."
    },
    "street": {
      "type": "string",
      "description": "The business street address."
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
    "postal": {
      "type": "string",
      "description": "The business zip code."
    },
    "tag": {
      "type": "string",
      "description": "The business tagline."
    },
    "locked": {
      "type": "boolean",
      "description": "Whether or not the business is locked. If it is locked, all keys are no longer accessible."
    },
    "isPersonal": {
      "type": "boolean",
      "description": "Whether or not this is a personal business"
    },
    "subscription": {
      "type": "object",
      "required": [
        "plan",
        "status"
      ],
      "properties": {
        "graceExpires": {
          "type": "integer",
          "description": "The date in milliseconds that the grace period will expire."
        },
        "overflow": {
          "type": "integer",
          "description": "The number of seats that are currently in overflow."
        },
        "overflowTime": {
          "type": "integer",
          "description": "The date in milliseconds that that the first seat in overflow started."
        },
        "plan": {
          "type": "integer",
          "enum": [
            0,
            1,
            2
          ],
          "description": "Type of subscription plan: `0` - Free Tier, `1` - Paid, `2` - Enterprise\n"
        },
        "seats": {
          "type": "integer",
          "description": "The number of seats that are allowed under this plan."
        },
        "status": {
          "type": "integer",
          "enum": [
            0,
            1
          ],
          "description": "The status of the subscription plan: `0` - Current, `1` - Payment Failure,\n"
        },
        "reason": {
          "type": "string",
          "description": "More information about why a payment failed"
        },
        "renewalDate": {
          "type": "integer",
          "description": "The date in milliseconds that the subscription will be renewed (if applicable)"
        }
      }
    },
    "icon": {
      "type": "string",
      "description": "Public image icon for this business ( if one is available )."
    }
  },
  "required": [
    "id",
    "name",
    "workspace",
    "email",
    "locked",
    "isPersonal",
    "subscription",
    "icon"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
