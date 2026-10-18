# UpdateTrustedRangeBody

Source: https://xq.stoplight.io/docs/xqmsg/a58e283f5fa4d-update-trusted-range-body

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/UpdateTrustedRangeBody`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "title": "UpdateTrustedRangeBody",
  "type": "object",
  "properties": {
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
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
