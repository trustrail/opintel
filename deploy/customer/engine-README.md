# Opintel engine — customer install

Use the archive matching your Mac (arm64 for Apple silicon). Docker Desktop must
be installed, running, and allowed at least 8 GB memory. Extract this archive to
`~/Opintel/engine`; do not run it on the USB stick. All commands below run there.

1. Run `./install`. No gateway connection or settings are required. It loads the
   offline images, generates its private TLS identity and readiness database
   credentials, starts the local readiness database, egress companion and engine,
   then waits for health. No source data is copied from the developer's machine.
2. Install prints the engine address and a pairing code valid for 15 minutes.
   Give those two values to the gateway operator through your trusted channel.
   On the gateway, run `./register-engine ENGINE_ADDRESS CODE`. No files or second
   pin need transferring. Keep the code private; it authorizes one gateway claim.
3. If the code expires before pairing, run `./pairing-code` here. This changes only
   the unclaimed pairing code, never the engine identity or credentials. Once
   paired, no code can replace its gateway. `./status` shows service information.
4. Complete the gateway's optional demonstration using its `DEMO.md`. Require a
   passed 30-minute result with receipt verification. Source data remains on this
   laptop if either package stops.

Lifecycle: `./start`, `./stop`, `./status`, `./upgrade /path/to/new/engine`,
`./backup`, `./restore /path/to/backup`. Backup/restore stop services. Back up before moving.
Backups contain private identities and customer state; protect them offline.
Restore retains a pre-restore backup. Only `./sources add` asks for terminal input. Never delete
state or volumes to repair an installation. Restart does not rotate credentials.
The engine remains locally ready while the gateway is unreachable; it serves no
unverified caller and gets assignments only after explicit gateway registration.

Customer databases: run `./sources add NAME` on this Engine host. Enter host,
port (default 5432), database, user and password; password entry is hidden.
Only `secret://sources/NAME` is printed. Use that reference when registering the
source in the gateway. Credentials remain in private mode-600 files under
`state/sources` (directory mode 700), mounted only into Engine services. Existing
names are never overwritten. `./sources list` prints names only;
`./sources remove NAME` explicitly removes one credential and new reads fail
closed. Backups include this private state. Automation uses
`./sources add NAME --host HOST --port PORT --database DATABASE --user USER --password-file FILE`;
FILE must be mode 600 and contain the exact password bytes, with no newline.
No password appears in arguments or environment variables. No host Node is needed.

LAN firewall: gateway → engine TCP 3100 (pinned engine API), 3103 (pairing/recovery), and 5434 (demo source);
engine → gateway TCP 3102 (pinned heartbeat) and 3101 (optional ingest receipt).
No shared Docker network, filesystem or source checkout connects the hosts. Open
these ports only between the two laptops. External customer databases need their
own explicit source configuration and network authorization. The bundled empty
readiness/demo database is durable and is never removed by stop or acceptance.

No XQ device bundle belongs in this package: the gateway's demo job alone mounts
team-issued agent identities. No hosted model is enabled or called by default.
Queries run against sources in place; result values are held in memory, not
persisted after the response. Optional spreadsheet ingest writes into the
customer's own Postgres inside their network. Retain logs and every failed result.
