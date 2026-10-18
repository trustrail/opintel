# XQ database storage probe

Version: 1.0 — 2026-10-16 (America/Toronto)

## Scope and result

One live escrow attempt, started 2026-10-17T00:13:46.090Z (October 16 locally), using the existing `.env` XQ account and the SDK's standard endpoints, confirmed by the operator as the sandbox for this run. Installed SDK: `@xqmsg/jssdk-core` 2.0.6. No customer values were used: the proposed share was a fresh random 32-byte value, retained only in process memory.

**HTTP 412 persists with database storage type 8.** The three alias authorizations succeeded; the subscription packet request returned 412. GeneratePacket did not reach its second, validation-server request. There was no locator to fetch. Recipient retrieval and non-recipient refusal therefore remain unverified by this run. No retry or alternate endpoint was attempted.

The previous adapter explicitly sent `type: 'unknown'`; it did not omit the field. It now uses the named `XQ_DATABASE_STORAGE_TYPE = 8`, with a comment citing XQ's Gateway/Transfer recommendation for our key packets. The existing mock contract expectation was updated accordingly.

## Exact calls, with secret values represented symbolically

All calls used SDK service URL construction and a native fetch transport matching the adapter's 15-second deadline and redirect refusal. No production configuration or timeout changed. SDK diagnostics were suppressed; no key material, access tokens, API keys, TeamID, or locator was printed or saved.

| Order | SDK call | HTTP request | Result |
|---|---|---|---|
| 1 | `AuthorizeAlias.supplyAsync({user: senderAlias})` | POST `https://subscription.xqmsg.net/v2/authorizealias`; JSON body; `api-key` from existing environment | 200; token payload type `string`, retained in memory |
| 2 | `AuthorizeAlias.supplyAsync({user: recipientAlias})` | Same endpoint and authentication; fresh `opintel-probe-recipient-<UUID>` alias | 200; token payload type `string`, retained in memory |
| 3 | `AuthorizeAlias.supplyAsync({user: otherAlias})` | Same endpoint and authentication; distinct `opintel-probe-other-<UUID>` alias | 200; token payload type `string`, retained in memory |
| 4 | `GeneratePacket.supplyAsync({key: share, recipients: [recipientAlias], expires: 1, dor: true, type: 8, meta: {receipt: marker}})` | POST `https://subscription.xqmsg.net/v2/packet`; JSON; SDK flattens recipients to a comma-joined string; `api-key` plus `Authorization: Bearer <sender AuthorizeAlias token>` | 412; no packet |

The 412 response object had exactly these observed fields and value types:

```json
{"status":"string","right":"string"}
```

The probe retained response shapes, not error-body values. It therefore does **not** establish which right this new refusal names; the earlier `transfer/data` diagnosis must not be copied onto this response without evidence. A type-8 request still being refused does not establish why the newly assigned licence has not permitted it.

## Retrieval, events and Communications

The intended sequence after generation was `FetchKey({locatorKey: locator})` as the non-recipient **before** the recipient, then the recipient fetch and an in-memory equality check against the original share. This avoids mistaking single-use consumption (`dor: true`) for an authorization refusal. Neither call occurred because generation failed.

There are no GetEventLogs rows for a fetch from this run: no fetch occurred, and GetEventLogs was not called. Consequently no live fetch-event schema was established. Independently, this checkout's environment has a dashboard API key but no dashboard access token; GetEventLogs requires dashboard bearer authentication. The SDK's field definitions are not a substitute for observed event rows.

**Communications visibility: not inspected and not established.** Packet generation failed; no claim is made that a packet appears or does not appear in the console.

The sanitized call record is in ignored `tmp/xq-database-probe-result.json`; the one-shot diagnostic is `tmp/xq-database-probe.mjs`. Neither contains credentials or share material. The diagnostic refuses to run again while its result file exists. Alias authorization succeeded remotely; no alias cleanup was attempted.

## Local prerequisite validation

Before any live call:

```text
npm test -- test/release-custody-escrow-refusal.test.ts
Test Files  1 passed (1)
Tests       3 passed (3)
Duration    34.20s
```

The three cases cover HTTP 412, network failure and timeout, each asserting the complete refused MCP response, no released values and persisted refusal evidence. Only this requested test file ran. The separate SDK contract expectation was updated but its test was not run. No gate, baseline regeneration, commit or push.

## Change ledger

| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1.0 | 2026-10-16 | Record database-type adapter change, three passing refusal cases and one live 412. | Packet requests use type 8; fail-closed behavior remains. Live escrow, recipient isolation and fetch corroboration are not established. |

## 2026-10-16 addendum — newly issued application and dashboard keys

The operator reported that both keys were regenerated after XQ assigned the licence. The local `.env` modification time was 2026-10-16T20:22:26-0400, later than the preceding probe. Both keys were present and loaded afresh into this diagnostic process. No key values were displayed, copied into this note, or written by the diagnostic; no running service or production configuration was changed. Issuance timing is operator-provided evidence, not a claim that XQ key-management history was independently inspected.

**Exactly one additional GeneratePacket invocation** was made under this explicit authorization, at 2026-10-17T00:25:21.089Z (October 16 locally). No retry followed it. The SDK, endpoints, 15-second transport deadline, and type-8 request shape were unchanged.

| Order | Call | Status and response body |
|---|---|---|
| 1 | `AuthorizeAlias({user: senderAlias})`; POST `https://subscription.xqmsg.net/v2/authorizealias` | 200; access-token string, omitted as secret |
| 2 | `AuthorizeAlias({user: freshRecipientAlias})`; same endpoint | 200; access-token string, omitted as secret |
| 3 | `AuthorizeAlias({user: freshNonRecipientAlias})`; same endpoint | 200; access-token string, omitted as secret |
| 4 | `GeneratePacket({key: randomShare, recipients: [freshRecipientAlias], expires: 1, dor: true, type: 8, meta: {receipt: freshMarker}})`; POST `https://subscription.xqmsg.net/v2/packet` | **412**, exact non-secret body below |

```json
{"status":"You do not have the required rights to use this service","right":"transfer/data"}
```

Authorization used the freshly loaded application API key and, for GeneratePacket, a newly obtained sender alias bearer token. The refreshed dashboard API key was loaded but no dashboard call was made. This run establishes that the type-8 packet request still receives a `transfer/data` refusal with the supplied refreshed configuration; it does not establish why XQ refuses that combination.

The validation-server packet upload was not reached and no locator was returned. Therefore:

- Named-recipient fetch/share equality: **not attempted; blocked by generation refusal**.
- Second non-recipient fetch/refusal: **not attempted; blocked by generation refusal**.
- GetEventLogs fetch rows and every-field/type shape: **unavailable; no fetch occurred and no event-log request was made**. The local dashboard access token remains absent; a dashboard API key alone does not meet the SDK's bearer-token requirement.
- Communications section: **not inspected; packet visibility not established**. Generation failure is not evidence of the console's contents.

The planned successful branch followed the requested recipient-first order. With `dor: true`, a later non-recipient refusal would be ambiguous between recipient authorization and single-use consumption; this run reached neither fetch and makes no isolation claim.

Sanitized result: `tmp/xq-database-probe-refreshed-result.json`. Diagnostic: `tmp/xq-database-probe-refreshed.mjs`, guarded against another run while its result file exists. Prior probe evidence is preserved. No tests, gate, timeout changes, endpoint changes, commit or push in this follow-up.

## 2026-10-16 addendum — bootstrap helper and persisted fresh sender token

Under a new explicit one-attempt authorization, `bootstrap()` exported by `scripts/xq-bootstrap.ts` minted a fresh sender access token through its existing AuthorizeAlias worker. The helper succeeded and validated an unexpired token; the diagnostic consumed its output in memory, replaced only `OPINTEL_XQ_SENDER_ACCESS_TOKEN` in the local `.env`, and loaded that saved token into the SDK sender profile. The helper's returned token was never printed. No endpoint, timeout, other configuration value, or running service was changed.

**Correction to the stale-token hypothesis:** the immediately preceding probe also called AuthorizeAlias for the sender and used that newly returned token in memory. It did not use the old `.env` sender token. This additional run specifically verifies the existing bootstrap helper and persisted-token path; the previous refusal cannot be attributed to having used the old `.env` token.

The new probe began at **2026-10-17T00:30:48.355Z** (October 16 locally). Exactly one `GeneratePacket.supplyAsync` invocation was made. No retry followed.

| Call | Result |
|---|---|
| Bootstrap helper: sender AuthorizeAlias via POST `https://subscription.xqmsg.net/v2/authorizealias` | Helper succeeded with an unexpired access-token string; secret body suppressed. The helper does not expose raw HTTP status to its caller. Token saved to `.env`. |
| Fresh recipient AuthorizeAlias, same endpoint | HTTP 200; token-string body suppressed |
| Fresh non-recipient AuthorizeAlias, same endpoint | HTTP 200; token-string body suppressed |
| `GeneratePacket({key: randomShare, recipients: [recipientAlias], expires: 1, dor: true, type: 8, meta: {receipt: marker}})` via POST `https://subscription.xqmsg.net/v2/packet` | **HTTP 412**, body below |

```json
{"status":"You do not have the required rights to use this service","right":"transfer/data"}
```

Both response fields are strings. GeneratePacket used the existing regenerated application API key and the freshly minted, saved sender bearer token. Its validation-server upload was not reached; no locator was produced.

- Recipient fetch and share equality: **not attempted**, blocked by failed generation.
- Subsequent non-recipient fetch/refusal: **not attempted**, blocked by failed generation.
- GetEventLogs row shape: **not available**; no fetch occurred and no log call was made. No fetch-event field contract is inferred from SDK declarations. Dashboard access-token provisioning remains absent from the local environment.
- Communications: **not inspected; visibility unknown**. No claim of absence in the UI is made.

The diagnostic stopped at the first packet refusal. No token values, key material, TeamID or locator were retained in this note or diagnostic output. Sanitized result: `tmp/xq-database-probe-fresh-sender-result.json`; invocation wrapper: `tmp/xq-fresh-sender-run.mts`. Existing probe records remain intact. No tests, gate, commit or push were run.

