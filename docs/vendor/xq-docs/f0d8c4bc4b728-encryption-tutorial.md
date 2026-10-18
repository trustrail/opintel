# Encryption Tutorial

Source: https://xq.stoplight.io/docs/xqmsg/f0d8c4bc4b728-encryption-tutorial

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/EncryptionApiTutorial.md`

## Published article

# Encryption Tutorial
<!-- theme: warning -->
> #### This tutorial is not a sandbox!
>
> Any operations here behave as if you executed them from our own server.

## Section 1 - Authorizing a User

An authorized user is identified by an email address that is granted an authorization token (authToken). This token is used to store and access the protected key.

Use the following steps with the API request interface to create the subscriber:

1. Create an **API key** from the [XQ Dashboard](https://manage.xqmsg.com/applications).
2. Copy and paste the **API key** in the required **api-key** field.
3. Enter the user's email address as the **user** the **Body** field. 
4. Click **Send API Request**.

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
## Section 2 *(Optional)* - Supply Entropy to your encryption key
Your encryption key is a random string of bits used by an encryption algorithm for rewriting data so it appears to be random. To help increase the security of your key, you can request quantum entropy using XQ's quantum entropy service. The quantum entropy service provides an alternate seed to your encryption key.

Enter a value for the **ks** field in the following API request interface and click **Send API Request** to supply entropy.

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

----
## Section 3 - Creating and saving the key packet to XQ
This step involves taking the user's secret key that needs protection and a list of authorized identities, then automatically generating and storing an encrypted key packet in the XQ keystore.

After the encrypted key packet is securely stored, the endpoint returns a locator token. This token must be sent alongside the data to enable the recipient to authenticate with the keystore and request access to the decryption key.

Use the following steps with the API request interface to create the key packet:

1. Copy and paste your **API key** in the required **api-key** field.
2. Copy and paste your stored **authToken** from the Creating a subscriber response in Section 1 of this tutorial. Prefix the authToken with **Bearer**.
3. Enter a comma-delimited list of email addresses and/or phone numbers as **recipients** in the **Body** field.
4. Enter a value for the expiration timeframe as **expires** in the **Body** field.
5. Click **Send API Request**.

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
    "meta": {"subject": "demo", "title": "demo"}
  }
}
```

>A successful response means your key packet is now stored on the key server. The response contains the locator token used to retrieve your encryption key in the future.
----
## Section 4 - Encrypting a message
Now that your encryption key is stored in the XQ key server, you are ready to encrypt a message! Use an appropriate cryptographic algorithm e.g. **AES**, **DES**, **Rabbit**, **RC4** to encrypt your message.

```params json_schema
{
  "title": "",
  "type": "object",
  "properties": {
     "message": {
      "type": "string",
      "description": "The message you want to encrypt"
    },
    "key": {
      "type": "string",
      "description": "The encryption key that was stored in XQ's keystore in the previous step"
    },
  },
  "required": ["message", "key"]
}
```
----
<!--
title: "Example: Encrypt a message using the AES algorithm"
lineNumbers: true

-->

```js
import CryptoJS from 'crypto-js';

// Example values
const message = "This is a secret message";
const key = "xyz123"; 

// Encrypt the message
const encrypted = CryptoJS.AES.encrypt(message, key).toString();

```



Archive note: complete JWT-shaped example tokens published by XQ were replaced with `<published-example-token-redacted>`; no contract fields were removed.
