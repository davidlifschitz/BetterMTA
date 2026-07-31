#!/usr/bin/env bash
# Phase 12A.9 — external / dogfood alpha health monitor.
#
# Modes:
#   MONITOR_MODE=local   → http://127.0.0.1:8088 (no Cloudflare Access headers)
#   MONITOR_MODE=remote  → ALPHA_PUBLIC_BASE_URL + CF Access service token headers
#
# Secrets (names only; never commit values):
#   ALPHA_PUBLIC_BASE_URL
#   CF_ACCESS_CLIENT_ID
#   CF_ACCESS_CLIENT_SECRET
#
# Privacy: uses PlaceRefs placeId st:F21 / st:D16 only — no coordinates, tester
# identities, or route history to third-party analytics. Logs to stdout / GHA.
#
# Exit codes:
#   0  — all required checks passed (warnings allowed) OR soft-skip (remote misconfigured)
#   1  — one or more hard failures
#   2  — usage / configuration error (local mode misused, etc.)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

MODE="${MONITOR_MODE:-remote}"
ROUTE_SMOKE="${MONITOR_ROUTE_SMOKE:-1}"
FAIL_ON_STALE="${MONITOR_FAIL_ON_STALE:-0}"
FAIL_ON_SCHEDULE_ONLY="${MONITOR_FAIL_ON_SCHEDULE_ONLY:-0}"
# Soft-skip remote when secrets missing (default). Set 0 to hard-fail instead.
SOFT_SKIP="${MONITOR_SOFT_SKIP:-1}"
GHA="${GITHUB_ACTIONS:-false}"

ORIGIN_PLACE_ID="${MONITOR_ORIGIN_PLACE_ID:-st:F21}"
DEST_PLACE_ID="${MONITOR_DEST_PLACE_ID:-st:D16}"
SELECTED_LINE="${MONITOR_SELECTED_LINE:-F}"

TMPDIR_MON="${TMPDIR:-/tmp}/bettermta-monitor-$$"
mkdir -p "$TMPDIR_MON"
cleanup() { rm -rf "$TMPDIR_MON" 2>/dev/null || true; }
trap cleanup EXIT

pass=0
fail=0
warn=0
skip=0
# Highest-severity class seen (for summary / annotations).
PRIMARY_CLASS=""

ok() { echo "PASS  $*"; pass=$((pass + 1)); }
bad() {
  local cls="$1"; shift
  echo "FAIL  [${cls}] $*"
  fail=$((fail + 1))
  if [[ -z "$PRIMARY_CLASS" ]]; then PRIMARY_CLASS="$cls"; fi
  if [[ "$GHA" == "true" ]]; then
    echo "::error title=${cls}::$*"
  fi
}
warnc() {
  local cls="$1"; shift
  echo "WARN  [${cls}] $*"
  warn=$((warn + 1))
  if [[ "$GHA" == "true" ]]; then
    echo "::warning title=${cls}::$*"
  fi
}
skipc() {
  echo "SKIP  $*"
  skip=$((skip + 1))
  if [[ "$GHA" == "true" ]]; then
    echo "::notice::$*"
  fi
}
note() { echo "NOTE  $*"; }

usage() {
  cat <<'EOF'
Usage: monitor-alpha.sh

  MONITOR_MODE=local ./infra/alpha/scripts/monitor-alpha.sh
  MONITOR_MODE=remote ./infra/alpha/scripts/monitor-alpha.sh   # needs Access secrets

Env:
  MONITOR_MODE                 local | remote (default: remote)
  ALPHA_PUBLIC_BASE_URL        https://<ALPHA_HOSTNAME> (remote)
  CF_ACCESS_CLIENT_ID          Access service token client id (remote)
  CF_ACCESS_CLIENT_SECRET      Access service token secret (remote)
  EDGE_BASE                    override local base (default http://127.0.0.1:8088)
  MONITOR_ROUTE_SMOKE          1|0 (default 1)
  MONITOR_FAIL_ON_STALE        1|0 (default 0 → warn)
  MONITOR_FAIL_ON_SCHEDULE_ONLY 1|0 (default 0 → warn)
  MONITOR_SOFT_SKIP            1|0 (default 1 → exit 0 if remote secrets missing)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

BASE=""
USE_ACCESS=0
case "$MODE" in
  local)
    BASE="${EDGE_BASE:-http://127.0.0.1:8088}"
    USE_ACCESS=0
    ;;
  remote)
    BASE="${ALPHA_PUBLIC_BASE_URL:-}"
    USE_ACCESS=1
    ;;
  *)
    echo "error: MONITOR_MODE must be local or remote (got: ${MODE})" >&2
    exit 2
    ;;
