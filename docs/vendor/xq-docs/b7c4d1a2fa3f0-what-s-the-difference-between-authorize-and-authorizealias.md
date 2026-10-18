# What's the difference between authorize and authorizealias?

Source: https://xq.stoplight.io/docs/xqmsg/b7c4d1a2fa3f0-what-s-the-difference-between-authorize-and-authorizealias

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/AuthorizeVsAuthorizealias.md`

## Published article

# What's the difference between authorize and authorizealias?

Both routes request a token from XQ for a particular email address or telephone number. Next, if the request is succesful and the user is using [authorize](../reference/Subscription.json/paths/~1authorize/post), the user receives an email with a pin and a validation link or a text message containing a pin. The user then uses the pin to validate their token. If using [authorizealias](../reference/Subscription.json/paths/~1authorizealias/post), the user is granted a **restricted** access token. The **restricted** access token allows for basic functionality (such as simple encryption and decryption).

>Using **/authorize** is apart of the standard process when it comes to validating an access token. A majority of the time it will be used over **/authorizealias**.

### Authorize
This response returns a **pre-authorization token**. An email or text message is sent to the provided email or telephone number. Once the user confirms their identity, the pre-authorization token can be exchanged for a full access token.

The user will also receive an email or text containing:
   1. Validation PIN - A two-factor authentication token used as input for the [CodeValidator](../reference/Subscription.json/paths/~1codevalidation/get) service
   2. Validation Link - A two-factor authentication token used as input for the [ExchangeForAccessToken](../reference/Subscription.json/paths/~1exchange/get) service (only applicable to the **email** method)

The user can choose to click the link to complete the process or use the PIN.
The PIN serves as the input parameter of the [CodeValidator](../reference/Subscription.json/paths/~1codevalidation/get) service.


### Authorize Alias

This response returns a **restricted access token** granting immediate basic access for the provided email address or telephone number. 
This means the user will receive an access token without needing 2 factor authentication (2FA).

This method should only be considered in situations where:
- 2FA is problematic/unecessary, such as IoT devices or trusted applications that have a different method for authenticating user information
- When a user isn't signed into their email provider and wishes to send encrypted emails via gmail/ other email products
- During development if the developer wants to momentarily bypass 2FA

>This method only works for new email addresses/phone numbers that are not registered with XQ. If a previously registered account is used, an error will be returned.

### What about devices?

Unattended devices and services should not use either route. `/authorize` requires a human to enter a PIN, which a headless workload cannot do. Devices should authorize with an X.509 certificate issued by XQ instead — see [Device Certificate Authorization](./DeviceCertificateIntroduction.md).

 <!-- TODO: implement when /authorize/trusted route is added to API docs
 
 iOT devices would generally use /authorize/trusted endpoint, which is 2FA but rather than password and PIN, it uses geolocation and security key. 
 
 -->
