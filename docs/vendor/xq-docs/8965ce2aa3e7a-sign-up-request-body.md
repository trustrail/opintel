# SignUpRequestBody

Source: https://xq.stoplight.io/docs/xqmsg/8965ce2aa3e7a-sign-up-request-body

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/SignUpRequestBody`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "required": [
    "email",
    "optIn"
  ],
  "properties": {
    "email": {
      "type": "string",
      "format": "email",
      "description": "The email address of the user."
    },
    "pwd": {
      "type": "string",
      "description": "Optional password that can be used to later login without going through the email authentication.\n\n** This should only be used by developers to bypass email factor authentication **"
    },
    "optIn": {
      "type": "boolean",
      "description": "Whether or not the user opts in to receiving email notifications"
    },
    "state": {
      "type": "string",
      "description": "Optional parameter that would pass through from the frontend and get placed as query parameter in the magic link that is in the email.\n\nThis can be used for the front end to determine which flow the user is coming from, and therefore which screen the user should be\nsent to after they have successfully logged in."
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
