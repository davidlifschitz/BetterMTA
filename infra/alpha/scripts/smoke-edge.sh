#!/usr/bin/env bash
# Phase 12A.4 — local edge proxy smoke (no Cloudflare).
# Expects alpha compose stack up:
#   ./infra/alpha/scripts/start-alpha.sh
#   # or: docker-compose -f docker-compose.yml -f docker-compose.alpha.yml up -d
#
# Optional route search: ALPHA_ROUTE_SMOKE=1 (default) / 0 to skip.
set -euo pipefail

EDGE="${EDGE_BASE:-http://127.0.0.1:8088}"
ROUTE_SMOKE="${ALPHA_ROUTE_SMOKE:-1}"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.alpha.yml)
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

pass=0
fail=0

ok() { echo "PASS  $*"; pass=$((pass + 1)); }
bad() { echo "FAIL  $*"; fail=$((fail + 1)); }

echo "== edge smoke against ${EDGE} =="

http_code() {
  # curl -w still emits 000 on failure; do not append a second code via || echo.
  local url="$1"
  local out="$2"
  local max="${3:-15}"
  curl -sS -o "$out" -w '%{http_code}' --max-time "$max" "$url" || true
}

# --- routing (stack should be healthy: api + web + preferably otp) ---
live_code="$(http_code "${EDGE}/health/live" /tmp/bettermta-edge-live.body 5)"
if [[ "$live_code" == "200" ]]; then
  ok "/health/live → ${live_code} (api)"
else
  bad "/health/live → ${live_code:-000} (expected 200 from api)"
fi

status_code="$(http_code "${EDGE}/v1/status" /tmp/bettermta-edge-status.body 20)"
if [[ "$status_code" == "200" ]] && grep -q 'dataMode' /tmp/bettermta-edge-status.body 2>/dev/null; then
  ok "/v1/status → ${status_code} with dataMode (api)"
else
  bad "/v1/status → ${status_code:-000} (expected 200 JSON from api; wait for api/otp healthy)"
fi

web_code="$(http_code "${EDGE}/" /tmp/bettermta-edge-web.body 10)"
web_ct="$(curl -sS -I --max-time 5 "${EDGE}/" 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print tolower($2); exit}' || true)"
if [[ "$web_code" == "200" ]] && [[ "${web_ct}" == *text/html* || "$(head -c 64 /tmp/bettermta-edge-web.body)" == *"<!DOCTYPE"* || "$(head -c 64 /tmp/bettermta-edge-web.body)" == *"<html"* ]]; then
  ok "/ → ${web_code} html (web)"
else
  # Next.js may return HTML without doctype preamble in first bytes; accept 200 + non-JSON
  if [[ "$web_code" == "200" ]] && ! grep -q '"dataMode"' /tmp/bettermta-edge-web.body 2>/dev/null; then
    ok "/ → ${web_code} non-api body (web)"
  else
    bad "/ → ${web_code:-000} (expected frontend from web)"
  fi
fi

# --- host publish: data/OTP must not be on 0.0.0.0 ---
echo "== host publish check (alpha) =="
cfg_json="$(docker-compose "${COMPOSE_FILES[@]}" config --format json 2>/dev/null || true)"
if [[ -z "$cfg_json" ]]; then
  bad "docker-compose config failed (cannot verify ports)"
else
  python3 - "$cfg_json" <<'PY' && ok "data/otp have no host ports; api/web/edge are loopback-only" || bad "unexpected host publish (data/otp exposed or non-loopback)"
import json, sys

cfg = json.loads(sys.argv[1])
services = cfg.get("services", {})

def ports(name):
    return services.get(name, {}).get("ports") or []

def host_ips(plist):
    ips = []
    for p in plist:
        if isinstance(p, dict):
            ips.append(p.get("host_ip") or "0.0.0.0")
        else:
            # short syntax like "8081:8082" => all interfaces
            ips.append("0.0.0.0")
    return ips

errors = []
if ports("data"):
    errors.append(f"data still publishes: {ports('data')}")
if ports("otp"):
    errors.append(f"otp still publishes: {ports('otp')}")

for name in ("api", "web", "edge"):
    for ip in host_ips(ports(name)):
        if ip not in ("127.0.0.1", "::1"):
            errors.append(f"{name} publishes on {ip}: {ports(name)}")

if "edge" not in services:
    errors.append("edge service missing from alpha compose")
