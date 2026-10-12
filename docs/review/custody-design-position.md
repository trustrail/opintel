# Design position: released under custody

Status: implemented as item5.36 under the accepted split-key design. The local provider is exercised end to end; the XQ adapter remains unverified against a live tenant, and XQ event corroboration is explicitly unsupported until its contract is verified.

## Position and limits

A seventh treatment, **released under custody**, sends a custody column out of Opintel sealed. The agent receives the sealed values and a release grant signed by Opintel, redeems K1 at the custody provider and K2 at Opintel, reconstructs the release key, and unseals locally. **Opintel decides; the provider delivers; rows never transit the provider.**

This adds deferral until the moment of use, an auditable point of release and a kill switch for unredeemed grants. It does **not** add recall. Once the recipient has both shares, revocation cannot take back the reconstructed key or plaintext. Receipts, actions and documentation must never claim otherwise.

This is separate from existing token-key custody: release keys are per grant, not tokenization keys.

## Fixed vocabulary

| Term | Meaning |
|---|---|
| Release grant | Opintel's signed authorization for release, bound to a receipt and recipient alias |
| Release key | Per-grant key used to seal and unseal custody values |
| Sealed / unseal | The protected representation / the agent's local recovery of its plaintext |
| Custody provider | Escrows and releases K1; never receives the rows |
| Alias | The agent's identity at the provider |
| Locator token | The provider's handle, opaque to Opintel |
| Redemption | Opintel's first-hand release of K2; after both shares are received, unsealing cannot be recalled |

An alias is not authorization by Opintel's self-declared agent id. The provider releases only to the named recipient using that recipient's credential.

## Flow

Steps 1–6 remain unchanged.

| Step | Action |
|---|---|
| 7 | Query with treatments and row filter |
| 7b | Generate a per-grant release key; seal the custody columns; split K into K1 and K2; escrow K1 with the provider addressed to the agent's alias, single-use; store K2 in Opintel by grant id and expiry; sign the grant |
| 8 | Return rows with custody values prefixed `opintelsealed:`, the grant and the receipt |
| 9 | Agent redeems both shares with its credential, in either order |
| 10 | Provider releases K1 to the named recipient only; Opintel releases K2 after checking the grant |
| 11 | Agent reconstructs K = K1 XOR K2 and unseals locally |

Revocation is available from Activity and the API. Redemption is Opintel's first-hand release of K2. Provider events, when available, are corroboration rather than the source of truth; polling is optional.

## Specification

### Sealing

- One release key per result (per grant), not per column. All custody columns in a result share it.
- AES-256-GCM. Key: 256 bits from the platform CSPRNG. Nonce: 96 bits, unique per cell.
- Associated data per cell: receipt id || column name || row ordinal, so a sealed value cannot be moved to another cell or another result.
- Sealed value format: `opintelsealed:v1:` + base64url(nonce || ciphertext || tag). The prefix is reserved like `opintelisolated` and `sentinel`.
- After sealing, K1 is a random 256-bit share and K2 = K XOR K1. Escrow K1 with the provider addressed to the alias, single-use, with the provider TTL rounded up as below. Store K2 in Opintel keyed by grant id with the grant's exp.
- Zeroise K and K1 once escrow is acknowledged. K and K1 never persist in Opintel: neither is written to the database, logs, receipts or outbox. K2 is deleted at redemption, expiry or revocation and is never logged. The ephemerality proof covers K, K1 and K2, including all four sinks.
- Neither Opintel nor the provider alone can read a sealed value. Opintel unavailable means nothing can be unsealed: fail closed, by design.

### Release grant

