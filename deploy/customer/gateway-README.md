# Opintel gateway — customer install

Use the archive matching your Mac (arm64 for Apple silicon). Docker Desktop must
be installed, running, and allowed at least 8 GB memory. Extract this archive to
`~/Opintel/gateway`; do not run it on the USB stick. All commands below run there.

1. In `package.env`, fill APP_BASE_URL (an HTTPS address reachable from both laptops,
   for example your gateway's LAN IP), OWNER_EMAIL, the five XQ team values and
   the SMTP block. WorkMail uses `smtp.mail.us-east-1.awsapps.com`, port `465`,
   `implicit`, and a sender such as `noreply@trustrail.io`; STARTTLS uses `starttls`.
   Optional certificate/key paths must both be supplied. All other secrets are generated.
2. Copy the XQ team owner's exported `identities` directory alongside `install`.
   The team owner supplies `identities/certificates.json`, a JSON array of four
   objects with numeric `certificateId`, exact `deviceName` and relative
   `bundlePath` (for example `device-1`). Entries 1–2 serve cedant A; 3–4 serve B.
   Each `identities/device-N/` contains that identity's exported `client.crt`,
   `client.key` and `transport.key`. Keep directories mode 700 and files mode 600;
   apply `chmod -R u+rwX,go-rwx identities` before installing.
   These are team-issued licensed identities, never created by this installer.
3. Run `./install`. It loads offline images, initializes empty state, starts and
   checks services, creates the expiring owner claim, and prints the sign-in address.
   It prints the custody master key **once**: save it offline before closing the
   terminal, then run `./backup`. Keep backups and `package.env` private; retain
   the team exports and any supplied TLS files with your offline backups.
4. Open the printed address, request your email link and complete sign-in from
   your real inbox. Without supplied TLS, the browser warns about the generated
   local CA; inspect/trust `state/ca.pem` in Keychain Access. The console also
   displays a visible fallback warning. Use trusted TLS for production.
5. Follow the engine README to install and pair it. Transfer this gateway's
   `trust.json` and the pin from `./status` to that laptop. Receive its private
   `gateway-registration.json` and its pin, then run
   `./register-engine /path/to/gateway-registration.json ENGINE_PIN`.
6. Run `./demo soak 1800`. It provisions the demo explicitly, seeds, renews,
   prepares and runs the same scenario set for 30 minutes. The command prints the
   private result/JSONL directory under `state/output`. Require result `passed`.

Lifecycle: `./start`, `./stop`, `./status`, `./upgrade /path/to/new/gateway`,
`./backup`, `./restore /path/to/backup`. Backup/restore stop services. Stop preserves data. Restore retains a
pre-restore backup; transient observer credentials and escrow shares are excluded.
Never delete `state` or Docker volumes to repair an install.
Replace EMAIL with an email address. Operator commands: `./owner-claim EMAIL` (explicit claim renewal),
`./invite EMAIL --role member` (or `--role admin`), `./users`, `./xq-check`, `./mail-test EMAIL`.
Mail-test and xq-check need no browser session. Invitations grant no access before
normal email or company SSO login. No hosted model is enabled: PAL_PROVIDER,
PAL_MODEL and EMBEDDING_MODEL are disabled; hosted-model egress requires future
explicit opt-in. XQ and configured SMTP are the required external destinations.

LAN firewall: browser → gateway TCP 443 (or APP_BASE_URL port); engine → gateway
TCP 3102 for pinned heartbeat and 3101 for optional ingest receipts; gateway →
engine TCP 3100 and 5434 (demo source only). No database/Redis/SpiceDB gateway
ports are published. Customer sources are customer-owned durable state and are
never torn down by lifecycle commands. No checkout, host Node or Compose command
is required. If a command fails, retain its result and logs; do not claim the soak passed.