## 2026-10-16 addendum — sender changed to licensed-team address

The operator reported that the earlier failures used an arbitrary sender alias outside the licensed XQ team, then confirmed updating `OPINTEL_XQ_SENDER_ALIAS` in `.env` to the intended team address. This is operator-provided membership information; this diagnostic did not independently inspect XQ team membership. No alias value is recorded here.

The existing `bootstrap()` helper authorized the updated sender successfully, returned an unexpired token, and the diagnostic saved only that new sender token to `.env`. The probe loaded that token and updated alias afresh. The helper's token response was consumed in memory, never printed. No endpoint, timeout, running service or other configuration value was changed by this diagnostic.

Probe start: **2026-10-17T01:02:54.102Z** (October 16 locally). Exactly one type-8 GeneratePacket invocation was made under this authorization; no retry followed.

| Call | Result |
|---|---|
| Existing bootstrap helper: AuthorizeAlias for updated sender | Successful helper result with unexpired token; secret body omitted. Raw HTTP status is not exposed by the helper. |
| AuthorizeAlias for fresh test recipient | HTTP 200, token-string body omitted |
| AuthorizeAlias for distinct non-recipient | HTTP 200, token-string body omitted |
| GeneratePacket via POST `https://subscription.xqmsg.net/v2/packet` | HTTP **412**, exact non-secret body below |

GeneratePacket arguments remained `{key: randomShare, recipients: [recipientAlias], expires: 1, dor: true, type: 8, meta: {receipt: marker}}`. Authentication used the configured application API key and the newly authorized updated sender's bearer token. The SDK flattened the recipients array as before.

```json
{"status":"You do not have the required rights to use this service","right":"transfer/data"}
```

The response has two fields, `status: string` and `right: string`. The changed sender did not remove the observed 412. This does not establish why XQ still refuses the request or independently prove the sender's effective licence membership.

No validation-server packet upload occurred and no locator was returned. Named-recipient fetch/share equality and subsequent non-recipient refusal were therefore **not attempted**. No GetEventLogs request or fetch occurred, so there is **no observed fetch-event row shape** from this run. Communications was **not inspected; packet visibility remains unknown**, rather than proven absent.

Sanitized record: `tmp/xq-database-probe-team-sender-result.json`; guarded wrapper: `tmp/xq-team-sender-run.mts`. Earlier evidence was preserved. No alias values, tokens, key material or TeamID are included in the note or terminal report. No tests, gate, commit or push. Stopped after the single packet attempt.

## 2026-10-16 addendum — operator updated keys again

After the operator confirmed another key update and authorized another attempt, the diagnostic reloaded `.env`, minted a fresh sender token through the existing bootstrap helper, saved that token to `.env`, and used it with the current configured sender. No alias or secret values were printed or recorded here.

Probe start: **2026-10-17T01:08:49.413Z** (October 16 locally). Exactly one GeneratePacket invocation; no retry. Sender bootstrap succeeded. Recipient and non-recipient AuthorizeAlias calls each returned HTTP 200 (token-string bodies omitted).

The unchanged type-8 call (`key: randomShare`, one recipient, `expires: 1`, `dor: true`, `type: 8`, receipt-marker metadata) to POST `https://subscription.xqmsg.net/v2/packet` returned **HTTP 412**:

```json
{"status":"You do not have the required rights to use this service","right":"transfer/data"}
```

Both fields have string values. No validation-server upload or locator followed. Recipient fetch/share comparison, non-recipient fetch and GetEventLogs were not attempted; no fetch-event row schema was observed. Communications remains uninspected and visibility unknown. This run does not determine why the provider still refuses the current configuration.

Sanitized record: `tmp/xq-database-probe-updated-keys-result.json`. No endpoints or timeouts changed, no running service restarted, no tests or gate run. Stopped after the single attempt.

## 2026-10-16 addendum — subsequent explicitly authorized recheck

At the operator's renewed instruction, the diagnostic reloaded the current `.env`, minted a fresh sender token through `bootstrap()`, saved that token locally, and made exactly one further type-8 GeneratePacket invocation. Probe start: **2026-10-17T01:22:13.332Z** (October 16 locally). No retry followed.

Sender bootstrap succeeded. Recipient and non-recipient AuthorizeAlias requests each returned HTTP 200; secret token-string bodies are omitted. The unchanged GeneratePacket request (random share, one recipient, one-hour expiry, `dor: true`, `type: 8`, receipt-marker metadata) to POST `https://subscription.xqmsg.net/v2/packet` returned **HTTP 412**:

```json
{"status":"You do not have the required rights to use this service","right":"transfer/data"}
```

Observed response fields: `status: string`, `right: string`. The validation-server upload was not reached and no locator was returned. Recipient retrieval/share equality, non-recipient refusal and GetEventLogs remained blocked and were not attempted. No fetch-event row shape was observed. Communications visibility remains uninspected, not proven absent.

Sanitized record: `tmp/xq-database-probe-recheck-2-result.json`. No alias values, tokens, API keys, share material or TeamID are recorded here. Endpoints and timeouts were unchanged; no running service was restarted. No tests or gate. Stopped after this single attempt.

## 2026-10-16 addendum — begin verified-user, explicit-team flow

At **2026-10-17T02:14:14.782Z** (October 16 locally), sent exactly one POST to `https://subscription.xqmsg.net/v2/authorize`, authenticated with the configured General API key, with JSON `{user: configuredSender, codetype: 'pin'}`. Response: **HTTP 200**, nonempty pre-authentication token string; secret body omitted. The pre-auth token was retained in an ignored local file with mode 0600 for the operator's PIN continuation. No address or token is recorded here.

Stopped for the mailbox PIN as instructed. Code validation, explicit-team exchange and GeneratePacket have **not** been called in this flow. PIN delivery itself has not been independently observed. The intended exchange must include the operator-supplied Team ID in `b`; it must not default to an unspecified team.

Provenance correction: prior probes used **AuthorizeAlias**, i.e. alias-role sender authorization, not the verified-user/PIN flow. They did not call `/exchange` at all. Consequently, although those probes lacked explicit team selection, the record cannot truthfully say they performed an “unscoped exchange.” The operator's explanation of lowest-index-team selection when `b` is omitted is recorded as the reason to require explicit team selection in the forthcoming exchange, not as an observed prior call.

No PIN, token, address, key material or TeamID appears in this note. No endpoint substitutions, timeout changes, tests, gate or packet retries.

### Verified-user flow: PIN validation

At **2026-10-17T02:15:12.136Z**, made one GET `/v2/codevalidation` against the same subscription server using the retained pre-auth token as bearer, the General API key and the operator-supplied PIN query parameter. Result: **HTTP 204**, no response body. No PIN, token or address is recorded here.

No exchange or packet generation was attempted: the explicit Team ID has not yet been supplied, and no XQ team/tenant/business variable was found in `.env`. The SDK CodeValidator automatically exchanges after successful validation, so the diagnostic called the validation endpoint directly to preserve the required explicit-team boundary. Awaiting the Team ID before calling `/v2/exchange?b=<explicit-team>`.

### Explicit-team exchange preflight — blocked before network request

On the operator's instruction to continue, the diagnostic checked the retained state and local `.env` before any network request. PIN validation remains recorded as HTTP 204, no exchange has been attempted, and the configured sender matches the authorized sender. However, `OPINTEL_XQ_TEAM_ID` is absent or empty in this checkout's parsed `.env` (no XQ team/tenant/business variable was found).

The guard stopped before calling `/exchange`; therefore there is no exchange HTTP status or body and no packet attempt. No authorize-flow restart or retry occurred. The team identifier will not be omitted or guessed.

## 2026-10-16 addendum — explicit-team exchange succeeds; escrow succeeds; recipient fetch refuses

At **2026-10-17T02:20:25.769Z** (October 16 locally), made one GET `https://subscription.xqmsg.net/v2/exchange` with `b` explicitly populated from `OPINTEL_XQ_TEAM_ID`, the General API key, and the PIN-validated pre-auth token as bearer. **HTTP 200**, access-token string body omitted. Saved the returned access token as `OPINTEL_XQ_SENDER_ACCESS_TOKEN` in local `.env`. No team identifier, address, PIN, token or key material is recorded here.

Prior failing probes used an **alias-role sender from AuthorizeAlias**. They did not use this verified-user, explicitly team-scoped exchange. This run establishes that the verified-user/team-scoped path can generate the type-8 packet; it does not isolate alias role versus team selection as separate causal variables.

The packet probe began **2026-10-17T02:20:26.696Z**. Exactly one `GeneratePacket.supplyAsync` invocation was made; its two internal HTTP requests are listed separately below. The sender token was loaded directly from the successful exchange; it was not replaced with another AuthorizeAlias token. The fresh recipient and non-recipient still used AuthorizeAlias tokens.

| Order | Call | Status and response |
|---|---|---|
| 1 | AuthorizeAlias for fresh named recipient; POST subscription `/v2/authorizealias` | 200; token-string body omitted |
| 2 | AuthorizeAlias for distinct non-recipient; same endpoint | 200; token-string body omitted |
| 3 | GeneratePacket: POST `https://subscription.xqmsg.net/v2/packet` | **200**; packet-string body omitted |
| 4 | GeneratePacket internal validation upload: POST `https://validation.xqmsg.net/v2/packet` | **200**; locator-string body omitted |
| 5 | Named recipient FetchKey: GET `https://validation.xqmsg.net/v2/key/<locator>` | **403**; body below |
| 6 | Non-recipient FetchKey: same endpoint, distinct alias bearer | **403**; same body below |

GeneratePacket input remained `{key: randomShare, recipients: [recipientAlias], expires: 1, dor: true, type: 8, meta: {receipt: marker}}`; the SDK flattened the recipients array. Both fetches used the locator returned from that single invocation. No retry or alternate endpoint was used.

Both 403 response bodies were:

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

Observed response shape: `{status: string}`. **The escrow 412 is gone in this run. Recipient retrieval failed, so the share was not returned and equality was not confirmed.** The non-recipient was refused, but with both positive and negative cases refusing, this is not a successful recipient-isolation proof. The provider's message suggests checking recipient/team authorization; it does not establish the cause. No further fetch, packet generation or authorization attempt was made.

