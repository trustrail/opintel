# Packaged demonstration and 30-minute soak

Complete gateway install, real owner email login and engine pairing first. Run
these commands in the installed gateway directory. Choose a separate ordinary Postgres database that you control. Never use the
engine readiness database. Synthetic and customer data take exactly the same path.

Your XQ team owner supplies four distinct licensed device exports out of band.
The installer never creates or replaces licensed identities. Keep the original
export filenames (ending `-CERTIFICATE_ID.zip`) and protect exports as secrets.
Import each with `./identities add /path/to/TEAM_EXPORT-123.zip --device DEVICE_NAME`.
Use the intended exact device name; without `--device`, the name is `opintel-ID`.
The command maintains `identity-bundles/certificates.json` and `identity-bundles/device-ID/`
containing `client.crt`, `client.key`, and `transport.key`. Directories are 700 and
files 600. Never hand-write the manifest. Reimporting an identical identity is a
no-op; a conflicting identity refuses without overwriting it.

Import in cedant order: the first two identities serve cedant A, the next two
serve cedant B. This four-identity mapping is specific to the shipped scenario set.
Keep the original exports with your protected offline backups.

To verify provider key handling independently, run `./xq-check --roundtrips 200`.
It escrows and retrieves 200 fresh shares using your imported identities, requires
200/200 exact matches, and writes a private result beneath `state/output`. It never
prints shares, device tokens or comparison digests. Release acceptance requires
this check. A failed escrow is a failure, not a retried sample.

Create a private file `state/output/source-uri` (mode 600) containing the connection
URI for that named database. It must be reachable from the gateway seed job and
from the engine. Seed explicitly:

```
./demo seed --target-file /output/source-uri --fixture V-01 --seed 1 --schemas soak_policies,soak_claims,soak_recoveries
```

On the engine, use `./sources add v01` with that ordinary database connection.
The reference is `secret://sources/v01`; the URI is never sent to the gateway.
Register it in Data → Connect a source, selecting the engine and schemas, as for
any source. The soak registers its three named schema scopes through the public
API with your normal company-administrator session. Save that session cookie in
`state/output/owner.cookie` (mode 600). It must contain `opintel_session=…` only.
No observer credential can create sources.

```
./demo soak 1800 --target-file /output/source-uri --source-ref secret://sources/v01 --session-file /output/owner.cookie
```

The job preserves the V-01 declaration and expected answers, seeds the source,
renews lifecycle credentials, prepares and runs all scenarios for 30 minutes.
Nothing reads terminal input. Receipt verification uses a project-scoped read-only
observer created on the gateway host after owner login. It expires no later than
five minutes after the requested duration and is revoked when the job ends.

The command prints the private directory beneath `state/output` containing the
JSONL and result. Require a passed result with receipt verification active, all
scenarios covered, and zero invariant breaches or operational errors. Retain every
failed result; a data-path success alone is not a passing soak. The console remains
available during the soak. Use `./status` to find its address.

Workbook fixtures are internal verification inputs, not an engine capability.
From the repository, `npm run demo:pack -- OUTPUT_DIRECTORY` writes ordinary XLSX
files only. Configure normal filing parties/rules and deliver them to a landing
zone using the unchanged files-to-Postgres tooling. The merged-header workbook
is held; restatements preserve the original filing. No special registration or
provisioning endpoint exists.
