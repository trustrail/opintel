# syntax=docker/dockerfile:1
ARG NODE_BUILD_IMAGE=node:22-bookworm
ARG NODE_RUNTIME_IMAGE=node:22-bookworm-slim
ARG OS_RUNTIME_IMAGE=debian:bookworm-slim
FROM ${NODE_RUNTIME_IMAGE} AS node-runtime
FROM node-runtime AS toolchain
WORKDIR /work
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY src ./src
COPY sidecar ./sidecar
COPY scripts/engine-package ./scripts/engine-package
COPY scripts/prepare-duckdb-scanner.ts scripts/check-production-artifact.mjs ./scripts/
COPY tsconfig.json ./

FROM toolchain AS api-build
RUN node scripts/engine-package/bundle.mjs api /artifacts

FROM toolchain AS engine-build
ARG TARGETPLATFORM
RUN npm run sidecar:prepare-scanner
RUN node scripts/engine-package/bundle.mjs engine /artifacts

FROM toolchain AS console-build
COPY public ./public
COPY docs/opintel-master.css ./docs/opintel-master.css
COPY vite.config.ts index.html ./
COPY deploy/images/console.mjs ./deploy/images/console.mjs
RUN npm run build:production
RUN node scripts/engine-package/bundle.mjs console /artifacts

FROM toolchain AS egress-build
COPY deploy/engine/egress.mjs ./deploy/engine/egress.mjs
RUN node scripts/engine-package/bundle.mjs egress /artifacts

# These bases never COPY a repository input. Final image policy separately
# verifies their layer identities; npm and the Node development tree never ship.
FROM ${OS_RUNTIME_IMAGE} AS runtime-base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /work
ENV NODE_ENV=production

FROM runtime-base AS firewall-runtime
RUN apt-get update && apt-get install -y --no-install-recommends iptables && rm -rf /var/lib/apt/lists/*

FROM ${NODE_BUILD_IMAGE} AS build
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY sidecar ./sidecar
COPY scripts ./scripts
COPY test ./test
COPY migrations ./migrations
COPY docs ./docs
COPY tsconfig.json vitest.ephemerality.config.ts ./
RUN node scripts/engine-package/compile.mjs src sidecar scripts test migrations
RUN npm run sidecar:prepare-scanner
RUN g++ -shared -fPIC -I/usr/local/include/node scripts/ephemerality/infrastructure/address.cc -o /work/compiled/scripts/ephemerality/infrastructure/address.node

FROM ${NODE_RUNTIME_IMAGE} AS controller
WORKDIR /work
RUN apt-get update && apt-get install -y --no-install-recommends python3 strace postgresql-client openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /work/node_modules ./node_modules
COPY --from=build /work/compiled ./compiled
COPY --from=build /work/src ./src
COPY --from=build /work/sidecar ./sidecar
COPY --from=build /work/scripts ./scripts
COPY --from=build /work/test ./test
COPY --from=build /work/migrations ./migrations
COPY --from=build /work/docs ./docs
COPY --from=build /work/package.json /work/tsconfig.json /work/vitest.ephemerality.config.ts ./
ENV S4_LINUX=1 PYTHONDONTWRITEBYTECODE=1
CMD ["npx","vitest","run","--config","vitest.ephemerality.config.ts"]

FROM runtime-base AS engine
COPY --from=engine-build /artifacts/ ./
RUN mkdir /audit /custody /ingest && chmod 0555 /audit /custody /ingest /tmp
USER 65534:65534
ENV UV_USE_IO_URING=0 SIDECAR_CONFIG_FILE=/config/service.json
CMD ["node","sidecar/supervise.js"]

FROM firewall-runtime AS egress
COPY --from=egress-build /artifacts/ ./
CMD ["node","egress.mjs","/policy/egress.json"]

FROM runtime-base AS api
COPY --from=api-build /artifacts/ ./
RUN mkdir /mail && chown 65534:65534 /mail
USER 65534:65534
ENV APPLICATION_TLS_CONFIG=/config/application-tls.json MAIL_OUTPUT_DIR=/mail
EXPOSE 3000
CMD ["node","src/platform/http/start.js"]

FROM runtime-base AS console
COPY --from=console-build /artifacts/ ./
USER 65534:65534
ENV API_UPSTREAM=http://api:3000
EXPOSE 8080
CMD ["node","console.mjs"]
