# Opintel gateway — customer install

Use the archive matching your Mac (arm64 for Apple silicon). Docker Desktop must
be running with at least 8 GB memory. Extract to `~/Opintel/gateway`, not the USB
stick. Run the commands below from that directory.

1. Fill `package.env`: APP_BASE_URL (HTTPS, reachable from both laptops), OWNER_EMAIL,
   the five XQ team values and SMTP settings. WorkMail: host
   `smtp.mail.us-east-1.awsapps.com`, port `465`, TLS mode `implicit`, sender
   `noreply@trustrail.io`. STARTTLS uses `starttls`. Optional TLS certificate and key
   paths must both be supplied. Other settings and secrets are generated.
2. Run `./install`. It loads the offline images, starts and checks services, claims
   the owner email and prints the sign-in address. Save the custody master key
   printed **once** in an offline backup, then run `./backup`. Protect `package.env`,
   backups and supplied TLS files; do not send them in support reports.
3. Open the printed address, request a login link and sign in from your real inbox.
   Without supplied TLS, inspect/trust `state/ca.pem` in Keychain Access; the browser
   and console warn about the local fallback. Use trusted TLS for production.
4. Install the engine using its README. Take its printed address and pairing code
   and run `./register-engine ENGINE_ADDRESS CODE` here. Then run `./xq-check`.
5. For the shipped 30-minute demonstration, follow [DEMO.md](DEMO.md). Device imports,
   cedant assignment and synthetic data belong to that optional demonstration.

Lifecycle: `./start`, `./stop`, `./status`, `./upgrade /path/to/new/gateway`,
`./backup`, `./restore /path/to/backup`. Backup/restore stop services. Restore keeps
pre-restore state; observer credentials and escrow shares are excluded from backup.
Never delete state or volumes to repair an install. Stop preserves customer data.

Operator commands: `./owner-claim EMAIL`, `./invite EMAIL --role admin` (or `member`),
`./users`, `./xq-check`, `./mail-test EMAIL`. No browser session is needed for these
commands. Invitations require normal email or company SSO login before access.

LAN: browsers → gateway TCP 443 (or APP_BASE_URL port); engine → gateway TCP 3102
for heartbeat and 3101 for optional ingest receipts; gateway → engine TCP 3100 and
3103 for pairing/recovery, and 5434 for the demo source. Gateway database, Redis and SpiceDB ports are private.
XQ and configured SMTP are required external destinations. PAL_PROVIDER, PAL_MODEL
and EMBEDDING_MODEL are disabled: hosted models require future explicit opt-in.
No checkout, host Node or Compose command is needed. Retain failure logs/results.