- Encoding: JWS compact serialisation (RFC 7515), alg EdDSA (Ed25519), payload = JSON claims. Standard claims: `iss` = project id, `sub` = alias, `aud` = provider id, `jti` = grant id, `iat`, `exp`. Private claims: `rcpt` (receipt id), `cols` (column names), `custody { provider, tenant, provider_redeem_at, locator, opintel_redeem_at }`, `jur` (allowed jurisdiction, optional in this slice).
- Signing key: derive the Ed25519 seed from the environment deployment master key with HKDF-SHA-256 (empty salt), info = UTF-8 canonical project UUID followed by the decimal version, output 32 bytes. The UUID has a fixed 36-character representation; the concatenation is unambiguous. `kid` is the decimal version in the JWS header. No private seed or signing key persists. Public keys published in describe under `custody.keys` so the agent and the provider can verify offline. Rotation keeps old public keys for verification for the maximum grant TTL after retirement.
- Opintel redeem is an MCP tool authenticated by the agent credential. It verifies signature, `exp` not passed, `sub` equals the caller's alias, `jti` not previously redeemed, and grant not revoked before releasing K2. A past-expiry, revoked or already-redeemed grant gets no K2 regardless of provider behaviour. The local provider implements the same strict checks for K1. XQ enforces recipient list and single-use for K1.

### Identity binding

- Alias = `agent:` + project id + `:` + credential id, created at the provider when an agent credential is issued, stored on the credential record. The pool key resolves to the credential, the credential to the alias; the grant's `sub` is that alias.
- Redemption proof: local provider accepts the agent credential itself as the bearer proof; the xq implementation uses the access token from AuthorizeAlias. The harness `redeem(grant, credential)` covers both.

### Lifecycle

- Grant TTL: `custody.grant_ttl`, default 10 minutes, single-use. Provider escrow TTL is rounded up to its smallest unit (XQ: 1 hour). Opintel's expiry check on K2 makes a longer provider TTL insufficient to unseal an expired grant.
- Redemption can occur in either order. The agent obtains K1 from the provider with its credential and K2 from Opintel with the grant and authenticated credential, then computes K = K1 XOR K2.
- On K2 redemption, Opintel records time, alias and request origin as `jur_observed` first-hand, deletes K2, and retains K1 escrow until provider redemption is observed or the grant exp passes, then revokes it.
- Receipt states: granted -> redeemed | expired | revoked. On expiry without redemption, mark expired, delete K2 and revoke escrow. Provider events are optional corroboration and never change a redeemed receipt state. Escrow cleanup is tied to the grant exp, not the rounded-up provider TTL.
- Revocation by receipt id or grant id is idempotent and records actor and time. Delete K2 and revoke escrow immediately regardless of receipt state; no revoked grant receives K2. Explicit revocation after redemption is retained as an event without rewriting the first-hand redemption.
- Jurisdiction is proof only: record Opintel's observed request origin as `jur_observed`; provider-reported region/origin is corroboration. No decision depends on jurisdiction in this slice.


## Contracts

The logical release grant has this shape; the Specification above defines its JWS wire encoding:

```text
{
  receipt,
  subject (alias),
  columns,
  custody: { provider, tenant, provider_redeem_at, locator, opintel_redeem_at },
  expires,
  signature
}
```

The signature authenticates all grant fields. The grant is bound to the receipt and alias and is self-describing: no discovery tool is required.

The MCP result adds:

```text
custody: [{ columns, grant }]
```

`describe` adds a custody section naming the provider, tenant and credential required.

The receipt shows:

```text
released under custody (<provider>) · granted T · redeemed T+n by alias
```

Its alternatives are `not redeemed` and `revoked T`. Activity shows decision and release as two events on one receipt id. Historical evidence remains immutable; subsequent release/revocation facts are retained as events associated with that receipt, not edits to its original answer.

The exposure bar and legend gain a custody mark through the visual language. Existing shared exposure presentation and mark-placement rules apply; this position does not invent its geometry or new colours.

## Sovereign release

In this slice sovereign release is **proof only**. Record Opintel's observed redemption request origin on the receipt, with provider-reported region/origin as corroboration when available. Activity carries a separate receipt-based custody summary by observed origin and receipt state (redeemed, expired, revoked), in one compact line above Requests, present only when the selected request range contains a custody grant, with per-receipt release facts beside Capture and stored redaction in the expanded detail; it is not added to Dashboard in this slice. Count buckets use UTC calendar days (§5.5); absolute timestamps use the reader's display timezone. Raw origins never become telemetry labels. The exposure bar counts entitlement decisions; the custody summary counts receipts. The roadmap's exposure metric builds on this receipt-based summary, not on the entitlement bar. Neither is an enforced jurisdiction restriction or proof of the recipient's physical location. Jurisdiction enforcement is phase 2.

