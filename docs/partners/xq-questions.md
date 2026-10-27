# XQ: packet escrow idempotency and ambiguous outcomes

Opintel uses `@xqmsg/jssdk-core` 2.0.6 `GeneratePacket`. One escrow comprises two separate calls:

1. `POST {SUBSCRIPTION_SERVER_URL}/packet`, JSON containing the key share, recipients, expiry, delete-on-receipt flag, storage type 8 and receipt identifier in metadata. This produces the encrypted packet.
2. `POST {VALIDATION_SERVER_URL}/packet`, `text/plain;charset=UTF-8`, containing that packet. This stores it and returns the locator.

Please confirm, separately for each call:

- Is retrying an identical request safe after the request was written but its response was lost? Can it create multiple packets, locators, charges or audit events?
- Is there an idempotency key? If so, specify its header/field, scope, retention period, concurrent-request behavior and response when the same key is reused with different content. Is the receipt metadata identifier sufficient, or purely descriptive?
- If subscription succeeded but validation returned HTTP 400, which stable error codes distinguish a permanent refusal from a temporary condition? Does any 400 mean the packet was nevertheless stored?
- If validation succeeded but its response was lost, can the client retrieve the existing locator without creating another escrow or consuming a delete-on-receipt share? How should an unreferenced packet be cancelled or reconciled?
- If subscription must be repeated, can its new packet safely replace the original in validation, and what happens to the original packet and its expiry?

Until these semantics are confirmed, Opintel retries connection establishment only, at most once, before writing HTTP headers or body. HTTP 400, response timeout and connection loss after a write remain refusals. It never replays the engine query. Diagnostics retain the subcall, HTTP status, bounded provider error code and attempt count; they exclude request/response bodies, credentials, shares and locators.
