#!/usr/bin/env bash
# Phase 12A.4 — graceful alpha Compose shutdown WITHOUT deleting volumes.
# Idempotent: safe when the stack is already down.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.alpha.yml)

log() { printf '[stop-alpha] %s\n' "$*"; }
die() { printf '[stop-alpha] ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "'docker' not found on PATH"
docker info >/dev/null 2>&1 || die "Docker daemon not reachable"
command -v docker-compose >/dev/null 2>&1 || die "'docker-compose' not found on PATH"

[[ -f docker-compose.yml ]] || die "missing docker-compose.yml"
[[ -f docker-compose.alpha.yml ]] || die "missing docker-compose.alpha.yml"

log "stopping alpha stack (volumes preserved — no -v)"
# Explicitly omit -v / --volumes so persistent data + OTP graph mounts stay.
docker-compose "${COMPOSE_FILES[@]}" down --remove-orphans

log "alpha stack stopped (bind mounts / named volumes untouched)"
