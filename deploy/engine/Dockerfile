FROM node:22-bookworm AS build
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

FROM node:22-bookworm-slim AS controller
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

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS engine
WORKDIR /work
COPY --from=production-dependencies /work/node_modules ./node_modules
COPY package.json ./package.json
COPY --from=build /work/compiled/src ./src
COPY --from=build /work/compiled/sidecar ./sidecar
COPY --from=build /work/tmp/duckdb-extensions ./tmp/duckdb-extensions
RUN mkdir /audit /custody /ingest && chmod 0555 /audit /custody /ingest /tmp
USER 65534:65534
ENV NODE_ENV=production UV_USE_IO_URING=0 SIDECAR_CONFIG_FILE=/config/service.json
CMD ["node","sidecar/start.js"]

FROM node:22-bookworm-slim AS egress
RUN apt-get update && apt-get install -y --no-install-recommends iptables && rm -rf /var/lib/apt/lists/*
COPY deploy/engine/egress.mjs /egress.mjs
CMD ["node","/egress.mjs","/policy/egress.json"]
