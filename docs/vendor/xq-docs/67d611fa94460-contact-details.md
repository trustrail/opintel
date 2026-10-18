# ContactDetails

Source: https://xq.stoplight.io/docs/xqmsg/67d611fa94460-contact-details

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/ContactDetails`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "type": "object",
  "properties": {
    "businessId": {
      "type": "integer",
      "description": "The ID of the business they belong to"
    },
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
    "state": {
      "type": "string",
      "enum": [
        "Invited",
        "Validated",
        "Disabled"
      ],
      "description": "User State"
    },
    "last": {
      "type": "integer",
      "description": "The last time the contact signed in ( in milliseconds since 1970 )."
    },
    "role": {
      "type": "string",
      "description": "User Role",
      "enum": [
        "Admin",
        "User",
        "Vendor",
        "Customer",
        "SuperUser",
        "Device"
      ]
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
  "required": [
    "businessId",
    "firstName",
    "lastName",
    "phone",
    "email",
    "title",
    "state",
    "last",
    "role",
    "n"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
