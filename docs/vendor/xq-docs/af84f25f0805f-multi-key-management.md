# MultiKeyManagement

Source: https://xq.stoplight.io/docs/xqmsg/af84f25f0805f-multi-key-management

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Subscription.json/components/schemas/MultiKeyManagement`

The multi-key form of a key packet submission. Identical to KeyManagement except that `keys` replaces `key`, storing several packets in one request. All packets created this way share the same recipients, expiry, type, and metadata.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "title": "MultiKeyManagement",
  "type": "object",
  "description": "The multi-key form of a key packet submission. Identical to KeyManagement except that `keys` replaces `key`, storing several packets in one request. All packets created this way share the same recipients, expiry, type, and metadata.",
  "properties": {
    "keys": {
      "type": "array",
      "description": "The secret keys that the user wants to protect. Each key should carry its 2-character algorithm prefix. A separate packet is created for each entry, and the returned tokens are in the same order.",
      "items": {
        "type": "string"
      }
    },
    "recipients": {
      "type": "string",
      "description": "A comma-delimited list of recipients who are allowed to access the keys. Applies to every key in the request."
    },
    "expires": {
      "description": "The number of hours that these keys will remain valid for. After this time, they will no longer be accessible. Applies to every key in the request.",
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
      "description": "A value indicating the type of data that is being encrypted. Values are 1 = “file”, 2 = “msg”, 3 = “chat”, 4 = “form”, 5 = “data”"
    },
    "meta": {
      "type": "object",
      "description": "Any additional meta information about the keys. Applies to every key in the request — use the /packet/batch endpoint if each key needs its own metadata."
    },
    "fence": {
      "type": "array",
      "description": "An array or comma-delimited list of IP addresses that these keys will be accessible from. By default, the keys will be retrievable from any address.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "keys",
    "recipients",
    "expires",
    "type"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
