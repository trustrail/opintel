# CreateTrustedRangeBody

Source: https://xq.stoplight.io/docs/xqmsg/b0e72c0a445ee-create-trusted-range-body

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/CreateTrustedRangeRequestBody`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "title": "CreateTrustedRangeBody",
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
