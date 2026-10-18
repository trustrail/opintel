# Encrypt your Data Locally

Source: https://xq.stoplight.io/docs/xqmsg/db46f9a48a734-encrypt-your-data-locally

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/EncryptYourDataLocally.md`

## Published article

# Encrypt your Data Locally

At XQ, we do not provide encryption tools directly; instead, we offer a robust and secure platform for storing, accessing, and logging all key access attempts. This ensures complete control over your encryption keys while maintaining an auditable record of their usage.

The actual encryption of your data is performed locally within your environment, ensuring that sensitive information never leaves your control unencrypted. You are responsible for implementing this encryption using the keys stored in XQ. To assist with this, our SDKs include pre-built models and examples that demonstrate how to perform encryption and decryption, enabling you to integrate these capabilities seamlessly into your applications. This approach ensures maximum security and compliance with data protection best practices.

>XQ APIs do not encrypt your data. We manage the keys and policies around that encryption.

After you provide the necessary mechanisms to encrypt your data on the client-side, send it or store it however you like. Meanwhile have the keys stored in XQ as a means of separating out the data and the associated keys.

To store keys in XQ you can use the ***packet/add*** API call in your client-side applications to enable users to store the associated encryption keys. 

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

Once you encrypt your data on the application side, you can transmit or store it freely, accompanied by the associated Locator Token generated via the packet/add API call. To enable users to securely access keys from XQ on the client side while retrieving encrypted data within your platform, you can leverage the following API call.

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






