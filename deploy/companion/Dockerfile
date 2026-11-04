FROM node:22-bookworm@sha256:63538dfe497cc29dfafdda25ada09b46db68a3f4cc205abf1f5d6bf0913f3384 AS build
WORKDIR /work
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN node scripts/engine-package/bundle.mjs companion /runtime
FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
RUN ln -s /tmp /run/opintel
USER 1000:1000
ENV NODE_ENV=production
CMD ["node","scripts/companion/main.js"]
