# Key Retention

Source: https://xq.stoplight.io/docs/xqmsg/922e0aadbd2e6-key-retention

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/KeyRetenion.md`

## Published article

# Key Retention

The retention period for encryption keys stored in XQ's backend is highly configurable, providing flexibility to meet various data retention and compliance requirements. Developers can set the retention period to align with their organization's specific needs, ranging from short-term durations to a maximum of 7 years. This extended configurability allows for seamless integration with regulatory frameworks and internal policies, ensuring secure data access control throughout the defined lifecycle. By tailoring the key retention period, organizations can strike a balance between operational efficiency, legal compliance, and data protection best practices.

When your platform users store keys in XQ's backend, they can specify an expiration time for each key. To enable this functionality, you'll need to implement an authorization flow within your client-side application, allowing users to securely interact with XQ's services.

----
### Authorizing a User Using a Specific Team

An authorized user is identified by an email address that is granted an authorization token (authToken). This token is used to store and access the protected key.

```params json_schema
{
  "title": "/authorize",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[General API key](https://manage.xqmsg.com/applications)"
    },
    "user": {
      "type": "string",
      "description": "The email address or phone number of the account to validate. The confirmation link or code will be sent to this address or number"
    },
  },
  "required": ["user", "api-key"]
}
```
----
```request http
{
  "method": "POST",
  "url": "https://subscription.xqmsg.net/v2/authorize",
  "headers": {
    "Content-Type": "application/json",
    "api-key": "123"
  },
  "body": {
    "user": "test@example.com"
  }
}
```

> A successful response includes the Pre-Auth Token that will allow the subscriber to exchange it in conjunction with the 2FA pin received in their email/phone with an authToken. Store the Pre-Auth Token for use in following step of the tutorial.

```params json_schema
{
  "title": "/codevalidation",
  "type": "object",
  "properties": {
    "token":{
      "type": "string",
      "description": "The Pre-Auth token that is returned after an initial request for authorization."
    },
    "pin": {
      "type": "integer",
      "description": "The pin that was sent to the users email or phone number."
    },
  },
  "required": ["token", "pin"]
}
```
----
```request http
{
  "method": "GET",
  "url": "https://subscription.xqmsg.net/v2/codevalidation",
  "headers": {
    "Authorization": "Bearer <published-example-token-redacted>"
  },
  "query": 
  {
    pin: 123456
  }
}
```

> A successful response will return a 204 with "No Content" but this will validate your pre-auth token with your 2fa credentials. 

```params json_schema
{
  "title": "/exchange",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[General API key](https://manage.xqmsg.com/applications)"
    },
    "Authorization": {
      "type": "string",
      "description": "This is a bearer token required to make most XQ API calls. To get one, a user must first utilize the authorize endpoint, upon which they get a pre-auth token. After they confirm their account utilizing the code-validation endpoint, they can then exchange the pre-auth token in return for an access token to a specific team."
    },
    "b": {
      "type": "integer",
      "description": "This is the specific Team ID you are using to exchange your pre-auth token for authorization. If no Team ID is specified, you will automatically be authorized into the Team ID with the lowest index that you have access to."
    },
  },
  "required": ["api-key", "authorization"]
}
```
----
```request http
{
  "method": "GET",
  "url": "https://subscription.xqmsg.net/v2/exchange",
  "headers": {
    "api-key": "123",
    "Authorization": "Bearer <published-example-token-redacted>"
  },
  "query": 
  {
    b: 123
  }
}
```
> A successful response will return a 200 with a new access token which can be used to store and access protected keys in that specific team.

----

### Storing Encrypted Key Packets in XQ's Backend Keystore

This step involves taking the user's secret key that needs protection and the recipients, then automatically generating and storing an encrypted key packet in the XQ keystore. During this API call developers can configure the key expiration time by setting an integer value in the "expires" body parameter.

```params json_schema
{
  "title": "/packet/add",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[General API key](https://manage.xqmsg.com/applications)"
    },
    "authorization":{
      "type": "string",
      "description": "authToken returned in /exchange response. Prefix the auth token with \"Bearer\""
    },
    "recipients": {
      "type": "string",
      "description": "Comma-delimited list of email addresses or phone numbers who are allowed to access the key."
    },
    "expires": {
      "type": "integer",
      "description": "Number of hours that this key will remain valid for. After this time, it will no longer be accessible."
    },
    "key": {
      "type": "string",
      "description": "The secret key that the user wants to protect."
    },
    "type": {
      "type": "string",
      "description": "A value indicating the type of data that is being encrypted. Values are 1 = “file”, 2 = “msg”, 3 = “chat”, 4 = “form”, 5 = “data”"
    },
    "meta": {
      "type": "object",
      "description": "Any additional meta information about the key."
    }
  },
  "required": ["recipients", "api-key", "authorization", "recipients", "expires", "key"]
}
```
----

```json http
{
  "method": "POST",
  "url": "https://subscription.xqmsg.net/v2/packet/add",
  "headers": {
    "Content-Type": "application/json",
    "api-key": "123",
    "authorization":"Bearer xyz123"
  },
  "body": {
    "recipients": "team@group.local",
    "expires": "1",
    "key": "abcdefghijklm0123456",
    "type": "file",
    "meta": {"subject": "demo", "title": "demo"}
  }
}
```

>A successful response means your key packet is now stored on the key server. The response contains the locator token used to retrieve your encryption key in the future. 

----
### Log Retention

All logs related to keys are retained indefinitely within XQ's platform, ensuring they remain accessible even after the associated keys have expired. These logs serve as a valuable record, providing detailed insights into the chain of custody and usage history of each key.

To access logs associated with specific keys in XQ's backend, developers can implement mechanisms within their platform to facilitate log retrieval. To get started, developers should integrate functionality within their client-side application that allows users to authenticate with XQ's Dashboard, enabling secure access to these logs.

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

To access detailed logs associated with a specific key such as the one generated above, developers can use the log endpoint. This endpoint provides a comprehensive chain of custody for the key, offering complete visibility into its access history. 

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
      "description": "The associated locator token of the required logs."
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
### Conclusion

Developers have the flexibility to customize the key expiration time for each API call based on their platform's specific requirements. Since each key is unique, expiration times can be tailored to align with the sensitivity of the data or the regulatory standards the platform must comply with. Any attempts to access a key after its expiration time will be denied, as the key is permanently removed from XQ's Backend Keystore upon expiration.







Archive note: complete JWT-shaped example tokens published by XQ were replaced with `<published-example-token-redacted>`; no contract fields were removed.
