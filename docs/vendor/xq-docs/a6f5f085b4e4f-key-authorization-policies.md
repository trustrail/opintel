# Key Authorization Policies

Source: https://xq.stoplight.io/docs/xqmsg/a6f5f085b4e4f-key-authorization-policies

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/KeyAuthorization.md`

## Published article

# Key Authorization Policies

XQ's key authorization policies empower developers to implement robust controls, allowing users to define who can access their data encryption keys, specify where the data encryption keys can be accessed, and revoke associated encryption keys remotely when needed.

## Who can access their encryption keys.

When storing a data encryption key for protection, the user or platform can provide a list of authorized identities. XQ then automatically generates and stores an encrypted key packet in the XQ Keystore, ensuring only the specified recipients have access.

Specifically, developers use the /packet/add API endpoint on the XQ Subscription server to store the encryption key. This API call requires a recipients parameter, which is a comma-separated list of email addresses or phone numbers specifying who is authorized to access the key. Any access attempts by users not included in the recipients list will be denied.

After the encrypted key packet is securely stored, the endpoint returns a locator token. This token must be sent alongside the data to enable the recipient to authenticate with the keystore and request access to the associated decryption key.

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

Developers can further expand the list of recipients for a key by using the grant endpoint of the validation server, along with the locator token generated in the previous step.

```params json_schema
{
  "title": "/grant/{token}",
  "type": "object",
  "properties": {
    "token":{
      "type": "string",
      "description": "Locator Token"
    },
    "authorization":{
      "type": "string",
      "description": "authToken returned in /exchange response. Prefix the auth token with \"Bearer\""
    },
    "recipients": {
      "type": "string",
      "description": "Comma-delimited list of email addresses or phone numbers who are allowed to access the key."
    }
  },
  "required": ["recipients", "authorization", "recipients", "token"]
}
```
----

```json http
{
  "method": "POST",
  "url": "https://validation.xqmsg.net/v2/grant/{token}",
  "headers": {
    "api-key": "123",
    "authorization":"Bearer xyz123"
  },
  "body": {
    "recipients": "test2@example.com",
  }
}
```

## Where the data encryption keys can be accessed

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

## Key Revocation

Developers can enable functionality that allows users to remotely revoke access to decryption keys associated with their encrypted data. Additionally, they can provide users with the ability to revoke access for specific individuals while maintaining access for others.

To fully revoke access to an encryption key for a specific data item, you can use the following endpoint.

```params json_schema
{
  "title": "/key/{token}",
  "type": "object",
  "properties": {
    "token":{
      "type": "string",
      "description": "Locator Token"
    },
    "authorization":{
      "type": "string",
      "description": "authToken returned in /exchange response. Prefix the auth token with \"Bearer\""
    }
  },
  "required": ["authorization", "token"]
}
```
----

```json http
{
  "method": "DELETE",
  "url": "https://validation.xqmsg.net/v2/key/{token}",
  "headers": {
    "api-key": "123",
    "authorization":"Bearer xyz123"
  }
}
```

To revoke a specific entity's access to an encryption key for a particular data item, use the following endpoint.

```params json_schema
{
  "title": "/revoke/{token}",
  "type": "object",
  "properties": {
    "token":{
      "type": "string",
      "description": "Locator Token"
    },
    "authorization":{
      "type": "string",
      "description": "authToken returned in /exchange response. Prefix the auth token with \"Bearer\""
    },
    "recipients": {
      "type": "string",
      "description": "Comma-delimited list of email addresses or phone numbers who will be removed from being able to access the key."
    }
  },
  "required": ["authorization", "token", "recipients"]
}
```
----

```json http
{
  "method": "PATCH",
  "url": "https://validation.xqmsg.net/v2/revoke/{token}",
  "headers": {
    "api-key": "123",
    "authorization":"Bearer xyz123"
  },
  "body":{
    "recipients":["string"]
  }
}
```



