# Data & Key Separation

Source: https://xq.stoplight.io/docs/xqmsg/c85a4b5a5a7a3-data-and-key-separation

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/DataKeySeparation.md`

## Published article

# Data & Key Separation

The primary purpose of XQ's Developer APIs is to empower developers with tools to securely store user data while maintaining a strict separation of encryption keys from the data itself. These APIs enable developers to build platforms capable of managing both structured and unstructured confidential user data, ensuring encryption keys are stored independently to enhance security and reduce the risk of unauthorized access.

This separation allows developers to create robust, secure systems that comply with the highest standards for data protection and privacy, while still enabling the platform's users to retain full control over their data. Users benefit from knowing that their data is protected and that only authorized individuals or systems can access the encryption keys necessary to decrypt it. This approach fosters trust and ensures compliance with modern privacy regulations and best practices.

## Confidential User Data Management

Developers can integrate mechanisms into their applications that empower users to encrypt their data locally before storing it on the platform. The encryption keys can then be securely managed and stored separately through XQ, ensuring enhanced data security and user control.

This implementation also ensures that if a developer(s) platform gets compromised, the hacker won't have access to the decryption keys associated with the confidential data.

## Client-Side Encryption

Integrate XQ authentication seamlessly into your application's client-side authentication flow, enabling users to securely store encryption keys for their confidential data directly with XQ.

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

### Step 5: Store the Encrypted Key Packet in XQ's Keystore

Once the client has authorized themselves with XQ's backend, any data they encrypt using a secure encryption key can be stored directly in XQ's keystore. The key can be associated with a specific list of recipients, which may include only the user themselves. This ensures that the user retains exclusive access to their encrypted data, maintaining privacy and control.


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

### Step 6: Store the Encrypted Data along with the Locator Token in your Backend.

The encrypted data can then be securely stored in your backend along with the associated locator token generated in the previous step. In the event of a security breach or compromise, users' confidential data will remain safe, as every data item is uniquely encrypted using distinct encryption keys. These keys are stored separately with XQ, adding an additional layer of security and ensuring that even if the data is exposed, it cannot be decrypted without the associated key.

Since XQ never interacts with the data itself, even if XQ were compromised, a hacker would only gain access to the encryption keys—not the data, which remains secure and inaccessible.

## Client-Side Decryption

Users can retrieve encrypted data directly from your backend and use the corresponding locator token along with their XQ authorization token to request the encryption key from XQ's backend. The data is then decrypted on the client side, ensuring that the separation of data and keys is securely maintained.

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
----
```params json_schema
{
  "title": "",
  "type": "object",
  "properties": {
     "encryptedMessage": {
      "type": "string",
      "description": "[The message](docs/EncryptionApiTutorial.md) you want to decrypt"
    },
    "key": {
      "type": "string",
      "description": "The auth token received when creating a subscriber response"
    },
  },
  "required": ["encryptedMessage", "key"]
}
```
----
<!--
title: "Example: Decrypt a message using the AES algorithm"
lineNumbers: true

-->

```js
import CryptoJS from 'crypto-js';

const decrypted = CryptoJS.AES.decrypt(encryptedMessage, key).toString(CryptoJS.enc.Utf8);

```



Archive note: complete JWT-shaped example tokens published by XQ were replaced with `<published-example-token-redacted>`; no contract fields were removed.
