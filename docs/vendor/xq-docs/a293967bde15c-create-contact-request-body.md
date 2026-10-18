# CreateContactRequestBody

Source: https://xq.stoplight.io/docs/xqmsg/a293967bde15c-create-contact-request-body

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/CreateContactRequestBody`

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
    "email": {
      "type": "string",
      "description": "Email address"
    },
    "title": {
      "type": "string",
      "description": "Business title"
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
      "description": "The Contacts Role:\n  `1` - Admin\n  `2` - User\n  `3` - Vendor\n  `4` - Customer\n  `5` - Super User\n  `6` - Device"
    },
    "notifications": {
      "type": "integer",
      "enum": [
        0,
        2,
        3
      ],
      "description": "Level of notifications received:\n  `0` - None\n  `2` - Warnings and Alerts\n  `3` - Alerts Only",
      "default": 0
    },
    "overflow": {
      "type": "boolean",
      "description": "Allow the contact to be created, even if the account has reached its seat limit and the contact needs to be created as an overflow contact."
    }
  },
  "required": [
    "email",
    "role"
  ],
  "title": "",
  "description": "",
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