esac

if [[ "$MODE" == "remote" ]]; then
  if [[ -z "$BASE" || -z "${CF_ACCESS_CLIENT_ID:-}" || -z "${CF_ACCESS_CLIENT_SECRET:-}" ]]; then
    msg="remote monitor not configured — set ALPHA_PUBLIC_BASE_URL + CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET (or MONITOR_MODE=local)"
    if [[ "$SOFT_SKIP" == "1" ]]; then
      skipc "$msg"
      echo "== summary: soft-skip (no alpha secrets); exit 0 =="
      exit 0
    fi
    echo "error: $msg" >&2
    exit 2
  fi
fi

BASE="${BASE%/}"
echo "== BetterMTA alpha monitor =="
echo "mode=${MODE} base=${BASE} access_headers=${USE_ACCESS} route_smoke=${ROUTE_SMOKE}"
# Never print token values.
if [[ "$USE_ACCESS" == "1" ]]; then
  note "using CF-Access-Client-Id (secret present; value not logged)"
fi

# Classify transport-level failures from curl exit + http code + body sniff.
classify_transport() {
  # args: curl_exit http_code body_file
  local ce="$1" code="$2" body="$3"
  if [[ "$ce" -ne 0 || "$code" == "000" ]]; then
    if [[ "$MODE" == "local" ]]; then
      echo "host_offline"
    else
      # From outside, connect/DNS/timeout usually means tunnel or origin unreachable.
      echo "tunnel_offline"
    fi
    return
  fi
  # Cloudflare Access challenge / deny (common when token missing/wrong).
  if [[ "$code" == "302" || "$code" == "401" || "$code" == "403" ]]; then
    if grep -qiE 'cloudflare|access|login|CF_Authorization' "$body" 2>/dev/null; then
      echo "access_denied"
      return
    fi
  fi
  # Cloudflare edge errors when tunnel/origin is down.
  if [[ "$code" == "502" || "$code" == "503" || "$code" == "504" ]]; then
    if grep -qiE 'cloudflare|Error 10[0-9]{2}|origin|tunnel' "$body" 2>/dev/null; then
      if [[ "$MODE" == "remote" ]]; then
        echo "tunnel_offline"
        return
      fi
    fi
  fi
  echo ""
}

http_get() {
  # args: url out_file max_time → prints "curl_exit http_code"
  local url="$1" out="$2" max="${3:-20}"
  local ce=0 code
  local -a hdrs=()
  if [[ "$USE_ACCESS" == "1" ]]; then
    hdrs=(
      -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}"
      -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"
    )
  fi
  set +e
  code="$(
    curl -sS -L --max-redirs 0 \
      -o "$out" -w '%{http_code}' \
      --max-time "$max" \
      ${hdrs[@]+"${hdrs[@]}"} \
      "$url" 2>/dev/null
  )"
  ce=$?
  set -e
  echo "${ce} ${code:-000}"
}

http_post_json() {
  local url="$1" out="$2" payload="$3" max="${4:-30}"
  local ce=0 code
  local -a hdrs=()
  if [[ "$USE_ACCESS" == "1" ]]; then
    hdrs=(
      -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}"
      -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"
    )
  fi
  set +e
  code="$(
    curl -sS -L --max-redirs 0 \
      -o "$out" -w '%{http_code}' \
      --max-time "$max" \
      -H 'content-type: application/json' \
      -H 'X-BetterMTA-Client: web' \
      ${hdrs[@]+"${hdrs[@]}"} \
      -d "$payload" \
      "$url" 2>/dev/null
  )"
  ce=$?
  set -e
  echo "${ce} ${code:-000}"
}

