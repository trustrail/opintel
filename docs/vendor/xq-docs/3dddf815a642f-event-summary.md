# EventSummary

Source: https://xq.stoplight.io/docs/xqmsg/3dddf815a642f-event-summary

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `model` · Source URI: `/reference/Manage.yml/components/schemas/EventSummary`

## Published structured definition

The JSON below preserves the node definition, including request/response schemas, descriptions, constraints, examples and bundled references.

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "integer",
      "description": "The event ID."
    },
    "action": {
      "type": "string",
      "description": "The action identifier path."
    },
    "app": {
      "type": "integer",
      "description": "Application ID"
    },
    "key": {
      "type": "integer",
      "description": "API Key ID"
    },
    "val": {
      "type": "integer",
      "description": "The ID of the related workspace user (or 0 if the entry is not related to a verified message )."
    },
    "threat": {
      "type": "integer",
      "description": "The threat level."
    },
    "data": {
      "type": "string",
      "description": "Additional information about the event. Could be a string, or an stringified object with meta information. If it is a plain string, then we can use this to search for related events."
    },
    "ip": {
      "type": "string",
      "description": "The IP of the location where this log entry was triggered from."
    },
    "location": {
      "type": "string",
      "description": "The name of the location where this log entry was triggered from ( if available )."
    },
    "user": {
      "type": "string",
      "description": "The user name who triggered this entry (if available)."
    },
    "created": {
      "type": "integer",
      "description": "The time ( in milliseconds) when this entry was logged."
    },
    "appname": {
      "type": "string",
      "description": "Server-supplied application name."
    },
    "keyname": {
      "type": "string",
      "description": "Server-supplied key name."
    }
  },
  "required": [
    "id",
    "action",
    "app",
    "key",
    "val",
    "threat",
    "ip",
    "created",
    "appname",
    "keyname"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
