#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
manifest=""
execute=false

usage() {
  cat <<'EOF'
Usage: rollback-private-beta.sh --manifest PATH [--execute]

Validate and display a four-app immutable-image rollback plan. The default is
dry-run. --execute redeploys the recorded images in dependency order and then
requires public API/web health checks.

Execution requires BETTERMTA_API_BASE_URL and BETTERMTA_WEB_BASE_URL in the
operator environment. The script never prints those values.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --manifest)
      [ "$#" -ge 2 ] || { echo "--manifest requires a path" >&2; exit 2; }
      manifest="$2"
      shift
      ;;
    --execute) execute=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }
[ -n "$manifest" ] || { echo "--manifest is required" >&2; exit 2; }
[ -f "$manifest" ] || { echo "Rollback manifest not found" >&2; exit 1; }

jq -e '
  .schemaVersion == 1 and
  (.apps | length == 4) and
  ([.apps[].app] | sort == [
    "bettermta-api",
    "bettermta-data",
    "bettermta-otp",
    "bettermta-web"
  ])
' "$manifest" >/dev/null || {
  echo "Rollback manifest has an invalid app-set contract" >&2
  exit 1
}

apps=(bettermta-data bettermta-otp bettermta-api bettermta-web)
configs=(
  infra/fly/data.fly.toml
  infra/fly/otp.fly.toml
  infra/fly/api.fly.toml
  infra/fly/web.fly.toml
)

for index in "${!apps[@]}"; do
  app="${apps[$index]}"
  expected_config="${configs[$index]}"
  config="$(jq -r --arg app "$app" '.apps[] | select(.app == $app) | .config' "$manifest")"
  image="$(jq -r --arg app "$app" '.apps[] | select(.app == $app) | .image' "$manifest")"
  [ "$config" = "$expected_config" ] || {
    echo "Rollback manifest has an invalid config for ${app}" >&2
    exit 1
  }
  [ -f "${REPO_ROOT}/${config}" ] || {
    echo "Rollback config is missing for ${app}" >&2
    exit 1
  }
  case "$image" in
    "registry.fly.io/${app}:"*) ;;
    *) echo "Rollback manifest has an invalid image for ${app}" >&2; exit 1 ;;
  esac
done

if [ "$execute" = false ]; then
  echo "Fly rollback dry-run: manifest valid for four apps"
  echo "No external state changed. Re-run with --execute after owner approval."
  exit 0
fi

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
if command -v fly >/dev/null 2>&1; then
  FLY_BIN=fly
elif command -v flyctl >/dev/null 2>&1; then
  FLY_BIN=flyctl
else
  echo "flyctl is required" >&2
  exit 1
fi
"$FLY_BIN" auth whoami >/dev/null 2>&1 || { echo "flyctl is not authenticated" >&2; exit 1; }

api_url="${BETTERMTA_API_BASE_URL:-}"
web_url="${BETTERMTA_WEB_BASE_URL:-}"
"${REPO_ROOT}/infra/fly/scripts/validate-public-origin.sh" \
  BETTERMTA_API_BASE_URL "$api_url"
"${REPO_ROOT}/infra/fly/scripts/validate-public-origin.sh" \
  BETTERMTA_WEB_BASE_URL "$web_url"

trap 'echo "ROLLBACK FAILED: inspect Fly status; the four-app set may be mixed" >&2' ERR
for index in "${!apps[@]}"; do
  app="${apps[$index]}"
  config="${configs[$index]}"
  image="$(jq -r --arg app "$app" '.apps[] | select(.app == $app) | .image' "$manifest")"
  echo "Redeploying recorded image for ${app}"
  "$FLY_BIN" deploy \
    -a "$app" \
    -c "${REPO_ROOT}/${config}" \
    --image "$image" \
    --ha=false \
    --strategy rolling \
    --yes
done

for app in "${apps[@]}"; do
  "$FLY_BIN" status -a "$app" --json |
    jq -e '.Machines | length == 1 and all(.state == "started")' >/dev/null
done

probe_public_health() {
  local label="$1"
  local url="$2"
  if ! curl -fs -o /dev/null "$url" >/dev/null 2>&1; then
    echo "ROLLBACK FAILED: ${label} failed" >&2
    exit 1
  fi
}
probe_public_health "API liveness check" "${api_url%/}/health/live"
probe_public_health "API readiness check" "${api_url%/}/health/ready"
probe_public_health "API status check" "${api_url%/}/v1/status"
probe_public_health "web health check" "${web_url%/}/"
trap - ERR
echo "Fly rollback: PASS (four recorded images healthy)"