else:
    edge_published = [p.get("published") for p in ports("edge") if isinstance(p, dict)]
    if "8088" not in [str(x) for x in edge_published]:
        errors.append(f"edge missing published 8088: {ports('edge')}")

if errors:
    print("port errors:", *errors, sep="\n  ")
    sys.exit(1)
PY
fi

# Runtime listener check when docker is available
if command -v docker >/dev/null 2>&1; then
  published="$(docker-compose "${COMPOSE_FILES[@]}" ps --format json 2>/dev/null || true)"
  if [[ -n "$published" ]]; then
    if echo "$published" | grep -E '0\.0\.0\.0:(8081|8090)\b' >/dev/null 2>&1; then
      bad "runtime publish shows 0.0.0.0:8081 or :8090"
    else
      ok "runtime ps has no 0.0.0.0:8081/:8090"
    fi
  fi

  # Restart policy check (alpha long-running services)
  cfg_json="${cfg_json:-$(docker-compose "${COMPOSE_FILES[@]}" config --format json 2>/dev/null || true)}"
  if [[ -n "$cfg_json" ]]; then
    python3 - "$cfg_json" <<'PY' && ok "restart=unless-stopped on data/data-proxy/otp/api/web/edge" || bad "restart policy missing on a long-running alpha service"
import json, sys
cfg = json.loads(sys.argv[1])
services = cfg.get("services", {})
need = ("data", "data-proxy", "otp", "api", "web", "edge")
errors = []
for name in need:
    if name not in services:
        errors.append(f"missing service {name}")
        continue
    policy = services[name].get("restart")
    if policy != "unless-stopped":
        errors.append(f"{name} restart={policy!r} (want unless-stopped)")
if errors:
    print("restart errors:", *errors, sep="\n  ")
    sys.exit(1)
PY
  fi
fi

# --- optional fast route search via edge (not readiness authority) ---
if [[ "$ROUTE_SMOKE" == "1" ]]; then
  echo "== optional route search (ALPHA_ROUTE_SMOKE=1) =="
  places_code="$(http_code "${EDGE}/v1/places/search?q=Carroll&limit=3" /tmp/bettermta-edge-places.body 15)"
  if [[ "$places_code" == "200" ]] && grep -q 'places' /tmp/bettermta-edge-places.body 2>/dev/null; then
    ok "/v1/places/search → ${places_code}"
    # Best-effort stationIds from JSON without requiring jq.
    origin_id="$(python3 - <<'PY' 2>/dev/null || true
import json
data=json.load(open("/tmp/bettermta-edge-places.body"))
places=data.get("places") or []
print((places[0].get("stationId") or places[0].get("placeId") or "") if places else "")
PY
)"
    dest_code="$(http_code "${EDGE}/v1/places/search?q=Bryant&limit=3" /tmp/bettermta-edge-dest.body 15)"
    dest_id="$(python3 - <<'PY' 2>/dev/null || true
import json
data=json.load(open("/tmp/bettermta-edge-dest.body"))
places=data.get("places") or []
print((places[0].get("stationId") or places[0].get("placeId") or "") if places else "")
PY
)"
    if [[ "$dest_code" == "200" && -n "$origin_id" && -n "$dest_id" ]]; then
      route_code="$(
        curl -sS -o /tmp/bettermta-edge-route.body -w '%{http_code}' --max-time 25 \
          -H 'content-type: application/json' \
          -d "{\"origin\":{\"stationId\":\"${origin_id}\"},\"destination\":{\"stationId\":\"${dest_id}\"},\"timing\":{\"type\":\"depart_now\"},\"selectedLineIds\":[\"F\"]}" \
          "${EDGE}/v1/routes/search" || true
      )"
      # Success or honest typed failure — never opaque 500.
      if [[ "$route_code" == "200" ]] || [[ "$route_code" == "404" ]] || [[ "$route_code" == "503" ]] || [[ "$route_code" == "504" ]]; then
        ok "/v1/routes/search → ${route_code} (typed)"
      else
        bad "/v1/routes/search → ${route_code:-000} (unexpected)"
      fi
    else
      bad "could not resolve places for route smoke (dest=${dest_code:-000})"
    fi
  else
    bad "/v1/places/search → ${places_code:-000} (optional route smoke aborted)"
  fi
else
  echo "== optional route search skipped (ALPHA_ROUTE_SMOKE=${ROUTE_SMOKE}) =="
fi

echo "== summary: ${pass} passed, ${fail} failed =="
[[ "$fail" -eq 0 ]]
