#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${FLY_ROOT}/../.." && pwd)"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "${TEST_TMP}"' EXIT

export FLY_TEST_LOG="${TEST_TMP}/calls.log"
SYSTEM_PATH="$PATH"
export PATH="${SCRIPT_DIR}/fixtures:${PATH}"
export BETTERMTA_API_BASE_URL="https://api.example.invalid"
export BETTERMTA_WEB_BASE_URL="https://web.example.invalid"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

for script in \
  "${FLY_ROOT}/scripts/preflight-private-beta.sh" \
  "${FLY_ROOT}/scripts/capture-rollback-manifest.sh" \
  "${FLY_ROOT}/scripts/rollback-private-beta.sh" \
  "${FLY_ROOT}/scripts/validate-public-origin.sh"
do
  [ -x "$script" ] || fail "missing executable ${script}"
  bash -n "$script"
done

bad_origins=(
  "http://api.example.invalid"
  "https://LOCALHOST"
  "https://user@localhost"
  "https://[::1]"
  "https://api.example.invalid/path"
)
for bad_origin in "${bad_origins[@]}"; do
  if env \
    BETTERMTA_API_BASE_URL="$bad_origin" \
    BETTERMTA_WEB_BASE_URL="https://web.example.invalid" \
    "${FLY_ROOT}/scripts/preflight-private-beta.sh" \
    --require-public-health >/dev/null 2>&1; then
    fail "preflight accepted a non-public origin shape"
  fi
done

"${FLY_ROOT}/scripts/preflight-private-beta.sh" --local-only >/dev/null
"${FLY_ROOT}/scripts/preflight-private-beta.sh" \
  --require-public-health \
  --require-rollback-target >/dev/null
FLY_TEST_SINGLE_RELEASE=true \
  "${FLY_ROOT}/scripts/preflight-private-beta.sh" \
  --require-rollback-target >/dev/null

if "${FLY_ROOT}/scripts/preflight-private-beta.sh" \
  --initial-activation >/dev/null 2>&1; then
  fail "initial-activation preflight accepted an existing release set"
fi
FLY_TEST_INITIAL=true \
  "${FLY_ROOT}/scripts/preflight-private-beta.sh" \
  --initial-activation >/dev/null
if FLY_TEST_INITIAL=true \
  "${FLY_ROOT}/scripts/preflight-private-beta.sh" >/dev/null 2>&1; then
  fail "normal preflight accepted an app set with no started Machines"
fi

flyctl_only="${TEST_TMP}/flyctl-only"
mkdir -p "$flyctl_only"
cp "${SCRIPT_DIR}/fixtures/fly" "${flyctl_only}/flyctl"
cp "${SCRIPT_DIR}/fixtures/curl" "${flyctl_only}/curl"
chmod +x "${flyctl_only}/flyctl" "${flyctl_only}/curl"
PATH="${flyctl_only}:${SYSTEM_PATH}" \
  "${FLY_ROOT}/scripts/preflight-private-beta.sh" \
  --require-public-health \
  --require-rollback-target >/dev/null

if preflight_failure="$(
  FLY_TEST_CURL_FAIL=true \
    "${FLY_ROOT}/scripts/preflight-private-beta.sh" \
    --require-public-health 2>&1
)"; then
  fail "preflight accepted failed public health"
fi
if rg -q 'api[.]example[.]invalid|web[.]example[.]invalid' \
  <<<"$preflight_failure"; then
  fail "preflight failure output exposed protected hostnames"
fi

existing_manifest="${TEST_TMP}/existing.json"
printf '{}\n' > "$existing_manifest"
if "${FLY_ROOT}/scripts/capture-rollback-manifest.sh" \
  --output "$existing_manifest" >/dev/null 2>&1; then
  fail "capture overwrote an existing rollback manifest"
fi

manifest="${TEST_TMP}/rollback.json"
"${FLY_ROOT}/scripts/capture-rollback-manifest.sh" --output "$manifest" >/dev/null
manifest_mode="$(stat -f '%Lp' "$manifest" 2>/dev/null || stat -c '%a' "$manifest")"
[ "$manifest_mode" = 600 ] || fail "rollback manifest mode is not 0600"
jq -e '
  .schemaVersion == 1 and
  (.apps | length == 4) and
  ([.apps[].app] | sort == [
    "bettermta-api",
    "bettermta-data",
    "bettermta-otp",
    "bettermta-web"
  ]) and
  ([.apps[].image | test("^registry[.]fly[.]io/.+:rollback-base$")] | all)
' "$manifest" >/dev/null || fail "captured manifest contract mismatch"

: > "$FLY_TEST_LOG"
"${FLY_ROOT}/scripts/rollback-private-beta.sh" --manifest "$manifest" >/dev/null
[ ! -s "$FLY_TEST_LOG" ] || fail "dry run made external calls"

"${FLY_ROOT}/scripts/rollback-private-beta.sh" \
  --manifest "$manifest" \
  --execute >/dev/null

[ "$(grep -c '^fly deploy ' "$FLY_TEST_LOG")" -eq 4 ] ||
  fail "expected four image redeploys"
[ "$(grep -c -- '--image registry.fly.io/' "$FLY_TEST_LOG")" -eq 4 ] ||
  fail "every rollback must deploy an immutable image"
[ "$(grep -c -- '--ha=false' "$FLY_TEST_LOG")" -eq 4 ] ||
  fail "every rollback must preserve the one-Machine cap"
[ "$(grep -c -- '--strategy rolling' "$FLY_TEST_LOG")" -eq 4 ] ||
  fail "every rollback must select the rolling strategy"
