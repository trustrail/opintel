# Run a packaged reinsurance soak

Use the digest-pinned gateway and engine packages. Operator commands run as
one-shot containers in the **same gateway Compose project** as migrations.
The operator machine needs Docker Compose and Bash; it needs neither a checkout
nor host Node. A separate build machine produces the packages and images.

Provision the gateway dependencies, migrate, load the authorization schema, make
an expiring owner claim and complete normal login using the gateway package
README. Install the engine independently using its README. Engine source
readiness, pinned TLS and acknowledged source egress remain mandatory.

Set the following in the operator environment referenced by the gateway package's
`GATEWAY_OPERATOR_ENV_FILE`. It uses the migration job's database connectivity;
`DATABASE_URL` must have the ordinary scoped application roles. Keep that file
mode 600. The API and engine retain their separately configured runtime envs.

```dotenv
APPLICATION_TLS_CONFIG=/config/application-tls.json
OPINTEL_API_BASE_URL=https://gateway.customer.example
OPINTEL_OPERATOR_CONFIG=/output/operator.json
OPINTEL_PROVISION_MANIFEST=/output/provision.json
OPINTEL_SEED_MANIFEST=/output/seed.json
OPINTEL_SOAK_MANIFEST=/output/soak.json
OPINTEL_OBSERVER_COOKIE=/output/observer.cookie
OPINTEL_CERTIFICATES=/output/certificates.json
OPINTEL_DEMO_DATABASE_URL=postgresql://demo-writer:REPLACE@source.customer.example/demo
OPINTEL_SECRET_DEMO_POSTGRES=postgresql://demo-writer:REPLACE@source.customer.example/demo
OPINTEL_DEMO_FIXTURE=V-01
OPINTEL_DEMO_SEED=1
OPINTEL_DEMO_SCHEMAS=soak_policies,soak_claims,soak_recoveries
OPINTEL_SOAK_DURATION=120
OPINTEL_SOAK_RATE=10000
```

The three schema names and V-01/seed 1 are the supported versioned synthetic
scenario. The source credential must resolve to this explicit database target in
the operator and engine environments; a separate read-only login may be used. Use a dedicated demo database. Seeding
refuses the application's database, incompatible schemas, changed rows and
pre-existing empty tables. It never drops tables; it ANALYZEs its generated
tables and verifies counts and planner estimates. Unrelated tables are untouched.

Size the engine's explicit source limits for the ten callers before starting.
The Stage 4 acceptance configuration uses eight connections per source,
30-second statement and 35-second source-operation deadlines, and the
ten-second per-agent pacing above. A source-connection refusal or an engine
verification failure still fails any scenario that requires success; preparation
checks prerequisites, not sustained-load capacity.

Set `GATEWAY_OPERATOR_OUTPUT_DIRECTORY` to an absolute, private host directory;
it is mounted as `/output`. Set `GATEWAY_OPERATOR_UID` and
`GATEWAY_OPERATOR_GID` to its owner, and use mode 700 on the directory and 600 on
files. Both jobs default to UID/GID 65534. Set `GATEWAY_AGENT_CERTIFICATES_DIRECTORY` to the
existing private agent certificate directory; only the demo-tools job mounts it read-only at
`/home/operator/.xq`. Keep the API’s separate `GATEWAY_XQ_DIRECTORY` free of
agent private keys. Do not put credentials in package/image artifacts.

Create `/output/operator.json` in that host directory with the existing owner
email and company ID, an explicit project declaration and the engine's public
address/pin. Obtain the company ID from the signed-in console and the pin from
`engine.sh ... pin`. These are examples to fill with your installation's values:

```json
{
  "ownerEmail": "owner@example.com",
  "companyId": "REPLACE_WITH_EXISTING_COMPANY_UUID",
  "projectName": "Reinsurance",
  "region": "eu-west-1",
  "engine": {
    "name": "Reinsurance engine",
    "address": "https://engine.customer.example:3100",
    "certificatePin": "REPLACE_WITH_ENGINE_CERTIFICATE_PIN"
  },
  "sourceCredentialRef": "secret://demo/postgres",
  "settings": {
    "query": {"rowLimit": 1000, "timeoutSeconds": 30, "memoryLimitMb": 256,
      "concurrencyPerPool": 2, "aggregateMinGroupSize": 5},
    "custody": {"provider": "xq", "tenant": "REPLACE_WITH_XQ_TENANT", "region": "eu-west-1"},
    "poolKeyGraceSeconds": 3600
  }
}
```

Provide the existing `OPINTEL_CUSTODY_MASTER_KEY`, `OPINTEL_XQ_API_KEY`,
`OPINTEL_XQ_DASHBOARD_API_KEY`, `OPINTEL_XQ_SENDER_ALIAS`,
`OPINTEL_XQ_SENDER_ACCESS_TOKEN` and `OPINTEL_XQ_REDEEM_URL` to both API and
operator runtime environments. `OPINTEL_API_BASE_URL` must be identical there
because it participates in the saved custody connection-check binding. Preserve
the existing master key and sender identity. Configure the gateway CA trust;
never disable certificate or hostname verification.

