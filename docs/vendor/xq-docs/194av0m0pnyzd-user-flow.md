# User Flow

Source: https://xq.stoplight.io/docs/xqmsg/194av0m0pnyzd-user-flow

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/UserFlow.md`

## Published article

---
stoplight-id: 194av0m0pnyzd
---

# User Flow

To interact with XQ servers and leverage the XQ APIs/SDKs, you'll need General and/or Dashboard API keys. Follow these steps to obtain them:

1. Open the [XQ Dashboard](https://manage.xqmsg.com/applications).
2. Authenticate using magic link, Google, or Microsoft authentication.
2. Navigate to **Applications** via the navigation bar on the left-hand side.

## Generating API Keys

To generate API keys for the first time, refer to the following steps:

1. Enter a name in the **Name your application** field. Optionally, add a description if needed.
2. Click **CREATE APPLICATION**.
3. In the **Name of key** field, provide a name for your API key.
4. From the API dropdown, select either **General** or **Dashboard**.
5. **Optional** - Specify a space-delimited list of IP addresses allowed to use this key in the **IP Access Restrictions** field.
6. Click **CONTINUE**.
7. Save your API key in a safe place. **Your API key is only visible once.**

*The Dashboard API key is utilized for the Manage API functionality, while the General API key is utilized for Quantum, Subscription, and Validation API functionalities.*

*If you need access to multiple features, generate multiple API keys with the corresponding dropdown group in **Step 4.***

## Create API keys for existing applications

To generate API keys for existing applications, refer to the following steps:

1. From the XQ Dashboard, click **Applications** and select your application name. 
2. In the **API KEYS** section click **ADD A NEW KEY**.
3. Follow the prompts to create an API key.

>Your API keys carry many privileges, so be sure to keep them secure! Do not share your secret API keys in publicly accessible areas such as GitHub, client-side code, etc.

## Authorizing a User

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

## Key Storage & Retrieval

Upon authorization, users gain the ability to securely store and retrieve encryption keys, along with comprehensive management functionality. For a detailed overview, explore our Encryption API Tutorial, Decryption API Tutorial, and a variety of use cases.

Tutorials
- [Encryption API Tutorial](EncryptionApiTutorial.md)
- [Decryption API Tutorial](DecryptionApiTutorial.md)
Use Cases
- [Data & Key Separation](DataKeySeparation.md)
- [Data Access Logging](DataAccessLogging.md)
- [Data Compliance](DataCompliance.md)


Archive note: complete JWT-shaped example tokens published by XQ were replaced with `<published-example-token-redacted>`; no contract fields were removed.
