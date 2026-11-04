# Opintel agent kit

Runs on the agent host, separate from application and verification archives.

## Custody demo

Use an existing project, connected source and pool. Run `./steps STEP --help` in the package that owns that step.
for each command. The steps are agent-side jobs: they do not start a gateway
service or receive database credentials. Output files are create-only and mode
600. Never paste a credential, device token, private key or transport key into a
command line. SQL is supplied explicitly with `--sql`.

1. From the separate verification archive, sign in as a project administrator through the normal email flow:

   ```sh
   ./steps sign-in --gateway https://GATEWAY --email ADMIN_EMAIL --session-out ./admin.session
   ```

   Paste the emailed link at the hidden prompt. The normal nonce-bound callback
   must create a real session. SSO/device-confirmation failures are refused;
   there is no administrator bypass. The cookie is written only to the private
   session file. When it expires, use this command with a new session output filename.

2. On the **agent's own host**, extract the agent kit archive (Docker is
   required; do not run `./install` there). Supply the licensed XQ general API
   key in a mode-600 file and import the original device export ZIP:

   ```sh
   ./identities add /private/path/Export-CERTIFICATE_ID.zip --device DEVICE_NAME --api-key-file /private/path/xq-api-key
   ```

   The offline import preserves `client.crt`, `client.key` and `transport.key`
   in `identity-bundles/device-CERTIFICATE_ID/`. A separate, short-lived agent
   process exchanges that identity with XQ and records XQ's actual recipient
   identifier. It never derives the identifier from a name or team. Only public
   data is published in `public-identities.json`: device name,
   certificate ID and recipientIdentifier. A public copy is also saved beside
   the bundle for agent-side redemption. Existing conflicting identities are
   refused, not overwritten.

   The public association remains in the agent kit. It is sent at MCP initialize
   over mutual TLS; there is no gateway public-manifest import. Private and
   transport keys never enter gateway service containers, volumes, environment,
   logs or the database. For a private CA, copy only its public certificate to
   `gateway-ca.pem` beside `./steps`.

3. In **Pools → Who can get in → Grant access**, issue the default
   **Identity-bound** credential. Alternatively, from the verification archive:

   ```sh
   ./steps grant-access --gateway https://GATEWAY --project PROJECT --pool POOL --agent "Custody agent" --session-file ./admin.session --key-out ./agent.key
   ```

   Transfer the mode-600 key file to the agent host. First connection binds the
   presented certificate fingerprint. Device name, certificate ID and agent ID
   are self-declared labels, never authorization. If the project requires binding
   approval, an administrator must approve the pending binding before queries run.
   Later connections require that certificate. Reset binding is an audited admin
   action. Existing custody credentials also require the previously associated
   XQ recipient during their first binding.

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
