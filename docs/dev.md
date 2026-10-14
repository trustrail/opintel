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
