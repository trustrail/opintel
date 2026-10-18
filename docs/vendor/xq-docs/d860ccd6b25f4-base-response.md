# BaseResponse

Source: https://xq.stoplight.io/docs/xqmsg/d860ccd6b25f4-base-response

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/BaseResponse`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "description": "",
  "type": "object",
  "properties": {
    "status": {
      "description": "\"OK\" if the response was successful, otherwise it describes the error that occurred",
      "type": "string"
    }
  },
  "required": [
    "status"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
