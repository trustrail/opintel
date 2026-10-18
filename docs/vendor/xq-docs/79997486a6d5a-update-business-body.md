# UpdateBusinessBody

Source: https://xq.stoplight.io/docs/xqmsg/79997486a6d5a-update-business-body

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/UpdateBusinessBody`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "properties": {
    "email": {
      "type": "string",
      "description": "The main business email address"
    },
    "name": {
      "type": "string",
      "description": "The full name of this business."
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
    "locked": {
      "type": "boolean",
      "description": "Whether or not the business is locked. If it is locked, all keys are no longer accessible."
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
