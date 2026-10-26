# Opintel engine — customer install

Use the archive matching your Mac (arm64 for Apple silicon). Docker Desktop must
be installed, running, and allowed at least 8 GB memory. Extract this archive to
`~/Opintel/engine`; do not run it on the USB stick. All commands below run there.

1. Run `./install`. No gateway connection or settings are required. It loads the
   offline images, generates its private TLS identity and readiness database
   credentials, starts the local readiness database, egress companion and engine,
   then waits for health. No source data is copied from the developer's machine.
2. Run `./status`. Save the engine certificate pin and keep its generated
   `state/gateway-registration.json` private. Transfer that file and pin to the
   gateway operator by USB. It contains the generated demo-source credential;
   do not paste its contents, put it in email, or include it in a support report.
3. Receive the gateway's public `trust.json` and pin by USB. Run
   `./register /path/to/trust.json GATEWAY_PIN`. A mismatched pin refuses before
   changing trust. Registration restarts the engine with pinned mutual TLS;
   it never turns off verification. The gateway README completes project
   registration, source assignment and the explicit demonstration soak.
4. For a single laptop the transfer paths can be `../gateway/trust.json` and
   `../engine/state/gateway-registration.json`. For two laptops copy only the
   named files by USB and use the LAN addresses printed by `./status`.
5. After the gateway's `./demo soak 1800`, require a passed result with receipt
   verification active. Data remains on the engine laptop if either package stops.

Lifecycle: `./start`, `./stop`, `./status`, `./upgrade /path/to/new/engine`,
`./backup`, `./restore /path/to/backup`. Backup/restore stop services. Back up before moving.
Backups contain private identities and customer state; protect them offline.
Restore retains a pre-restore backup. Nothing reads terminal input. Never delete
state or volumes to repair an installation. Restart does not rotate credentials.
The engine remains locally ready while the gateway is unreachable; it serves no
unverified caller and gets assignments only after explicit gateway registration.

LAN firewall: gateway → engine TCP 3100 (pinned engine API) and 5434 (demo source);
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
