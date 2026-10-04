# Opintel Engine deployment (S5)

The same OCI image and Compose package support both deployment models. This
package is a Linux deployment, including Docker Desktop's Linux VM for tests.
An image alone cannot enforce filesystem, swap or network policy: use the
provided manifest, not an unrestricted `docker run`.

## Provisioning

1. Build `docker compose -f deploy/engine/compose.yml --env-file OPERATOR_ENV build`.
   The `engine` target of `deploy/engine/Dockerfile` produces
   `opintel-engine:local`; distribute a reviewed immutable image digest. The
   matching `egress` target supplies the firewall companion. The PostgreSQL
   scanner for pinned DuckDB 1.4.3 is fetched, signature/build checked and baked
   at build time. Runtime does not install extensions.
2. Provision a read-only configuration directory and TLS identities outside the
   image. Set `ENGINE_CONFIG_DIRECTORY` and `ENGINE_SECRET_ENV_FILE` (customer
   owned, mode 0600). Secret references resolve from that environment, as in
   local Engine configuration. No configuration or secrets are copied into the
   image. Service JSON must set `host: "0.0.0.0"`, `port: 3100`,
   `postgresExtension: "/work/tmp/duckdb-extensions/postgres_scanner.duckdb_extension"`,
   `auditFile: "/audit/sampling.jsonl"`, and optional custody
   `{ "keyStore": "/custody/primary", "keyEscrow": "/custody/escrow" }`.
   TLS file paths should be under `/config`; the UID 65534 engine must be able
   to read the private key, without making it world-readable.
3. Set `ENGINE_AUDIT_DIRECTORY` and `ENGINE_CUSTODY_DIRECTORY` to customer-owned
   directories, owned by UID/GID 65534, mode 0700. `/audit` holds the metadata-only
   sampling audit; `/custody` holds encrypted custody and separately located
   primary/escrow stores. They must have customer-controlled retention, backup
   and permissions. The engine does not receive a Docker socket or host root.
