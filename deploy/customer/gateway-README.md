# Opintel gateway — customer install

Use the archive matching your Mac (arm64 for Apple silicon). Docker Desktop must
be running with at least 8 GB memory. Extract to `~/Opintel/gateway`, not the USB
stick. Run the commands below from that directory.

1. Fill `package.env`: APP_BASE_URL (HTTPS, reachable from both laptops), OWNER_EMAIL,
   the five XQ team values and SMTP settings. WorkMail: host
   `smtp.mail.us-east-1.awsapps.com`, port `465`, TLS mode `implicit`, sender
   `noreply@trustrail.io`. STARTTLS uses `starttls`. Optional TLS certificate and key
   paths must both be supplied. Other settings and secrets are generated.
   `SMTP_PASSWORD` is literal text after `=`: no expansion, comments, trimming or
   backslash escapes. Matching outer single or double quotes are delimiters and
   are removed once; use outer quotes to preserve a value that itself begins and
   ends with a quote. Keep the value on one line.
2. Run `./install`. It loads the offline images, starts and checks services, claims
   the owner email and prints the sign-in address. Save the custody master key
   printed **once** in an offline backup, then run `./backup`. Protect `package.env`,
   backups and supplied TLS files; do not send them in support reports.
3. Open the printed address, request a login link and sign in from your real inbox.
   Without supplied TLS, inspect/trust `state/ca.pem` in Keychain Access; the browser
   and console warn about the local fallback. Use trusted TLS for production.
4. Install the engine using its README. Take its printed address and pairing code
   and run `./register-engine ENGINE_ADDRESS CODE` here. Then run `./xq-check`.
5. Agent device imports and custody operations run from the separate agent kit;
   optional synthetic verification runs from the separate verification package.

Lifecycle: `./start`, `./stop`, `./status`, `./upgrade /path/to/new/gateway`,
`./backup`, `./restore /path/to/backup`. Backup/restore stop services. Restore keeps
pre-restore state; observer credentials and escrow shares are excluded from backup.
Never delete state or volumes to repair an install. Stop preserves customer data.

Operator commands: `./owner-claim EMAIL`, `./invite EMAIL --role admin` (or `member`),
`./users`, `./xq-check`, `./mail-test EMAIL`. No browser session is needed for these
commands. Invitations require normal email or company SSO login before access.

LAN: browsers → gateway TCP 443 (or APP_BASE_URL port); engine → gateway TCP 3102
for heartbeat and 3101 for optional ingest receipts; gateway → engine TCP 3100 and
3103 for pairing/recovery, and the operator-selected port for each ordinary source database. Gateway database, Redis and SpiceDB ports are private.
XQ and configured SMTP are required external destinations. PAL_PROVIDER, PAL_MODEL
and EMBEDDING_MODEL are disabled: hosted models require future explicit opt-in.
No checkout, host Node or Compose command is needed. Retain failure logs/results.

## Connect an agent

Send the issued credential as `Authorization: Bearer CREDENTIAL`. Supply the
self-declared agent name in either of these ways:

- Header: `X-Opintel-Agent-Id: NAME`, with endpoint
  `https://GATEWAY/mcp/v1/p/PROJECT`.
- URL parameter: `https://GATEWAY/mcp/v1/p/PROJECT?agentId=NAME`.
  This works with clients that can send only the credential header. URL-encode
  the name when building the URL; keep the credential in the header.

At least one agent ID is required. Each supplied ID must be non-blank; when both
are supplied they must match exactly. The agent ID is self-declared and recorded
for presence and receipts only. It never grants access: the credential does that.

## Agent access and verification

Agent identities, query and local redemption run from the separate agent kit on
the agent host. See that archive's README for the custody sequence. Administrator
sign-in, grant-access and synthetic verification run from the separate verification
archive. Neither archive is part of the gateway or engine application package.

### Engine transport limits

Gateway and engine use pinned mutual-TLS HTTP/2 sessions for their private
calls. Set `ENGINE_TRANSPORT_MAX_SESSIONS` (1),
`ENGINE_TRANSPORT_MAX_CONCURRENT_STREAMS` (32),
`ENGINE_TRANSPORT_IDLE_TIMEOUT_MS` (60000),
`ENGINE_TRANSPORT_MAX_SESSION_AGE_MS` (600000),
`ENGINE_TRANSPORT_CONNECT_TIMEOUT_MS` (5000), and
`ENGINE_TRANSPORT_PING_INTERVAL_MS` (15000) in `package.env` before install.
Use matching values on both hosts. Invalid integers or out-of-range values
refuse startup. See `docs/timeouts.md` in the source release for ranges and
semantics. Sessions beyond one are opened only when existing stream capacity
is exhausted; the peer's advertised stream limit still applies. Session
rotation rechecks the pinned certificate, and written requests never replay.
Settings → Engines → Connection timings shows process-local counts and the
last-1024-call p50/p95/last latencies; no separate metrics endpoint is exposed.

Upgrade gateway and engine together in a maintenance window when moving from
an HTTP/1-only release. The private listeners retain HTTP/1 compatibility for
operator tools, but new gateway calls and the engine's reverse heartbeat/receipt
clients require H2 peers. A mixed-version pair is not fully operational. Request
and response schemas stay the same.

The standard `./upgrade` also validates these six settings from `package.env`
and applies them to the generated service environment. If an override is
absent, a previously installed value is retained; older installations acquire
the packaged defaults. Restart through that standard upgrade path rather than
editing generated Compose state.

Set `LOG_LEVEL=debug` in `package.env` before install/upgrade to retain detailed
DNS/TCP/TLS/stream phase records. The default `info` emits one transport summary
per call. Both levels exclude request bodies, addresses and TLS material.
