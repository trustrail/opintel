# syntax=docker/dockerfile:1
ARG NODE_BUILD_IMAGE=node:22-bookworm
ARG NODE_RUNTIME_IMAGE=node:22-bookworm-slim
FROM ${NODE_RUNTIME_IMAGE} AS production-build
ARG TARGETPLATFORM
WORKDIR /work
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY src ./src
COPY sidecar ./sidecar
COPY scripts ./scripts
COPY migrations ./migrations
COPY docs/opintel-master.css docs/opintel-schema.zed ./docs/
COPY public ./public
COPY tsconfig.json vite.config.ts index.html ./
RUN node scripts/engine-package/compile.mjs src sidecar scripts migrations
RUN npm run build:production

FROM production-build AS scanner
ARG TARGETPLATFORM
RUN npm run sidecar:prepare-scanner

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

FROM production-build AS production-dependencies
RUN npm prune --omit=dev

FROM ${NODE_RUNTIME_IMAGE} AS engine
WORKDIR /work
COPY --from=production-dependencies /work/node_modules ./node_modules
COPY package.json ./package.json
COPY --from=production-build /work/compiled/src ./src
COPY --from=production-build /work/compiled/sidecar ./sidecar
COPY --from=scanner /work/tmp/duckdb-extensions ./tmp/duckdb-extensions
RUN mkdir /audit /custody /ingest && chmod 0555 /audit /custody /ingest /tmp
USER 65534:65534
ENV NODE_ENV=production UV_USE_IO_URING=0 SIDECAR_CONFIG_FILE=/config/service.json
CMD ["node","sidecar/supervise.js"]

FROM ${NODE_RUNTIME_IMAGE} AS egress
RUN apt-get update && apt-get install -y --no-install-recommends iptables && rm -rf /var/lib/apt/lists/*
COPY deploy/engine/egress.mjs /egress.mjs
CMD ["node","/egress.mjs","/policy/egress.json"]

FROM ${NODE_RUNTIME_IMAGE} AS api
WORKDIR /work
COPY --from=production-dependencies /work/node_modules ./node_modules
COPY package.json ./package.json
COPY --from=production-build /work/compiled/src ./src
COPY --from=production-build /work/compiled/sidecar ./sidecar
COPY migrations ./migrations
COPY --from=production-build /work/compiled/scripts ./scripts
COPY docs/opintel-schema.zed ./docs/opintel-schema.zed
RUN mkdir /mail && chown 65534:65534 /mail
USER 65534:65534
ENV NODE_ENV=production APPLICATION_TLS_CONFIG=/config/application-tls.json MAIL_OUTPUT_DIR=/mail
EXPOSE 3000
CMD ["node","src/platform/http/start.js"]

FROM ${NODE_RUNTIME_IMAGE} AS console
WORKDIR /work
COPY --from=production-build /work/dist ./dist
COPY deploy/images/console.mjs ./console.mjs
USER 65534:65534
ENV NODE_ENV=production API_UPSTREAM=http://api:3000
EXPOSE 8080
CMD ["node","console.mjs"]