4. Declare destinations in `ENGINE_POLICY_FILE`, for example:

   ```json
   {"sources":[{"address":"10.20.0.8","port":5432}],
    "receipt":{"address":"10.20.0.9","port":443}}
   ```

   These are TCP destination declarations, not inferred from incoming query SQL.
   A port is optional for a source host (all TCP ports at that declared address);
   specify it to restrict that host further. Always declare the receipt port.
   The receipt address is the application's HTTPS landing endpoint and is
   mandatory when landing is configured. Declare every address needed by each
   source. The namespace firewall drops all other IPv4/IPv6 outbound traffic,
   including Docker's DNS proxy; it allows established replies. Loopback requires
   an explicit declaration too. Resolve names during operator provisioning and keep
   certificate hostnames intact using approved static name resolution (the
   `hosts.compose.yml` overlay with `ENGINE_HOSTS_FILE`, a customer-owned static
   `/etc/hosts` file mounted read-only). Docker `container:` networking does not support `--add-host`/`extra_hosts`
   on this engine; see [Docker networking](https://docs.docker.com/engine/network/).
   DNS is not a blanket outbound exception. Regenerate policy and recreate the engine
   when addresses change; undeclared new addresses fail closed. Install the
   policy before starting the engine, and never run the engine without the
   companion's healthy namespace. Operators control policy files, firewall
   capabilities and the Docker host; the engine has no network capabilities.
5. For ingest, add `-f deploy/engine/ingest.compose.yml`, set
   `ENGINE_INGEST_DIRECTORY`, and create its `scratch` and landing directories
   owned by UID 65534. Configure landing-zone directories below `/ingest`.
   The optional mount holds original files, registers and extraction scratch;
   these are legitimate customer-environment writes. `TMPDIR=/ingest/scratch`.
   Without ingest, omit this overlay and the third writable mount.
6. Start with `docker compose -f deploy/engine/compose.yml --env-file OPERATOR_ENV up -d`
   (include the ingest overlay if needed). Choose `ENGINE_BIND_ADDRESS`,
   `ENGINE_PORT` and `ENGINE_MEMORY`; the default listener binds the Docker host's
   loopback, not its public network. Equal memory/memory+swap limits forbid
   container swap; confirm cgroup enforcement on the actual Linux host.

Only `/audit`, `/custody`, and optional `/ingest` are writable storage mounts.
Root, `/tmp`, and `/dev/shm` are read-only; the engine drops all capabilities,
uses no-new-privileges, limits processes and sets core soft/hard limits to zero.
**Linux tmpfs `size=0` means unlimited**, so it is not a no-write control.
Query spill remains disabled independently inside DuckDB (C.2). Customer operators
must disable host/hypervisor swap, crash capture and unwanted log/spool capture;
the image cannot prove or impose those host policies. Do not enable Node heap
snapshots or dump tooling in the engine. Logs obey C.5/§8: execution metadata only.

## Deployment responsibilities

| Model | Reachability | Certificates and engine operation |
|---|---|---|
| Multi-tenant | Agent reaches Opintel's hosted MCP application. Application-to-engine dispatch needs a customer-approved path into the customer network. S5 supplies the TLS listener, not a tunnel or an inbound-access decision; 5.20 must resolve this prerequisite. Receipt delivery is a declared outbound HTTPS destination and does not establish reverse dispatch reachability | Opintel operates the application; customer/customer-appointed operator operates engine, storage, policy and host. Each operator provisions its own private key. CA/trust material and full-certificate pins are exchanged through authenticated provisioning across the organisational boundary. Coordinate trust/pin replacement and certificate rotation before expiration; distribution/rotation mechanism remains an operator provisioning decision, not a registry feature |
| Single-tenant | Application and engines run inside customer network; agent reaches customer's MCP endpoint. Internal application-to-engine routing, including between segments, is required. No cross-organisation inbound path is needed | Customer-appointed operators operate both endpoints and provision trust/pins internally. Private keys stay at their endpoint. Operators coordinate rotation and replace the read-only configuration before recreating containers; internal certificate distribution is customer owned |

The code and container controls are identical. Network paths, receipt destinations,
certificate distribution and operator responsibilities differ. No engine registry,
self-registration token, dynamic source-to-engine routing or reachability mechanism
is implemented by S5.

## Verification and controller boundary

Run `npm run test:ephemerality`. It builds the **same engine target and image tag**
as this package, verifies Docker's actual image ID and runtime controls in
`test-results/ephemerality/<run>/shipping-runtime.json`, performs SD-005 active probes,
and runs all S4 scenarios. An independently reachable undeclared test host is
first verified by a witness outside the restricted namespace. Engine-side TCP
attempts must then fail, while a declared source connects and a TLS client sends
a POST to the declared application receipt receiver and receives 204. This is a
synthetic application network receiver; receipt persistence/authorization remain
the existing ingest application tests. The test also starts the baked shipping
entry point and verifies readiness and shutdown under its real restrictions.

The shipping engine lacks Python, strace, Vitest, OpenSSL certificate generation,
PostgreSQL fixture CLI and the allocation-address addon. A separate controller
image supplies those, plus independent markers, memory scanning, syscall records
and reports. It shares the Linux PID namespace solely for `/proc` scanning and
ptrace; only that controller receives SYS_PTRACE. Read-only mounted instrumentation
starts a child inside the shipping image and pauses before importing production
modules, allowing the outside controller to attach first. The addon and fixtures
are test-only read-only mounts. The engine cannot access the controller's reports
or tools. Control files/logs live in permitted mounts and remain scanned alongside
workload sinks. Test fixture loopback (variable local transport ports) and Redis/SpiceDB endpoints are explicit additional
network declarations for the application scenario; production engines do not
need them. Controller traffic is outside the inspected process tree.

S4 includes attempted writes to `/tmp`, `/dev/shm`, `/work` and `/`, live file/heap
controls, transient write observation, complete/incomplete scan reporting and
unsuppressed mapped-memory residuals. Allowed customer storage is never exempted
from workload-sentinel detection. Immediate managed-heap erasure is not claimed.


The image uses compiled JavaScript. For operator ingest commands, run
`docker compose -f deploy/engine/compose.yml --env-file OPERATOR_ENV exec engine node sidecar/ingest/command.js --help`.
Examples printed with `npm run sidecar:register --` have the equivalent container
prefix `node sidecar/ingest/command.js`; the development TypeScript runner is not
shipped. [Local validation](../../docs/review/s5-packaging.md) records the tested
image ID; promote that tested image digest rather than rebuilding during release.

## Single-tenant registry (5.20)

The application dials this engine's private HTTPS listener. In project
Settings → Engines, register its address and SHA-256 certificate fingerprint,
then Test connection. A valid hex typo fails verification before assignment.
After verification, designate the project's custody engine, initialize custody,
and assign sources. Each source has one engine; multiple engines are allowed.
Editing the address/pin requires verification again. Exchange application trust
and public certificates internally; keep private keys at their endpoints.

Application `APPLICATION_TLS_CONFIG` contains only `caFile`, `certFile`, `keyFile`.
No application code reads the former `client.json`, `SIDECAR_CLIENT_CONFIG`, or
`LANDING_RECEIPT_CLIENT_CONFIG`. Engine addresses/pins and source/custody mappings
live in the registry. The engine's own `service.json` remains its deployment
configuration; it is not application routing configuration. The receipt listener
uses registry certificate authorization bound to the sending engine's project
and assigned source. Customer operators provision matching project key versions
on additional engines until separate item 5.21 implements distribution; stale
or unprovisioned engines refuse tokenized work. No relay or enrollment is added.

On an operator workstation, obtain the pin from the provisioned engine public
certificate with `openssl x509 -in engine.pem -noout -fingerprint -sha256`.
Settings accepts its colon-separated fingerprint or 64 hex characters and
checks it against the live peer during verification. Trust-chain and hostname
validation remain enabled; the pin does not replace either. Coordinate pin
replacement with certificate rotation and verify the replacement before use.
