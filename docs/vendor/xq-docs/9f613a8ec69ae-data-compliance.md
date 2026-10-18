# Data Compliance

Source: https://xq.stoplight.io/docs/xqmsg/9f613a8ec69ae-data-compliance

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/DataCompliance.md`

## Published article

# Data Compliance

XQ's platform enables developers to establish data access and loss prevention policies for encryption keys stored within the system. This capability allows developers to create platforms that help users meet compliance requirements, such as GDPR, by restricting access to encryption keys based on geolocation.

## Policy Creation

Developers can empower users to control where encryption keys can be accessed by configuring settings in the Policies section of the XQ Management Portal. For example, a simple Data Access policy might involve restricting access to keys of type "msg" to a specific region. Users can easily implement this by following these steps:

1. Open the [XQ Dashboard](https://manage.xqmsg.com/applications/policy-manager).  
2. Log in using one of the available methods: Magic Link, Google, or Microsoft authentication.  
3. Navigate to **Policy Manager** via the navigation bar on the left.  
4. Click the **"ADD NEW"** button at the top, next to "Policies".  
5. Provide a name for your policy, set the type to **"Data Access"**, and assign the applicable groups.  
6. Define the conditions of the policy, such as:  
   - **Data**: Email  
   - **Operator**: Not From  
   - **Data Type**: Countries  
   - **Value**: United States  
7. Configure the action for the policy, for example:  
   - **Then**: Block  
   - **Action**: Notify User  
   - **Message**: "Message is only accessible from the United States of America."

---

## Encryption Key Labeling

Platform users can also establish Data Access policies for labeled keys, which developers can manage using the /packet/add method. Labels are specified through the meta object and can be set using a format like "labels": ["Label1","Label2"].

To integrate this functionality into your application you will have to integrate XQ authentication seamlessly into your application's client-side authentication flow, enabling users to securely store encryption keys for their confidential data directly with XQ.

### Step 1: Begin the login process.

During the user login process, when a user authenticates with their email and password on your platform, you can invoke XQ's Authorize endpoint to initiate secure key management.

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

### Step 2: Prompt the user to enter the PIN.

Your platform can prompt the user to enter the 2FA PIN sent to their registered email address. Once they have received their 2FA PIN they will input the value into your platform and you will call the codevalidation endpoint.

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

### Step 3: Automatic Pre-Auth token exchange.

If the users 2FA pin is valid, you can automatically exchange the pre-auth token on the client side application for the XQ Access Token.

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

### Step 4: Integrate client-side encryption

Leverage XQ's Quantum Entropy in combination with client-side encryption libraries to robustly encrypt sensitive user data. This approach ensures that all data entered into your platform is securely encrypted, with encryption keys stored separately by XQ. Access to these keys can be restricted exclusively to the client, providing enhanced security and user control over their confidential information.

You can utilize XQ's Quantum Entropy generator to ensure strong encryption keys are generated. 

```params json_schema
{
  "title": "/",
  "type": "object",
  "properties": {
     "ks": {
      "type": "string",
      "description": "The number of entropy bits to fetch. Value will be returned as a base64-encoded hex string."
    },
  },
  "required": ["ks"]
}
```
----

```json http
{
  "method": "GET",
  "url": "https://quantum.xqmsg.net/v2",
  "query": {
    "ks": "256"
  }
}
```

>The response is a base64-encoded hex string.

While the hex string returned in the response can be used as entropy, to retrieve the actual bits, the string should be decoded from base-64 and each hex character in the sequence converted to its 4-bit binary representation.

<!--
title: "Example: Encrypt a message using the AES algorithm"
lineNumbers: true

-->

```js
import CryptoJS from 'crypto-js';

// Example values
const data = "Highly Sensitive Data";
const key = "ff308a2a9e1671244dfe2e35ae0c8d1c9ddeec6b51128457ca29229a932d5574"; 

// Encrypt the message
const encrypted = CryptoJS.AES.encrypt(message, key).toString();

```

### Step 5: Store the encrypted key packet in XQ's Keystore with a designated label.

Platform users can also establish Data Access policies for labeled keys, which developers can manage using the /packet/add method. Labels are specified through the meta object and can be set using a format like "labels": ["Label1","Label2"].

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
      "type": "string",
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
    "recipients": "test2@example.com",
    "expires": "1",
    "key": "xyz123",
    "type": "msg",
    "meta": {"subject": "demo", "title": "demo", "labels": ["Label1", "Label2"]}
  }
}
```






Archive note: complete JWT-shaped example tokens published by XQ were replaced with `<published-example-token-redacted>`; no contract fields were removed.