# --- 1) Public application reachability (web) ---
web_body="${TMPDIR_MON}/web.body"
read -r web_ce web_code <<<"$(http_get "${BASE}/" "$web_body" 15)"
web_cls="$(classify_transport "$web_ce" "$web_code" "$web_body")"
if [[ -n "$web_cls" && "$web_code" != "200" ]]; then
  bad "$web_cls" "GET / → http ${web_code:-000} curl_exit=${web_ce}"
elif [[ "$web_code" == "200" ]]; then
  # Prefer HTML; reject JSON API bodies mistaken for the app.
  if grep -q '"dataMode"' "$web_body" 2>/dev/null && ! grep -qiE '<!DOCTYPE|<html' "$web_body" 2>/dev/null; then
    bad "web_failure" "GET / → 200 but body looks like API JSON (edge routing?)"
  else
    ok "public app GET / → ${web_code}"
  fi
else
  bad "web_failure" "GET / → http ${web_code:-000}"
fi

# --- 2) API liveness ---
live_body="${TMPDIR_MON}/live.body"
read -r live_ce live_code <<<"$(http_get "${BASE}/health/live" "$live_body" 15)"
live_cls="$(classify_transport "$live_ce" "$live_code" "$live_body")"
if [[ -n "$live_cls" && "$live_code" != "200" ]]; then
  bad "$live_cls" "GET /health/live → http ${live_code:-000}"
elif [[ "$live_code" == "200" ]] && grep -q '"status"' "$live_body" 2>/dev/null; then
  ok "/health/live → ${live_code}"
else
  bad "api_failure" "/health/live → http ${live_code:-000}"
fi

# --- 3) API readiness ---
ready_body="${TMPDIR_MON}/ready.body"
read -r ready_ce ready_code <<<"$(http_get "${BASE}/health/ready" "$ready_body" 20)"
ready_cls="$(classify_transport "$ready_ce" "$ready_code" "$ready_body")"
READY_REASONS=""
if [[ -n "$ready_cls" && "$ready_code" != "200" && "$ready_code" != "503" ]]; then
  bad "$ready_cls" "GET /health/ready → http ${ready_code:-000}"
elif [[ "$ready_code" == "200" ]]; then
  ok "/health/ready → ${ready_code}"
elif [[ "$ready_code" == "503" ]]; then
  READY_REASONS="$(python3 - "$ready_body" <<'PY' 2>/dev/null || true
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(",".join(d.get("reasons") or []))
except Exception:
    print("")
PY
)"
  # Classify from readiness reasons.
  case ",${READY_REASONS}," in
    *,otp_unreachable,*)
      bad "otp_failure" "/health/ready → 503 reasons=${READY_REASONS}"
      ;;
    *,static_dataset_missing,*|*,catalog_unavailable,*|*,data_service_unreachable,*)
      bad "data_failure" "/health/ready → 503 reasons=${READY_REASONS}"
      ;;
    *)
      bad "api_failure" "/health/ready → 503 reasons=${READY_REASONS:-unknown}"
      ;;
  esac
else
  bad "api_failure" "/health/ready → http ${ready_code:-000}"
fi

# --- 4) /v1/status + dataMode + coherence inputs ---
status_body="${TMPDIR_MON}/status.body"
read -r status_ce status_code <<<"$(http_get "${BASE}/v1/status" "$status_body" 20)"
status_cls="$(classify_transport "$status_ce" "$status_code" "$status_body")"
STATUS_DATA_MODE=""
STATUS_STATIC=""
STATUS_RT_AGE=""
if [[ -n "$status_cls" && "$status_code" != "200" ]]; then
  bad "$status_cls" "GET /v1/status → http ${status_code:-000}"
elif [[ "$status_code" != "200" ]]; then
  bad "api_failure" "/v1/status → http ${status_code:-000}"
