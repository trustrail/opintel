# TrustedRangeSummary

Source: https://xq.stoplight.io/docs/xqmsg/7b5293cc1e126-trusted-range-summary

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/TrustedRangeSummary`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "title": "TrustedRangeSummary",
  "type": "object",
  "properties": {
    "id": {
      "type": "integer"
    },
    "businessId": {
      "type": "integer",
      "description": "The ID of the workspace that this range belongs to."
    },
    "tag": {
      "type": "string",
      "description": "A tag name used to identify this range."
    },
    "fence": {
      "type": "string",
      "description": "A space delimited list of trusted IP addresses."
    },
    "channel": {
      "type": "integer",
      "maximum": 2,
      "minimum": 0
    },
    "secureKey": {
      "type": "string",
      "description": "The key used to secure the access token before sending it back to the client."
    }
  },
  "required": [
    "id",
    "businessId",
    "tag",
    "fence",
    "secureKey"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
