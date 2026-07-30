# Shared helpers for Phase 12A.8 release/rollback scripts.
# shellcheck shell=bash

DEPLOYMENTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$DEPLOYMENTS_DIR/.." && pwd)"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.alpha.yml -f docker-compose.release.yml)

CURRENT_ENV="${DEPLOYMENTS_DIR}/current.env"
PREVIOUS_ENV="${DEPLOYMENTS_DIR}/previous.env"
MANIFEST_DIR="${DEPLOYMENTS_DIR}/manifests"

OTP_VERSION_PIN="2.9.0"
EDGE_BASE="${EDGE_BASE:-http://127.0.0.1:8088}"
WAIT_SECS="${ALPHA_WAIT_SECS:-420}"

die() { printf '[release] ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '[release] %s\n' "$*"; }
warn() { printf '[release] WARN: %s\n' "$*" >&2; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH"
}

require_repo_files() {
  [[ -f "$ROOT/docker-compose.yml" ]] || die "missing docker-compose.yml"
  [[ -f "$ROOT/docker-compose.alpha.yml" ]] || die "missing docker-compose.alpha.yml"
  [[ -f "$ROOT/docker-compose.release.yml" ]] || die "missing docker-compose.release.yml"
  [[ -f "$ROOT/infra/alpha/Caddyfile" ]] || die "missing infra/alpha/Caddyfile"
}

cd_root() {
  cd "$ROOT"
}

compose() {
  docker-compose "${COMPOSE_FILES[@]}" "$@"
}

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || die "env file missing: $file"
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

git_commit_sha() {
  git -C "$ROOT" rev-parse HEAD
}

git_commit_short() {
  git -C "$ROOT" rev-parse --short=12 HEAD
}

git_branch() {
  git -C "$ROOT" rev-parse --abbrev-ref HEAD
}

git_is_dirty() {
  ! git -C "$ROOT" diff --quiet || ! git -C "$ROOT" diff --cached --quiet || [[ -n "$(git -C "$ROOT" ls-files --others --exclude-standard)" ]]
}

validate_repo_state() {
  local allow_dirty="${1:-0}"
  local branch
  branch="$(git_branch)"
  log "git branch: ${branch}"
  log "git HEAD: $(git_commit_sha)"

  if [[ "$branch" != "agent/integration-live" && "$branch" != *"alpha"* && "$branch" != *"integration-live"* ]]; then
    warn "expected alpha/integration-live branch; on '${branch}'"
  else
    log "branch looks like alpha/integration-live worktree"
  fi

  if git_is_dirty; then
    if [[ "$allow_dirty" == "1" ]]; then
      warn "working tree is dirty (--allow-dirty); release will still pin current HEAD SHA"
    else
      warn "working tree is dirty — continuing with HEAD SHA pin (pass --allow-dirty to silence)"
    fi
  else
    log "working tree clean"
  fi
}

discover_static_version() {
  local active="$ROOT/services/data/var/data/static/active.json"
  if [[ -f "$active" ]]; then
    python3 - "$active" <<'PY'
import json, sys
print(json.load(open(sys.argv[1])).get("versionId") or "unknown")
PY
    return
  fi
  # Fallback: probe running data container if present
  local cid
  cid="$(docker ps --filter name=bettermta-data --format '{{.ID}}' 2>/dev/null | head -1 || true)"
  if [[ -n "$cid" ]]; then
    local body
    body="$(docker exec "$cid" curl -fsS -H 'Authorization: Bearer dev-local-token' http://127.0.0.1:8081/internal/health 2>/dev/null || true)"
    if [[ -n "$body" ]]; then
      python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(d.get("staticVersionId") or d.get("versionId") or "placeholder-static-unknown")' "$body" 2>/dev/null && return
    fi
  fi
  echo "placeholder-static-unknown"
}

discover_otp_graph_version() {
  local active="$ROOT/services/otp/var/otp/graphs/active.json"
  if [[ -f "$active" ]]; then
    python3 - "$active" <<'PY'
import json, sys
print(json.load(open(sys.argv[1])).get("graphVersion") or "unknown")
PY
    return
  fi
  echo "placeholder-graph-unknown"
}

discover_otp_version() {
  local manifest
  local graph
  graph="$(discover_otp_graph_version)"
  manifest="$ROOT/services/otp/var/otp/graphs/${graph}/manifest.json"
  if [[ -f "$manifest" ]]; then
    python3 - "$manifest" <<'PY'
import json, sys
print(json.load(open(sys.argv[1])).get("otpVersion") or "2.9.0")
PY
    return
  fi
  echo "$OTP_VERSION_PIN"
}

utc_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

utc_stamp() {
  date -u +"%Y%m%dT%H%M%SZ"
}

make_release_id() {
  local short
  short="$(git_commit_short)"
  printf 'rel-%s-%s' "$(utc_stamp)" "$short"
}

image_name() {
  local service="$1"
  local tag="$2"
  printf 'bettermta-%s:%s' "$service" "$tag"
}

export_image_env_from_tag() {
  local tag="$1"
  export BETTERMTA_IMAGE_DATA
  export BETTERMTA_IMAGE_OTP
  export BETTERMTA_IMAGE_API
  export BETTERMTA_IMAGE_WEB
  BETTERMTA_IMAGE_DATA="$(image_name data "$tag")"
  BETTERMTA_IMAGE_OTP="$(image_name otp "$tag")"
  BETTERMTA_IMAGE_API="$(image_name api "$tag")"
  BETTERMTA_IMAGE_WEB="$(image_name web "$tag")"
}

write_env_file() {
  local out="$1"
  local release_id="$2"
  local commit_sha="$3"
  local otp_ver="$4"
  local static_ver="$5"
  local graph_ver="$6"
  local built_at="$7"
  cat >"$out" <<EOF
# BetterMTA controlled-alpha release pointer — DO NOT COMMIT
# Generated: ${built_at}
RELEASE_ID=${release_id}
BETTERMTA_COMMIT_SHA=${commit_sha}
OTP_VERSION=${otp_ver}
STATIC_DATASET_VERSION=${static_ver}
OTP_GRAPH_VERSION=${graph_ver}
BUILD_TIMESTAMP=${built_at}
BETTERMTA_IMAGE_DATA=$(image_name data "$release_id")
BETTERMTA_IMAGE_OTP=$(image_name otp "$release_id")
BETTERMTA_IMAGE_API=$(image_name api "$release_id")
BETTERMTA_IMAGE_WEB=$(image_name web "$release_id")
EOF
}

wait_for_edge_ready() {
  local deadline=$((SECONDS + WAIT_SECS))
  local live_ok=0 ready_ok=0 live_code="" ready_code=""
  log "waiting up to ${WAIT_SECS}s for ${EDGE_BASE}/health/live + /health/ready"
  while (( SECONDS < deadline )); do
    live_code="$(curl -sS -o /tmp/bettermta-release-live.body -w '%{http_code}' --max-time 5 "${EDGE_BASE}/health/live" 2>/dev/null || true)"
    ready_code="$(curl -sS -o /tmp/bettermta-release-ready.body -w '%{http_code}' --max-time 8 "${EDGE_BASE}/health/ready" 2>/dev/null || true)"
    [[ "$live_code" == "200" ]] && live_ok=1
    [[ "$ready_code" == "200" ]] && ready_ok=1
    if [[ "$live_ok" -eq 1 && "$ready_ok" -eq 1 ]]; then
      log "edge live+ready OK"
      return 0
    fi
    sleep 5
  done
  compose ps || true
  die "edge not ready within ${WAIT_SECS}s (live=${live_code:-000} ready=${ready_code:-000}); prior release env left intact"
}

disk_free_gi() {
  # Available GiB on Data volume (macOS APFS) or root.
  df -g /System/Volumes/Data 2>/dev/null | awk 'NR==2{print $4; exit}' \
    || df -g / 2>/dev/null | awk 'NR==2{print $4; exit}' \
    || echo "0"
}

check_disk_for_build() {
  local avail
  avail="$(disk_free_gi)"
  # Need several GiB for image rebuild layers; threshold conservative.
  if [[ "${avail:-0}" -lt 6 ]]; then
    warn "disk free ~${avail}Gi — full compose build is unsafe; prefer --retag-only or --dry-run"
    return 1
  fi
  return 0
}
