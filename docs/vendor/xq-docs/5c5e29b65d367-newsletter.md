# Newsletter

Source: https://xq.stoplight.io/docs/xqmsg/5c5e29b65d367-newsletter

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Subscription.json/components/schemas/Newsletter`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "title": "Newsletter",
  "type": "object",
  "properties": {
    "notifications": {
      "type": "integer",
      "description": "Specifies the notifications that the user should receive ( 0 = No Notifications, 1 = Receive Usage Reports, 2 = Receive Tutorials, 3 = Receive Both )",
      "minimum": 0,
      "maximum": 3
    },
    "newsletter": {
      "description": "Should this user receive newsletters or not? This is only valid for new users, and is ignored if the user already exists.",
      "type": "boolean"
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