Save the normal signed-in `opintel_session` cookie in `observer.cookie` as
`opintel_session=VALUE`, with mode 600. It is used for the existing authenticated
operator identity verification, XQ connection check and receipt reads. The job creates no login and has no observer
SQL fallback. Sign in again explicitly if the session expires.

Install the existing location-authorized bundles for 223/opintelprobe,
224/opintelpoola, 225/opintelpoolb2 and 226/opintelpoolb. Each private directory
must have mode 700 and contain `client.crt`, `client.key` and `transport.key`,
with mode 600. Do not create replacement licensed identities. Save this public
mapping as `certificates.json` in the output directory:

```json
[
  {"certificateId":223,"deviceName":"opintelprobe","bundlePath":"/home/operator/.xq/v02/223"},
  {"certificateId":224,"deviceName":"opintelpoola","bundlePath":"/home/operator/.xq/v02/224"},
  {"certificateId":225,"deviceName":"opintelpoolb2","bundlePath":"/home/operator/.xq/v02/225"},
  {"certificateId":226,"deviceName":"opintelpoolb","bundlePath":"/home/operator/.xq/v02/226"}
]
```

From the extracted gateway package, run:

```sh
umask 077
GATEWAY_ENV=/etc/opintel/gateway.env
GATEWAY_PROJECT=customer-gateway
./gateway.sh --env-file "$GATEWAY_ENV" --project-name "$GATEWAY_PROJECT" provision
./gateway.sh --env-file "$GATEWAY_ENV" --project-name "$GATEWAY_PROJECT" demo-tools seed
./gateway.sh --env-file "$GATEWAY_ENV" --project-name "$GATEWAY_PROJECT" demo-tools xq-check
./gateway.sh --env-file "$GATEWAY_ENV" --project-name "$GATEWAY_PROJECT" demo-tools governance
./gateway.sh --env-file "$GATEWAY_ENV" --project-name "$GATEWAY_PROJECT" provision
./gateway.sh --env-file "$GATEWAY_ENV" --project-name "$GATEWAY_PROJECT" demo-tools governance
./gateway.sh --env-file "$GATEWAY_ENV" --project-name "$GATEWAY_PROJECT" demo-tools lifecycle
./gateway.sh --env-file "$GATEWAY_ENV" --project-name "$GATEWAY_PROJECT" demo-tools prepare
./gateway.sh --env-file "$GATEWAY_ENV" --project-name "$GATEWAY_PROJECT" demo-tools soak
```

Provisioning checks existing company/project administrator authorization. It
creates no user or role, initializes token custody through the existing service,
resumes matching state and refuses differing settings, engine pins, source
assignments, decisions or saved credential associations. Keep the private
manifests: plaintext keys cannot be recovered. An interrupted issuance whose
key was not saved is a conflict, never permission to mint a replacement silently.
Source setup waits for the real engine's egress acknowledgment and normal
introspection; the operator cannot manufacture that acknowledgment.

`lifecycle` explicitly creates dedicated retiring/revoked probes. It never rotates
the ten ordinary callers. To replace expired probes, explicitly run
`demo-tools lifecycle-renew`; prior probe records remain in the private manifest.
`prepare` and `soak` never provision, renew, seed or repair their target.
Preparation checks source counts/estimates, scenario/discovery compatibility,
actual receipt list/detail access, the API's XQ status, all requested certificate
exchanges, escrow/redemption in both pools and enough remaining grace for the
requested duration. Provider-location refusals and expired windows fail before
timing. A two-minute run is a wiring/soak check, not the Stage 5 thirty-minute proof.

Preparation records use unique `prepare-*.json` filenames in the private output
directory. API connection checks use `xq-check-*.json`. Soak JSONL reports live
under `soak/` with unique names; failed reports are retained. Require exit 0,
`SOAK PASSED`, zero invariant breaches, zero operational errors and zero skipped
receipt checks. Inspect custody verified values and declared scenario coverage;
a timed run is not a claim that every scenario completed. For thirty minutes,
set `OPINTEL_SOAK_DURATION=1800`, then run `prepare` and `soak` again. Never run
the repository gate or another database-resetting harness against this target.

Stage 4 acceptance status and exact published image digests are recorded in
`docs/review/stage4-progress.md`. Do not infer acceptance from these instructions.

For the recorded ten-caller acceptance installation, the engine runtime env
also declares `UV_THREADPOOL_SIZE=16`. This is an explicit capacity setting,
not a relaxation of query budgets. `STAGE4_HOST_ADDRESS` optionally selects the
published endpoint address in the maintainer acceptance harness; it does not
change operator jobs, which read their targets from the package env/config.