## Provider boundary

```text
escrow(key, alias, ttl, singleUse) -> locator
revoke(locator)
redemptions(since) -> events
```

Two implementations are in scope:

- `local`: in-process, for tests and the harness.
- `xq`: `jssdk-core`, behind the provider interface in infrastructure; escrow, revoke and FetchKey concern K1 only. Recipient-list and single-use enforcement protect that share. XQ remains an available adapter rather than being excluded by its rounded-up TTL. It remains untested against XQ until credentials arrive; local conformance does not establish XQ conformance.

The agent side in the harness provides:

```text
redeem(grant, credential) -> key
```

## Proof and acceptance

The slice carries deliberate agent-perspective harness scenarios for redeem-and-unseal, refusal of a second alias, refusal of a replayed grant, and failure of a revoked grant. Transcripts retain the agent perspective and never use console credentials.

Ephemerality scenarios cover sealed values and release keys not persisting beyond the grant's life, including the local provider's intentional live-grant retention. Existing S4 positive controls, write observation, incomplete-coverage reporting and honest memory-residual reporting remain binding. This introduces no promise of immediate managed-heap erasure and no excluded capture sink.

Harness scenarios also cover K1 obtained but K2 refused after expiry, K2 obtained but K1 refused for a second alias, and Opintel down making unseal impossible.

Activity tests cover receipt states and decision/release events on the same receipt. Visual coverage is 390 / 900 / 1440 under the enforced capture preconditions, after user design approval. The implementation gate is **`npm run check:data` plus `npm run check:ui`**, sequencing their suites and sharing one base `check` run when both apply.

## Implementation surface and remaining decisions

Implementation spans treatment policy and engine execution; provider ports/adapters; signed grant and sealed-value contracts; MCP response/describe; immutable receipt events and provider-event ingestion; authorized revocation; Activity receipt detail; shared exposure/marks; harness and ephemerality coverage. Provider network destinations must fit the deployment's declared-host policy.

The Specification fixes sealing, split-key ownership, grant encoding, signing-key rotation and alias binding. The accepted custody mark is a closed padlock in a treatment disc, between tokenized and withheld, using existing plum. No production XQ verification is claimed without credentials.

**Wire details.** Cells contain JSON-encoded values. AAD concatenates each of the three UTF-8 fields with a four-byte unsigned big-endian byte length before it; row ordinals are zero-based decimal strings. This makes the concatenation unambiguous across column names. Nonces use a fresh four-byte CSPRNG prefix per result and an eight-byte unsigned big-endian cell ordinal, unique under that result's key.

**Atomicity and cleanup.** Escrow acknowledgement precedes saving K2 and the granted event. K2 deletion and its redemption event commit in one serialized tenant transaction before the share is returned. Failure to persist evidence prevents delivery. A disconnected recipient after commit cannot replay the share: single-use takes priority over recovery. Pending cleanup enumerates identifiers even for archived projects without members; share access remains tenant-scoped. Explicit revocation remains retryable after redemption. Provider failures do not restore K2.

**Proof boundary.** K2 is intentionally stored in the application's database for the live grant. Deletion means removal from the live row, not secure erasure of PostgreSQL WAL, backups or freed physical pages. K/K1 must never appear in that store. Container filesystem, telemetry, receipt and outbox sinks have no key exemption. Managed-heap residuals are reported under C.5, never suppressed or described as immediate erasure.

**Configuration.** Project Settings records non-secret provider, tenant, region and grant lifetime. `OPINTEL_API_BASE_URL` is the deployment MCP origin; `OPINTEL_XQ_REDEEM_URL` is the provider redemption endpoint. Credentials and the signing master key are environment-only; `OPINTEL_RELEASE_CUSTODY` is no longer read. Local providers are for tests and the harness. XQ additionally requires its tenant, redemption URL, API credentials and sender identity; it has no implicit fallback. Local shares are lost on process restart, refusing release rather than reconstructing missing custody. Public signing keys are retained through outstanding grants when rotated. The production SDK adapter performs key-only operations in disposable workers; its browser compatibility globals and caches never enter the application process.

