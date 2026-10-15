# XQ escrow blocked by provider entitlement

Status: live XQ escrow blocked for the current self-serve account credentials. Item 5.36; no product change, workaround, alternate endpoint or silent fallback. End-to-end XQ release remains unverified.

## Evidence and scope

The pool-agent report `tmp/review/pool-agent/8f73a623-91a8-43e7-aebc-94c71a356ac6/report.json` recorded four custody failures and 105 successful non-custody probes. All four custody failures were query refusals (`dependency_unavailable`), not failed decryption. A subsequent bounded query returned `cause: release_prepare_failed`, receipt `01a13d71-6f2d-7b37-93b6-7d8ee478a5dc`.

A synthetic escrow using a random 32-byte key share and the current `.env` sender credentials failed at the first `GeneratePacket` request with HTTP 412:

```json
{"status":"You do not have the required rights to use this service","right":"transfer/data"}
```

No customer data was sent in that diagnostic. The sender token was present and unexpired. The provider refused packet generation before the SDK could perform the second, validation-server request. No further live provider request was made for this source audit.

**Conclusion:** XQ requires the `transfer/data` right for this escrow packet-generation operation, and our current self-serve account credentials lack effective access to it. This is a provider entitlement blocker, with no request-shape mismatch found in the checked contract. The SDK does not contain the literal right name or the server's entitlement rules: the right-to-operation association is established by the live 412 response, not by a client-side declaration. We have not inspected XQ's account administration; whether XQ grants the right at account, application, or sender scope remains for XQ to confirm. Nor does this prove that all later stages will succeed once the right is granted.

## SDK source comparison

The named `xqsrc/jssdk-core` checkout was not found locally. This audit read the published, installed `@xqmsg/jssdk-core` **2.0.6** implementation under `node_modules/@xqmsg/jssdk-core/dist/esm/src/com/xqmsg/sdk/v2/`, and compared the upstream [GeneratePacket source](https://github.com/xqmsg/jssdk-core/blob/master/src/com/xqmsg/sdk/v2/services/GeneratePacket.ts), [XQSDK source](https://github.com/xqmsg/jssdk-core/blob/master/src/com/xqmsg/sdk/v2/XQSDK.ts), and [AuthorizeAlias source](https://github.com/xqmsg/jssdk-core/blob/master/src/com/xqmsg/sdk/v2/services/AuthorizeAlias.ts). Upstream master is not assumed identical to the installed release: notably, 2.0.6 requires `type`, which our request supplies.

Opintel calls the actual SDK `GeneratePacket.supplyAsync`; it supplies a Node `fetch` transport in place of the browser's XMLHttpRequest. The comparison is:

| Contract | SDK behavior | Opintel escrow |
|---|---|---|
| First endpoint | POST `https://subscription.xqmsg.net/v2/packet`, assembled from `SUBSCRIPTION_SERVER_URL` and service `packet` | Same SDK call and constants; no production endpoint override |
| First body | JSON with `key`, `recipients`, `expires`, `dor`, `type`, `meta`; SDK joins recipient array with commas | K1 encoded base64url; `[credentialAlias]` passed to SDK; expiry rounded up to hours; `dor: true`; `type: 'unknown'`; receipt-only metadata (or null) |
| General API authentication | `api-key`, from `XQ_API_KEY` | `OPINTEL_XQ_API_KEY` |
| Sender authentication | `Authorization: Bearer <XQ access token>` from `validateAccessToken()` using the active profile's XQ cache | `OPINTEL_XQ_SENDER_ALIAS` is the active profile; `OPINTEL_XQ_SENDER_ACCESS_TOKEN` is stored in its XQ access cache |
| Token type | `AuthorizeAlias` stores its returned token with `putXQAccess` and selects that alias as active profile | Bootstrap uses `AuthorizeAlias`; worker restores that token/profile pair. No dashboard token or pre-auth token substituted |
| Second endpoint, only after first succeeds | POST `https://validation.xqmsg.net/v2/packet`, same API key and bearer, `text/plain;charset=UTF-8`, body is first response's packet | Same SDK call; Node transport sends `payload.data` verbatim. Not reached in the failing live diagnostic |

`unknown` is the SDK's communication-type enum value. The SDK accepts arbitrary key strings and metadata; K1 and receipt metadata use that contract. Its README's manual-key example is abbreviated (it omits the `type` required by 2.0.6); we checked executable source rather than copying that omission.

The endpoint, payload fields/serialization, auth header and token type match. This is not a claim of byte-identical browser transport: the SDK's XMLHttpRequest transport additionally sets `Access-Control-Allow-Origin: *` as a request header; our Node transport does not. It also uses a shorter timeout and refuses redirects. These are explicit transport differences, not alternate escrow contracts. The existing `test/release-custody-xq-contract.test.ts` asserts both packet requests, body encodings and authentication against a mock server; it is not evidence of live account entitlement.

## Blocked capability and required action

Without `transfer/data`, Opintel cannot escrow K1 with XQ for **Released under custody** query results. Consequently it cannot complete delivery of a sealed result plus release grant, and the agent cannot exercise XQ retrieval, K2 redemption and authenticated unsealing end to end. Saving a custody treatment and a successful authentication-only connection check do not establish escrow permission.

The query fails closed with `dependency_unavailable`; no result is released. Other treatments are unaffected by this provider prerequisite. XQ must enable the required entitlement for these credentials before a new live integration run can establish the remaining stages. No endpoint substitution, local-provider fallback, bypass or silent disabling of escrow is authorized or implemented.

The diagnostic read credentials directly from `.env`; the API uses its process environment and caches its provider. Equality with an already-running API's loaded secret values was not established. No keys, access tokens, locator tokens or result values are recorded here.

Validation for this audit: source and existing contract-test inspection only, plus documentation whitespace check. No code, gate, baseline, commit or push.
