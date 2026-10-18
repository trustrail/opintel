# User

Source: https://xq.stoplight.io/docs/xqmsg/2d2fa75e1761c-user

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Subscription.json/components/schemas/User`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "title": "User",
  "type": "object",
  "description": "",
  "examples": [],
  "properties": {
    "user": {
      "type": "string",
      "description": "The email address or phone number of the account to validate. A confirmation link or code will be sent to this address or number.",
      "default": "test@example.com"
    },
    "firstName": {
      "type": "string",
      "description": "The first name of the user."
    },
    "lastName": {
      "type": "string",
      "description": "The last name of the user."
    },
    "newsletter": {
      "type": "boolean",
      "description": "Should this user receive newsletters or not? This is only valid for new users, and is ignored if the user already exists.",
      "default": false
    },
    "notifications": {
      "type": "integer",
      "description": "Specifies the notifications that the user should receive ( 0 = No Notifications, 1 = Receive Usage Reports, 2 = Receive Tutorials, 3 = Receive Both )",
      "minimum": 0,
      "maximum": 3,
      "default": 0
    }
  },
  "required": [
    "user"
  ],
  "x-internal": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
