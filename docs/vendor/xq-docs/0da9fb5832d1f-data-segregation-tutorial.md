# Data Segregation Tutorial

Source: https://xq.stoplight.io/docs/xqmsg/0da9fb5832d1f-data-segregation-tutorial

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/DataSegregationTutorial.md`

## Published article

# Data Segregation Tutorial
<!-- theme: warning -->
> #### This tutorial is not a sandbox!
>
> Any operations here behave as if you executed them from our own server.

## Section 1 - Creating Multiple Teams in XQ

Teams within XQ are self-contained entities, each managing its own keys, users, policies, and communication logs.

Use the following steps to create a team in XQ:

1. Navigate to the [XQ Dashboard](https://manage.xqmsg.com/) and authenticate using magic-link, Google, or Microsoft.
2. In the top-right corner click on **Personal Dashboard** followed by selecting **+ Create a new team**.
3. Input your team name (Team A) followed by click on Next to proceed.
4. Invite members to your team by entering their email addresses in the text field and clicking **Next**. You can also choose **Skip for now** to add team members later.
5. Once your team is created select your **name/email address** on the top right-hand side of the screen followed by **Account & Billing** in the dropdown.
6. The **Team ID** is in the "Organization" section, this will be required for Section 2.

Repeat steps 2 - 6 and create another team with a different name (Team B) ensuring to note down the **Team ID** for each.

## Section 2 - Authorizing and Storing an Encryption Key Packet in Team A

To interact with XQ servers and leverage the XQ APIs/SDKs, you'll need General and/or Dashboard API keys. Follow these steps to obtain them:

>You can utilize either team to create your API keys just be aware your API keys carry many privileges, so be sure to keep them secure! Do not share your secret API keys in publicly accessible areas such as GitHub, client-side code, etc.

1. Open the [XQ Dashboard](https://manage.xqmsg.com/applications).
2. Authenticate using magic link, Google, or Microsoft authentication.
2. Navigate to **Applications** via the navigation bar on the left-hand side.
----
### Creating API Keys

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

----
### (Optional) Listing a User's Team IDs

You can list a users team(s) and their IDs by having them authenticate then making a request to the dashboard businesses endpoint.

#### First you can send a magic link to a users email address using the following endpoint.

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
    "email": "test@example.com"
  }
}
```

> A successful response will return a 204 status code, indicating that the email has been successfully sent to the specified user. The email will include a one-time-use access_token embedded in a URI, which will be used in the next step. You can copy the link from the email and extract the access_token from the URI. Please note in a standard implementation you would handle this utilizing the state request payload.

----
#### The access_token then needs to be exchanged for a valid authentication token.

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
> A successful response will return a 200 with a new access token which can be used to get user specific information.

----

#### Finally, you can use the business dashboard endpoint to retrieve a list of all the user's teams along with their respective IDs.

```params json_schema
{
  "title": "/businesses",
  "type": "object",
  "properties": {
    "api-key":{
      "type": "string",
      "description": "[Dashboard API key](https://manage.xqmsg.com/applications)"
    },
    "authorization": {
      "type": "string",
      "description": "This is a bearer token required to make most XQ API calls."
    }
  },
  "required": ["api-key", "authorization"]
}
```
----
```request http
{
  "method": "GET",
  "url": "https://dashboard.xqmsg.net/v2/businesses",
  "headers": {
    "api-key": "123",
    "Authorization": "Bearer <published-example-token-redacted>"
  }
}
```
> A successful response will return an object containing all of the users teams and their respective Id's

----
### Authorizing a User Using a Specific Team

An authorized user is identified by an email address that is granted an authorization token (authToken). This token is used to store and access the protected key.

***During the /exchange step, set the "Team A" team ID as b***

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
### Creating and saving the key packet to XQ

This step involves taking the user's secret key that needs protection and the recipient which will be "Active Team", then automatically generating and storing an encrypted key packet in the XQ keystore.

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
### Fetching your decryption key authorized to team A

Before you can decrypt a message, you must retrieve the key that was used for encryption. Use the locator token that XQ provides when the key is uploaded. The locator token was the return value in the previous step.

```params json_schema
{
  "title": "/key/{locatorToken}",
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
    "locatorToken": {
      "type": "string",
      "description": "This token is the response received when storing the key packet on the server. Make sure to URI encode the locatorToken"
    }
  }
  "required": ["recipients", "api-key", "authorization"]
}
```
----
```json http
{
  "method": "GET",
  "url": "https://validation.xqmsg.net/v2/key/{locatorToken}",
  "headers": {
    "api-key": "123",
    "authorization": "Bearer xyz123"
  }
}
```

## Section 3 - Authorizing and Attempting Access to a Key from Team B

We will repeat the authorization and key retrieval process outlined above, but this time, we will exchange the pre-auth token for a different team ID.

***During the /exchange step, set the "Team B" team ID as b***

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

### Fetching your decryption key authorized to team A

Use the locator token that XQ provides when the key is uploaded. The locator token was the return value in the previous section.

```params json_schema
{
  "title": "/key/{locatorToken}",
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
    "locatorToken": {
      "type": "string",
      "description": "This token is the response received when storing the key packet on the server. Make sure to URI encode the locatorToken"
    }
  }
  "required": ["recipients", "api-key", "authorization"]
}
```
----
```json http
{
  "method": "GET",
  "url": "https://validation.xqmsg.net/v2/key/{locatorToken}",
  "headers": {
    "api-key": "123",
    "authorization": "Bearer xyz123"
  }
}
```



Archive note: complete JWT-shaped example tokens published by XQ were replaced with `<published-example-token-redacted>`; no contract fields were removed.
