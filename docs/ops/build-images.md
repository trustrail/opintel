# Build and run Opintel images

`make build` is the build entry point. It requires Docker Buildx, Python 3, Node,
Git, Internet access to pinned dependencies and the official DuckDB extension
repository. Use Docker Desktop's containerd image store (or a Docker Engine
containerd image store) so local multi-architecture manifests can be retained.
The entry point checks for at least 4 GiB host free space for one platform and
8 GiB for two before it starts; Docker-VM capacity must also be sufficient.
For a monitored rebuild with an already populated cache, operators can set
`BUILD_MIN_FREE_GIB` explicitly (minimum 1); it does not cap actual disk usage.
Cross builds need native builder nodes or working QEMU/binfmt emulation. Leave
ample host and Docker-VM space for both architectures; the first attempt on the
8 GiB development laptop exhausted 3.3 GiB free before completing one image.

```sh
make build PLATFORM=linux/amd64
make build PLATFORM=linux/arm64
make build PLATFORM=linux/amd64,linux/arm64
```

The default builds both architectures. Targets are `api`, `engine`, `console` and
`egress`. The firewall companion is part of the Engine deployment and is built
for the same platform. `IMAGE_PREFIX` defaults to `opintel`; `TAG` defaults to the
first twelve characters of HEAD. Tags look like
`opintel-engine:<sha>-linux-arm64`. A single-platform build also gives each image
`<sha>`; a two-platform invocation gives that tag a manifest with both platforms.
The build uses Buildx for each architecture and assembles the combined index from
the same cached build targets. Nothing is pushed to an image registry implicitly.
Build reviewed source: a dirty worktree retains HEAD's tag, so it is not a
substitute for recording the candidate revision. Rebuild after committing before
using the new commit's release tags.

## Dependencies and scanner

`deploy/images/upstream.json` is both a valid Compose file and the image lock.
Postgres/pgvector, Redis and SpiceDB images are referenced only there by upstream
multi-platform manifest digest. Both Node build/runtime bases are locked there
for the normal image entry point as well. Update the lock deliberately, verify
both architectures and repeat the image checks; a tag alone is not a pin.
The legacy proof/controller Dockerfile targets remain available to S4.

`TARGETPLATFORM` is Docker's target, not the host architecture.
`scripts/prepare-duckdb-scanner.ts` maps `linux/amd64` to `linux_amd64` and
`linux/arm64` to `linux_arm64`. It runs in the target build stage, verifies the
exact DuckDB runtime build, checks the runtime platform agrees with the target,
downloads the official signed scanner and verifies signature/build/platform by
LOAD with unsigned extensions disabled. Cross-download without executing the
matching target runtime is refused. Without TARGETPLATFORM the existing native
development preparation still uses `PRAGMA platform`, including macOS.

## Secret boundary

Operator `.env` files, `.xq`, `.aws`, private-key files and certificate bundles are
excluded by `.dockerignore`; Dockerfiles use explicit COPY inputs. The console
contains static production assets plus its HTTP/proxy server. API and Engine
contain compiled application code and production dependencies. The API retains
original migration files, including TypeScript executed by pinned Node 22's
built-in type stripping, so the checksum ledger sees the original applied bytes.
No build argument
accepts a credential or XQ configuration. Certificates, keys, operator service JSON,
XQ state and environment values belong in runtime mounts or runtime environment
files. The XQ SDK implementation is code, not XQ account material.
Image-build/audit/smoke tooling under `scripts/images` is host-only and excluded
from the build context. The smoke transpiles its synthetic seed on the host and
mounts that one file read-only into its disposable seed container.

