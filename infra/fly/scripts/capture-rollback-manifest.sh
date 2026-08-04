#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
output=""

usage() {
  cat <<'EOF'
Usage: capture-rollback-manifest.sh --output PATH

Read the currently running image for each BetterMTA Fly app and write one
compatible rollback-set manifest. This command does not mutate Fly state.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --output)
      [ "$#" -ge 2 ] || { echo "--output requires a path" >&2; exit 2; }
      output="$2"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

[ -n "$output" ] || { echo "--output is required" >&2; exit 2; }
[ ! -e "$output" ] || { echo "Refusing to overwrite existing manifest" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }
if command -v fly >/dev/null 2>&1; then
  FLY_BIN=fly
elif command -v flyctl >/dev/null 2>&1; then
  FLY_BIN=flyctl
else
  echo "flyctl is required" >&2
  exit 1
fi
"$FLY_BIN" auth whoami >/dev/null 2>&1 || { echo "flyctl is not authenticated" >&2; exit 1; }

captured_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
source_commit="$(git -C "$REPO_ROOT" rev-parse HEAD)"
manifest="$(jq -n \
  --arg capturedAt "$captured_at" \
  --arg sourceCommit "$source_commit" \
  '{schemaVersion: 1, capturedAt: $capturedAt, sourceCommit: $sourceCommit, apps: []}')"

apps=(bettermta-data bettermta-otp bettermta-api bettermta-web)
configs=(
  infra/fly/data.fly.toml
  infra/fly/otp.fly.toml
  infra/fly/api.fly.toml
  infra/fly/web.fly.toml
)

for index in "${!apps[@]}"; do
  app="${apps[$index]}"
  config="${configs[$index]}"
  status_json="$("$FLY_BIN" status -a "$app" --json)"
  images="$(
    jq -r '.Machines[]?.config.image // empty' <<<"$status_json" | sort -u
  )"
  image_count="$(printf '%s\n' "$images" | awk 'NF { count++ } END { print count + 0 }')"
  if [ "$image_count" -ne 1 ] || [ -z "$images" ]; then
    echo "BLOCKED: ${app} does not have one unambiguous running image" >&2
    exit 1
  fi
  image="$images"
  case "$image" in
    "registry.fly.io/${app}:"*) ;;
    *) echo "BLOCKED: ${app} image is not an app-scoped Fly registry ref" >&2; exit 1 ;;
  esac
  manifest="$(jq \
    --arg app "$app" \
    --arg config "$config" \
    --arg image "$image" \
    '.apps += [{app: $app, config: $config, image: $image}]' \
    <<<"$manifest")"
done

mkdir -p "$(dirname "$output")"
umask 077
printf '%s\n' "$manifest" > "$output"
echo "Rollback manifest captured: ${output}"
