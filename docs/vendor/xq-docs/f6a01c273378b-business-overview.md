# BusinessOverview

Source: https://xq.stoplight.io/docs/xqmsg/f6a01c273378b-business-overview

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/BusinessOverview`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "required": [
    "id",
    "name",
    "domain",
    "canAccessBusiness",
    "isPersonal"
  ],
  "properties": {
    "id": {
      "type": "integer",
      "description": "The ID of the business."
    },
    "name": {
      "type": "string",
      "description": "The name of the business."
    },
    "domain": {
      "type": "string",
      "description": "The domain of the business."
    },
    "canAccessBusiness": {
      "type": "boolean",
      "description": "Whether or not the user has access to that business' dashboard. For example, if they are a vendor in that business, they don;t have access to the dashboard."
    },
    "isPersonal": {
      "type": "boolean",
      "description": "Whether or not this is a personal dashboard"
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
