# KeyPacketBatchEntry

Source: https://xq.stoplight.io/docs/xqmsg/f3bbfd80618d1-key-packet-batch-entry

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Subscription.json/components/schemas/KeyPacketBatchEntry`

A single key packet within a /packet/batch submission. Every field is set per entry, so entries in the same request may differ in metadata, recipients, expiry, and type.

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "title": "KeyPacketBatchEntry",
  "type": "object",
  "description": "A single key packet within a /packet/batch submission. Every field is set per entry, so entries in the same request may differ in metadata, recipients, expiry, and type.",
  "properties": {
    "key": {
      "type": "string",
      "description": "The secret key that the user wants to protect, carrying its 2-character algorithm prefix."
    },
    "recipients": {
      "type": "array",
      "description": "The recipients who are allowed to access this key.",
      "items": {
        "type": "string"
      }
    },
    "expires": {
      "type": "integer",
      "description": "How long this key remains valid, expressed in the units given by the `unit` field. Note this differs from every other packet endpoint, where `expires` is always in hours."
    },
    "unit": {
      "type": "string",
      "description": "The time unit that `expires` is measured in, for example \"days\". This field is unique to the batch endpoint.",
      "default": "days"
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
        "\"data\"",
        "\"database\""
      ],
      "default": "\"database\"",
      "description": "A value indicating the type of data that is being encrypted. Batch submissions are typically used for \"database\" packets, where each key protects a single field or column."
    },
    "meta": {
      "type": "object",
      "description": "Metadata for this specific key, commonly a title and a set of labels. This is the reason to choose /packet/batch over the multi-key form of /packet/add."
    }
  },
  "required": [
    "key",
    "recipients",
    "expires"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