**Activity filter.** Answer treated now also includes completed custody deliveries. Planned reads, omissions, refusals and incomplete requests remain excluded. Provider corroboration is optional; the XQ adapter currently has no corroboration-event source configured.

**Lifecycle decision.** Either redemption order is supported. After K2 release, retain K1 escrow until provider redemption is observed or the grant's exp passes, then revoke it. Explicit revocation revokes escrow immediately regardless of state. A provider event observed after K2 release is corroboration, not a receipt state change. Expired or revoked grants with no K2 released remain unusable. Cleanup attempts cannot guarantee remote deletion during a network outage; the provider may retain K1 until its TTL, but K1 alone cannot unseal a result whose K2 was never released.

**Engine compatibility.** Custody extends the treatment wire contract to version 3. Registry verification, assignment, execution, receipt authorization and development tools require 3. An existing contract-2 record is not a fallback: upgrade and verify its Engine before use. Applied migrations are unchanged.

**Rollup counts.** Granted counts issued grants in the selected request range, including those subsequently redeemed, expired or revoked. Terminal counts use the current receipt state; explicit revocation after redemption does not rewrite redemption. Origins count first-hand redemptions only. No custody grant in scope means no extra Activity line.

**Activity presentation.** The rollup is one line above Requests: `Custody · 12 granted · 9 redeemed · 2 expired · 1 revoked · origins CA 8, US 1`. It is absent without a grant in the selected range, preserving existing Activity without custody. Origins are recorded facts, not inferred countries. Receipt details use the granted/redeemed/not-redeemed/revoked receipt-line format above, with provider corroboration separate. No Dashboard summary is added. Revocation invalidates the affected receipt detail and project Activity summaries; delivery rows do not change.

**Cleanup timing.** Expiry is enforced by the signed `exp` check on every K2 redemption, independently of the cleanup timer. Logical deletion and remote revocation are attempted by the one-second, non-overlapping sweeper; process/network outages can delay deletion. Expired state never becomes usable again. Physical erasure and instantaneous scheduling are not promised.

### Project Settings and availability

The Project tab has a Custody group using the existing one-line disclosed rows and accumulating save bar. Provider is a segmented choice: `local` (**development only**) or `xq`. XQ fields are tenant, API key, dashboard API key and region. Both secrets are operator-provisioned environment variables per deployment, read-only in Settings and shown only as **set** or **not set**, never echoed. Region is the fallback for the provider's reported jurisdiction when its event carries none; it does not replace Opintel's observed request origin. Check connection calls the adapter health check and reports its result inline.

Grant TTL is edited in minutes, default 10. Show the signing key id in use and Rotate signing key. Retired public keys remain available for verification for one grant TTL, including verification through outstanding grants' expiry. Agent aliases are created automatically when a credential is issued and shown read-only on its Pools credential row, not in Settings.

No new secret store is part of 5.36. Provider secrets remain operator-provisioned through the environment and the existing secret-handling boundary; they never enter the database, receipts, telemetry or logs. The proof covers unintended persistence and reports live configuration memory honestly: environment secrets remain live for the deployment lifetime. XQ health checking performs the required API check and, when configured, a separate read-only dashboard check; only reachability, authentication and a safe failure class are returned, never the response body. A separately reviewed encrypted secret store is deferred.

Released under custody is selectable in Entitlements only when a custody provider is configured and its last connection check passed. Otherwise show the option disabled with **Configure a custody provider in Settings**. Local receipts say **released under custody (local)**.

If a provider is removed or its check fails while custody columns exist, queries touching those columns fail closed with a notice naming the cause. Needs You shows one finding: **Custody provider unavailable; N columns affected**, linking to Settings. Unrelated columns remain governed by their existing treatments. Availability must be enforced at execution as well as selection.


**Signing-key custody decision.** Derive each project/version Ed25519 seed with HKDF from an operator-provisioned deployment master key in the environment, with info = project id || key version. The JWS kid is the version. No private seed or signing key persists. Rotation increments the version; retired public keys remain derivable for verification for one grant TTL. Database state records versions and retirement deadlines only (public verification material is not secret). Loss or replacement of the master key changes derived keys and requires an explicitly reviewed deployment/key migration, not a silent fallback. The master key is the one operator-provisioned signing secret.

