# UpdateContactRequestBody

Source: https://xq.stoplight.io/docs/xqmsg/6a17b96fc3852-update-contact-request-body

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/UpdateContactRequestBody`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "type": "object",
  "properties": {
    "firstName": {
      "type": "string",
      "description": "First Name"
    },
    "lastName": {
      "type": "string",
      "description": "Last Name"
    },
    "phone": {
      "type": "string",
      "description": "Telephone Number"
    },
    "email": {
      "type": "string",
      "description": "Email Address"
    },
    "title": {
      "type": "string",
      "description": "The business title of the contact."
    },
    "role": {
      "type": "integer",
      "enum": [
        1,
        2,
        3,
        4,
        5,
        6
      ],
      "description": "The Contacts Role:\n  `1` - Admin\n  `2` - User\n  `3` - Vendor\n  `4` - Customer\n  `5` - SuperUser"
    },
    "n": {
      "type": "integer",
      "enum": [
        0,
        2,
        3
      ],
      "description": "Level of notifications received:\n  `0` - None\n  `2` - Warnings and Alerts\n  `3` - Alerts Only"
    },
    "more": {
      "type": "string",
      "description": "Additional information about this contact."
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
