# Internal installation verification package

This archive runs outside the installation. It is never copied into the gateway
or engine archives. Use Docker on the verification host. The archive includes no
credentials, sessions or identities.

`./steps sign-in --gateway https://GATEWAY --email ADMIN_EMAIL --session-out ./admin.session`
uses the normal email link and callback. Paste the emailed link at its hidden
prompt. The session is saved in a new mode-600 file.

`./steps grant-access --gateway https://GATEWAY --project PROJECT --pool POOL --agent NAME --session-file ./admin.session --key-out ./agent.key`
issues an identity-bound credential by default. `--kind bearer-only` is available
only for pools without custody columns. Transfer the private credential file to
the agent host; never print it or put its value in arguments.

The synthetic fixture loader and soak remain `./demo seed` and `./demo soak`.
Their explicit target configuration belongs in a mode-600 `verification.env` on
this host, and their output in `output/`. The release harness prepares that
configuration independently of the gateway operator job. Supply the installation's
`DATABASE_URL`, `REDIS_URL`, `SPICEDB_ENDPOINT`, `SPICEDB_TOKEN`,
`OPINTEL_CUSTODY_MASTER_KEY`, `OWNER_EMAIL`, `APP_BASE_URL`,
`OPINTEL_API_BASE_URL`, `OPINTEL_OPERATOR_API_TARGET`, `ENGINE_HEARTBEAT_URL`,
`APPLICATION_TLS_CONFIG`, `OPINTEL_XQ_REDEEM_URL`, `OPINTEL_XQ_API_KEY`,
`OPINTEL_XQ_DASHBOARD_API_KEY`, `OPINTEL_XQ_SENDER_ALIAS`,
`OPINTEL_XQ_SENDER_ACCESS_TOKEN` and `OPINTEL_XQ_TEAM_ID`. The heartbeat URL is
the gateway's HTTPS heartbeat endpoint as reachable from the engine. Set
`OPINTEL_DEPLOYMENT_PACKAGE=gateway`, `OPINTEL_CUSTOMER_JOB=1`,
`OPINTEL_PACKAGED_SOAK=1`, `NODE_EXTRA_CA_CERTS=/config/ca.pem`,
`APPLICATION_TLS_CONFIG=/config/application-tls.json`, and `HOME=/home/operator`.
Set private output paths `OPINTEL_OPERATOR_CONFIG=/output/operator.json`,
`OPINTEL_PROVISION_MANIFEST=/output/provision.json`,
`OPINTEL_SOAK_MANIFEST=/output/soak.json`, `OPINTEL_SEED_MANIFEST=/output/seed.json`,
`OPINTEL_CERTIFICATES=/output/certificates.json`, `OPINTEL_OUTPUT_DIRECTORY=/output`,
`OPINTEL_SOAK_OUTPUT_DIRECTORY=/output/soak`, and
`STEPS_XQ_API_KEY_FILE=/input/xq-api-key`. `OPINTEL_SOAK_DURATION` and
`OPINTEL_SOAK_RATE` configure the soak; the duration argument overrides the former.
Keep credentials in the private configuration or key file, never in command arguments.
For a Docker installation it also writes private path files:
`network` names the installation's Docker network; `configuration-directory`
points to the installation's configuration directory; only the required TLS files are mounted read-only; and
`identities-directory` points to the agent kit's identity bundles, mounted
read-only into the isolated verification job. `agent-api-key-file` names the
agent's mode-600 XQ API key file. The job uses its own short-lived container;
none of these mounts is added to a gateway service. No verification service is installed in the gateway compose
project. See [DEMO.md](DEMO.md) and run `./demo --help` for the fixture and target flags.

Agent identities, query and local unsealing belong to the separate agent kit.