else
  eval "$(python3 - "$status_body" <<'PY'
import json, sys, shlex
d = json.load(open(sys.argv[1]))
def emit(k, v):
    print(f"{k}={shlex.quote('' if v is None else str(v))}")
emit("STATUS_DATA_MODE", d.get("dataMode"))
emit("STATUS_STATIC", d.get("staticDatasetVersion"))
emit("STATUS_RT_AGE", d.get("realtimeAgeSeconds"))
emit("STATUS_DEGRADED", d.get("degraded"))
PY
)"
  if [[ -z "$STATUS_DATA_MODE" || -z "$STATUS_STATIC" ]]; then
    bad "data_failure" "/v1/status missing dataMode or staticDatasetVersion"
  else
    ok "/v1/status → dataMode=${STATUS_DATA_MODE} static=${STATUS_STATIC} rtAge=${STATUS_RT_AGE:-n/a}"
  fi

  case "$STATUS_DATA_MODE" in
    live)
      note "dataMode=live"
      ;;
    stale)
      if [[ "$FAIL_ON_STALE" == "1" ]]; then
        bad "stale_realtime" "dataMode=stale realtimeAgeSeconds=${STATUS_RT_AGE:-n/a}"
      else
        warnc "stale_realtime" "dataMode=stale realtimeAgeSeconds=${STATUS_RT_AGE:-n/a} (warn; set MONITOR_FAIL_ON_STALE=1 to fail)"
      fi
      ;;
    schedule_only)
      if [[ "$FAIL_ON_SCHEDULE_ONLY" == "1" ]]; then
        bad "schedule_only_operation" "dataMode=schedule_only (schedule routing only)"
      else
        warnc "schedule_only_operation" "dataMode=schedule_only (warn; set MONITOR_FAIL_ON_SCHEDULE_ONLY=1 to fail)"
      fi
      ;;
    unavailable)
      bad "data_failure" "dataMode=unavailable"
      ;;
    synthetic)
      if [[ "$MODE" == "remote" ]]; then
        bad "data_failure" "dataMode=synthetic on remote alpha (fixtures not allowed)"
      else
        warnc "data_failure" "dataMode=synthetic (local dogfood)"
      fi
      ;;
    *)
      bad "data_failure" "unexpected dataMode=${STATUS_DATA_MODE:-empty}"
      ;;
  esac
fi

# --- 5) Bounded live route-search smoke (Carroll→Bryant F PlaceRefs) ---
ROUTE_STATIC=""
ROUTE_DATA_MODE=""
ROUTE_ERR_CODE=""
if [[ "$ROUTE_SMOKE" != "1" ]]; then
  skipc "route smoke disabled (MONITOR_ROUTE_SMOKE=${ROUTE_SMOKE})"
else
  route_body="${TMPDIR_MON}/route.body"
  # PlaceRefs only — no coordinates.
  payload="$(python3 - <<PY
import json
print(json.dumps({
  "origin": {"placeId": "${ORIGIN_PLACE_ID}"},
  "destination": {"placeId": "${DEST_PLACE_ID}"},
  "timing": {"type": "depart_now"},
  "selectedLineIds": ["${SELECTED_LINE}"],
}))
PY
)"
  read -r route_ce route_code <<<"$(http_post_json "${BASE}/v1/routes/search" "$route_body" "$payload" 45)"
  route_cls="$(classify_transport "$route_ce" "$route_code" "$route_body")"
  if [[ -n "$route_cls" && "$route_code" != "200" && "$route_code" != "404" && "$route_code" != "503" && "$route_code" != "504" ]]; then
    bad "$route_cls" "POST /v1/routes/search → http ${route_code:-000}"
  elif [[ "$route_code" == "200" ]]; then
    eval "$(python3 - "$route_body" <<'PY'
import json, sys, shlex
d = json.load(open(sys.argv[1]))
def emit(k, v):
    print(f"{k}={shlex.quote('' if v is None else str(v))}")
