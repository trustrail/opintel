# KeyManagement

Source: https://xq.stoplight.io/docs/xqmsg/2e0e59ba7dfee-key-management

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Subscription.json/components/schemas/KeyManagement`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "title": "KeyManagement",
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "description": "The secret key that the user wants to protect."
    },
    "recipients": {
      "type": "string",
      "description": "A comma-delimited list of recipients who are allowed to access the key."
    },
    "expires": {
      "description": "The number of hours that this key will remain valid for. After this time, it will no longer be accessible.",
      "type": "integer"
    },
    "dor": {
      "type": "boolean",
      "description": "Delete on Read. If this is set to true, a recipient will only be able to read a message once.",
      "default": false
    },
    "type": {
      "type": [
        "number",
        "string"
      ],
      "enum": [
        1,
        2,
        3,
        4,
        5,
        "\"file\"",
        "\"msg\"",
        "\"chat\"",
        "\"form\"",
        "\"data\""
      ],
      "default": 5,
      "description": "A value indicating the type of data that is being encrypted. Values are 1 = “file”, 2 = “msg”, 3 = “chat”, 4 = “form”, 5  “data”"
    },
    "meta": {
      "type": "object",
      "description": "Any additional meta information about the key."
    },
    "fence": {
      "type": "array",
      "description": "An array or comma-delimited list of IP addresses that this key will be accessible from. By default, the key will be retrievable from any address.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "key",
    "recipients",
    "expires",
    "type"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
