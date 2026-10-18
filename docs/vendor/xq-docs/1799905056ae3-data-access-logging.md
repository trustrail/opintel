# Data Access Logging

Source: https://xq.stoplight.io/docs/xqmsg/1799905056ae3-data-access-logging

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/DataAccessLogging.md`

## Published article

# Data Access Logging

XQ's platform provides a detailed chain of custody for every encryption key, recording when it was accessed, by whom, and from where. Through XQ's APIs, developers can easily surface this information to end users, offering transparency and reinforcing trust in the security of their data. 

## Accessing Data Logs

Integrate XQ authentication seamlessly into your application's client-side authentication flow, enabling users to track where their data is being accessed.

### Step 1: Begin the dashboard login process.

To initiate this process, when a user logs into your application, an email is automatically sent to them. XQ allows developers to include a state parameter in the email body, which can be used in client-side applications to identify the flow the user is coming from and direct them to the appropriate screen after a successful login.

Additionally, a host parameter specifies the target domain for the login links. This parameter enables routing users to the correct domain, ensuring they are directed to your platform seamlessly.

```params json_schema
{
  "title": "/login/link",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[Dashboard API key](https://manage.xqmsg.com/applications)"
    },
    "email": {
      "type": "string",
      "description": "The email address of the user."
    },
    "state": {
      "type": "string",
      "description": "Optional parameter that would pass through from the frontend and get placed as query parameter in the magic link that is in the email. This can be used for the front end to determine which flow the user is coming from, and therefore which screen the user should be sent to after they have successfully logged in."
    },
    "host": {
      "type": "string",
      "description": "The host domain that login links will target. If not provided, the server instance default will be used."
    }
  },
  "required": ["email", "api-key"]
}
```
----
```request http
{
  "method": "POST",
  "url": "https://dashboard.xqmsg.net/v2/login/link",
  "headers": {
    "api-key": "123"
  },
  "body": {
    "email": "test@example.com",
    "state": "",
    "host": "example.com"
  }
}
```

### Step 2: Exchange the Pre-Auth token for a valid authentication token.

When the user is routed to your platform, you can extract the pre-auth token embedded in the URI as access_token. This token can then be used on the client side to exchange it for a valid authentication token.

```params json_schema
{
  "title": "/login/verify",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[Dashboard API key](https://manage.xqmsg.com/applications)"
    },
    "authorization": {
      "type": "string",
      "description": "This is a bearer token required to make most XQ API calls. To get one, a user must first utilize the login/link endpoint, upon which they get a pre-auth token."
    }
  },
  "required": ["api-key", "authorization"]
}
```
----
```request http
{
  "method": "GET",
  "url": "https://dashboard.xqmsg.net/v2/login/verify?request=default",
  "headers": {
    "api-key": "123",
    "Authorization": "Bearer <published-example-token-redacted>"
  }
}
```

### Step 3: List User Communications

You can then list the user communications and present this data to your clients. This endpoint is more of an overview of the communications rather than a deeper dive on a single key.

```params json_schema
{
  "title": "/communications",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[Dashboard API key](https://manage.xqmsg.com/applications)"
    },
    "authorization": {
      "type": "string",
      "description": "This is a bearer token required to make most XQ API calls. To get one, a user must first utilize the login/link endpoint, upon which they get a pre-auth token."
    },
    "from": {
    "type": "integer",
    "description": "The lower boundary time (in milliseconds) to search. A zero value will be ignored."
    },
    "limit": {
      "type": "integer",
      "description": "Page size."
    },
    "page": {
      "type": "integer",
      "description": "Page number."
    },
    "recipients": {
      "type": "string",
      "description": "Filter by recipient email. Comma-separated values will match against any recipient in the list."
    },
    "search": {
      "type": "string",
      "description": "Generic search field for user-defined input. Matches against resource names (email subject, file name, etc.), recipients, and owners."
    },
    "status": {
      "type": "string",
      "description": "The comma-separated status of the key: 0 - Available, 1 - Revoked, 2 - Expired."
    },
    "to": {
      "type": "integer",
      "description": "The upper boundary time (in milliseconds) to search. A zero value will be ignored."
    },
    "type": {
      "type": "string",
      "description": "The type of key: 0 - Unknown, 1 - File, 2 - Email. Comma-separated values will match against EITHER type."
    },
    "users": {
      "type": "string",
      "description": "Filter by sender's email. Comma-separated values will match against any sender in the list."
    }
  },
  "required": ["api-key", "authorization"]
}
```
----
```request http
{
  "method": "GET",
  "url": "https://dashboard.xqmsg.net/v2/communications",
  "headers": {
    "api-key": "123",
    "Authorization": "Bearer <published-example-token-redacted>"
  },
  "query": {
    "from": 1,
    "to": 2,
    "limit": 50,
    "page": 0,
    "recipients": "recipient@example.com",
    "search": "example search",
    "status": "0,1,2",
    "type": "1,2",
    "users": "sender@example.com"
  }
}
```

### Step 4: Get Detailed Logs for a specific key

To access detailed logs associated with a specific key, developers can use the log endpoint. This endpoint provides a comprehensive chain of custody for the key, offering complete visibility into its access history. 

This can help developers present more detailed entries when users want to dive deeper into a specific item.

```params json_schema
{
  "title": "/log",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[Dashboard API key](https://manage.xqmsg.com/applications)"
    },
    "authorization": {
      "type": "string",
      "description": "This is a bearer token required to make most XQ API calls. To get one, a user must first utilize the login/link endpoint, upon which they get a pre-auth token."
    },
    "data": {
      "type": "string",
      "description": "A unique identifier for the requested data."
    },
    "page": {
      "type": "integer",
      "description": "Page number for pagination."
    },
    "limit": {
      "type": "integer",
      "description": "The maximum number of results to return per page."
    },
    "tz": {
      "type": "integer",
      "description": "The timezone offset in hours from UTC."
    }
  },
  "required": ["api-key", "authorization", "data"]
}
```
----
```request http
{
  "method": "GET",
  "url": "https://dashboard.xqmsg.net/v2/log",
  "headers": {
    "api-key": "123",
    "Authorization": "Bearer <published-example-token-redacted>"
  },
  "query": {
    "page": 0,
    "limit": 50,
    "data": "hLeHS3dszrVM4AnAHEMJRILDRCkXXq6kY3eQW93sN22",
    "tz": -8
  }
}
```

## Additional Presentable Components

There are various presentable data items developers can integrate in addition to the logs provided above. To identify any further presentable items navigate to the [Manage](https://xq.stoplight.io/docs/xqmsg/a92720bfbb44a-manage) section of our stoplight documentation.



Archive note: complete JWT-shaped example tokens published by XQ were replaced with `<published-example-token-redacted>`; no contract fields were removed.