### Event rows and Communications evidence limits

`OPINTEL_XQ_DASHBOARD_ACCESS_TOKEN` remains absent; the probe did not substitute the subscription access token for a dashboard token. GetEventLogs was not called, so **no full fetch-event row shape was observed**. The HTTP error object above is not a GetEventLogs row.

An attempt to inspect an existing authenticated browser session failed before browser state was available: the UI automation runtime exited with a sandbox initialization error (`unbound variable: TIOCSTI`). Therefore **Communications visibility is not inspected/unknown**, not absent. No packet or fetch retry was made during that check.

Sanitized records: `tmp/xq-explicit-team-exchange-result.json` and `tmp/xq-database-probe-explicit-team-result.json`. Existing evidence is preserved. Only the sender-token setting was updated by this continuation; endpoints and timeouts are unchanged. No tests, gate, commit or push. Stopped after the authorized exchange, single packet invocation and two fetches.

## 2026-10-16 addendum — same validated identity: escrow and retrieval succeed

At **2026-10-17T02:30:07.685Z** (October 16 locally), under explicit authorization for one attempt, generated **one fresh type-8 packet** naming the configured validated sender identity as its sole recipient. Used the same saved, explicitly team-scoped access token for generation and retrieval. No AuthorizeAlias call, new exchange or token replacement occurred in this run.

| Call | Status | Result |
|---|---|---|
| GeneratePacket subscription POST `/v2/packet` | **200** | Packet returned; secret string body omitted |
| GeneratePacket internal validation POST `/v2/packet` | **200** | Locator returned; secret string body omitted |
| FetchKey validation GET `/v2/key/<locator>` as that same identity | **200** | Share returned; exact string equality with the submitted base64url random 32-byte share confirmed in memory |

Input otherwise unchanged: `expires: 1`, `dor: true`, `type: 8`, receipt-marker metadata. **This proves live XQ key-share escrow and retrieval end to end for the same validated, team-scoped identity.** It does not prove per-agent alias retrieval, the entire Opintel MCP/K2/decryption path, or provider corroboration. No second fetch, packet retry, browser, GetEventLogs request or Communications inspection occurred in this run.

Sanitized result: `tmp/xq-database-probe-same-identity-result.json`. No addresses, tokens, locator, TeamID or key material appear here or in the report. Endpoints/timeouts unchanged. Stopped after the one generation and one fetch.

### Per-agent alias requirements — source findings only; no attempted changes

All references below are to installed `@xqmsg/jssdk-core` **2.0.6**, rooted at `node_modules/@xqmsg/jssdk-core/dist/esm/src/com/xqmsg/sdk/v2/services/`.

- **AuthorizeAlias is not a documented team-enrollment operation.** Its description says it creates a user without PIN validation, limited to basic encryption/decryption (`AuthorizeAlias.js:12`). Its request requires `user` and directly stores the returned access token; the implementation does not perform an explicit-team exchange (`AuthorizeAlias.js:20`, `AuthorizeAlias.js:33`). Passing the team-scoped sender's token to an agent would not demonstrate that agent alias's own identity.
- **The documented explicit-team exchange uses a pre-auth token, not an alias access token.** `ExchangeForAccessToken.js:25` obtains `validatePreAuthToken()` and `ExchangeForAccessToken.js:29` sends `{b: teamId.toString()}`. The verified-user pre-auth/PIN contract is described in `Authorize.js:12`. The SDK does not establish that an arbitrary synthetic alias can obtain such a pre-auth token or become eligible for that team merely by supplying `b`.
- **Fetch authorization is checked server-side.** `FetchKey.js:14` documents a valid, unexpired requesting-user token and being listed as a recipient, alongside expiry/location conditions. `FetchKey.js:32` sends the active identity's bearer token and locator; it supplies no team-selection parameter to FetchKey itself. The prior 403 mentions recipient/team, but does not distinguish missing membership from token scope or another provider policy.
- **A contact API is not proof of alias enrollment semantics.** `dashboard/AddContact.js:21` requires email, role and notification fields and uses dashboard authorization (`dashboard/AddContact.js:29`). These client declarations do not say that adding a synthetic alias makes its existing alias token eligible to retrieve a team-scoped packet.

**Conclusion: the pinned SDK alone does not establish whether a per-agent alias needs team membership, its own scoped exchange, or a separate provider capability.** XQ must specify the supported machine-alias enrollment/token-issuance contract: whether alias-role principals can receive these packets at all; whether and how membership is granted; and whether AuthorizeAlias can issue a team-scoped recipient token or a distinct exchange is required. A reviewed contract would then need a positive alias retrieval and a distinct-alias refusal test. No membership mutation, alias exchange, role change or new live experiment was attempted here.

## 2026-10-16 addendum — fresh per-agent alias recipient, conditional negative control

At **2026-10-17T02:37:41.167Z** (October 16 locally), retained the existing validated, explicitly team-scoped sender identity/token unchanged. Authorized one fresh per-agent alias, addressed exactly one fresh type-8 packet to that alias, then attempted exactly one fetch using the alias's returned AuthorizeAlias access token.

| Call | Status | Result |
|---|---|---|
| Recipient AuthorizeAlias; POST subscription `/v2/authorizealias` | **200** | Alias access-token string returned; secret body omitted |
| GeneratePacket subscription POST `/v2/packet` | **200** | Packet string returned; secret body omitted |
| Same GeneratePacket invocation's validation POST `/v2/packet` | **200** | Locator string returned; secret body omitted |
| FetchKey as that recipient alias; GET validation `/v2/key/<locator>` | **403** | Exact body below |

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

The response shape is `{status: string}`. **No share was returned; share equality was not established.** Generation used the current team-scoped sender token; fetch used the freshly authorized named recipient alias token. Input otherwise remained one-hour expiry, `dor: true`, numeric storage `type: 8`, a random 32-byte share and receipt-marker metadata.

Stopped on the recipient's 403. The conditional unrelated-alias authorization/fetch was **not performed**, because positive retrieval failed. No membership changes, role changes, alternate exchange, workaround, browser, event-log request or retry occurred. This is negative evidence for XQ about this alias-recipient path, not a claim that every possible alias configuration is unsupported or that the precise server-side cause is known.

Sanitized record: `tmp/xq-database-probe-alias-binding-result.json`. No token values, addresses, aliases, key material, locator or TeamID are included in this note or terminal report. No configuration changes, tests, gate, commit or push.

## 2026-10-16 addendum — enrollment gap confirmed; stopped for dashboard authorization

Read-only production-path inspection confirms **AddContact is not called during credential registration**. `src/platform/http/start.ts:242` wires the credential repository's provisioning callback to release custody; `src/modules/pools/infrastructure/keys.ts:110` invokes it for a newly created credential. `src/modules/release-custody/infrastructure/runtime.ts:130` calls `provider.register(alias)`, `xq-provider.ts:22` dispatches the worker register operation, and `xq-worker.mjs:36` calls only `AuthorizeAlias({user: alias})`. No AddContact implementation was found in the production custody/pool path.

This is a **production provisioning gap as well as a probe gap**, relative to the SDK's documented external-ID alias enrollment flow. It is not proof that enrollment alone will resolve the observed 403; that still requires the authorized positive retrieval experiment.

Installed `@xqmsg/jssdk-core` 2.0.6 README lines **1044–1050** describe creating an external-ID account with the Alias role; lines **1067–1074** show `AddContact` with `RolesEnum.ALIAS` and `NotificationEnum.NONE`. The AddContact service requires email/identifier, role and notification fields and obtains a **dashboard access token**, then POSTs to the dashboard `contact` service (`node_modules/@xqmsg/jssdk-core/dist/esm/src/com/xqmsg/sdk/v2/services/dashboard/AddContact.js:21`, `:29`).

Local configuration check: dashboard API key present; **dashboard access token absent** (checked in process environment plus `.env`, without printing values). Per the explicit stop condition, no AddContact, AuthorizeAlias, GeneratePacket or FetchKey call was made in this turn. No membership changes, browser or retries.

### What obtains the missing dashboard token

The pinned SDK provides **DashboardLoginVerify**, specifically for a user already authorized through the subscription flow. `node_modules/@xqmsg/jssdk-core/dist/esm/src/com/xqmsg/sdk/v2/services/dashboard/DashboardLoginVerify.js:39` loads the current XQ access token and uses it as bearer; line **44** performs GET `https://dashboard.xqmsg.net/v2/login/verify?request=sub` with dashboard destination authentication. The destination selects the dashboard API key (`.../v2/XQSDK.js:90`). On success the returned dashboard token is placed in the dashboard cache (`DashboardLoginVerify.js:48–51`). This is a documented exchange, not permission to substitute the subscription token directly for a dashboard token. DashboardLogin is another SDK path, but no login or exchange was attempted here.

Next authorized step would be DashboardLoginVerify with the current validated user's token and dashboard API key, then verification of the returned dashboard/business scope before enrolling the alias. Success and business selection are not assumed from the client source alone. The requested enrollment/packet attempt remains unconsumed. No production code edits or tests in this investigation.

## 2026-10-16 addendum — dashboard authorization and ALIAS enrollment succeed; retrieval still refuses

At **2026-10-17T02:44:41.300Z** (October 16 locally), ran the explicitly authorized chain once, stopping at the first unexpected failure. Sender remained the existing validated, explicitly team-scoped identity. No sender-token replacement, browser, workaround or retry occurred.

