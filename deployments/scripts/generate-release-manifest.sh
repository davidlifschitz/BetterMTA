#!/usr/bin/env bash
# Phase 12A.8 — generate an immutable release manifest (JSON) from repo + dataset pins.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

OUT=""
RELEASE_ID=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: generate-release-manifest.sh [--release-id ID] [--out PATH] [--dry-run]

Writes deployments/manifests/<release-id>.json with:
  bettermtaCommitSha, otpVersion, staticDatasetVersion, otpGraphVersion,
  buildTimestamp, releaseId, image tags.

Discover static/graph versions from services/*/var/.../active.json when present;
otherwise placeholder-* fields.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release-id) RELEASE_ID="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

cd_root
require_cmd git
require_cmd python3
mkdir -p "$MANIFEST_DIR"

RELEASE_ID="${RELEASE_ID:-$(make_release_id)}"
COMMIT_SHA="$(git_commit_sha)"
OTP_VER="$(discover_otp_version)"
STATIC_VER="$(discover_static_version)"
GRAPH_VER="$(discover_otp_graph_version)"
BUILT_AT="$(utc_now)"
OUT="${OUT:-${MANIFEST_DIR}/${RELEASE_ID}.json}"

export_image_env_from_tag "$RELEASE_ID"

DOC="$(python3 - <<PY
import json
doc = {
  "releaseId": "${RELEASE_ID}",
  "bettermtaCommitSha": "${COMMIT_SHA}",
  "otpVersion": "${OTP_VER}",
  "staticDatasetVersion": "${STATIC_VER}",
  "otpGraphVersion": "${GRAPH_VER}",
  "buildTimestamp": "${BUILT_AT}",
  "images": {
    "data": "${BETTERMTA_IMAGE_DATA}",
    "otp": "${BETTERMTA_IMAGE_OTP}",
    "api": "${BETTERMTA_IMAGE_API}",
    "web": "${BETTERMTA_IMAGE_WEB}",
  },
  "composeFiles": [
    "docker-compose.yml",
    "docker-compose.alpha.yml",
    "docker-compose.release.yml",
  ],
  "notes": "Immutable release identifier for controlled-alpha compose. Rollback uses previous image tags, not source re-edit.",
}
print(json.dumps(doc, indent=2, sort_keys=True))
PY
)"

printf '%s\n' "$DOC"
if [[ "$DRY_RUN" == "1" ]]; then
  log "dry-run: did not write ${OUT}"
  exit 0
fi
printf '%s\n' "$DOC" >"$OUT"
log "wrote ${OUT}"
log "releaseId=${RELEASE_ID} static=${STATIC_VER} graph=${GRAPH_VER} otp=${OTP_VER}"
