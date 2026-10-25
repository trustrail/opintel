# Gateway package

This package runs independently of the engine package. Its generated Compose
files contain immutable image digests; `release.json` records provenance.
Docker with Compose is required. Use an absolute operator-owned environment file;
never place secrets in an image or copy customer data with a package.

Set the configuration paths referenced by `services/*.json` in that environment
file. API runtime environment needs `DATABASE_URL`, `REDIS_URL`, `SPICEDB_ENDPOINT`,
`SPICEDB_TOKEN`, and `APP_BASE_URL`. Operator runtime environment additionally needs
`MIGRATION_DATABASE_URL` with migration authority. Use a separate runtime database
login with the existing application roles. Configure TLS at
`GATEWAY_CONFIG_DIRECTORY/application-tls.json`, with CA/cert/key paths relative
to that directory, and the CA at `tls/ca.pem`. Set console TLS in its separate
configuration directory. Customer `~/.xq` may be supplied as
`GATEWAY_XQ_DIRECTORY`; it is mounted read-only.

Set `GATEWAY_HEARTBEAT_URL` to this gateway's HTTPS address reachable from engines.
Heartbeat and receipt listeners have independent bind/port settings:
`GATEWAY_HEARTBEAT_BIND_ADDRESS`, `GATEWAY_HEARTBEAT_PORT` (3102),
`GATEWAY_RECEIPT_BIND_ADDRESS`, `GATEWAY_RECEIPT_PORT` (3101).
Default bind is localhost; explicitly select a reachable interface for remote
engines. Configure the engine's `receiptUrl` to the receipt address when ingest
is enabled. These are pinned mTLS endpoints, separate from the browser API.

Example lifecycle (substitute the absolute operator environment path):

```sh
./gateway.sh --env-file /etc/opintel/gateway.env start postgres redis spicedb-postgres
./gateway.sh --env-file /etc/opintel/gateway.env migrate up
./gateway.sh --env-file /etc/opintel/gateway.env spicedb-migrate
./gateway.sh --env-file /etc/opintel/gateway.env start spicedb
./gateway.sh --env-file /etc/opintel/gateway.env schema
./gateway.sh --env-file /etc/opintel/gateway.env owner-claim --owner-email owner@example.com --company 'Customer' --region eu-west-1
./gateway.sh --env-file /etc/opintel/gateway.env start api console
```

Wait for each configured dependency to be reachable before its job. External
Postgres, Redis and SpiceDB endpoints are supported: omit their local service
startup and point runtime/operator environment at those endpoints. No service
starts an implicit dependency. Startup checks compatibility and never migrates.
Migration jobs preserve historical checksums and fail on mismatch.

The claim creates no account credential or administrator role. It refuses when
any company exists. The exact email must complete normal login within 24 hours;
only then is the company administrator role granted. An expired unclaimed claim
requires another explicit CLI invocation. Both events are audited.

After login, register the engine address and certificate pin in project Settings,
verify it, designate custody where required, and save/assign sources. Assignment
waits for the current egress acknowledgment before normal introspection. Only
connected sources can serve queries. A connection failure leaves the source saved
and unreachable. No synthetic dataset is installed by this package.

## Packaged operator jobs

The provisioning image supplies `provision`; the separate demo-tools image
supplies `seed`, `governance`, `lifecycle`, `lifecycle-renew`, `xq-check`, `prepare`
and `soak`. Invoke them through this same wrapper and project name:

```sh
./gateway.sh --env-file /etc/opintel/gateway.env --project-name customer-gateway provision
./gateway.sh --env-file /etc/opintel/gateway.env --project-name customer-gateway demo-tools seed
```

They use `GATEWAY_OPERATOR_ENV_FILE`, the migration job's network/database
connectivity, read-only configuration and a separate writable private output
directory. Set `GATEWAY_OPERATOR_OUTPUT_DIRECTORY` (mode 700) and its owner in
`GATEWAY_OPERATOR_UID`/`GATEWAY_OPERATOR_GID`. They never start dependencies.
The package-only provisioning, certificate, observer and soak procedure is in
`run-soak.md`, included in the generated gateway package. No checkout or host Node
is required. Installation does not automatically seed data or configure governance.