| Step | Exact service call | Status | Result/body shape |
|---|---|---|---|
| 1 | DashboardLoginVerify: GET `https://dashboard.xqmsg.net/v2/login/verify?request=sub`, validated XQ access token as bearer and dashboard API key | **200** | Dashboard access-token string returned; retained in memory only, not printed or saved |
| 2 | AddContact: POST `https://dashboard.xqmsg.net/v2/contact`, dashboard bearer/key; `{email: freshAlias, role: RolesEnum.ALIAS, notifications: NotificationEnum.NONE}` | **200** | `{id: number, status: string}`; SDK role ALIAS is 7, notifications NONE is 0 |
| 3 | AuthorizeAlias: POST `https://subscription.xqmsg.net/v2/authorizealias`, `{user: sameFreshAlias}` | **200** | Alias access-token string returned; secret omitted |
| 4a | GeneratePacket: POST `https://subscription.xqmsg.net/v2/packet` as unchanged validated sender | **200** | Packet string returned; secret omitted |
| 4b | Same invocation's validation POST `https://validation.xqmsg.net/v2/packet` | **200** | Locator string returned; secret omitted |
| 4c | FetchKey: GET `https://validation.xqmsg.net/v2/key/<locator>` using the enrolled recipient's AuthorizeAlias bearer | **403** | Exact body below |

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

The fetch body has one field, `status: string`. **No share returned; no equality established.** Exactly one GeneratePacket invocation used a fresh random 32-byte share, one recipient (the same newly enrolled alias), `expires: 1`, `dor: true`, numeric `type: 8`, and receipt-marker metadata.

AddContact succeeded in the business context selected by DashboardLoginVerify. No separate current-business read or team-membership inspection was performed in this chain, so the provider response is evidence of successful contact creation, not independent proof that the dashboard and subscription token business scopes agree. Enrollment alone has not established working alias retrieval; the precise remaining server-side cause is not determined by this 403.

Stopped at the recipient fetch failure, as instructed. No second-alias enrollment/authorization/fetch, GetEventLogs or GetCommunications call occurred. Consequently there is no event-row shape, locator/alias/timestamp/origin mapping, timestamp unit/zone evidence, or Communications visibility result from this run. Those conditional stages remain unexecuted, not failed tests.

Sanitized record: `tmp/xq-enrolled-alias-chain-result.json`. One test alias contact was created remotely; no cleanup or additional mutation was attempted after failure. The dashboard token was held only in the process cache and cleared on exit. No addresses, tokens, key material, locator or TeamID are recorded in the note or terminal report. No production code changes, tests, gate, commit or push in this continuation.

## 2026-10-16 addendum — SDK role inventory and DEVICE attempt

The installed SDK **does define ALIAS = 7**; absence from the console's six displayed choices does not establish that the SDK value is unrecognized by the server. Conversely, the earlier AddContact 200 does not independently establish its stored/effective role. No contact read-back was performed.

Role mapping from `node_modules/@xqmsg/jssdk-core/dist/esm/src/com/xqmsg/sdk/v2/RolesEnum.js` (pinned 2.0.6):

| SDK constant | Value | Console label supplied by operator | Source line |
|---|---|---|---|
| SUPER_USER | 5 | Super User | 20 |
| USER | 2 | User | 24 |
| DEVICE | 6 | Device | 18 |
| ADMIN | 1 | Admin | 12 |
| VENDOR | 4 | Vendor | 26 |
| CUSTOMER | 3 | Customer | 16 |
| ALIAS | 7 | Not among those six choices | 14 |
| UNKNOWN | 0 | Not among those six choices | 22 |

At **2026-10-17T02:53:06.184Z** (October 16 locally), made the single authorized DEVICE enrollment attempt with a fresh synthetic per-agent identifier in the `email` field, the same identifier form as the previous alias probe. Sender remained the validated team-scoped identity. DashboardLoginVerify returned **200**, supplying a dashboard token held only in memory. AddContact sent `{email: freshIdentifier, role: RolesEnum.DEVICE, notifications: NotificationEnum.NONE}` (numeric role **6**, notifications **0**) to POST `https://dashboard.xqmsg.net/v2/contact` and returned **403**:

```json
{"status":"Contact cannot be created with this role and address"}
```

Response shape: `{status: string}`. **Stopped at enrollment**, before AuthorizeAlias, packet generation or fetch. No share was returned or compared because those stages were not reached. No second device, event-log call, other role, alternate address, browser, workaround or retry was attempted. This refusal concerns the requested role/address combination; it does not prove that DEVICE is unsupported for all address forms.

Sanitized record: `tmp/xq-device-alias-chain-result.json`. Dashboard credentials were cleared from the process cache on exit, not persisted. No token values, addresses, identifiers or key material appear in the note. No production configuration edits, tests, gate, commit or push in this continuation.

## 2026-10-16 addendum — explicitly requested SUPER_USER attempt

At **2026-10-17T03:02:51.034Z** (October 16 locally), made one operator-authorized attempt using `RolesEnum.SUPER_USER` (**5**) and a fresh synthetic identifier of the same format as the prior probes, not an email address. The SDK describes this role as full authority including billing; this was explicitly disclosed before the call. Sender remained the existing validated, team-scoped identity.

| Call | Status |
|---|---|
| DashboardLoginVerify | **200**, dashboard token returned in memory |
| AddContact, role 5, notifications 0 | **200**, response shape `{id: number, status: string}` |
| AuthorizeAlias for that same fresh contact identifier | **200**, token string returned |
| One GeneratePacket, numeric type 8: subscription stage | **200** |
| Same GeneratePacket: validation stage | **200** |
| FetchKey as that recipient using its AuthorizeAlias token | **403** |

Exact fetch response:

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

No share returned and no equality established. Stopped at that failure. No second contact, second fetch, event-log request, browser, role fallback or retry. AddContact succeeded remotely for the requested privileged role; no read-back of effective role and no cleanup/removal was performed. This experiment does not establish the cause of the retrieval refusal.

Sanitized record: `tmp/xq-super-user-alias-chain-result.json`. Secret payloads, contact identifiers, addresses, key material and TeamID are omitted. No production code/configuration edits, tests, gate, commit or push.

## 2026-10-16 addendum — explicitly requested USER attempt

At **2026-10-17T03:04:47.710Z** (October 16 locally), made one operator-authorized attempt with `RolesEnum.USER` (**2**) using the same synthetic identifier format and unchanged validated, team-scoped sender.

DashboardLoginVerify, AddContact (role 2, notifications 0), and AuthorizeAlias each returned **200**. AddContact's response shape was `{id: number, status: string}`; token payloads were suppressed. Exactly one type-8 GeneratePacket invocation returned **200** at both subscription and validation stages. FetchKey using the newly enrolled recipient's AuthorizeAlias token returned **403**:

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

No share returned; no equality established. Stopped at the recipient fetch failure. No second contact, negative-control fetch, event-log call, browser, workaround or retry. The newly created contact remains; no cleanup or effective-role read-back was performed.

Sanitized record: `tmp/xq-user-role-alias-chain-result.json`. No addresses, contact identifiers, tokens, key material, locator or TeamID are recorded here. No production configuration/code edits, tests, gate, commit or push.

## 2026-10-16 addendum — explicitly requested ALIAS recheck

At **2026-10-17T03:06:02.441Z** (October 16 locally), made one newly authorized attempt with `RolesEnum.ALIAS` (**7**), a fresh synthetic identifier of the same format, and the unchanged validated, team-scoped sender.

DashboardLoginVerify, AddContact (role 7, notifications 0), and AuthorizeAlias each returned **200**. Exactly one type-8 GeneratePacket invocation returned **200** at both subscription and validation stages. FetchKey as the enrolled alias using its AuthorizeAlias token returned **403**:

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

No share returned; no equality established. Stopped at this failure. No second contact, negative-control fetch, event-log request, browser, workaround or automatic retry. The created contact remains; no cleanup or effective-role read-back was performed.

Sanitized record: `tmp/xq-alias-role-recheck-result.json`. No addresses, identifiers, tokens, key material, locator or TeamID are recorded here. No production code/configuration edits, tests, gate, commit or push.

## 2026-10-16 addendum — all XQ policies disabled by operator

**Non-default test condition:** the operator reported disabling all policies in the XQ console before this run. The diagnostic did not inspect or change those settings, and no browser was opened. This result must not be represented as behavior under default/enabled policies.

At **2026-10-17T03:25:12.019Z** (October 16 locally), ran one fresh chain with the existing validated, team-scoped sender, a new synthetic per-agent identifier, and a newly generated packet (no earlier packet reused).

| Call | Status |
|---|---|
| DashboardLoginVerify | **200**, dashboard token returned in memory |
| AddContact, `RolesEnum.ALIAS` (7), notifications NONE (0) | **200** |
| AuthorizeAlias for that same fresh recipient | **200** |
| One type-8 GeneratePacket: subscription stage | **200** |
| Same GeneratePacket: validation stage | **200** |
| FetchKey as the named alias with its AuthorizeAlias token | **403** |

Exact fetch response:

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

**No share returned; no equality established.** GeneratePacket retained one-hour expiry, `dor: true`, numeric `type: 8`, random share and receipt-marker metadata. This observed refusal persists under the operator-reported disabled-policy condition; no conclusion about its precise cause or server-side policy propagation is inferred.

Stopped after the single recipient fetch. No retry, second alias, additional packet, event-log query, browser or workaround. The created contact remains; no cleanup performed. Sanitized record: `tmp/xq-alias-policies-disabled-result.json`. No addresses, identifiers, tokens, key material, locator or TeamID are included here. No local production configuration/code changes, tests, gate, commit or push.

## 2026-10-16 addendum — bearer selection and isolated-process fetch

### Earlier probe credential handling

The previous probe uses **one XQSDK instance with multiple cached profiles**, not one permanently shared identity: `tmp/xq-alias-policies-disabled.mjs:17` constructs the instance; line 28 selects/stores the sender token; line 41 obtains the recipient's AuthorizeAlias token; line 44 restores the sender before generation; lines 46–47 explicitly select the alias, store its token under that profile, and fetch.

In installed SDK 2.0.6, `services/AuthorizeAlias.js:33–35` stores the returned alias access token and **changes the active profile to that alias**. `services/FetchKey.js:32–35` obtains `validateAccessToken()` and makes it the bearer. `XQSDK.js:212–221` resolves that token from the **currently active profile's XQ cache**, not its dashboard cache. These SDK paths are under `node_modules/@xqmsg/jssdk-core/dist/esm/src/com/xqmsg/sdk/v2/`. Thus the source selects the alias bearer for the earlier fetch; the historical probes did not instrument header equality to independently verify it on the wire.

