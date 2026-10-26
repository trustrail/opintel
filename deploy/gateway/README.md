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
to that directory, and the CA at `tls/ca.pem`. Set the ingress certificate and key paths as described below. Customer `~/.xq` may be supplied as
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
./gateway.sh --env-file /etc/opintel/gateway.env start api console ingress
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

## HTTPS ingress and service isolation

Start `ingress` alongside `api` and `console`; nginx owns the published HTTPS port
(`GATEWAY_CONSOLE_PORT`, default 443). Console serves static files only. API,
MCP, health and OIDC routes bypass it. Stopping console affects only the UI.
Set `GATEWAY_INGRESS_CONFIG_FILE` to the absolute path of this package's
`ingress/nginx.conf`. Use these absolute host paths in package.env:

```dotenv
GATEWAY_INGRESS_CERT_FILE=/etc/opintel/tls/fullchain.pem
GATEWAY_INGRESS_KEY_FILE=/etc/opintel/tls/private.key
```

Supply both or neither. Missing/unreadable supplied files fail startup; they never
trigger fallback. When neither is supplied, starting ingress runs its one-shot
setup image and reuses a local CA/server identity under
`GATEWAY_CONFIG_DIRECTORY/ingress-tls`. Set `GATEWAY_INGRESS_HOSTS` to comma-separated
DNS names/IPs before first generation (default localhost,127.0.0.1). Do not delete
this identity to rotate it implicitly. The console visibly warns about fallback
TLS. Trust the fallback ca.pem explicitly in browsers and operator HTTPS trust;
merge it into the configured gateway tls/ca.pem trust bundle for packaged Node
clients. Use a trusted certificate for production. Service daemons restart unless
stopped and have health checks; completed migration/operator jobs do not restart.

## Outbound SMTP

Set all relevant fields in the private package.env consumed by Compose:

```dotenv
SMTP_HOST=smtp.mail.us-east-1.awsapps.com
SMTP_PORT=465
SMTP_USER=noreply@trustrail.io
SMTP_PASSWORD=REPLACE_IN_PRIVATE_ENV_ONLY
SMTP_SENDER=noreply@trustrail.io
SMTP_TLS_MODE=implicit
```

AWS WorkMail's us-east-1 SMTP endpoint uses port 465 with implicit TLS
(https://docs.aws.amazon.com/general/latest/gr/workmail.html).
For a STARTTLS service use its configured port (commonly 587) and
`SMTP_TLS_MODE=starttls`; TLS upgrade is mandatory and certificates are verified.
User/password must be paired; both may be empty for a TLS-protected internal mail
relay. Partial configuration fails startup. With every SMTP field unset, local
mail under the API's /mail volume remains the fallback. A configured SMTP failure
never falls back to local files. Production logs contain no magic links or tokens.
Magic links and invitations keep the existing authentication and authorization
checks. Restart/recreate API after changing package.env. Keep this file mode 600.
