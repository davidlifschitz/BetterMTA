# BetterMTA application API — multi-stage Node 22
# Build context: repository root (needs services/routing + contracts)
#   docker build -f apps/api/Dockerfile -t bettermta-api .

FROM node:22-bookworm-slim AS build
WORKDIR /repo

# routing library (file: dependency) — keep path layout for npm link
COPY services/routing/package.json services/routing/package-lock.json ./services/routing/
WORKDIR /repo/services/routing
RUN npm ci
COPY services/routing/tsconfig.json services/routing/tsconfig.build.json ./
COPY services/routing/src ./src
RUN npm run build && npm prune --omit=dev

# API package (file:../../services/routing must resolve)
WORKDIR /repo/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
# Emit JS (package.json "build" is typecheck-only / noEmit)
RUN printf '%s\n' \
  '{' \
  '  "extends": "./tsconfig.json",' \
  '  "compilerOptions": {' \
  '    "noEmit": false,' \
  '    "outDir": "dist",' \
  '    "rootDir": "src",' \
  '    "declaration": false,' \
  '    "sourceMap": false,' \
  '    "types": ["node"]' \
  '  },' \
  '  "include": ["src/**/*.ts"]' \
  '}' > tsconfig.build.docker.json \
  && npx tsc -p tsconfig.build.docker.json \
  && npm prune --omit=dev

WORKDIR /repo
COPY contracts/schemas ./contracts/schemas
COPY contracts/package.json ./contracts/package.json

FROM node:22-bookworm-slim AS runtime
# Preserve monorepo-relative paths so file: @bettermta/routing symlink works.
WORKDIR /repo
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --create-home bettermta

COPY --from=build --chown=bettermta:bettermta /repo/services/routing /repo/services/routing
COPY --from=build --chown=bettermta:bettermta /repo/apps/api /repo/apps/api
COPY --from=build --chown=bettermta:bettermta /repo/contracts /repo/contracts
# Stable path for FLAG_DEFAULTS_PATH (infra/fly/api.fly.toml + env templates)
COPY --chown=bettermta:bettermta infra/flags/flags.json /app/config/flags.json

WORKDIR /repo/apps/api

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    BETTERMTA_ADAPTER_MODE=live \
    BETTERMTA_CONTRACTS_ROOT=/repo/contracts \
    BETTERMTA_TRUST_PROXY=1 \
    FLAG_DEFAULTS_PATH=/app/config/flags.json

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health/live || exit 1

USER bettermta
CMD ["node", "dist/index.js"]