### One fetch in a separate process

At **2026-10-17T03:37:59.578Z** (October 16 locally), generated one fresh type-8 packet after fresh ALIAS enrollment/authorization, with the existing validated sender in the parent process. DashboardLoginVerify, AddContact, AuthorizeAlias and both GeneratePacket stages returned **200**.

Fetch ran in a new Node executable with a fresh SDK. `tmp/xq-isolated-alias-chain.mjs:50` launches it with `env: {}`, empty `execArgv`, and cwd `/private/tmp`; line 52 sends only the General API key, recipient alias, recipient access token and locator over IPC. No sender token, dashboard token, expected share or full environment object was passed. The child does not read `.env`. `tmp/xq-isolated-fetch-child.mjs:8–9` creates a fresh SDK, clears profiles and installs only the alias token. Lines 11–14 enforce one request and check the actual outgoing Authorization header against that token before sending.

Observed **fetchRequests = 1**, **bearerMatchesAliasToken = true**, **HTTP 403**:

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

**No share returned; no equality established.** The refusal reproduces with no sender token supplied to the fetch process. It is not explained by accidentally selecting the sender bearer in that request.

The diagnostic's overly strict `cleanEnvironment` check returned false: it tests that the runtime environment has literally zero keys, rather than that no credentials are inherited. A separate local, network-free Node launch with `env: {}` observed macOS injecting `__CF_USER_TEXT_ENCODING`. The actual fetch process did not report its environment key list, so that control is explanatory evidence, not a retroactive measurement of every key in that process. The explicit child environment and IPC input are the source evidence for credential separation. No provider request was repeated for this check.

Policy context remains the operator's earlier report of all XQ policies disabled; it was not re-inspected. Sanitized record: `tmp/xq-isolated-alias-result.json`. No browser, second fetch, workaround, secret output, tests or gate. The newly enrolled contact remains. Stopped after the single isolated fetch.

## 2026-10-17 addendum — trusted-egress preflight and fresh alias attempt

### AuthorizeAlias optional parameters

Installed SDK 2.0.6 declares `{user: string, firstName?: string, lastName?: string}` at `node_modules/@xqmsg/jssdk-core/dist/types/src/com/xqmsg/sdk/v2/services/AuthorizeAlias.d.ts:4–8`. There is **no documented device/trusted-IP/automatic-onboarding opt-in parameter**. The implementation requires only `user` and forwards the supplied payload (`dist/esm/src/com/xqmsg/sdk/v2/services/AuthorizeAlias.js:20–29`). Forwarding arbitrary fields does not establish that the provider supports additional options. This run used `{user: freshAlias}` only; no guessed parameter.

### Egress and team verified before alias/packet attempt

Preflight began **2026-10-17T19:24:09.978Z**. DashboardLoginVerify, GetCurrentBusiness and GetTrustedRanges each returned **200**. The returned business `id` matched configured `OPINTEL_XQ_TEAM_ID` in memory. GetTrustedRanges returned `{ranges: [{id: number, tag: string, fence: string, channel: number, secureKey: string}], status: string}`; no values are disclosed here.

A credential-free HTTPS request from this machine to the public-IP service `api.ipify.org` observed its IPv4 egress. The trusted entry's `fence` parsed as an IP network, and Python `ipaddress` confirmed **the observed egress belongs to that network**. No XQ credentials were sent to the IP service. This verifies the measured local egress against the correct team's configured range; the range endpoint does not prove the source address XQ actually observed on a later request, or that automatic onboarding was selected/applied.

Sanitized preflight records: `tmp/xq-trusted-preflight-result.json`, `tmp/xq-trusted-match-result.json`. Raw preflight comparison inputs are restricted to an ignored mode-0600 local file; no IP/address, team identifier or secure-key value was printed or copied here.

### Exactly one fresh chain

At **2026-10-17T19:24:33.649Z**, after the successful preflight, used the existing validated, team-scoped sender and a fresh synthetic recipient identifier. As requested for this chain, **no AddContact** was called: the recipient was authorized directly from the trusted machine.

| Call | Status |
|---|---|
| DashboardLoginVerify, to support conditional event inspection | **200** |
| AuthorizeAlias for the fresh recipient, `{user}` only | **200** |
| One type-8 GeneratePacket: subscription stage | **200** |
| Same GeneratePacket: validation stage | **200** |
| FetchKey with that recipient alias's token | **403** |

Exact response:

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

**No share returned; no match established.** Packet input remained one-hour expiry, `dor: true`, numeric type 8 and receipt-marker metadata. The observed trusted-range match did not make this AuthorizeAlias retrieval succeed. No inference is made that the separate device-onboarding mechanism was exercised.

Stopped at the recipient refusal. No second alias, negative-control fetch, GetEventLogs request, browser, automatic retry or workaround. Therefore no successful-fetch event row or locator/alias/timestamp/origin mapping exists from this run. Sanitized record: `tmp/xq-trusted-alias-chain-result.json`. The operator's earlier all-policies-disabled condition was not re-inspected in this run; neither default policies nor continued policy disabling is independently established. No configuration/code changes, tests, gate, commit or push in this continuation.

## 2026-10-17 addendum — fresh reproduction for XQ with current conditions

Policy Manager policies: **disabled**, explicitly confirmed by the operator in this turn and recorded at **2026-10-17T19:40:20.529Z**. This is current operator evidence, not an inferred carry-forward or an API/browser observation. The installed SDK has no Policy Manager read service; GetSettings concerns notification/newsletter preferences. No policy settings were changed.

Trusted-range conditions: read afresh after the chain's sole DashboardLoginVerify (required to read dashboard configuration), before contact enrollment or packet generation. GetCurrentBusiness returned 200 at **19:40:36.782Z** and its business id matched configured Team ID. GetTrustedRanges returned 200 at **19:40:37.153Z**; **a trusted range remains configured**. An unauthenticated public-IP lookup from this machine plus `ipaddress` network membership comparison established **the measured egress IPv4 is inside that range**, with no unparsed ranges. No IP addresses, range values or credentials were printed or recorded here. The check establishes measured egress membership, not XQ's own per-request source-IP observation. No trusted-range settings changed.

Exactly one pass, with a fresh synthetic alias, ALIAS role (7), notifications NONE (0), the existing validated team-scoped sender, and one new type-8 packet:

| Step | UTC request-start timestamp | HTTP status |
|---|---|---|
| DashboardLoginVerify | 2026-10-17T19:40:36.540Z | **200**, dashboard access token returned |
| AddContact, ALIAS role | 2026-10-17T19:40:53.636Z | **200**, `{id: number, status: string}` |
| AuthorizeAlias, same alias | 2026-10-17T19:40:53.891Z | **200**, alias token returned |
| GeneratePacket subscription stage | 2026-10-17T19:40:54.221Z | **200**, packet returned |
| Same invocation's validation stage | 2026-10-17T19:40:54.449Z | **200**, locator returned |
| FetchKey as that alias | **2026-10-17T19:40:54.597Z** | **403** |

The fetch timestamp above was recorded immediately before dispatching the HTTP request; it is the local UTC request-start timestamp for XQ event correlation, not a provider-event timestamp. GeneratePacket retained numeric type 8, one-hour expiry, `dor: true`, one recipient, a random share and receipt-marker metadata. The active profile and bearer for fetch were the fresh alias and its AuthorizeAlias token.

Exact failure body:

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

No share returned; no equality established. Stopped after that fetch. One attempt per chain step; GeneratePacket's two requests are its normal internal stages, not retries. No workaround, browser, additional alias, event-log call, endpoint/timeouts change, test or gate. The created contact remains; no cleanup performed. Sanitized record: `tmp/xq-fresh-event-pass-result.json`. No tokens, addresses, key material, locator or TeamID are recorded here.

## 2026-10-17 security finding — owner retrieves packet addressed only to alias

One explicitly authorized control run began **2026-10-17T19:44:39.114Z**. A fresh alias was enrolled using ALIAS role and authorized, and exactly one fresh type-8 packet was addressed **only to that alias**. The validated owner remained the sender but was **not in the supplied recipients list**. The only fetch used the validated owner's bearer token, not the alias token; the transport checked that the actual outgoing bearer equalled the configured validated owner token (`ownerBearerConfirmed: true`).

| Call | UTC request-start timestamp | Status |
|---|---|---|
| DashboardLoginVerify | 2026-10-17T19:44:39.118Z | 200 |
| AddContact, fresh ALIAS | 2026-10-17T19:44:39.458Z | 200 |
| AuthorizeAlias for fresh alias | 2026-10-17T19:44:39.668Z | 200 |
| GeneratePacket subscription stage | 2026-10-17T19:44:39.939Z | 200 |
| Same invocation's validation stage | 2026-10-17T19:44:40.074Z | 200 |
| **Fetch as validated owner, absent from recipients** | **2026-10-17T19:44:40.469Z** | **200** |

**Security finding: the non-recipient validated owner received the share, and it matched the submitted share exactly.** This fails the expected recipient-list-only access boundary in this tested configuration. It must not be reported as recipient binding passing. The response body was the share string and is intentionally not reproduced.

Input: `{key: randomShare, recipients: [freshAlias], expires: 1, dor: true, type: 8, meta: {receipt: marker}}`. The SDK's normal recipient flattening was used; the owner was not added by the probe. The experiment does not determine whether provider behavior is an intentional sender/owner privilege, a policy-dependent exception, or a defect. Those distinctions require XQ's explanation, not more probing in this authorization.

Context immediately preceding this control: operator confirmed policies disabled, and the prior run verified the correct team's trusted range includes measured machine egress. Neither setting was changed or re-inspected in this control. The finding is scoped to this configuration, not asserted as default-policy behavior or arbitrary non-owner access.

**Stopped immediately after this one fetch.** No alias fetch, other identity, second packet, retry, event-log request, browser, cleanup or further probe. Sanitized record: `tmp/xq-owner-nonrecipient-control-result.json`. No addresses, tokens, locator, TeamID or key material are included in this note or terminal output. No tests, gate, commit or push.

