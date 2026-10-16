# Development operations

## XQ sender bootstrap (dev only)

Install the locked dependencies first. In the repository's git-ignored `.env`,
set `OPINTEL_XQ_API_KEY` to the operator-provisioned General API key and
`OPINTEL_XQ_SENDER_ALIAS` to the intended sender identity. This command performs
live alias authorization; do not run it against production configuration.

From the repository root, Rick runs these two lines:

```sh
npx tsx scripts/xq-bootstrap.ts
${EDITOR:-vi} .env
```

In the editor, append the two printed assignments (or replace existing assignments
for those names), then save. The script never writes `.env`. Do not redirect its
output into `.env` or a shared log: the successful final output contains the
sender access token. It prints no API key, and failures print no provider bodies
or credentials. It rejects `NODE_ENV=production`.

The script calls `AuthorizeAlias` through the installed `@xqmsg/jssdk-core` 2.0.6
in a disposable worker. `OPINTEL_XQ_REDEEM_URL` comes from that SDK's
`VALIDATION_SERVER_URL` plus `FetchKey.serviceName`, without a hard-coded host or
service path. This is the key-retrieval endpoint; the SDK appends the encoded
locator when fetching a particular key. The URL is not an Opintel dev-server URL.

The final comment reports the returned JWT's `exp` as UTC. This is decoded expiry
metadata, not local signature verification. Missing, malformed or expired expiry
claims fail without printing the token. Re-run authorization when a replacement
sender token is needed. This does not provision a dashboard token, check project
custody settings, or prove a complete live custody round trip.

## Discovering pool test agent (dev only)

`scripts/xq-integration.ts` connects to the real MCP endpoint with a pool
credential, calls `opintel.describe` without an object filter, then tests **every
attribute it discovers**, across all returned objects. There is no table, column,
pool-ID or row-decision-ID configuration. The credential selects its pool. The
project UUID is the segment after `/projects/` in the console URL; no database
query is needed to find it.

In the repository's git-ignored `.env`, set just these test-specific fields:

```dotenv
OPINTEL_XQ_TEST_PROJECT_ID=<project UUID from the console URL>
OPINTEL_XQ_TEST_POOL_KEY=<current credential key for the pool to test>
```

The API address uses `OPINTEL_API_BASE_URL` (default `http://localhost:3000`).
The script rejects non-loopback API addresses and production mode. For live XQ
custody redemption, it also uses the already configured General API key, sender
alias/token and SDK redemption URL from the bootstrap section. Dashboard
credentials are not needed. If XQ credentials are missing, custody probes are
reported as inconclusive without issuing their queries. Existing credential keys
cannot be recovered from the console: use one you hold or explicitly issue a new
credential for the intended pool. Do not paste credentials into chat or arguments.

Start the API and Engine with `.env` loaded before imports, in separate terminals:

```sh
NODE_OPTIONS='--import=dotenv/config' npm run dev:api
NODE_OPTIONS='--import=dotenv/config' npm run dev:sidecar
```

Then run:

```sh
npx tsx scripts/xq-integration.ts
```

The agent makes sequential, bounded queries, continuing after individual failures.
It does not edit policies, credentials, source data or provider settings. Each
query creates ordinary receipt evidence. Object and column names come from
Describe and are quoted, never interpolated as executable SQL fragments. Each
sample projects one attribute with `LIMIT 3`; it adds no WHERE clause that could
hide a missing entitlement filter. Policy is evaluated afresh for each query.

| Advertised treatment | Probe |
|---|---|
| Clear | Read up to three values; report delivery/counts, not values. |
| Tokenized | Read up to three treated values; report delivery/counts, not tokens. |
| Masked | Read up to three treated values; report delivery/counts, not values. |
| Aggregate only | Confirm raw projection is explicitly refused, then request `COUNT(column)`; a disclosure-policy refusal is inconclusive for aggregate delivery. |
| Released under custody | Verify the signed grant and its project/receipt/column/provider/endpoint bindings; authorize its credential alias; fetch K1 from XQ, redeem K2 via MCP, decrypt in memory, and require an explicit `forbidden` on a second Opintel redemption. |
| Withheld | Request the named attribute and require an explicit withheld refusal with no structured result. |

Results are grouped by treatment, with object, attribute, probe, outcome, counts,
receipt ID and recorded row-decision metadata. Reports are written with mode 0600
to a new `tmp/review/pool-agent/<run-id>/report.md` and `report.json`. The terminal
prints their location and treatment summary. No source value, key, access token,
grant, provider locator or ciphertext is printed or written. Mutable share/key
buffers are cleared; JavaScript strings and parsed plaintext cannot be promised
deterministic erasure. SDK calls remain in disposable workers.

Exit codes: **0** all discovered probes passed; **1** a failed probe/session or
empty inventory; **2** no failed probes but one or more inconclusive probes.
Zero attributes under a treatment is zero coverage, not proof of that treatment.

Coverage limits are part of every report:

- Describe deliberately omits undecided, unreachable, inactive and unsupported
  attributes. The agent cannot discover or claim to test the hidden catalogue.
- This is bounded sampling, not a complete scan or an independent evaluation of
  row predicates. Receipt scope IDs/hashes are recorded, not treated as proof of
  the business predicate's correctness. Concurrent data/policy changes can affect
  separate probes.
- Clear, tokenized and masked reads prove delivery under the advertised policy;
  no privileged source oracle is used to prove exact transformations. Empty or
  all-null samples are inconclusive.
- Custody probes prove live retrieval/decryption and Opintel single-use refusal,
  not dashboard corroboration, expiry, admin revocation or XQ second-fetch denial.
  If a probe fails before XQ retrieval, the runner attempts to revoke its own
  verified locator; unacknowledged cleanup is reported. Remaining K2 expires via
  the normal grant sweeper. Successful XQ requests use the adapter's delete-on-read
  setting; each successfully redeemed Opintel share is consumed.

`test/xq-integration.test.ts` exercises discovery, per-treatment queries, report
redaction, signed grants, real AES-GCM cells and failure handling offline with
mocked transport. It is included in `check`. The live agent is never run by the
gate; it requires the operator's local credential and development services.
