# ChartPoint

Source: https://xq.stoplight.io/docs/xqmsg/a8a20e03ccd07-chart-point

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/ChartPoint`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "type": "array",
  "items": {
    "anyOf": [
      {
        "type": "string"
      },
      {
        "type": "integer"
      }
    ]
  },
  "examples": [
    [
      "2020-09-29",
      1,
      23,
      22,
      0
    ]
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
