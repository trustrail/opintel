# EventType

Source: https://xq.stoplight.io/docs/xqmsg/074bb0931250e-event-type

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/EventType`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "required": [
    "action",
    "title"
  ],
  "properties": {
    "action": {
      "type": "string",
      "description": "Identifier for the event. Typically in the format of saas://..."
    },
    "title": {
      "type": "string",
      "description": "The readable name of the event"
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
