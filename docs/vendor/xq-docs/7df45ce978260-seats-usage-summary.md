# SeatsUsageSummary

Source: https://xq.stoplight.io/docs/xqmsg/7df45ce978260-seats-usage-summary

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/SeatsUsageSummary`

Number of seats used/available for a business

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "description": "Number of seats used/available for a business",
  "required": [
    "plan",
    "overflow",
    "used"
  ],
  "properties": {
    "plan": {
      "type": "integer",
      "description": "Number of regular seats in plan"
    },
    "overflow": {
      "type": "integer",
      "description": "Number of overflow seats available"
    },
    "used": {
      "type": "integer",
      "description": "Total number of seats in used (regular and overflow)"
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
