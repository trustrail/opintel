# syntax=docker/dockerfile:1
ARG NODE_BUILD_IMAGE=node:22-bookworm
ARG NODE_RUNTIME_IMAGE=node:22-bookworm-slim
ARG OS_RUNTIME_IMAGE=debian:bookworm-slim
FROM ${NODE_RUNTIME_IMAGE} AS node-runtime
FROM node-runtime AS toolchain
WORKDIR /work
COPY --chmod=0755 package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY --chmod=0755 src ./src
COPY --chmod=0755 sidecar ./sidecar
COPY --chmod=0755 scripts/engine-package ./scripts/engine-package
COPY --chmod=0755 scripts/prepare-duckdb-scanner.ts scripts/check-production-artifact.mjs ./scripts/
COPY --chmod=0755 tsconfig.json ./

FROM toolchain AS api-build
COPY --chmod=0755 migrations ./migrations
COPY --chmod=0755 docs/opintel-schema.zed ./docs/opintel-schema.zed
RUN node scripts/engine-package/bundle.mjs api /artifacts

FROM toolchain AS engine-build
ARG TARGETPLATFORM
RUN npm run sidecar:prepare-scanner
RUN node scripts/engine-package/bundle.mjs engine /artifacts

FROM toolchain AS console-build
COPY --chmod=0755 scripts/build-consoles.mjs ./scripts/build-consoles.mjs
COPY --chmod=0755 public ./public
COPY --chmod=0755 vite.config.ts ./
COPY --chmod=0755 deploy/images/console.mjs ./deploy/images/console.mjs
RUN npm run build:production
RUN node scripts/engine-package/bundle.mjs console /artifacts

FROM toolchain AS egress-build
COPY --chmod=0755 src ./src
COPY --chmod=0755 sidecar ./sidecar
COPY --chmod=0755 deploy/engine/egress.mjs ./deploy/engine/egress.mjs
RUN node scripts/engine-package/bundle.mjs egress /artifacts

FROM toolchain AS migrations-build
COPY --chmod=0755 migrations ./migrations
COPY --chmod=0755 docs/opintel-schema.zed ./docs/opintel-schema.zed
RUN node scripts/engine-package/bundle.mjs migrations /artifacts

FROM toolchain AS provisioning-build
COPY --chmod=0755 scripts/operator ./scripts/operator
RUN node scripts/engine-package/bundle.mjs provisioning /artifacts

FROM toolchain AS demo-tools-build
COPY --chmod=0755 scripts/operator ./scripts/operator
COPY --chmod=0755 scripts/soak ./scripts/soak
COPY --chmod=0755 scripts/infrastructure ./scripts/infrastructure
COPY --chmod=0755 scripts/demo-soak-definition.ts ./scripts/
RUN node scripts/engine-package/bundle.mjs demo-tools /artifacts

# These bases never COPY --chmod=0755 a repository input. Final image policy separately
# verifies their layer identities; npm and the Node development tree never ship.
FROM ${OS_RUNTIME_IMAGE} AS runtime-base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --chmod=0755 --from=node-runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /work
ENV NODE_ENV=production

FROM runtime-base AS firewall-runtime
RUN apt-get update && apt-get install -y --no-install-recommends iptables && rm -rf /var/lib/apt/lists/*

FROM ${NODE_BUILD_IMAGE} AS build
WORKDIR /work
COPY --chmod=0755 package.json package-lock.json ./
RUN npm ci
COPY --chmod=0755 src ./src
COPY --chmod=0755 sidecar ./sidecar
COPY --chmod=0755 scripts ./scripts
COPY --chmod=0755 test ./test
COPY --chmod=0755 migrations ./migrations
COPY --chmod=0755 docs ./docs
COPY --chmod=0755 tsconfig.json vitest.ephemerality.config.ts ./
RUN node scripts/engine-package/compile.mjs src sidecar scripts test migrations
RUN npm run sidecar:prepare-scanner
RUN g++ -shared -fPIC -I/usr/local/include/node scripts/ephemerality/infrastructure/address.cc -o /work/compiled/scripts/ephemerality/infrastructure/address.node

FROM ${NODE_RUNTIME_IMAGE} AS controller
WORKDIR /work
RUN apt-get update && apt-get install -y --no-install-recommends python3 strace postgresql-client openssl && rm -rf /var/lib/apt/lists/*
COPY --chmod=0755 --from=build /work/node_modules ./node_modules
COPY --chmod=0755 --from=build /work/compiled ./compiled
COPY --chmod=0755 --from=build /work/src ./src
COPY --chmod=0755 --from=build /work/sidecar ./sidecar
COPY --chmod=0755 --from=build /work/scripts ./scripts
COPY --chmod=0755 --from=build /work/test ./test
COPY --chmod=0755 --from=build /work/migrations ./migrations
COPY --chmod=0755 --from=build /work/docs ./docs
COPY --chmod=0755 --from=build /work/package.json /work/tsconfig.json /work/vitest.ephemerality.config.ts ./
ENV S4_LINUX=1 PYTHONDONTWRITEBYTECODE=1
CMD ["npx","vitest","run","--config","vitest.ephemerality.config.ts"]

FROM runtime-base AS engine
COPY --chmod=0755 --from=engine-build /artifacts/ ./
RUN mkdir /audit /custody /ingest && chmod 0555 /audit /custody /ingest /tmp
USER 65534:65534
ENV UV_USE_IO_URING=0 SIDECAR_CONFIG_FILE=/config/service.json
CMD ["node","sidecar/supervise.js"]

FROM firewall-runtime AS egress
COPY --chmod=0755 --from=egress-build /artifacts/ ./
CMD ["node","egress.mjs","/policy/egress.json"]

FROM runtime-base AS api
COPY --chmod=0755 --from=api-build /artifacts/ ./
RUN mkdir /mail && chown 65534:65534 /mail
USER 65534:65534
ENV APPLICATION_TLS_CONFIG=/config/application-tls.json MAIL_OUTPUT_DIR=/mail
EXPOSE 3000
CMD ["node","src/platform/http/start.js"]

FROM runtime-base AS console
COPY --chmod=0755 --from=console-build /artifacts/ ./
USER 65534:65534
EXPOSE 8080
CMD ["node","console.mjs"]

FROM runtime-base AS migrations
COPY --chmod=0755 --from=migrations-build /artifacts/ ./
USER 65534:65534
CMD ["node","src/platform/db/migrate.js","status"]

FROM runtime-base AS tls-runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM tls-runtime AS provisioning
COPY --chmod=0755 --from=provisioning-build /artifacts/ ./
USER 65534:65534
CMD ["node","src/platform/ops/owner-claim.js","--help"]

FROM runtime-base AS demo-tools
COPY --chmod=0755 --from=demo-tools-build /artifacts/ ./
USER 65534:65534
CMD ["node","scripts/operator/demo.js","--help"]
