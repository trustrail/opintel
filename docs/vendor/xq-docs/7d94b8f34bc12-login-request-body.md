# LoginRequestBody

Source: https://xq.stoplight.io/docs/xqmsg/7d94b8f34bc12-login-request-body

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/LoginRequestBody`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "required": [
    "pwd"
  ],
  "properties": {
    "email": {
      "type": "string",
      "format": "email",
      "description": "The email address of the user. Required unless the user is logging in with an OAuth Access Token."
    },
    "pwd": {
      "type": "string",
      "description": "A token or password that can be used to log a user in to their account. Depends on the value of `method`"
    },
    "workspace": {
      "type": "string",
      "description": "The account workspace. This field is deprecated and should not be used.",
      "deprecated": true
    },
    "method": {
      "type": "integer",
      "default": 0,
      "enum": [
        0,
        1
      ],
      "description": "The method being used to log the user in:\n  `0` -- Password\n  `1` -- OAuth Access Token"
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
