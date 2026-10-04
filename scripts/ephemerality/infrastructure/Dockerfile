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
RUN g++ -shared -fPIC -I/usr/local/include/node scripts/ephemerality/infrastructure/address.cc -o /opt/s4-address.node
RUN npm run sidecar:prepare-scanner

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 strace postgresql-client openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY --from=build /work /work
COPY --from=build /opt/s4-address.node /opt/s4-address.node
ENV S4_LINUX=1
CMD ["npx", "vitest", "run", "--config", "vitest.ephemerality.config.ts"]
