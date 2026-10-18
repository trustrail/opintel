# KeyPacketRecipientInfo

Source: https://xq.stoplight.io/docs/xqmsg/235a322b8d230-key-packet-recipient-info

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/KeyPacketRecipientInfo`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "required": [
    "user",
    "key"
  ],
  "properties": {
    "user": {
      "type": "string",
      "description": "If a recipient is not visible to the requester, this will be set to \"External User\". Otherwise, will be set to the the recipient email/phone."
    },
    "key": {
      "type": "string",
      "description": "A key representing the user. For known recipients, this will be their email/phone number. For external users, this will be a unique hash."
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
