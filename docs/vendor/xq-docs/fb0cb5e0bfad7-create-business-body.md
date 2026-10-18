# CreateBusinessBody

Source: https://xq.stoplight.io/docs/xqmsg/fb0cb5e0bfad7-create-business-body

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/CreateBusinessBody`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "properties": {
    "email": {
      "type": "string",
      "description": "The main business email address"
    },
    "workspace": {
      "type": "string",
      "description": "The desired workspace for this business. Must be unique."
    },
    "name": {
      "type": "string",
      "description": "The full name of this business."
    },
    "aemail": {
      "type": "string",
      "description": "The email for the main administrator of this business. May be the same as the business email."
    },
    "afirst": {
      "type": "string",
      "description": "The first name of the main administrator"
    },
    "alast": {
      "type": "string",
      "description": "The last name of the main administrator"
    },
    "street": {
      "type": "string",
      "description": "The street address of the business."
    },
    "city": {
      "type": "string",
      "description": "The business city."
    },
    "state": {
      "type": "string",
      "description": "The business state."
    },
    "country": {
      "type": "string",
      "description": "The business country."
    },
    "telephone": {
      "type": "string",
      "description": "The business telephone number."
    },
    "postal": {
      "type": "string",
      "description": "The zip code of the business."
    },
    "tag": {
      "type": "string",
      "description": "A short business tagline."
    },
    "convertFromExisting": {
      "type": "boolean",
      "description": "Whether or not to convert the existing dashboard into the newly created dashboard. This will copy over all the contacts and data and then delete the old dashboard."
    }
  },
  "required": [
    "email",
    "workspace",
    "name",
    "aemail"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
