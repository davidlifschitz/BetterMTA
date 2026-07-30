#!/usr/bin/env bash
# Phase 12A.8 — post-deploy / post-rollback smoke.
# Always runs local edge smoke; runs authenticated remote smoke when configured.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

cd_root
require_cmd curl

ROUTE_SMOKE="${ALPHA_ROUTE_SMOKE:-1}"
LOCAL_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-only) LOCAL_ONLY=1; shift ;;
    -h|--help)
      echo "Usage: smoke-post-deploy.sh [--local-only]"
      exit 0
      ;;
    *) die "unknown arg: $1" ;;
  esac
done

log "local edge smoke (infra/alpha/scripts/smoke-edge.sh)"
EDGE_BASE="$EDGE_BASE" ALPHA_ROUTE_SMOKE="$ROUTE_SMOKE" \
  bash "$ROOT/infra/alpha/scripts/smoke-edge.sh"

if [[ "$LOCAL_ONLY" == "1" ]]; then
  log "remote smoke skipped (--local-only)"
  exit 0
fi

PUBLIC_BASE="${ALPHA_PUBLIC_BASE_URL:-}"
CLIENT_ID="${CF_ACCESS_CLIENT_ID:-}"
CLIENT_SECRET="${CF_ACCESS_CLIENT_SECRET:-}"

if [[ -z "$PUBLIC_BASE" || -z "$CLIENT_ID" || -z "$CLIENT_SECRET" ]]; then
  log "remote Access smoke SKIPPED — set ALPHA_PUBLIC_BASE_URL + CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET to enable"
  exit 0
fi

log "remote Access smoke against ${PUBLIC_BASE}"
live_code="$(
  curl -sS -o /tmp/bettermta-remote-live.body -w '%{http_code}' --max-time 20 \
    -H "CF-Access-Client-Id: ${CLIENT_ID}" \
    -H "CF-Access-Client-Secret: ${CLIENT_SECRET}" \
    "${PUBLIC_BASE%/}/health/live" || true
)"
ready_code="$(
  curl -sS -o /tmp/bettermta-remote-ready.body -w '%{http_code}' --max-time 25 \
    -H "CF-Access-Client-Id: ${CLIENT_ID}" \
    -H "CF-Access-Client-Secret: ${CLIENT_SECRET}" \
    "${PUBLIC_BASE%/}/health/ready" || true
)"

# Never print token values.
if [[ "$live_code" != "200" ]]; then
  die "remote /health/live → ${live_code:-000} (expected 200 via Access service token)"
fi
if [[ "$ready_code" != "200" ]]; then
  die "remote /health/ready → ${ready_code:-000} (expected 200 via Access service token)"
fi
log "remote Access smoke PASS (live+ready 200)"
