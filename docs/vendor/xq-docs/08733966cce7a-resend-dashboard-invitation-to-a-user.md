# Resend dashboard invitation to a user

Source: https://xq.stoplight.io/docs/xqmsg/08733966cce7a-resend-dashboard-invitation-to-a-user

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `http_operation` · Source URI: `/reference/Manage.yml/paths/~1invite~1{contactId}/get`

## Endpoint

`GET https://dashboard.xqmsg.net/v2/invite/{contactId}`

You can only resend invitations to contacts currently in an **Invited** state. If a contact has previously accepted an invite, the **Reset Password** workflow must be used to recover the password.

**Required Scope:** invitation

**Webhook Event:** resendinvite

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "id": "20c0dfe2c5e2e",
  "method": "get",
  "path": "/invite/{contactId}",
  "tags": [
    {
      "id": "b9f97d4f05234",
      "name": "Authentication"
    }
  ],
  "extensions": {},
  "iid": "get-invite",
  "description": "You can only resend invitations to contacts currently in an **Invited** state. If a contact has previously accepted an invite, the **Reset Password** workflow must be used to recover the password.\n\n**Required Scope:** invitation\n\n**Webhook Event:** resendinvite",
  "summary": "Resend dashboard invitation to a user",
  "securityDeclarationType": "declared",
  "responses": [
    {
      "id": "9ccfc1d6b8007",
      "code": "204",
      "headers": [],
      "contents": [],
      "description": "No Content - The invitation has been resent."
    }
  ],
  "request": {
    "headers": [
      {
        "id": "37affac8b4203",
        "name": "authorization",
        "style": "simple",
        "examples": [],
        "description": "This is a bearer token required to make most XQ API calls. To get one, a user must first request access, upon which they get a pre-auth token. After they confirm their account, they will send the pre-auth token to the server in return for an access token.",
        "required": true,
        "schema": {
          "type": "string",
          "default": "Bearer xyz123",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "ddce135166dae"
          }
        },
        "explicitProperties": [
          "schema",
          "in",
          "name",
          "description",
          "required"
        ]
      }
    ],
    "query": [],
    "cookie": [],
    "path": [
      {
        "id": "252d752a19025",
        "name": "contactId",
        "style": "simple",
        "examples": [],
        "description": "The ID of the contact to send the invitation to. The contact must currently be in the \"Invited\" state. Otherwise, the **Forgot Password** workflow should be used instead.",
        "required": true,
        "schema": {
          "type": "string",
          "$schema": "http://json-schema.org/draft-07/schema#",
          "x-stoplight": {
            "id": "4c28ae2c70c88"
          }
        },
        "explicitProperties": [
          "schema",
          "name",
          "in",
          "required",
          "description"
        ]
      }
    ]
  },
  "security": [
    [
      {
        "id": "de1755561948a",
        "key": "API Key",
        "extensions": {},
        "description": "Required for almost every API call. Developers may provision their own keys from their dashboard account.",
        "type": "apiKey",
        "name": "api-key",
        "in": "header"
      }
    ]
  ],
  "servers": [
    {
      "id": "9c8a6f289ced5",
      "url": "https://dashboard.xqmsg.net/v2",
      "name": "Manage",
      "description": "production"
    }
  ]
}
```