## 2026-10-17 addendum — contact inventory after console certificate creation

At **2026-10-17T20:01:12.379Z**, began one dashboard authorization and one unfiltered GetContacts read. DashboardLoginVerify and GET `https://dashboard.xqmsg.net/v2/contact/all` both returned **200**. The SDK supplied null filters. Response `total` was **8**, and **all 8** contacts were returned.

No **DEVICE** role appears. Returned roles are Alias, SuperUser and User. Therefore no device identity was available for the conditional packet test: **no GeneratePacket or fetch was attempted**. This establishes absence of a DEVICE contact in this current dashboard contact inventory; it does not establish the certificate's identity/storage model elsewhere in XQ.

Full returned inventory, using contact record IDs as identifiers and redacting address values:

| Contact ID | Identifier shape | Role (returned spelling) | State | Created time |
|---|---|---|---|---|
| 17789 | `opintel-enrolled-<UUID>@<domain>` | Alias | Validated | Not supplied |
| 17790 | `opintel-enrolled-<UUID>` | SuperUser | Invited | Not supplied |
| 17791 | `opintel-enrolled-<UUID>` | User | Invited | Not supplied |
| 17792 | `opintel-enrolled-<UUID>@<domain>` | Alias | Validated | Not supplied |
| 17793 | `opintel-enrolled-<UUID>@<domain>` | Alias | Validated | Not supplied |
| 17794 | `opintel-enrolled-<UUID>@<domain>` | Alias | Validated | Not supplied |
| 17800 | `opintel-enrolled-<UUID>@<domain>` | Alias | Validated | Not supplied |
| 17801 | `opintel-enrolled-<UUID>@<domain>` | Alias | Validated | Not supplied |

The contact response fields are `id: number`, `bid: number`, `fn: string`, `ln: string`, `email: string`, `phone: string`, `title: string`, `isLocal: boolean`, `role: string`, `state: string`, `ss: number`, `n: number`, `last: number`, `more: string`. There is no explicit creation timestamp. `more` is empty for every contact. The numeric `last` field is not relabelled as creation time without a documented meaning.

A relevant observed distinction: the Alias contacts' returned email fields have a 53-character probe-identifier local part and an 11-character domain, whereas SuperUser and User retain the 53-character synthetic non-email string. This is the returned shape only, not proof of the authentication or recipient canonicalization contract. No additional experiment was performed.

Sanitized record: `tmp/xq-device-contacts-result.json`; raw contact response retained only in ignored mode-0600 `tmp/xq-device-contacts-private.json`. No addresses, tokens, TeamID or key material appear in this note. No browser, retries, mutations, tests or gate. Stopped because the conditional DEVICE identity was absent.

## 2026-10-17 addendum — numeric Contact ID as packet recipient

Selected existing contact **17789**, returned as `Alias` / `Validated` in the preceding complete GetContacts inventory. Used its returned email-shaped identifier to obtain an alias token; no contact was created or modified. This differs from earlier probes that authorized the original synthetic identifier before observing the returned email shape; no conclusion isolates those differences here.

Exactly one pass, beginning **2026-10-17T20:06:49.377Z**:

| Call | UTC request-start timestamp | Status |
|---|---|---|
| AuthorizeAlias for the selected contact's returned identifier | 2026-10-17T20:06:49.394Z | **200** |
| GeneratePacket subscription stage, `recipients: ["17789"]`, `type: 8` | 2026-10-17T20:06:49.949Z | **200** |
| Same invocation's validation stage | 2026-10-17T20:06:50.109Z | **200** |
| FetchKey with that alias's returned access token | **2026-10-17T20:06:50.459Z** | **403** |

**GeneratePacket accepted the numeric Contact ID encoded as a recipient string. Fetch did not return a share; equality was not established.** Acceptance does not prove that the server resolved the numeric string to a contact rather than treating it as a literal recipient identifier.

Exact fetch failure body:

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

The validated, team-scoped sender and all other packet options were unchanged (one-hour expiry, `dor: true`, random share, receipt-marker metadata). The SDK joined the one-element recipients array as usual. Last operator policy report was disabled; settings and egress were not re-inspected or changed in this run.

Stopped on the first failure. No retries, alternate representation, additional identity, browser, event-log query or workaround. Sanitized record: `tmp/xq-contact-id-recipient-result.json`. No addresses, token values, key material, locator or TeamID are included here. No tests, gate, commit or push.

## 2026-10-17 — device certificate export, offline inspection only

Step 1 only. Inspected `docs/certs/OpintelAgentic-223.zip` and extracted into a new initially empty directory, `tmp/xq-device-certificate-mg45p1f4` (directory mode 0700; extracted/decoded files mode 0600). No live request, TLS handshake, packet generation, browser or fetch occurred.

Archive inventory:

| File | Extension | Encoding/type |
|---|---|---|
| client.crt | .crt | 2592 bytes of base64 text, decoding to 1942-byte PEM `CERTIFICATE` (X.509) |
| client.key | .key | 3168 bytes of base64 text, decoding to 2375-byte unencrypted DER PKCS#8 private key; OpenSSL validates it |
| transport.key | .key | 64 bytes of base64 text, decoding to 48 opaque bytes; not PEM; purpose/algorithm not established |