### Connection checks and provider changes (decided)

The required XQ API check uses CheckApiKey. The optional dashboard check uses one read-only GetCurrentUser or GetCurrentBusiness call with a deployment-provisioned dashboard access token. Settings reports each separately: authenticated, failed, or not set. A missing or failed dashboard check disables provider-event corroboration, not custody. No response body is reported.

Changing provider or tenant confirms the number of live grants before saving: “Revoke 3 live grants and switch provider?” Every live grant loses K2, its original provider and tenant receive the K1 revocation, and its receipt records revoked, reason “provider changed”, actor and time. An old grant or locator is never sent to the new tenant.

### XQ open questions

XQ corroboration is explicitly unavailable until its event contract is verified against a real tenant. The adapter returns `unsupported`, never an empty list presented as evidence of no events. Settings states “Corroboration: not available for XQ until verified” on the provider row. Dashboard authentication is still checked separately; successful authentication does not establish an event mapping. Receipts carry first-hand K2 events only for XQ. Local corroboration remains supported.

Verify the provider event fields and semantics that identify locator, redeeming alias, timestamp and request origin, including pagination, duplicates and delay. The typed `ProviderRedemption`/`ProviderRedemptions` adapter seam is where the verified mapping belongs. See [XQ integration brief](xq-integration-brief.md).

### SDK source verification (2026-10-12, decided)

