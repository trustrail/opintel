# Run the shipped soak

Start with installed gateway and engine customer packages, paired using their
READMEs. Complete the owner's normal email login. The customer's XQ team owner
must supply four licensed device export ZIPs. Import each with the gateway's
`./identities add EXPORT.zip --device NAME` command, following its `DEMO.md`.
The command maintains the protected `identity-bundles` directory and manifest; it never
enrolls or replaces devices. Import the two cedant A identities first, then the
two cedant B identities.

From the gateway package directory, run:

```sh
./demo soak 1800
```

The duration is seconds; 1800 is the shipped acceptance duration. Preparation
requires the credential grace window to cover the requested run. This command runs the
shipped demo-tools image. It verifies existing owner authority and XQ connectivity,
provisions the demonstration without overwriting decisions or rotating keys,
then seeds, renews the pool-key grace window, prepares and soaks, in that order.
It reads settings and targets from the installation's private configuration.
It requires no checkout, host Node, Compose command, browser-session export or
terminal input. Use the same command for a paired engine on another LAN host.

Results land in `state/output/soak-run-<UTC timestamp>/result.json`; the per-query
JSONL files are in that directory's `soak/` subdirectory. The command prints its
container result path under `/output`, which maps to `state/output` in the package.
Require `status: passed`, receipt verification active, and zero scenario mismatches
and operational errors. Retain failed results and logs rather than rerunning to
replace the evidence.

The read-only receipt observer is minted by the gateway-host job, scoped to this
project, and limited to the job duration plus five minutes. It loses authority
when the job exits or dies. Its credential stays in the private job directory,
is removed on graceful completion and is excluded from backups. Do not copy it.

The synthetic source is durable state on the engine host. Stop/start preserves
its tables; the acceptance harness stops its source only after writing its result
and retains the source volume. Customer source data is never torn down by these
commands. Backups exclude transient custody escrow shares; restoring cannot revive
an old redemption capability, and callers may need a fresh governed query.

The lower-level `./demo seed` and `./demo prepare` remain available after the
first successful configuration. Use `./demo soak DURATION` for a complete later
soak so lifecycle renewal cannot be accidentally omitted.