Derived local inspection files: `client.decoded.crt.pem` and `client.decoded.key.der`. No private-key bytes, transport-key bytes, certificate body or public-key body were printed. OpenSSL parsed key ASN.1 structure without displaying integer/octet values; its top-level child tags are INTEGER, SEQUENCE, OCTET STRING (PKCS#8 structure). Certificate/public-key equality was checked in memory: **the private key matches the certificate**.

OpenSSL 3.6.0 certificate metadata (subject values expressly requested for this offline inspection):

- Subject: `emailAddress=<owner>,OU=OpintelAgentic,O=Zumba,CN=XQ Trusted Certificate`
- Issuer: `C=US,ST=California,L=Walnut Creek,O=XQ MESSAGE INC,CN=XQ Trusted Certificate`
- Not before: **2026-10-17 20:21:36 UTC**
- Not after: **2028-10-16 20:21:36 UTC**
- SHA-256 fingerprint: `EA:40:B4:F4:D2:0F:B2:D6:44:32:58:35:82:D8:52:5F:CF:EB:81:D7:5E:32:85:29:35:76:D1:9B:7C:56:7B:FE`
- SAN: **absent**
- Key Usage: **absent**
- Extended Key Usage: **absent**
- Basic Constraints: **absent**

OpenSSL reports “No extensions in certificate.” The subject carries an email address, organizational unit and organization label. It does not label any field as an agent alias, device ID or numeric Team ID; mapping the labels/email to an XQ principal cannot be established from this certificate alone. There are no SAN identity entries. The archive name has a numeric suffix, but that is not proof of its meaning.

No configuration, endpoint, README or device-id file accompanies the certificate. `transport.key` is additional opaque key material, not a documented configuration/identifier. No IP/country restriction extension is present; the issuer's country field is not an access-policy restriction. Console-side restrictions may exist independently, but were not inspected or tested.

Stopped after offline Step 1. Step 2 remains unexecuted pending review.

## 2026-10-17 — device-certificate tutorial probe preparation

The operator supplied the cryptographic exchange contract: fresh server `/time`, `{crt, device, ver:3, ts}`, PBKDF2-HMAC-SHA256 over the trimmed transport-key STRING with 1024 iterations and 32-byte output, AES-256-GCM with `Salted__`/16-byte salt/12-byte IV/ciphertext/16-byte tag, response-specific salt/IV and verified tag, then RSA PKCS#1 v1.5 decryption of `access_token`.

Extracted the archive from `~/.xq` into a newly created private directory **outside the repository**, `/Users/rzarita/.xq/device-probe-b6m7vvn5` (0700 directory; 0600 files). Decoded certificate/private-key inspection copies also remain there. No secret material or certificate body was printed. Previous inspection artifacts were not moved or deleted.

Added offline cryptographic helpers in `scripts/infrastructure/xq-device-certificate-envelope.mjs`. These are preparation only: the live runner is not yet wired, and the helpers have not been exercised against XQ. Awaiting the integer `cert_id`, the tutorial's server base URLs and exact `/packet/add` ENUMERATED-recipient request example, including the intended two-character algorithm identifier. No endpoint, recipient encoding or algorithm prefix will be guessed from similarly named SDK services. No live step, packet attempt, test or gate has run in this preparation.

### Existing K1 escrow prefix finding

**The existing provider does not prepend a two-character algorithm identifier.** `src/modules/release-custody/infrastructure/xq-provider.ts:23` serializes the 32-byte K1 with `Buffer.from(key).toString('base64url')`; `src/modules/release-custody/infrastructure/xq-worker.mjs:37` supplies that string unchanged as GeneratePacket's `key`. The installed `GeneratePacket.js:38–40` only transforms recipients and forwards the supplied key. This is a mismatch with the newly supplied tutorial requirement; the prior share-equality result is not proof of the provider's algorithm selection. No production prefix change made in this preparation.

## 2026-10-17 — certificate tutorial probe, cert_id 223: first live failure

Implemented one-shot runner `scripts/xq-device-certificate-probe.mjs` with cryptographic helpers in `scripts/infrastructure/xq-device-certificate-envelope.mjs`. Certificate material was read exclusively from the new private extraction under `~/.xq`; no new certificate/key copies were placed in the repository. The runner records its attempt before network activity and refuses to rerun against the same result file.

The operator supplied cert_id **223**, the subscription-server routing, ENUMERATED recipient encoding and `/packet/add` body contract. The probe obtains `SUBSCRIPTION_SERVER_URL` from the installed XQSDK instance, not a hard-coded server URL. Planned recipient is one literal configured sender email address; no group address is used. Planned packet type is `msg`, expiry string `24`, and the test key has the `.1` prefix. No existing production K1 formatting was changed.

Offline preparation verified the envelope encrypt/decrypt round trip, rejection of a modified GCM tag, and RSA PKCS#1 v1.5 round trip using synthetic plaintext with the supplied private key. This Node runtime rejects that RSA padding mode in privateDecrypt, so the helper uses installed OpenSSL `pkeyutl -decrypt -pkeyopt rsa_padding_mode:pkcs1`, with captured output and without changing Node security settings. No key material or plaintext tokens were printed. These local checks are not XQ conformance evidence or a gate run.

### Live results — one attempt per executed step

| Step | UTC request-start timestamp | Result |
|---|---|---|
| GET subscription `/time`, General API key | 2026-10-17T20:51:27.582Z | **HTTP 200**; response validated as a bare safe integer, used as `ts` |
| POST subscription `/authorize/certificate/223`, General API key, no bearer | **2026-10-17T20:51:28.048Z** | **HTTP 500**, exact body below |
| Decrypt response envelope / verify tag | — | Not attempted: stopped on HTTP failure |
| RSA-decrypt device access token | — | Not attempted |
| POST `/packet/add` | — | Not attempted |
| GET `/key/<encoded locator>` / key comparison | — | Not attempted |

```json
{"status":"java.lang.IllegalArgumentException: Illegal base64 character 2d"}
```

The certificate exchange payload used the full trimmed PEM `crt`, device name `opintel-certificate-probe`, `ver: 3` and the freshly fetched server integer `ts`. PBKDF2 used the **trimmed transport-key string**, not decoded bytes, with SHA-256, 1024 iterations and 32-byte output. Request envelope was base64 of `Salted__ || salt(16) || iv(12) || ciphertext || tag(16)`, sent as a bare base64 body with `Content-Type: application/json`. The request body was not JSON-string-quoted. Local wall time was used only for reporting, never as the protocol timestamp.

The failure mentions hexadecimal character 2d (hyphen), but the server's failing decoding stage is not established. No alternate certificate representation, endpoint, encoding, timestamp or retry was attempted. **No device token, packet or retrieved key was obtained.** Sanitized record: `tmp/xq-device-certificate-tutorial-result.json`. Stopped at the first live failure. No browser, production configuration changes, gate, commit or push.

### Supersession of the earlier K1-prefix interpretation

The source fact stands: `xq-provider.ts:23` base64url-encodes K1 without adding an algorithm prefix, and `xq-worker.mjs:37` passes it through. The earlier preparation note's characterization as a production mismatch is superseded by the operator's clarification: Opintel does not ask XQ to select a cipher, and the owner-to-owner probe round-tripped the raw share exactly. The `.1` prefix belongs to this tutorial probe's documented algorithm-selection path. No production prefix defect is established by its omission alone; no production prefix change was made.

## 2026-10-17 — explicitly verified standard-base64 certificate exchange retry

One separately authorized retry; stopped on the first failure. Source inspection confirms the original envelope already used `.toString('base64')` in `scripts/infrastructure/xq-device-certificate-envelope.mjs:16`, independently of the production K1 base64url helper. No base64url envelope conversion was found. Added a pre-send canonical standard-base64 alphabet/padding and decode/re-encode equality check. It passed: no URL-safe hyphen or underscore characters in the envelope. The request body was the bare encrypted base64 string, not JSON-quoted or object-wrapped, with `Content-Type: application/json`, General API key and no bearer.

| Call | UTC request start | Result |
|---|---|---|
| GET subscription `/time` | 2026-10-17T21:45:37.529Z | HTTP 200; fresh bare integer accepted and used directly as ts |
| POST subscription `/authorize/certificate/223` | 2026-10-17T21:45:37.916Z | HTTP 500 |

Exact failure body:

```json
{"status":"java.lang.IllegalArgumentException: Illegal base64 character 2d"}
```

The same error persists with verified standard base64 and a fresh server timestamp. The server's failing decode stage is unknown; this evidence does not support attributing it to base64url encoding of the outgoing envelope. Certificate representation and transport-key derivation were unchanged. No response decryption, packet creation or key fetch followed; no further retry, browser, gate or production configuration change. Sanitized attempt record: `tmp/xq-device-certificate-standard-base64-result.json`. No tokens, addresses, key material or certificate bodies are recorded here.

## 2026-10-17 — bare base64 DER certificate field, one authorized attempt

Changed only the `crt` representation: stripped BEGIN/END CERTIFICATE armor and newlines, validating the remainder as canonical standard base64 DER. Kept the device name, ver 3, cert_id 223, transport-key derivation, encrypted envelope encoding, headers and endpoint unchanged. Envelope remained standard base64, sent as a bare unquoted string with Content-Type application/json and no bearer.

| Call | UTC request start | Result |
|---|---|---|
| GET subscription `/time` | 2026-10-17T21:47:53.298Z | HTTP 200; fresh server integer used as ts |
| POST subscription `/authorize/certificate/223` | 2026-10-17T21:47:54.183Z | HTTP 403 |

Exact response body:

```json
{"status":"The certificate in your data payload is invalid"}
```

The 0x2d decode error did not recur; the response changed to an invalid-certificate refusal. This does not establish why certificate validation failed. Stopped after this single exchange attempt. No packet, fetch, additional retry or workaround. Sanitized record: `tmp/xq-device-certificate-bare-der-result.json`. No secret material recorded.

## 2026-10-17 — full PEM confirmed by operator, one exchange retry

Following the operator's confirmation of the crt PEM format and GET /time procedure, made one authorized exchange attempt. Restored the full trimmed PEM with BEGIN/END CERTIFICATE armor and newlines in crt. GET /time used the General API key in the api-key header; its fresh bare integer became numeric ts. Device name, ver 3, cert_id 223, transport-key derivation and endpoint were unchanged. Pre-send checks verified canonical standard-base64 envelope and a bare unquoted request body with Content-Type application/json, no bearer.

| Call | UTC request start | Result |
|---|---|---|
| GET subscription `/time` | 2026-10-17T22:03:35.323Z | HTTP 200; fresh server integer accepted |
| POST subscription `/authorize/certificate/223` | 2026-10-17T22:03:35.708Z | HTTP 500 |

Exact response body:

```json
{"status":"java.lang.IllegalArgumentException: Illegal base64 character 2d"}
```

The 0x2d failure recurred with full PEM. The failing server decode stage remains unconfirmed. No device token was obtained; no packet or fetch followed. Stopped with no further retry. Sanitized record: `tmp/xq-device-certificate-pem-confirmed-result.json`. No certificate bodies, addresses, token values or key material recorded.

## 2026-10-17 — local certificate identification and device-variable matrix

Local OpenSSL inspection, before network activity: serial hex `976027CF5DB42901`, decimal `10907762069075142913`; notBefore `2026-10-17T20:21:36Z`, notAfter `2028-10-16T20:21:36Z`. The certificate has **no X.509 extensions at all**: no standard, custom or private-enterprise extension OIDs or extension values to list. Consequently there is no extension-carried identifier. Common Name: `XQ Trusted Certificate`. No addresses, certificate body, private material or transport key printed or copied.

Previous device payload value was exactly `opintel-certificate-probe`, UTF-8 hex `6f70696e74656c2d63657274696669636174652d70726f6265` (24 ASCII bytes, no newline or NUL). Source: scripts/xq-device-certificate-probe.mjs:9 takes the third positional argument with that default; the previous invocation supplied the same value explicitly. The payload passes this variable as device without transformation.

This matrix uses the operator-selected bare base64 DER control, not the chronologically last full-PEM attempt (which returned 500). Apart from fresh ts and fresh cryptographic salt/IV, only device varies from that DER control: cert_id 223, ver 3, PBKDF2 SHA256 1024/32 over trimmed transport-key string, AES256GCM, Salted__ envelope, canonical standard base64 and bare request body remain unchanged.

| Variant / single variable changed | Fresh GET /time UTC start and status | Exchange UTC start | HTTP status | Exact body |
|---|---|---|---|---|
| 1: device = `device-probe-b6m7vvn5` | 2026-10-17T22:11:36.312Z; 200 | 2026-10-17T22:11:36.604Z | 403 | `{"status":"The certificate in your data payload is invalid"}` |
| 2: device = `XQ Trusted Certificate` (subject CN) | 2026-10-17T22:11:52.632Z; 200 | 2026-10-17T22:11:52.857Z | 403 | `{"status":"The certificate in your data payload is invalid"}` |

Variant 3 (empty device) was not sent: the operator-supplied tutorial contract specifies a device name of 1–48 characters; optionality is not established. The runner enforces that bound. The requested ID sweep is explicitly conditional on variants 1–3 all returning 403, so its condition was not met and no requests for 220, 221, 222, 224 or 225 were sent. Exactly two exchanges, each with its own immediately preceding GET /time; no retries, packet calls, new certificates or downloads. Stopped after the matrix. These results do not identify why XQ rejects the certificate.

## 2026-10-17 — device as known contact identity: agent alias then owner

Two authorized exchanges, in the requested order. Agent alias was selected privately from the saved validated Alias contact matching the contact ID used by the prior recipient probe; owner came from the configured validated sender identity. Neither address was printed or recorded here. The requested literal identity values were passed unchanged, without truncation. For these explicitly requested identity variants, the probe's local 48-character device-name limit was not applied; this is not a change to the transmitted protocol or production configuration.

Both calls kept crt as bare base64 DER, ver 3, cert_id 223, fresh numeric ts from GET /time with General API key, PBKDF2-HMAC-SHA256 (1024 iterations, 32 bytes) over the trimmed transport-key string, AES-256-GCM, Salted__ plus 16-byte salt / 12-byte IV / ciphertext / 16-byte tag, standard base64 and bare unquoted application/json body. Only device changed from the control, apart from the required fresh time and cryptographic randomness.

| Device variant | Fresh GET /time UTC start; status | Exchange UTC start | Status | Exact response body |
|---|---|---|---|---|
| agent alias | 2026-10-17T22:21:25.406Z; 200 | 2026-10-17T22:21:25.735Z | 403 | `{"status":"The certificate in your data payload is invalid"}` |
| owner | 2026-10-17T22:21:39.839Z; 200 | 2026-10-17T22:21:40.047Z | 403 | `{"status":"The certificate in your data payload is invalid"}` |

Operator-specified interpretation matrix: owner succeeds / alias fails would suggest identity binding with the alias not acceptable; both succeed would require reporting the identities the issued tokens actually resolve to; both fail directs escalation to XQ for server-side certificate state, including IP/country restrictions or missing contact association. This run lands in the **both fail** branch and goes to XQ unchanged. Evidence establishes that neither known-contact device value resolves the rejection. It does not independently prove which server check failed, categorically exclude all device-field semantics, or establish a specific IP/country/contact-state cause; XQ must identify that check.

No device token obtained, no token identity to resolve, no further variants, packet operations or retries. Sanitized records: tmp/xq-device-certificate-identity-agent-alias-result.json and tmp/xq-device-certificate-identity-owner-result.json. No addresses, tokens, TeamID, transport key, certificate bodies or key material recorded.

## 2026-10-17 — base64 of full PEM with final newline; call 1 only

Header audit: before and now, the certificate POST targets the SDK subscription base https://subscription.xqmsg.net/v2, uses api-key from OPINTEL_XQ_API_KEY (General API key), Content-Type application/json, and **no Authorization header / bearer**. No dashboard key is used. Added a pre-send host/header assertion; it passed. GET /time also uses the General API key with no bearer.

Local format inspection revealed client.crt is already base64 text (2592 bytes), decoding to 1942 bytes of PEM text with 24 CRLF line endings and no terminal LF. client.pem contains those same decoded bytes. For the requested call 1, decoded client.crt locally, normalized the PEM line endings to LF, appended one final LF after END CERTIFICATE, and standard-base64 encoded the complete PEM text into crt. No certificate material was copied into the repository or printed.

Device = agent alias, cert_id 223, ver 3. All other requested cryptographic parameters unchanged: fresh server ts, trimmed transport-key STRING, PBKDF2-HMAC-SHA256 1024/32, AES256GCM, Salted__ plus salt16 / IV12 / ciphertext / tag16, standard-base64 envelope, bare unquoted application/json body.

| Step | UTC request start | Status |
|---|---|---|
| GET /time | 2026-10-17T22:30:30.984Z | 200 |
| POST /authorize/certificate/223, call 1 | 2026-10-17T22:30:31.456Z | 403 |

Exact response body:

```json
{"status":"The certificate in your data payload is invalid"}
```

No successful response envelope or device access token: response decryption and RSA unwrapping were not reached, so no token shape is available. Call 2 was **not attempted**, following the operator's final instruction, “Do not attempt the second authorization call yet.” No other live calls, retries or packet operations. The certificate rejection remains unexplained; this response does not identify its server-side cause. Sanitized record: tmp/xq-device-certificate-base64-pem-lf-result.json.

## 2026-10-17 — authoritative reference and successful certificate-token unwrap

The operator supplied the authoritative XQ contract: full PEM crt, device name 1–48 characters, ver 3, fresh ts from /time; bare standard-base64 AES256GCM envelope Salted__ || salt16 || IV12 || ciphertext || tag16; PBKDF2-HMAC-SHA256 over the transport key (1024 iterations / 32 bytes); General API key, no bearer; response uses its own salt/IV and contains an RSA PKCS#1 v1.5-encrypted access_token. This supersedes earlier speculative interpretations of device as a contact or claims that the prior 403s established invalid server-side certificate state. Historical results remain preserved.

### URL and source-file facts

Exact URL before and for these attempts: **https://subscription.xqmsg.net/v2/authorize/certificate/223**. The SDK subscription base includes /v2; the probe appends /authorize/certificate/223. No route correction was needed and no earlier result is void for missing /v2. Header names supplied: api-key (OPINTEL_XQ_API_KEY), content-type (application/json); no Authorization header. Each exchange was preceded immediately by a fresh GET /time with the same General key.

The bundle client.crt is itself base64 text. Decoding that outer file layer yields the complete original PEM text, with CRLF line endings and no final newline; those bytes equal client.pem. Step 2 used that full PEM without trimming or normalizing it. Fallback a standard-base64 encoded those exact full PEM bytes, preserving their line endings and absence of final newline. This differs from the earlier LF-plus-final-newline experiment, and device now also differs from that earlier experiment; this result alone cannot attribute the improvement to either change individually.

### Authorized sequence, stopped on first 2xx

Device was exactly `opintelprobe`, with no hyphens; cert_id 223 and all other cryptographic parameters followed the reference. Fresh salts and IVs were generated for each request. Envelope canonical base64 and bare/unquoted body assertions passed.

| Attempt | Fresh GET /time UTC start; status | Exchange UTC start | Status | Body / outcome |
|---|---|---|---|---|
| Step 2: full original PEM text | 2026-10-17T22:42:38.395Z; 200 | 2026-10-17T22:42:38.774Z | 500 | `{"status":"java.lang.IllegalArgumentException: Illegal base64 character 2d"}` |
| Step 3a: standard base64 of full original PEM text | 2026-10-17T22:42:58.014Z; 200 | 2026-10-17T22:42:58.645Z | **200** | Encrypted response body withheld; local authenticated decryption and RSA unwrap succeeded |
| Step 3b: bare base64 DER | — | — | Not attempted | Stopped at first success |

Response AES-GCM decryption used the RESPONSE's own salt and IV; its authentication tag verified. RSA PKCS#1 v1.5 unwrap with the matching device private key **succeeded**. Recovered token shape: string, **380 characters**, three dot-separated base64url-shaped segments (JWT-shaped). No claims were printed; JWT signature validation, identity resolution, packet storage and retrieval were not attempted. The token was not saved or installed as production configuration.

This establishes certificate authorization and local token recovery for the base64-of-original-PEM variant. The documented literal-full-PEM variant still returns 500, so there is an observed contract discrepancy to take to XQ, not grounds to silently rewrite their authoritative contract. Exactly two certificate calls, no further retries or variants. No addresses, TeamID, certificate bodies, transport key, tokens or key material printed or copied into the repository. Sanitized records: tmp/xq-device-certificate-reference-pem-result.json and tmp/xq-device-certificate-reference-base64-pem-result.json. No gate, commit or push.

## 2026-10-17 — certificate device: owner escrow and device retrieval succeed

Executed the authorized repeat exchange, JWT inspection, one GeneratePacket invocation and one FetchKey invocation in a **single process** using scripts/xq-device-custody-probe.mjs. The device token existed in process memory only: not written to disk, environment, note or logs. No changes to src/. No new certificate, alternate identity, retry or remote cleanup operation.

### Certificate exchange

GET /time immediately preceded POST https://subscription.xqmsg.net/v2/authorize/certificate/223. Used the successful representation: crt = standard base64 of the complete original PEM bytes recovered from client.crt (CRLF preserved, no added final newline), device = opintelprobe, ver 3, numeric server ts. Transport key remained its trimmed string, PBKDF2-HMAC-SHA256 1024/32, AES-256-GCM, Salted__ / salt16 / IV12 / ciphertext / tag16, standard-base64 bare unquoted body. General API key, Content-Type application/json, no Authorization header on exchange. HTTP 200. Response own-salt/IV decryption and GCM tag verification succeeded; RSA PKCS#1 v1.5 token unwrap succeeded.

### Decoded JWT claim inventory (signature untouched)

| Location / claim | Value shape / permitted detail |
|---|---|
| header.alg | string |
| header.typ | string, `JWT` |
| payload.iss | string |
| payload.aud | string |
| payload.sub | address-shaped string; device subject, masked as `opintelprobe_crt_223@<team>.trusted.local` |
| payload.exp | number: 1797461598 seconds since Unix epoch, 2026-12-16T22:53:18.000Z |
| payload.jti | string |
| payload.bni | string; meaning not established from decoding alone |
| payload.cid | string; meaning not established from decoding alone |
| payload.ori | string; meaning not established from decoding alone |
| payload.chn | number; meaning not established from decoding alone |

No iat or nbf claim was present, so no token-issued-at value is available. No payload role or type claim was present; the header type is JWT. No claim literally named team/business/bid was present; abbreviated bni/cid semantics were not inferred. A team identifier **is present in the subject's trusted.local domain segment** and matched OPINTEL_XQ_TEAM_ID locally without printing it. The token subject supplied the exact recipient identifier, matching the operator-described dashboard shape. The dashboard was not queried during this run. JWT signature was left untouched and not independently verified by the probe; claims were decoded only.

### Escrow and retrieval

Sender was the existing validated-owner session loaded unchanged from OPINTEL_XQ_SENDER_ALIAS and OPINTEL_XQ_SENDER_ACCESS_TOKEN. GeneratePacket was invoked once with type 8, the device's literal trusted.local subject as its sole enumerated recipient, a freshly generated 32-byte test share encoded as in the existing working escrow path, expires 1 and dor true. No share prefix was added. The SDK's one invocation performs subscription /packet then validation /packet. Both returned HTTP 200.

Locator was recorded privately in tmp/xq-device-custody-locator-private.json with owner-only 0600 permissions; its value is deliberately absent from this note and stdout. Device-token memory was then selected as FetchKey bearer, with a local assertion that the sent bearer equals the device token, not the owner token. General API key supplied. The installed SDK routes FetchKey to validation.xqmsg.net/v2/key/<locator>; this preserves the existing working SDK path. Fetch returned HTTP 200 and the returned share matched the escrowed share **byte for byte**.

| Operation | UTC request-start time | HTTP status |
|---|---|---|
| GET subscription /v2/time | 2026-10-17T22:53:15.054Z | 200 |
| POST subscription /v2/authorize/certificate/223 | 2026-10-17T22:53:15.284Z | 200 |
| GeneratePacket: POST subscription /v2/packet | 2026-10-17T22:53:15.962Z | 200 |
| GeneratePacket: POST validation /v2/packet | 2026-10-17T22:53:16.465Z | 200 |
| Device FetchKey: GET validation /v2/key/<locator> | 2026-10-17T22:53:16.888Z | **200; byte-exact match** |

This proves the positive owner-to-certificate-device escrow/retrieval path for this run. No non-recipient refusal test, provider event corroboration or production integration change was performed; those claims are not established here. Sanitized report: tmp/xq-device-custody-chain-result.json. Stopped after retrieval. No cleanup calls, further variants, gate, commit or push.
