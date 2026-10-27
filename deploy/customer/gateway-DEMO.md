# Packaged demonstration and 30-minute soak

Complete gateway install, real owner email login and engine pairing first. Run
these commands in the installed gateway directory. The engine's synthetic source
is durable customer-owned state; stopping a package or acceptance never deletes it.

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

Run `./demo soak 1800`. One job provisions the demonstration, seeds the source,
renews lifecycle credentials, prepares and runs all scenarios for 30 minutes.
Nothing reads terminal input. Receipt verification uses a project-scoped read-only
observer created on the gateway host after owner login. It expires no later than
five minutes after the requested duration and is revoked when the job ends.

The command prints the private directory beneath `state/output` containing the
JSONL and result. Require a passed result with receipt verification active, all
scenarios covered, and zero invariant breaches or operational errors. Retain every
failed result; a data-path success alone is not a passing soak. The console remains
available during the soak. Use `./status` to find its address.
