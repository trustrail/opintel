# Decryption Tutorial

Source: https://xq.stoplight.io/docs/xqmsg/849b4a8be091d-decryption-tutorial

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/DecryptionApiTutorial.md`

## Published article

# Decryption Tutorial
<!-- theme: warning -->
> #### This tutorial is not a sandbox!
>
> Any operations here behave as if you executed them from our own server.

----
## Section 1 - Fetching your encryption key
Before you can decrypt a message, you must retrieve the key that was used for encryption. Use the locator token that XQ provides when the key is uploaded.

Additionally, you must ensure the user that is fetching the token has the permissions to return this key. To verify the identity of the caller you need the authorization token of the subscriber.

See the [Encryption tutorial](docs/EncryptionApiTutorial.md) for steps on generating these tokens. Store the **authToken** and **locator token** from this tutorial.

Use the following steps with the API request interface to fetch your encryption key:

1. Create an API key from the [XQ Dashboard](https://manage.xqmsg.com/applications).
2. Copy and paste the API key in the required **api-key** field.
3. Enter the **locator token** in the **locatorToken** field.
4. Enter the **authToken** in the **authorization** field. Prefix the authToken with **Bearer**.
5. Click **Send API Request**.

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


>A successful response will return the encryption key and verified the subscriber is valid and has access to the key.

----
## Section 2 - Decrypting your message
Use the encryption key to decrypt your message. How you decrypt your message will depend on the method you used to encrypt the data.

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

<!--
title: "Example: Decrypt a message using the AES algorithm"
lineNumbers: true

-->
```bash
openssl enc -d -k [key] -in [encrypted file] -out [decrypted file]
```
