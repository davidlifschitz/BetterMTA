#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_ONLY=false
REQUIRE_PUBLIC_HEALTH=false
REQUIRE_ROLLBACK_TARGET=false
INITIAL_ACTIVATION=false

usage() {
  cat <<'EOF'
Usage: preflight-private-beta.sh [options]

Read-only validation for BetterMTA's prepared Fly private-beta stack.

Options:
  --local-only               Validate checked-in artifacts without Fly access
  --require-public-health    Require BETTERMTA_API_BASE_URL and
                             BETTERMTA_WEB_BASE_URL, then probe both
  --require-rollback-target  Require at least one current image-bearing Fly
                             release for every app
  --initial-activation       Require all four apps to have zero Machines and
                             zero image-bearing releases; still verify secrets
                             and required volumes
  -h, --help                 Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --local-only) LOCAL_ONLY=true ;;
    --require-public-health) REQUIRE_PUBLIC_HEALTH=true ;;
    --require-rollback-target) REQUIRE_ROLLBACK_TARGET=true ;;
    --initial-activation) INITIAL_ACTIVATION=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [ "$INITIAL_ACTIVATION" = true ] && {
  [ "$REQUIRE_PUBLIC_HEALTH" = true ] ||
  [ "$REQUIRE_ROLLBACK_TARGET" = true ];
}; then
  echo "--initial-activation cannot require public health or a rollback target" >&2
  exit 2
fi

need_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "BLOCKED: required command is unavailable: $1" >&2
    exit 1
  }
}

resolve_fly_bin() {
  if command -v fly >/dev/null 2>&1; then
    echo fly
  elif command -v flyctl >/dev/null 2>&1; then
    echo flyctl
  else
    echo "BLOCKED: flyctl is unavailable" >&2
    exit 1
  fi
}

pass() {
  echo "PASS: $*"
}

need_command python3
python3 -c 'import tomllib' >/dev/null 2>&1 || {
  echo "BLOCKED: Python 3.11+ with tomllib is required" >&2
  exit 1
}
python3 - "$REPO_ROOT" <<'PY'
import json
import pathlib
import sys
import tomllib

root = pathlib.Path(sys.argv[1])
expected = {
    "api.fly.toml": "bettermta-api",
    "data.fly.toml": "bettermta-data",
    "otp.fly.toml": "bettermta-otp",
    "web.fly.toml": "bettermta-web",
}
configs = {}
for filename, app in expected.items():
    path = root / "infra" / "fly" / filename
    if not path.is_file():
        raise SystemExit(f"Missing required Fly config: {path}")
    parsed = tomllib.loads(path.read_text(encoding="utf-8"))
    if parsed.get("app") != app:
        raise SystemExit(f"Fly app mismatch in {filename}")
    configs[filename] = parsed

api_env = configs["api.fly.toml"].get("env", {})
if api_env.get("BETTERMTA_DATA_INTERNAL_URL") != "http://bettermta-data.internal:8081":
    raise SystemExit("api.fly.toml must pin the Fly-private data URL")
if api_env.get("BETTERMTA_OTP_URL") != "http://bettermta-otp.internal:8080":
    raise SystemExit("api.fly.toml must pin the Fly-private OTP URL")

web_args = configs["web.fly.toml"].get("build", {}).get("args", {})
if web_args.get("NEXT_PUBLIC_FLAG_ADDRESS_POI") != "false":
    raise SystemExit("Fly web address/POI flag must remain explicitly false")

flag_path = root / "infra" / "flags" / "flags.json"
flags = json.loads(flag_path.read_text(encoding="utf-8"))
address_default = flags.get("flags", {}).get("address_poi_enabled", {}).get("default")
if address_default is not False:
    raise SystemExit("API address/POI flag default must remain explicitly false")
PY
pass "checked-in Fly configs are complete and internally wired"

for required in \
  apps/api/Dockerfile \
  apps/web/Dockerfile \
  services/data/Dockerfile \
  services/otp/Dockerfile \
  infra/flags/flags.json
do
  [ -f "${REPO_ROOT}/${required}" ] || {
    echo "Missing required artifact: ${required}" >&2
    exit 1
  }
done
pass "required images and feature-flag defaults are present"

if [ "$LOCAL_ONLY" = true ]; then
  echo "Fly private-beta preflight: LOCAL PASS (no external state inspected)"
  exit 0
fi

need_command jq
need_command curl
FLY_BIN="$(resolve_fly_bin)"
"$FLY_BIN" auth whoami >/dev/null 2>&1 || {
  echo "BLOCKED: flyctl is not authenticated" >&2
  exit 1
}
pass "flyctl is installed and authenticated"

