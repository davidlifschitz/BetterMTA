# BetterMTA web (Next.js 15) — multi-stage Node 22
# Build context: repository root (contracts alias during build)
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 \
#     -t bettermta-web .
# Alpha edge (same-origin): --build-arg NEXT_PUBLIC_API_BASE_URL=
#
# Production flags (baked at build time for NEXT_PUBLIC_*):
#   NEXT_PUBLIC_API_MODE=live
#   NEXT_PUBLIC_FLAG_FEEDBACK=false
#   no fixture payloads in the client graph

FROM node:22-bookworm-slim AS build
WORKDIR /repo

# Default absolute localhost for local compose; alpha override bakes "".
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
ARG NEXT_PUBLIC_API_MODE=live
ARG NEXT_PUBLIC_FLAG_FEEDBACK=false

ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_API_MODE=${NEXT_PUBLIC_API_MODE} \
    NEXT_PUBLIC_FLAG_FEEDBACK=${NEXT_PUBLIC_FLAG_FEEDBACK} \
    NEXT_TELEMETRY_DISABLED=1

COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
WORKDIR /repo/apps/web
RUN npm ci

COPY apps/web/ ./
COPY contracts /repo/contracts

RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --create-home bettermta

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=bettermta:bettermta /repo/apps/web/package.json /repo/apps/web/package-lock.json ./
COPY --from=build --chown=bettermta:bettermta /repo/apps/web/node_modules ./node_modules
COPY --from=build --chown=bettermta:bettermta /repo/apps/web/.next ./.next
COPY --from=build --chown=bettermta:bettermta /repo/apps/web/next.config.ts ./next.config.ts
# apps/web may not ship a public/ directory; create empty for next start.
RUN mkdir -p public && chown bettermta:bettermta public

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ || exit 1

USER bettermta
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
