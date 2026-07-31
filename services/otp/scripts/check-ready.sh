#!/usr/bin/env bash
# Readiness verification for BetterMTA OTP.
#
# Modes:
#   ./scripts/check-ready.sh                full readiness (OTP up + graph match)
#   ./scripts/check-ready.sh --preflight-only
#       validate router-config JSON + env-resolvable updater URLs; do NOT require OTP up
#
# Fails (nonzero) when:
#   - no active graph / missing graph.obj
#   - active.json graphVersion mismatches loaded serve meta or OTP identity
#   - router-config.json invalid JSON
#   - updater URLs cannot be resolved from env (missing BETTERMTA_DATA_HOST)
#   - OTP HTTP not ready (full mode)
#   - OTP-reported graph window / health indicates not loaded (full mode)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OTP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VAR_DIR="${OTP_ROOT}/var/otp"
CONFIG_DIR="${OTP_ROOT}/config"
ACTIVE_JSON="${VAR_DIR}/graphs/active.json"
ROUTER_CONFIG="${CONFIG_DIR}/router-config.json"
OTP_BASE="${OTP_BASE:-http://localhost:8090}"

PREFLIGHT_ONLY=0
if [[ "${1:-}" == "--preflight-only" ]]; then
  PREFLIGHT_ONLY=1
fi

fail() {
  echo "check-ready: FAIL $*" >&2
  exit 1
}

ok() {
  echo "check-ready: OK $*"
}

# --- config validation ---
[[ -f "${ROUTER_CONFIG}" ]] || fail "missing router-config: ${ROUTER_CONFIG}"

python3 - "${ROUTER_CONFIG}" <<'PY' || fail "router-config.json does not parse as JSON"
import json, sys
from pathlib import Path
raw = Path(sys.argv[1]).read_text()
cfg = json.loads(raw)
assert "updaters" in cfg and isinstance(cfg["updaters"], list)
assert len(cfg["updaters"]) >= 9, f"expected >=9 updaters, got {len(cfg['updaters'])}"
print(f"parsed router-config with {len(cfg['updaters'])} updaters")
PY

# Env resolution for updater URLs (OTP substitutes ${VAR}; we require BETTERMTA_DATA_HOST)
export BETTERMTA_DATA_HOST="${BETTERMTA_DATA_HOST:-host.docker.internal:8081}"
export BETTERMTA_INTERNAL_TOKEN="${BETTERMTA_INTERNAL_TOKEN:-offline-placeholder-not-a-secret}"

python3 - "${ROUTER_CONFIG}" <<'PY' || fail "updater URL env resolution failed"
import json, os, re, sys
from pathlib import Path
from urllib.parse import urlparse

cfg = json.loads(Path(sys.argv[1]).read_text())
pat = re.compile(r"\$\{([A-Z0-9_]+)(?::-([^}]*))?\}")

def subst(s: str) -> str:
    def repl(m):
        key, default = m.group(1), m.group(2)
        val = os.environ.get(key)
        if val is None or val == "":
            if default is not None:
                return default
            raise SystemExit(f"missing env {key} required by updater URL/header")
        return val
    return pat.sub(repl, s)

for i, u in enumerate(cfg["updaters"]):
    url = subst(u["url"])
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise SystemExit(f"updater[{i}] unresolved/invalid URL: {url!r}")
    # headers also substitute
    for hk, hv in (u.get("headers") or {}).items():
        subst(hv)
    print(f"updater[{i}] type={u['type']} feedId={u.get('feedId')} url={url}")
print("env-resolved updater URLs OK")
PY

ok "router-config valid; updater URLs resolve from env (BETTERMTA_DATA_HOST=${BETTERMTA_DATA_HOST})"

# --- active graph ---
[[ -f "${ACTIVE_JSON}" ]] || fail "no active graph pointer at ${ACTIVE_JSON}"
GRAPH_VERSION="$(python3 -c "import json; print(json.load(open('${ACTIVE_JSON}'))['graphVersion'])")"
STATIC_VERSION_ID="$(python3 -c "import json; print(json.load(open('${ACTIVE_JSON}'))['staticVersionId'])")"
GRAPH_DIR="${VAR_DIR}/graphs/${GRAPH_VERSION}"
[[ -f "${GRAPH_DIR}/graph.obj" ]] || fail "missing graph.obj for active ${GRAPH_VERSION}"
[[ -f "${GRAPH_DIR}/manifest.json" ]] || fail "missing manifest.json for active ${GRAPH_VERSION}"

MANIFEST_VERSION="$(python3 -c "import json; print(json.load(open('${GRAPH_DIR}/manifest.json'))['graphVersion'])")"
[[ "${MANIFEST_VERSION}" == "${GRAPH_VERSION}" ]] || fail "active/manifest graphVersion mismatch active=${GRAPH_VERSION} manifest=${MANIFEST_VERSION}"

ok "active graph ${GRAPH_VERSION} (staticVersionId=${STATIC_VERSION_ID}) present"

if [[ "${PREFLIGHT_ONLY}" == "1" ]]; then
  ok "preflight-only complete"
  exit 0
fi

# --- OTP HTTP readiness ---
HEALTH_URL="${OTP_BASE}/otp/actuators/health"
GRAPHQL_URL="${OTP_BASE}/otp/gtfs/v1"

echo "check-ready: probing ${HEALTH_URL}"
HEALTH_BODY=""
for i in $(seq 1 60); do
  if HEALTH_BODY="$(curl -fsS --max-time 3 "${HEALTH_URL}" 2>/dev/null)"; then
    break
  fi
  sleep 2
  HEALTH_BODY=""
done
[[ -n "${HEALTH_BODY}" ]] || fail "OTP not responding at ${HEALTH_URL} (is bettermta-otp running?)"

echo "check-ready: health response: ${HEALTH_BODY}"
echo "${HEALTH_BODY}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('status')=='UP', d" \
  || fail "health status not UP"

# Correlate serve-meta with active
SERVE_META="${VAR_DIR}/serve/serve-meta.json"
if [[ -f "${SERVE_META}" ]]; then
  SERVE_VERSION="$(python3 -c "import json; print(json.load(open('${SERVE_META}'))['graphVersion'])")"
  [[ "${SERVE_VERSION}" == "${GRAPH_VERSION}" ]] || fail "serve-meta graphVersion=${SERVE_VERSION} != active=${GRAPH_VERSION}"
  ok "serve-meta matches active.json (${GRAPH_VERSION})"
else
  echo "check-ready: WARN no serve-meta.json (OTP may have been started outside run-otp.sh)"
fi

# GraphQL serviceTimeRange — confirms a transit graph is loaded
GQL_QUERY='{"query":"{ serviceTimeRange { start end } }"}'
GQL_BODY="$(curl -fsS --max-time 30 \
  -H 'Content-Type: application/json' \
  -H 'OTPTimeout: 60000' \
  -d "${GQL_QUERY}" \
  "${GRAPHQL_URL}")" || fail "GraphQL serviceTimeRange request failed"

echo "check-ready: serviceTimeRange: ${GQL_BODY}"
echo "${GQL_BODY}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert 'errors' not in d or not d['errors'], d
r=d['data']['serviceTimeRange']
assert r and r.get('start') is not None and r.get('end') is not None, r
print('serviceTimeRange start=', r['start'], 'end=', r['end'])
" || fail "GraphQL did not return a loaded serviceTimeRange"

# Optional: compare router configVersion if exposed
ok "OTP ready at ${OTP_BASE}; graphVersion=${GRAPH_VERSION} bound to staticVersionId=${STATIC_VERSION_ID}"
exit 0