Every successful `make build` exports each selected platform image to a streaming
layer checker, which rejects forbidden filenames, private-key PEM blocks, explicit XQ credential assignments and live
Opintel key material. All layers are inspected, including content later deleted
or hidden by a whiteout. Configuration blobs are checked too. Unsupported blobs,
failed exports and missing layer coverage fail the build. Values are never
printed. Public OS trust-store certificates are allowed. The only private-key
text exception is six published GnuTLS known-answer self-test vectors, compared
byte-for-byte with [the upstream source](https://github.com/gnutls/gnutls/blob/3.7.9/lib/crypto-selftests-pk.c).
Their exact SHA-256 hashes are accepted only inside the pinned Debian
`libgnutls.so.30.34.3` library path for either architecture. No key files or
operator credentials are exempt. The initial real-image audit caught these
vectors; it failed before this narrow classification was added.
Positive controls include a hidden `.env`, `.xq` directory, private-key file,
private PEM content under an innocent filename and a live-key-shaped value.

```sh
python3 scripts/images/check-secrets.py --self-test
python3 scripts/images/check-secrets.py opintel-api:TAG-linux-amd64 linux/amd64
```

A failed final check means the build is not accepted even if Docker has already
created local images. Do not distribute those tags.

## Compose

The dependency-only development stack remains `docker-compose.yml`. The full
image package is `deploy/images/compose.yml`. Select exactly one runtime platform
and a built revision tag; build's comma-separated PLATFORM is not valid here.

```sh
PLATFORM=linux/arm64 TAG=YOUR_SHA docker compose \
  --env-file /operator/opintel.env -f deploy/images/compose.yml up -d
```

The operator environment must supply `APPLICATION_CONFIG_DIRECTORY`,
`API_SECRET_ENV_FILE`, `ENGINE_CONFIG_DIRECTORY`, `ENGINE_SECRET_ENV_FILE`,
`ENGINE_POLICY_FILE`, `ENGINE_AUDIT_DIRECTORY` and `ENGINE_CUSTODY_DIRECTORY`.
The full package consumes the Engine's existing manifest/runtime restrictions;
follow `deploy/engine/README.md` for configuration, pinned TLS peers, declared
source destinations, UID ownership, read-only root/tmp/shm, equal memory/swap
ceilings and disabled core dumps. The engine keeps `restart: "no"`: its supervisor,
not Docker's indefinite restart loop, owns its bounded restart budget.

`~/.xq` is mounted read-only at `/xq` in API and Engine; override XQ_DIRECTORY if
needed. The caller's directory is never a build input. Operator keys must be
readable by the runtime UID without broadening host access. The API gets its TLS
identity from `/config/application-tls.json`. The full Compose stack expects its
SpiceDB TLS certificate/key at `/config/tls/spicedb.pem` and `spicedb.key`, trusted
by `/config/tls/ca.pem` through NODE_EXTRA_CA_CERTS. Runtime environment must set
DATABASE_URL, REDIS_URL, SPICEDB_ENDPOINT and SPICEDB_TOKEN and any declared secret
references. The dependency-only development stack retains its loopback plaintext
SpiceDB setup; the image package uses TLS between containers.

The console listens on 8080 and serves production assets, browser route fallback
and a streaming proxy for `/api`, `/auth` and `/mcp` to API_UPSTREAM. It defaults
to `http://api:3000`. Host ports default to API 3000 and console 4173, bound to
loopback. Postgres, Redis and SpiceDB host ports may be changed with POSTGRES_PORT,
REDIS_PORT and SPICEDB_PORT. The supplied dependency passwords are development
values; provision customer deployment identities before exposing the package.

## Image smoke and validation

```sh
TAG=YOUR_SHA node scripts/images/smoke.mjs
```

The harness always runs linux/amd64. It provisions a unique Compose project,
two-day synthetic TLS identities outside every image, an isolated synthetic
Postgres database, Redis and SpiceDB. It starts all three application images and
the Engine firewall companion. Readiness exercises the real signed scanner's
constant source probe; a registered and verified engine then serves one entitled
synthetic table through a real pool-key-authenticated MCP call. The query must
return its expected row and an evidence id. The console must serve HTTP 200.
No XQ account material or customer source is used. Test-only fixture keys have
broad read permissions inside their disposable configuration directory; that is
not the operator-key provisioning policy.

Results and generated configuration are under `tmp/images-smoke-*`; the result
contains no credential. Shutdown removes the harness's containers/network but
retains its volumes and receipt data for review. It never removes unrelated
services or volumes. Normal full validation remains the single `npm run check`
gate; image builds and this packaging smoke supplement it.

Validation record (2026-10-22): both platform builds and all eight image-layer
audits passed, including target-runtime scanner LOAD verification. The amd64
smoke passed readiness, console serving and a real governed query with one row
and an evidence id (`tmp/images-smoke-hUYgz7/result.json`). Earlier attempts caught
a compiled migration filename mismatch, fixture grace/IP/startup errors, public
GnuTLS self-test vectors, and an accidentally packaged Python diagnostic cache.
These were corrected without changing applied migrations or query governance.
The final host-tool exclusion rebuild and all eight layer audits also passed.
The single completed-candidate gate stopped at normal-test bootstrap after
243.53 seconds: both strict typechecks, lint/boundaries, production artifact
exclusion, and all 59 conformance checks passed. The existing development
PostgreSQL container was stopped, so `opintel_test` on localhost:5432 was
unavailable; no domain/integration tests or final gate smoke ran. The existing
container was restarted with its data retained and migration checksums verified.
A separately authorized run on the unchanged tree passed all 1,986 normal tests
in 220 files and all 59 conformance checks, then stopped at smoke setup because
Redis was offline (1,413.24 seconds). Neither failed run was silently retried.
Their records and causes remain in `tmp/platform-images-validation/stopped/` and
`tmp/platform-images-validation/authorized/`.

The gate now starts stopped dev Compose PostgreSQL/Redis services before any
tier, without recreating containers or pulling images. It checks authenticated
test PostgreSQL SELECT 1 and Redis PING. Compose inspection is limited to two
seconds, startup to five seconds and parallel reachability workers to five
seconds; a failure names the dependency and records zero executed tiers. This
does not create/migrate databases or reset data; missing initial setup still
requires `npm run dev:up`. The existing normal test isolation and later smoke
preconditions remain intact. One new gate is authorized on this resulting tree;
commit, merge and push are conditional on green, with no rerun on failure.

Current gate record: `test-results/gate.json`; build log:
`/private/tmp/opintel-build-images-release.log`; smoke record:
`tmp/images-smoke-hUYgz7/result.json`.
