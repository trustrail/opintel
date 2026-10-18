# UpdateSubscriptionRequestBody

Source: https://xq.stoplight.io/docs/xqmsg/fbb7eced4f57c-update-subscription-request-body

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/UpdateSubscriptionRequestBody`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "required": [
    "plan"
  ],
  "properties": {
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
      "description": "The number of user to provision for the subscription",
      "examples": [
        85
      ]
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
