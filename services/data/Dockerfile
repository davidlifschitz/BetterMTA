# BetterMTA data platform — multi-stage Node 22
# Build context: repository root
#   docker build -f services/data/Dockerfile -t bettermta-data .

FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY services/data/package.json services/data/package-lock.json ./
RUN npm ci
COPY services/data/tsconfig.json services/data/tsconfig.build.json ./
COPY services/data/src ./src
COPY services/data/proto ./proto
RUN npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --create-home bettermta

COPY --from=build --chown=bettermta:bettermta /src/package.json /src/package-lock.json ./
COPY --from=build --chown=bettermta:bettermta /src/node_modules ./node_modules
COPY --from=build --chown=bettermta:bettermta /src/dist ./dist
COPY --from=build --chown=bettermta:bettermta /src/proto ./proto

ENV NODE_ENV=production \
    BETTERMTA_INTERNAL_PORT=8081 \
    BETTERMTA_DATA_DIR=/var/bettermta/data

# Listen bind is 127.0.0.1 in process (see internal-server.ts). Compose uses a
# socat sidecar (infra/compose) to expose the port on the Docker network.
EXPOSE 8081

HEALTHCHECK --interval=15s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -fsS -H "Authorization: Bearer ${BETTERMTA_INTERNAL_TOKEN}" \
    http://127.0.0.1:8081/internal/health || exit 1

USER bettermta
CMD ["node", "dist/main.js"]
