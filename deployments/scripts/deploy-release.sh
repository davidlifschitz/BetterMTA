#!/usr/bin/env bash
# Phase 12A.8 — deploy a new immutable release for controlled-alpha compose.
#
# On failure: exits non-zero WITHOUT deleting previous.env or volumes.
# Editing source + compose up is NOT a substitute for image-tag rollback.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

DRY_RUN=0
RETAG_ONLY=0
ALLOW_DIRTY=0
SKIP_SMOKE=0
SKIP_UP=0
SOURCE_TAG="${SOURCE_TAG:-local}"

usage() {
  cat <<'EOF'
Usage: deploy-release.sh [options]

Options:
  --dry-run       Validate, build/retag plan, write manifest + env pointers; do not compose up
  --retag-only    Tag existing images (default source :local) instead of compose build
  --allow-dirty   Quieter dirty-tree warning
  --skip-smoke    Skip post-deploy smoke
  --skip-up       Write release refs only (implies no compose up; use with --retag-only)
  --source-tag T  Source image tag to retag from (default: local)
  -h, --help      Show help

Steps:
  1) validate repo state
  2) build immutable images OR retag existing
  3) record release manifest
  4) preserve previous release (current.env → previous.env)
  5) start new release (unless dry-run / skip-up)
  6) wait for readiness
  7) local smoke (+ remote if Access env set)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --retag-only) RETAG_ONLY=1; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    --skip-smoke) SKIP_SMOKE=1; shift ;;
    --skip-up) SKIP_UP=1; shift ;;
    --source-tag) SOURCE_TAG="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

cd_root
require_cmd git
require_cmd docker
require_cmd docker-compose
require_cmd curl
require_cmd python3
docker info >/dev/null 2>&1 || die "Docker daemon not reachable"
require_repo_files
mkdir -p "$MANIFEST_DIR"

validate_repo_state "$ALLOW_DIRTY"

RELEASE_ID="$(make_release_id)"
COMMIT_SHA="$(git_commit_sha)"
OTP_VER="$(discover_otp_version)"
STATIC_VER="$(discover_static_version)"
GRAPH_VER="$(discover_otp_graph_version)"
BUILT_AT="$(utc_now)"

log "planned RELEASE_ID=${RELEASE_ID}"
log "pins: commit=${COMMIT_SHA} otp=${OTP_VER} static=${STATIC_VER} graph=${GRAPH_VER}"

if [[ "$RETAG_ONLY" != "1" ]]; then
  if ! check_disk_for_build; then
    if [[ "$DRY_RUN" == "1" ]]; then
      warn "BLOCKED-for-disk: dry-run continues, but a real build would be refused (<6Gi free)"
    else
      die "BLOCKED-for-disk: refuse full compose build with <6Gi free. Re-run with --retag-only (or free disk)."
    fi
  fi
fi

# --- build or retag ---
if [[ "$RETAG_ONLY" == "1" ]]; then
  log "retag-only: tagging bettermta-{data,otp,api,web}:${SOURCE_TAG} → :${RELEASE_ID}"
  for svc in data otp api web; do
    src="$(image_name "$svc" "$SOURCE_TAG")"
    dst="$(image_name "$svc" "$RELEASE_ID")"
    sha_tag="$(image_name "$svc" "sha-$(git_commit_short)")"
    docker image inspect "$src" >/dev/null 2>&1 || die "source image missing: $src (build once or pass --source-tag)"
    if [[ "$DRY_RUN" == "1" ]]; then
      log "dry-run: would docker tag ${src} ${dst} && tag ${sha_tag}"
    else
      docker tag "$src" "$dst"
      docker tag "$src" "$sha_tag"
      log "tagged ${dst} (+ ${sha_tag})"
    fi
  done
else
  export_image_env_from_tag "$RELEASE_ID"
  log "compose build with release image tags"
  if [[ "$DRY_RUN" == "1" ]]; then
    log "dry-run: would run compose build for ${RELEASE_ID}"
  else
    compose build
    # Also pin SHA tags from the just-built release tags.
    for svc in data otp api web; do
      docker tag "$(image_name "$svc" "$RELEASE_ID")" "$(image_name "$svc" "sha-$(git_commit_short)")"
    done
  fi
fi

# --- manifest ---
MANIFEST_PATH="${MANIFEST_DIR}/${RELEASE_ID}.json"
if [[ "$DRY_RUN" == "1" ]]; then
  bash "${SCRIPT_DIR}/generate-release-manifest.sh" --release-id "$RELEASE_ID" --out "$MANIFEST_PATH" --dry-run >/dev/null
  log "dry-run: manifest preview generated (not written)"
else
  bash "${SCRIPT_DIR}/generate-release-manifest.sh" --release-id "$RELEASE_ID" --out "$MANIFEST_PATH" >/dev/null
fi

# --- preserve previous ---
if [[ -f "$CURRENT_ENV" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    log "dry-run: would copy ${CURRENT_ENV} → ${PREVIOUS_ENV}"
  else
    cp "$CURRENT_ENV" "$PREVIOUS_ENV"
    log "preserved previous release → ${PREVIOUS_ENV}"
  fi
else
  log "no current.env yet — previous.env not updated"
fi

# --- write current ---
if [[ "$DRY_RUN" == "1" ]]; then
  log "dry-run: would write ${CURRENT_ENV} for ${RELEASE_ID}"
  write_env_file "/tmp/bettermta-current.env.dryrun" "$RELEASE_ID" "$COMMIT_SHA" "$OTP_VER" "$STATIC_VER" "$GRAPH_VER" "$BUILT_AT"
  log "dry-run env preview: /tmp/bettermta-current.env.dryrun"
else
  write_env_file "$CURRENT_ENV" "$RELEASE_ID" "$COMMIT_SHA" "$OTP_VER" "$STATIC_VER" "$GRAPH_VER" "$BUILT_AT"
  log "wrote ${CURRENT_ENV}"
fi

if [[ "$DRY_RUN" == "1" || "$SKIP_UP" == "1" ]]; then
  log "stopping before compose up (dry-run=${DRY_RUN} skip-up=${SKIP_UP})"
  log "next: source deployments/current.env and compose up -d --no-build"
  exit 0
fi

# --- start release (never delete volumes) ---
load_env_file "$CURRENT_ENV"
log "starting release ${RELEASE_ID} (volumes preserved; no docker compose down -v)"
# Prefer recreate with pinned images; do not prune.
compose up -d --no-build --remove-orphans

wait_for_edge_ready

if [[ "$SKIP_SMOKE" != "1" ]]; then
  bash "${SCRIPT_DIR}/smoke-post-deploy.sh" || {
    warn "smoke FAILED — previous.env left intact for rollback; volumes not deleted"
    exit 1
  }
fi

log "deploy OK release=${RELEASE_ID}"
log "rollback: ./deployments/scripts/rollback-release.sh"