[ "$(grep -c -- '--yes' "$FLY_TEST_LOG")" -eq 4 ] ||
  fail "every rollback must be noninteractive"
[ "$(grep -c '^curl ' "$FLY_TEST_LOG")" -eq 4 ] ||
  fail "expected API and web health verification"

if rollback_failure="$(
  FLY_TEST_CURL_FAIL=true \
    "${FLY_ROOT}/scripts/rollback-private-beta.sh" \
    --manifest "$manifest" \
    --execute 2>&1
)"; then
  fail "rollback accepted failed public health"
fi
if rg -q 'api[.]example[.]invalid|web[.]example[.]invalid' \
  <<<"$rollback_failure"; then
  fail "rollback failure output exposed protected hostnames"
fi
if FLY_TEST_MULTI_MACHINE=true \
  "${FLY_ROOT}/scripts/rollback-private-beta.sh" \
  --manifest "$manifest" \
  --execute >/dev/null 2>&1; then
  fail "rollback accepted more than one started Machine per app"
fi

tampered="${TEST_TMP}/tampered.json"
jq '.apps[0].app = "unexpected-app"' "$manifest" > "$tampered"
if "${FLY_ROOT}/scripts/rollback-private-beta.sh" --manifest "$tampered" >/dev/null 2>&1; then
  fail "rollback accepted an unexpected app"
fi

if rg -n "fly(ctl)? releases rollback" \
  "${FLY_ROOT}" \
  "${REPO_ROOT}/docs" \
  "${REPO_ROOT}/.github/workflows/deploy.yml" >/dev/null; then
  fail "removed Fly rollback command is still documented or automated"
fi
rg -q "capture-rollback-manifest[.]sh" \
  "${REPO_ROOT}/.github/workflows/deploy.yml" ||
  fail "deploy workflow does not capture the pre-deploy rollback set"
rg -q 'preflight-private-beta[.]sh --initial-activation' \
  "${REPO_ROOT}/.github/workflows/deploy.yml" ||
  fail "deploy workflow does not prove a genuinely initial activation"
rg -q 'validate-public-origin[.]sh PUBLIC_API_BASE_URL' \
  "${REPO_ROOT}/.github/workflows/deploy.yml" ||
  fail "deploy workflow does not use the shared public-origin validator"
rg -q 'preflight-private-beta[.]sh --require-rollback-target' \
  "${REPO_ROOT}/.github/workflows/deploy.yml" ||
  fail "deploy workflow does not preflight the retained rollback target"
[ "$(rg -c 'preflight-private-beta[.]sh --require-rollback-target' \
  "${REPO_ROOT}/.github/workflows/deploy.yml")" -ge 2 ] ||
  fail "deploy workflow does not recheck Machine caps after deployment"
rg -q "rollback-private-beta[.]sh" \
  "${REPO_ROOT}/.github/workflows/deploy.yml" ||
  fail "deploy workflow does not point operators to the guarded rollback command"
rg -q 'superfly/flyctl-actions/setup-flyctl@[0-9a-f]{40}' \
  "${REPO_ROOT}/.github/workflows/deploy.yml" ||
  fail "Fly setup action is not pinned to an immutable commit"
rg -q '^permissions:' "${REPO_ROOT}/.github/workflows/deploy.yml" &&
  rg -q '^  contents: read$' "${REPO_ROOT}/.github/workflows/deploy.yml" ||
  fail "deploy workflow permissions are not least-privilege"
rg -q 'group: deploy-fly-\$\{\{ inputs[.]environment \}\}' \
  "${REPO_ROOT}/.github/workflows/deploy.yml" &&
  rg -q '^  cancel-in-progress: false$' \
    "${REPO_ROOT}/.github/workflows/deploy.yml" ||
  fail "deploy workflow does not serialize per environment"
rg -q -- '--image-label.*GITHUB_SHA' \
  "${REPO_ROOT}/.github/workflows/deploy.yml" ||
  fail "deploy workflow does not label images with the source commit"
[ "$(rg -c -- '--ha=false' "${REPO_ROOT}/.github/workflows/deploy.yml")" -eq 4 ] ||
  fail "every workflow deploy must preserve the one-Machine cap"
[ "$(rg -c -- '--strategy rolling' "${REPO_ROOT}/.github/workflows/deploy.yml")" -eq 4 ] ||
  fail "every workflow deploy must select the rolling strategy"
[ "$(rg -c -- '--yes' "${REPO_ROOT}/.github/workflows/deploy.yml")" -eq 4 ] ||
  fail "every workflow deploy must be noninteractive"
if rg -n 'NEXT_PUBLIC_API_BASE_URL=\$\{url\}|Health gate against https' \
  "${REPO_ROOT}/.github/workflows/deploy.yml" >/dev/null; then
  fail "deploy workflow prints protected hostnames"
fi
if rg -n 'got: \$url|echo .*\$\{?(PUBLIC_API_BASE_URL|API_HOST)' \
  "${REPO_ROOT}/.github/workflows/deploy.yml" >/dev/null; then
  fail "deploy workflow failure output may expose a protected hostname"
fi
rg -q 'must be a non-localhost HTTPS origin' \
  "${FLY_ROOT}/scripts/validate-public-origin.sh" ||
  fail "shared validator does not require a public HTTPS origin"
if rg -n 'curl -[^ ]*S' \
  "${REPO_ROOT}/.github/workflows/deploy.yml" >/dev/null; then
  fail "deploy workflow curl failures may expose protected hostnames"
fi

echo "Fly operator script tests: PASS"