emit("ROUTE_DATA_MODE", d.get("dataMode"))
emit("ROUTE_STATIC", d.get("staticDatasetVersion"))
c = (d.get("constrained") or {}).get("itineraries") or []
b = (d.get("baseline") or {}).get("itineraries") or []
emit("ROUTE_CONSTRAINED_N", len(c))
emit("ROUTE_BASELINE_N", len(b))
complete = ((d.get("constrained") or {}).get("satisfactionSummary") or {}).get("completeMatchFound")
emit("ROUTE_COMPLETE", complete)
PY
)"
    # Do not log requestId as durable route history to external systems; stdout OK.
    if [[ "${ROUTE_CONSTRAINED_N:-0}" -gt 0 || "${ROUTE_BASELINE_N:-0}" -gt 0 ]]; then
      ok "route smoke Carroll→Bryant F → 200 itineraries constrained=${ROUTE_CONSTRAINED_N} baseline=${ROUTE_BASELINE_N} complete=${ROUTE_COMPLETE:-n/a}"
    else
      # Typed empty can still indicate OTP/path issues.
      bad "otp_failure" "route smoke → 200 but zero itineraries (constrained+baseline)"
    fi
  else
    eval "$(python3 - "$route_body" <<'PY'
import json, sys, shlex
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    d = {}
err = (d.get("error") or {})
code = err.get("code") or ""
msg = err.get("message") or ""
details = err.get("details") or {}
print(f"ROUTE_ERR_CODE={shlex.quote(code)}")
print(f"ROUTE_ERR_MSG={shlex.quote(msg[:160])}")
otp_g = details.get("otpGraphVersion") if isinstance(details, dict) else None
st = details.get("staticDatasetVersion") if isinstance(details, dict) else None
print(f"ROUTE_ERR_OTP_GRAPH={shlex.quote('' if otp_g is None else str(otp_g))}")
print(f"ROUTE_ERR_STATIC={shlex.quote('' if st is None else str(st))}")
PY
)"
    if [[ "$ROUTE_ERR_CODE" == "data_unavailable" ]] && [[ -n "${ROUTE_ERR_OTP_GRAPH:-}" || "${ROUTE_ERR_MSG}" == *"graph"* ]]; then
      bad "graph_static_mismatch" "route smoke → ${route_code} ${ROUTE_ERR_CODE}: graph/static incoherent"
    elif [[ "$ROUTE_ERR_CODE" == "data_unavailable" ]]; then
      bad "data_failure" "route smoke → ${route_code} ${ROUTE_ERR_CODE}"
    elif [[ "$route_code" == "504" || "$route_code" == "503" ]]; then
      bad "otp_failure" "route smoke → http ${route_code} code=${ROUTE_ERR_CODE:-none}"
    elif [[ "$route_code" == "404" ]]; then
      bad "otp_failure" "route smoke → http 404 code=${ROUTE_ERR_CODE:-none}"
    else
      bad "api_failure" "route smoke → http ${route_code:-000} code=${ROUTE_ERR_CODE:-none}"
    fi
  fi
fi

# --- 6) Static / graph coherence (status vs route; ready already gates OTP) ---
if [[ -n "${STATUS_STATIC:-}" && -n "${ROUTE_STATIC:-}" ]]; then
  if [[ "$STATUS_STATIC" == "$ROUTE_STATIC" ]]; then
    ok "static/graph coherence: status.staticDatasetVersion == route.staticDatasetVersion (${STATUS_STATIC})"
  else
    bad "graph_static_mismatch" "status static=${STATUS_STATIC} vs route static=${ROUTE_STATIC}"
  fi
elif [[ "$ready_code" == "200" && -n "${STATUS_STATIC:-}" && "$ROUTE_SMOKE" != "1" ]]; then
  # Without route smoke we can only confirm ready+status static present.
  ok "static coherence (ready+status only): static=${STATUS_STATIC}"
fi

echo "== summary: ${pass} passed, ${warn} warnings, ${fail} failed, ${skip} skipped; primary_class=${PRIMARY_CLASS:-none} =="
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
exit 0