apps=(bettermta-data bettermta-otp bettermta-api bettermta-web)
for app in "${apps[@]}"; do
  machines="$("$FLY_BIN" machines list -a "$app" --json)"
  if [ "$INITIAL_ACTIVATION" = true ]; then
    jq -e 'length == 0' <<<"$machines" >/dev/null || {
      echo "BLOCKED: ${app} already has Machines; this is not an initial activation" >&2
      exit 1
    }
    pass "${app} exists with no Machines"
  else
    "$FLY_BIN" status -a "$app" --json >/dev/null
    jq -e 'length == 1 and all(.state == "started")' <<<"$machines" >/dev/null || {
      echo "BLOCKED: ${app} must have exactly one started Machine" >&2
      exit 1
    }
    pass "${app} exists with exactly one started Machine"
  fi
done

require_secret_names() {
  local app="$1"
  shift
  local listed
  listed="$("$FLY_BIN" secrets list -a "$app" --json)"
  local name
  for name in "$@"; do
    jq -e --arg name "$name" \
      'any(.[]; ((.Name // .name // "") == $name))' \
      <<<"$listed" >/dev/null || {
        echo "BLOCKED: ${app} is missing required secret ${name}" >&2
        exit 1
      }
  done
  pass "${app} has all required secret names"
}

require_secret_names bettermta-api \
  BETTERMTA_DATA_INTERNAL_TOKEN \
  BETTERMTA_METRICS_TOKEN \
  BETTERMTA_PLACE_REF_KEY
require_secret_names bettermta-data BETTERMTA_INTERNAL_TOKEN
require_secret_names bettermta-otp BETTERMTA_INTERNAL_TOKEN

require_volume() {
  local app="$1"
  local volume="$2"
  "$FLY_BIN" volumes list -a "$app" --json |
    jq -e --arg volume "$volume" \
      'any(.[]; ((.name // .Name // "") == $volume))' >/dev/null || {
        echo "BLOCKED: ${app} is missing required volume ${volume}" >&2
        exit 1
      }
  pass "${app} has required volume ${volume}"
}

require_volume bettermta-data bettermta_data
require_volume bettermta-otp bettermta_otp_graphs

if [ "$INITIAL_ACTIVATION" = true ]; then
  for app in "${apps[@]}"; do
    releases="$("$FLY_BIN" releases --image -a "$app" --json)"
    jq -e '
      [.[] | (.ImageRef // .image_ref // .Image // .image // empty)] |
      length == 0
    ' <<<"$releases" >/dev/null || {
      echo "BLOCKED: ${app} already has an image-bearing release; this is not an initial activation" >&2
      exit 1
    }
    pass "${app} has no image-bearing release"
  done
elif [ "$REQUIRE_ROLLBACK_TARGET" = true ]; then
  for app in "${apps[@]}"; do
    releases="$("$FLY_BIN" releases --image -a "$app" --json)"
    jq -e '
      [.[] | (.ImageRef // .image_ref // .Image // .image // empty)] |
      length >= 1 and all(length > 0)
    ' <<<"$releases" >/dev/null || {
      echo "BLOCKED: ${app} lacks a current image-bearing rollback target" >&2
      exit 1
    }
    pass "${app} has a retained image rollback target"
  done
fi

api_url="${BETTERMTA_API_BASE_URL:-}"
web_url="${BETTERMTA_WEB_BASE_URL:-}"
if [ "$REQUIRE_PUBLIC_HEALTH" = true ] || [ -n "$api_url" ] || [ -n "$web_url" ]; then
  "${REPO_ROOT}/infra/fly/scripts/validate-public-origin.sh" \
    BETTERMTA_API_BASE_URL "$api_url"
  "${REPO_ROOT}/infra/fly/scripts/validate-public-origin.sh" \
    BETTERMTA_WEB_BASE_URL "$web_url"
  probe_public_health() {
    local label="$1"
    local url="$2"
    if ! curl -fs -o /dev/null "$url" >/dev/null 2>&1; then
      echo "BLOCKED: ${label} failed" >&2
      exit 1
    fi
  }
  probe_public_health "API liveness check" "${api_url%/}/health/live"
  probe_public_health "API readiness check" "${api_url%/}/health/ready"
  probe_public_health "API status check" "${api_url%/}/v1/status"
  probe_public_health "web health check" "${web_url%/}/"
  pass "public API and web health checks passed"
fi

echo "Fly private-beta preflight: PASS"
