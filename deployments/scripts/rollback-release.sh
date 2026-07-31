#!/usr/bin/env bash
# Phase 12A.8 — roll back controlled-alpha compose to previous immutable release.
#
# Restores previous image tags from deployments/previous.env and restarts the
# stack WITHOUT deleting persistent volumes. Source re-edit is not a rollback.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

DRY_RUN=0
SKIP_SMOKE=0
SKIP_UP=0

usage() {
  cat <<'EOF'
Usage: rollback-release.sh [options]

Options:
  --dry-run     Show previous→current switch; do not rewrite env or compose up
  --skip-smoke  Skip post-rollback smoke
  --skip-up     Update env pointers only (no compose up)
  -h, --help    Show help

Steps:
  1) select previous release (deployments/previous.env)
  2) restore previous image references into current.env
  3) restart stack without deleting persistent state
  4) wait for readiness
  5) local (+ remote if configured) smoke
  6) record rollback result under deployments/manifests/
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --skip-smoke) SKIP_SMOKE=1; shift ;;
    --skip-up) SKIP_UP=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

cd_root
require_cmd docker
require_cmd docker-compose
require_cmd curl
require_cmd python3
docker info >/dev/null 2>&1 || die "Docker daemon not reachable"
require_repo_files
mkdir -p "$MANIFEST_DIR"

[[ -f "$PREVIOUS_ENV" ]] || die "missing ${PREVIOUS_ENV} — no previous release to restore"

# Capture failed/current before overwrite (for forensics; not used for auto re-rollforward).
FAILED_ID="none"
if [[ -f "$CURRENT_ENV" ]]; then
  # shellcheck disable=SC1090
  FAILED_ID="$(grep -E '^RELEASE_ID=' "$CURRENT_ENV" | head -1 | cut -d= -f2- || echo none)"
fi

# shellcheck disable=SC1090
source "$PREVIOUS_ENV"
PREV_ID="${RELEASE_ID:-}"
[[ -n "$PREV_ID" ]] || die "previous.env missing RELEASE_ID"

for img in "${BETTERMTA_IMAGE_DATA:-}" "${BETTERMTA_IMAGE_OTP:-}" "${BETTERMTA_IMAGE_API:-}" "${BETTERMTA_IMAGE_WEB:-}"; do
  [[ -n "$img" ]] || die "previous.env incomplete (image vars missing)"
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    die "previous image missing locally: $img — cannot roll back (rebuild blocked or image pruned)"
  fi
done

log "selected previous release: ${PREV_ID}"
log "images: data=${BETTERMTA_IMAGE_DATA} api=${BETTERMTA_IMAGE_API} web=${BETTERMTA_IMAGE_WEB} otp=${BETTERMTA_IMAGE_OTP}"

RESULT_PATH="${MANIFEST_DIR}/rollback-$(utc_stamp).json"
record_result() {
  local status="$1"
  local detail="$2"
  BETTERMTA_RB_STATUS="$status" \
  BETTERMTA_RB_DETAIL="$detail" \
  BETTERMTA_RB_FROM="$FAILED_ID" \
  BETTERMTA_RB_TO="$PREV_ID" \
  BETTERMTA_RB_AT="$(utc_now)" \
  BETTERMTA_RB_DATA="$BETTERMTA_IMAGE_DATA" \
  BETTERMTA_RB_OTP="$BETTERMTA_IMAGE_OTP" \
  BETTERMTA_RB_API="$BETTERMTA_IMAGE_API" \
  BETTERMTA_RB_WEB="$BETTERMTA_IMAGE_WEB" \
  python3 - "$RESULT_PATH" <<'PY'
import json, os, sys
path = sys.argv[1]
doc = {
  "action": "rollback",
  "status": os.environ["BETTERMTA_RB_STATUS"],
  "detail": os.environ["BETTERMTA_RB_DETAIL"],
  "fromReleaseId": os.environ["BETTERMTA_RB_FROM"],
  "toReleaseId": os.environ["BETTERMTA_RB_TO"],
  "recordedAt": os.environ["BETTERMTA_RB_AT"],
  "images": {
    "data": os.environ["BETTERMTA_RB_DATA"],
    "otp": os.environ["BETTERMTA_RB_OTP"],
    "api": os.environ["BETTERMTA_RB_API"],
    "web": os.environ["BETTERMTA_RB_WEB"],
  },
  "volumesDeleted": False,
  "notes": "Rollback switches immutable image tags via docker-compose.release.yml; bind mounts / volumes preserved.",
}
open(path, "w", encoding="utf-8").write(json.dumps(doc, indent=2, sort_keys=True) + "\n")
print(path)
PY
}

if [[ "$DRY_RUN" == "1" ]]; then
  log "dry-run: would promote previous.env → current.env (from=${FAILED_ID} to=${PREV_ID})"
  log "dry-run: would compose up -d --no-build with previous image tags"
  record_result "dry_run" "no stack changes" >/dev/null || true
  log "wrote dry-run result ${RESULT_PATH}"
  exit 0
fi

# Save failing current aside, then restore previous as current.
if [[ -f "$CURRENT_ENV" ]]; then
  cp "$CURRENT_ENV" "${DEPLOYMENTS_DIR}/failed-${FAILED_ID}.env" 2>/dev/null \
    || cp "$CURRENT_ENV" "${DEPLOYMENTS_DIR}/failed-last.env"
  log "saved failing current → deployments/failed-*.env"
fi
cp "$PREVIOUS_ENV" "$CURRENT_ENV"
log "restored current.env from previous.env (${PREV_ID})"

if [[ "$SKIP_UP" == "1" ]]; then
  record_result "env_only" "env pointers updated; compose up skipped"
  log "skip-up: env restored; run compose up manually"
  exit 0
fi

load_env_file "$CURRENT_ENV"
log "restarting stack on previous images (no volume delete)"
# Explicitly avoid `down -v`. Recreate containers from pinned tags.
compose up -d --no-build --remove-orphans --force-recreate

wait_for_edge_ready

SMOKE_STATUS="skipped"
if [[ "$SKIP_SMOKE" != "1" ]]; then
  if bash "${SCRIPT_DIR}/smoke-post-deploy.sh"; then
    SMOKE_STATUS="pass"
  else
    SMOKE_STATUS="fail"
    record_result "smoke_failed" "stack on previous images but smoke failed"
    die "rollback smoke FAILED — stack left on previous images; volumes intact"
  fi
fi

record_result "ok" "rolled back; smoke=${SMOKE_STATUS}"
log "rollback OK to ${PREV_ID} (result ${RESULT_PATH})"
