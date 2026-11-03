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

## Custody demo

Use an existing project, connected source and pool. Run `./steps STEP --help`
for each command. The steps are agent-side jobs: they do not start a gateway
service or receive database credentials. Output files are create-only and mode
600. Never paste a credential, device token, private key or transport key into a
command line. SQL is supplied explicitly with `--sql`.

1. Sign in as a project administrator through the normal email flow:

   ```sh
   ./steps sign-in --gateway https://GATEWAY --email ADMIN_EMAIL --session-out ./admin.session
   ```

   Paste the emailed link at the hidden prompt. The normal nonce-bound callback
   must create a real session. SSO/device-confirmation failures are refused;
   there is no administrator bypass. The cookie is written only to the private
   session file. When it expires, use this command with a new session output filename.

2. On the **agent's own host**, extract the matching gateway archive (Docker is
   required; do not run `./install` there). Supply the licensed XQ general API
   key in a mode-600 file and import the original device export ZIP:

   ```sh
   ./identities add /private/path/Export-CERTIFICATE_ID.zip --device DEVICE_NAME --api-key-file /private/path/xq-api-key
   ```

   The offline import preserves `client.crt`, `client.key` and `transport.key`
   in `identity-bundles/device-CERTIFICATE_ID/`. A separate, short-lived agent
   process exchanges that identity with XQ and records XQ's actual recipient
   identifier. It never derives the identifier from a name or team. Only public
   data is published in `public-identities/associations.json`: device name,
   certificate ID and recipientIdentifier. A public copy is also saved beside
   the bundle for agent-side redemption. Existing conflicting identities are
   refused, not overwritten.

   Transfer **only that public manifest** to the gateway operator, who runs:

   ```sh
   ./identities add --public-file /private/path/associations.json
   ```

   In production, import and exchange run on the agent's host. Private and
   transport keys never enter gateway service containers, volumes, environment,
   logs or the database. Gateway services mount only the separate public
   manifest. Do not transfer the ZIP or device bundle to the gateway. A local
   demonstration may run the isolated agent jobs on the same physical host;
   they remain separate from gateway services. Use publicly trusted HTTPS, or
   place the gateway's **public CA certificate** in `gateway-ca.pem` beside
   `./steps`; never copy its CA private key.

3. Issue this agent a credential for the pool. In **Pools → Who can get in →
   Grant access**, enter its label and select **XQ identity for custody**. The
   choice shows device name and certificate ID. Leaving it empty issues an
   ordinary credential. Alternatively:

   ```sh
   ./steps grant-access --gateway https://GATEWAY --project PROJECT --pool POOL --agent "Custody agent" --xq-identity DEVICE_NAME --session-file ./admin.session --key-out ./agent.key
   ```

   The key is never printed. Public identity metadata is associated with the
   credential; the self-declared `--agent-id` never authorizes access. Credential
   rows and agent detail show the linked device or that none is linked.

4. In **Settings → Engines**, verify the chosen engine, then use its row menu
   **Use for custody** if it is not already designated. In **Settings → Custody**, configure XQ and its team,
   then **Run connection check**. Resolve any reported failure. The Signing key
   is Opintel's own generated grant-signing key, not an agent device key.

5. In **Data → Entitlements**, open the table, select its cell for this pool and
   choose **Custody** for the intended column. Existing row decisions, pool
   bindings, query limits and all other column decisions still apply.

6. Query as the agent, using the pool credential file:

   ```sh
   ./steps query --gateway https://GATEWAY --project PROJECT --key-file ./agent.key --agent-id custody-agent --sql 'SELECT id, custody_column FROM source.public.table_name' --out ./answer.json
   ```

   Clear, tokenized and masked values are displayed as received. Custody cells
   are shortened on screen; the private result file retains complete sealed
   values and grants. The summary names the evidence ID, grant IDs, columns
   and expiry. `--quiet` prints only the summary. Treatment labels use exact
   direct-column matches from describe; expressions or aliases whose treatment
   cannot be established say **not reported**, never an inferred treatment.

7. Redeem and unseal on the agent host:

   ```sh
   STEPS_XQ_API_KEY_FILE=/private/path/xq-api-key ./steps redeem-and-unseal --result ./answer.json --gateway https://GATEWAY --project PROJECT --key-file ./agent.key --agent-id custody-agent --xq-identity ./identity-bundles/device-CERTIFICATE_ID --show --out ./unsealed.json
   ```

   The environment contains a **file path**, never key material. The isolated
   device process exchanges its own certificate with XQ. K2 is redeemed through
   `opintel.redeem`, K1 from XQ with the agent identity, and AES-256-GCM unsealing
   happens locally using the receipt, column and row associated data. All shares
   must be obtained before any cell is decrypted. Without `--show`, only grant,
   column and row summaries are printed. `--out` privately saves the unsealed
   rows. The receipt state **redeemed** records Opintel's K2 release; it alone
   does not prove XQ retrieval or local decryption.

8. Run redemption again: the one-time K2 release is refused and no plaintext is
   produced. To demonstrate **revocation independently of replay**, query again
   into a new result file and revoke that still-unredeemed grant through the
   existing console API, `POST /api/v1/projects/PROJECT/releases/GRANT_ID/revoke`,
   using the normal administrator session. In the signed-in console's browser
   developer console, substitute the printed project and grant IDs:

   ```js
   await fetch('/api/v1/projects/PROJECT/releases/GRANT_ID/revoke', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     credentials: 'same-origin',
     body: '{}'
   });
   ```

   Expect HTTP 200. Redemption of this new result must
   refuse a share, produce no plaintext/output file and exit nonzero. The server
   deliberately groups expired, revoked, already-redeemed and wrong-credential
   K2 refusals; the step reports that group without inventing a more specific
   cause. Revocation cannot recall plaintext or key shares already obtained by
   an authorized agent. Individual grant revocation currently has an API but no
   button in the Activity receipt panel; credential revocation in Pools also
   revokes its live grants and disables that credential.
