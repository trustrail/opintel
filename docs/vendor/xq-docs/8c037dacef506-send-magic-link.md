# SendMagicLink

Source: https://xq.stoplight.io/docs/xqmsg/8c037dacef506-send-magic-link

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/SendMagicLink`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "type": "object",
  "properties": {
    "email": {
      "type": "string",
      "format": "email",
      "description": "The email address of the user."
    },
    "state": {
      "type": "string",
      "description": "Optional parameter that would pass through from the frontend and get placed as query parameter in the magic link that is in the email.\n\nThis can be used for the front end to determine which flow the user is coming from, and therefore which screen the user should be\nsent to after they have successfully logged in."
    },
    "host": {
      "type": "string",
      "description": "The host domain that login links will target. If not provided, the server instance default will be used."
    }
  },
  "required": [
    "email"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