The **SDK source, not the README, is the verification reference until XQ supplies its OpenAPI document**. The public repository inspected is commit [`7835097bc7534c5b4db5381e5c798c54bbff2016`](https://github.com/xqmsg/jssdk-core/tree/7835097bc7534c5b4db5381e5c798c54bbff2016), dated 2022-09-06. Its package version is **1.9.0**; Opintel pins **2.0.6**, whose distributed executable source is also inspected. These are different contracts. An older public source must not silently override the installed service's required fields. The source audit and contract tests do not establish live XQ conformance.

The paths below are under `src/com/xqmsg/sdk/v2/` in that pinned GitHub commit; installed paths are under `node_modules/@xqmsg/jssdk-core/dist/cjs/src/com/xqmsg/sdk/v2/`. Opintel locations refer to `src/modules/release-custody/infrastructure/`.

| Operation | SDK source reference | Opintel reference and finding |
|---|---|---|
| GeneratePacket | `services/GeneratePacket.ts:9–15,32–47,81–110` | `xq-worker.mjs:35`: `key`, `recipients`, `expires`, `dor`, `type`, `meta` match. The adapter supplies `[alias]`; the SDK joins it with commas before sending. `expires` is rounded up to hours; `dor: true` is DELETE_ON_RECEIPT; `type: 'unknown'` is a defined CommunicationsEnum value. The SDK sends the subscription packet onward as plain text to validation; the adapter preserves that flow. |
| FetchKey | `services/FetchKey.ts:29–71` | `xq-worker.mjs:37`: `locatorKey` matches; SDK URL-encodes it, uses the recipient's bearer token and normalizes its optional prefix. `xq-provider.ts:26` validates the resulting K1 encoding. |
| RevokeKeyAccess | `services/RevokeKeyAccess.ts:23,32–58`; installed `services/RevokeKeyAccess.js:21–32,52` | `xq-worker.mjs:36`: `{tokens:[locator]}` differs from GitHub 1.9.0's `{locatorKeys:[locator]}`, **but matches pinned 2.0.6**. Both send a `tokens` list on the wire. Retain the pinned contract. A diagnostic change to `locatorKeys` failed the real-SDK contract test and was reverted. |
| RevokeUserAccess | `services/RevokeUserAccess.ts:35–75`; installed `services/RevokeUserAccess.js:20–36` | Not called by Opintel: the worker operation inventory is `xq-worker.mjs:32–38`. GitHub requires `recipients` plus `locatorKey` and joins recipients; 2.0.6 validates recipients only and sends its array unchanged. This revokes recipients for one locator; it does **not** establish an alias-deletion operation. Existing grant cleanup uses whole-locator revocation. |
| AuthorizeAlias | `services/AuthorizeAlias.ts:9–12,49–81` | `xq-worker.mjs:34`: `{user:alias}` matches. SDK caches the returned access token; our disposable registration worker discards it. Agent fetch uses a separately supplied provider access token. Delivery/recovery of the agent token and allowed alias syntax still require XQ verification. |
| CheckApiKey | `services/CheckApiKey.ts:22,33–56` | `xq-worker.mjs:33`: `{'api-key':...}` follows runtime validation, despite the stale SDK TypeScript declaration `{api:string}`. GET `/apikey` uses the General key and sender access token. Health returns safe status only and discards the body. |
| Dashboard health | `services/dashboard/GetCurrentBusiness.ts:30–53` | `xq-worker.mjs:32`: read-only GET `/business`, Dashboard key and dashboard bearer token match. Its result remains separate from the required General-key check. |
| VerifyAccount | `services/dashboard/VerifyAccount.ts:38–45,109–132` | Not called in this slice; configured dashboard access tokens are used for health. The SDK takes `accessToken`, calls dashboard `login/verify`, and selects `Destination.DASHBOARD`. This is not General-key authentication. |
| GetEventLogs | `services/dashboard/GetEventLogs.ts:65–107` | Not called; `xq-provider.ts:25` explicitly returns unsupported. Filters include `action`, `appid`, `data`, `from`, `full`, `keyid`, `limit`, `page`, `regex`, `threat`, `to`, `user`. Dashboard key and dashboard access token are required. Response event mapping remains unverified. |
| Key split | `XQSDK.ts:170–182,280–296` | `xq-worker.mjs:13,22,29–33`: constructor receives `XQ_API_KEY` and `DASHBOARD_API_KEY` separately. Native transport selects Dashboard key for the only dashboard operation, General key otherwise; bearer tokens are also separate. All currently supported operations match. |

**Receipt metadata decision.** Set GeneratePacket `meta` to `{receipt: <receipt id>}` for query escrow, rather than null. Both inspected implementations support arbitrary metadata, and a receipt id is the correlation identifier needed to relate provider operations to Opintel's first-hand receipt. Send no SQL, column values, credentials or release-key material in metadata. The provider port receives the optional receipt id; local escrow semantics are unchanged. Metadata is correlation only, never evidence that a provider redemption occurred.

**Open questions retained after the source audit.**

- Obtain the source tag/OpenAPI matching deployed XQ and pinned 2.0.6. Resolve the `locatorKeys` versus `tokens` input discrepancy before any SDK upgrade; do not change the current working 2.0.6 call to match 1.9.0. GeneratePacket `type` is optional in 1.9.0's runtime required-fields list but required in 2.0.6; Opintel already supplies it.
- RevokeUserAccess changed its required fields and recipient serialization between these versions. It is not an alias-retirement API. Confirm whether XQ has an identity-retirement operation beyond revoking each known escrow; do not invent one.
- CheckApiKey's declared `{api:string}` conflicts with runtime `api-key`; retain the runtime field. Confirm expected scopes/tenant ownership and whether any 2xx payload can represent an unsuccessful semantic check. Current health deliberately does not inspect or report response bodies.
- Confirm AuthorizeAlias accepts `agent:<project>:<credential>` (source comments describe email/phone), whether repeated authorization rotates tokens, and the secure agent-side access-token delivery/recovery contract. The General API key authenticates the request; none of these services accepts a separate tenant field. Verify configured tenant ownership through XQ, rather than inventing a request parameter.
- The SDK transport parses JSON only when response text contains `status`, whereas Opintel's native transport parses valid JSON generally. Raw packet/locator/key text is covered by the adapter contract test; retain current transport and verify actual response envelopes with XQ before changing either behavior. SDK DELETE calls duplicate payload into query parameters and a JSON body; the contract test records that behavior without guessing the server's preference.
- VerifyAccount's exchange path calls session validation with the incoming token after obtaining a dashboard token (`VerifyAccount.ts:122–132`), and its semantics need live verification before adoption. Do not add it merely because it exists.
- Verify `dor` single-use enforcement, TTL rounding and revocation acknowledgement with real credentials. Confirm event mapping (locator, alias, time, origin), pagination and receipt metadata exposure/retention. Optional corroboration remains unsupported until then.
