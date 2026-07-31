#!/usr/bin/env bash
# Phase 12A.4 — bring up controlled-alpha Compose stack and smoke the edge.
# Idempotent: safe to re-run when the stack is already up.
#
# When deployments/current.env exists, includes docker-compose.release.yml and
# sources image pins (same pattern as deployments/scripts/common.sh) so a later
# start/stop does not silently fall back to :local.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

CURRENT_ENV="${ROOT}/deployments/current.env"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.alpha.yml)
EDGE_BASE="${EDGE_BASE:-http://127.0.0.1:8088}"
WAIT_SECS="${ALPHA_WAIT_SECS:-420}"
ROUTE_SMOKE="${ALPHA_ROUTE_SMOKE:-1}"

log() { printf '[start-alpha] %s\n' "$*"; }
die() { printf '[start-alpha] ERROR: %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH"
}

require_file() {
  [[ -f "$1" ]] || die "required file missing: $1"
}

# Mirror deployments/scripts/common.sh load_env_file (set -a / source / set +a).
load_current_env() {
  local file="$1"
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

log "repo root: $ROOT"

require_cmd docker
docker info >/dev/null 2>&1 || die "Docker daemon not reachable (is Colima/Docker Desktop running?)"
require_cmd docker-compose

# Required compose / edge config (no secret env files for local alpha compose).
# Compose bakes a local-only internal token (NOT for production / Tunnel).
require_file docker-compose.yml
require_file docker-compose.alpha.yml
require_file infra/alpha/Caddyfile
require_file infra/alpha/scripts/smoke-edge.sh

if [[ -f "$CURRENT_ENV" && -r "$CURRENT_ENV" ]]; then
  require_file docker-compose.release.yml
  COMPOSE_FILES+=(-f docker-compose.release.yml)
  load_current_env "$CURRENT_ENV"
  log "release pins: using deployments/current.env + docker-compose.release.yml (RELEASE_ID=${RELEASE_ID:-unknown})"
  log "  images: data=${BETTERMTA_IMAGE_DATA:-?} otp=${BETTERMTA_IMAGE_OTP:-?} api=${BETTERMTA_IMAGE_API:-?} web=${BETTERMTA_IMAGE_WEB:-?}"
else
  log "NOTE: no readable deployments/current.env — alpha compose only (:local image defaults)"
  log "NOTE: after a release deploy, prefer start/stop so current.env pins are preserved"
fi

# Soft prerequisites (warn; OTP/API ready will fail closed if missing).
if [[ ! -f services/otp/var/otp/graphs/active.json ]]; then
  log "WARN: services/otp/var/otp/graphs/active.json missing — OTP/API may not become ready"
fi
if [[ ! -d services/data/var/data/static ]]; then
  log "WARN: services/data/var/data/static missing — data may not become ready"
fi

log "starting alpha stack (${COMPOSE_FILES[*]})"
docker-compose "${COMPOSE_FILES[@]}" up -d --remove-orphans

log "waiting up to ${WAIT_SECS}s for edge health at ${EDGE_BASE}/health/live and /health/ready"
deadline=$((SECONDS + WAIT_SECS))
live_ok=0
ready_ok=0
while (( SECONDS < deadline )); do
  live_code="$(curl -sS -o /tmp/bettermta-alpha-live.body -w '%{http_code}' --max-time 5 "${EDGE_BASE}/health/live" 2>/dev/null || true)"
  ready_code="$(curl -sS -o /tmp/bettermta-alpha-ready.body -w '%{http_code}' --max-time 8 "${EDGE_BASE}/health/ready" 2>/dev/null || true)"
  if [[ "$live_code" == "200" ]]; then live_ok=1; fi
  if [[ "$ready_code" == "200" ]]; then ready_ok=1; fi
  if [[ "$live_ok" -eq 1 && "$ready_ok" -eq 1 ]]; then
    log "edge live+ready OK"
    break
  fi
  sleep 5
done

if [[ "$live_ok" -ne 1 ]]; then
  docker-compose "${COMPOSE_FILES[@]}" ps || true
  die "edge /health/live not 200 within ${WAIT_SECS}s (last=${live_code:-000})"
fi
if [[ "$ready_ok" -ne 1 ]]; then
  docker-compose "${COMPOSE_FILES[@]}" ps || true
  if [[ -f /tmp/bettermta-alpha-ready.body ]]; then
    log "last /health/ready body: $(head -c 400 /tmp/bettermta-alpha-ready.body)"
  fi
  die "edge /health/ready not 200 within ${WAIT_SECS}s (last=${ready_code:-000}) — API readiness authority; web is not"
fi

log "running edge smoke"
EDGE_BASE="$EDGE_BASE" ALPHA_ROUTE_SMOKE="$ROUTE_SMOKE" \
  bash infra/alpha/scripts/smoke-edge.sh

log "alpha stack up; edge origin ${EDGE_BASE}"
log "stop with: ./infra/alpha/scripts/stop-alpha.sh"
