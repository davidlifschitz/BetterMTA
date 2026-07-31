#!/usr/bin/env bash
# Phase 12A.4 — graceful alpha Compose shutdown WITHOUT deleting volumes.
# Idempotent: safe when the stack is already down.
#
# When deployments/current.env exists, includes docker-compose.release.yml and
# sources image pins (same pattern as deployments/scripts/common.sh) so tear-down
# matches the release-pinned bring-up. Never passes -v / --volumes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

CURRENT_ENV="${ROOT}/deployments/current.env"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.alpha.yml)

log() { printf '[stop-alpha] %s\n' "$*"; }
die() { printf '[stop-alpha] ERROR: %s\n' "$*" >&2; exit 1; }

# Mirror deployments/scripts/common.sh load_env_file (set -a / source / set +a).
load_current_env() {
  local file="$1"
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

command -v docker >/dev/null 2>&1 || die "'docker' not found on PATH"
docker info >/dev/null 2>&1 || die "Docker daemon not reachable"
command -v docker-compose >/dev/null 2>&1 || die "'docker-compose' not found on PATH"

[[ -f docker-compose.yml ]] || die "missing docker-compose.yml"
[[ -f docker-compose.alpha.yml ]] || die "missing docker-compose.alpha.yml"

if [[ -f "$CURRENT_ENV" && -r "$CURRENT_ENV" ]]; then
  [[ -f docker-compose.release.yml ]] || die "missing docker-compose.release.yml (required when deployments/current.env exists)"
  COMPOSE_FILES+=(-f docker-compose.release.yml)
  load_current_env "$CURRENT_ENV"
  log "release pins: using deployments/current.env + docker-compose.release.yml (RELEASE_ID=${RELEASE_ID:-unknown})"
else
  log "NOTE: no readable deployments/current.env — alpha compose only (:local image defaults)"
fi

log "stopping alpha stack (${COMPOSE_FILES[*]}; volumes preserved — no -v)"
# Explicitly omit -v / --volumes so persistent data + OTP graph mounts stay.
docker-compose "${COMPOSE_FILES[@]}" down --remove-orphans

log "alpha stack stopped (bind mounts / named volumes untouched)"
