# HookSummary

Source: https://xq.stoplight.io/docs/xqmsg/7108c0b0b040c-hook-summary

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/HookSummary`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "required": [
    "id",
    "enabled",
    "url"
  ],
  "properties": {
    "id": {
      "type": "integer",
      "description": "The ID of the webhook."
    },
    "url": {
      "type": "string",
      "description": "Webhook URL"
    },
    "enabled": {
      "type": "boolean",
      "description": "Whether or not the webhook is enabled"
    },
    "app": {
      "type": "number",
      "description": "Application ID"
    },
    "events": {
      "type": "string",
      "description": "Events that the webhook is subscribed to"
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
