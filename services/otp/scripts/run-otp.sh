#!/usr/bin/env bash
# Serve OpenTripPlanner 2.9.0 from the active BetterMTA graph.
#
# - Loads var/otp/graphs/<active>/graph.obj
# - Host port 8090 → container 8080
# - Container name: bettermta-otp
# - Mounts router-config.json + otp-config.json beside the graph for runtime
#
# Env:
#   BETTERMTA_DATA_HOST       default host.docker.internal:8081 (data gateway)
#   BETTERMTA_INTERNAL_TOKEN  Bearer token for internal feeds (placeholder OK offline)
#   OTP_IMAGE                 default opentripplanner/opentripplanner:2.9.0
#   JAVA_XMX                  default 2g for serve (lower than build)
#   OTP_MEMORY                docker --memory default 3.5g
#   DETACH=0                  run foreground (default DETACH=1)
#
# Restart: docker restart bettermta-otp
# Stop:    docker stop bettermta-otp && docker rm bettermta-otp

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OTP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VAR_DIR="${OTP_ROOT}/var/otp"
CONFIG_DIR="${OTP_ROOT}/config"
ACTIVE_JSON="${VAR_DIR}/graphs/active.json"

OTP_IMAGE="${OTP_IMAGE:-opentripplanner/opentripplanner:2.9.0}"
BETTERMTA_DATA_HOST="${BETTERMTA_DATA_HOST:-host.docker.internal:8081}"
BETTERMTA_INTERNAL_TOKEN="${BETTERMTA_INTERNAL_TOKEN:-offline-placeholder-not-a-secret}"
JAVA_XMX="${JAVA_XMX:-2g}"
OTP_MEMORY="${OTP_MEMORY:-3.5g}"
DETACH="${DETACH:-1}"
CONTAINER_NAME="bettermta-otp"

if [[ ! -f "${ACTIVE_JSON}" ]]; then
  echo "run-otp: ERROR no active graph pointer at ${ACTIVE_JSON}" >&2
  echo "run-otp: build a graph first (./scripts/build-graph.sh)" >&2
  exit 1
fi

GRAPH_VERSION="$(python3 -c "import json; print(json.load(open('${ACTIVE_JSON}'))['graphVersion'])")"
GRAPH_DIR="${VAR_DIR}/graphs/${GRAPH_VERSION}"

if [[ ! -f "${GRAPH_DIR}/graph.obj" ]]; then
  echo "run-otp: ERROR missing ${GRAPH_DIR}/graph.obj" >&2
  exit 1
fi

# Validate router-config before start (JSON parse + env-substituted URLs)
"${SCRIPT_DIR}/check-ready.sh" --preflight-only || {
  echo "run-otp: ERROR preflight failed" >&2
  exit 1
}

# Stage a serve directory: graph + runtime configs (OTP reads from one base dir)
SERVE_DIR="${VAR_DIR}/serve"
rm -rf "${SERVE_DIR}"
mkdir -p "${SERVE_DIR}"
cp "${GRAPH_DIR}/graph.obj" "${SERVE_DIR}/graph.obj"
cp "${CONFIG_DIR}/router-config.json" "${SERVE_DIR}/router-config.json"
if [[ -f "${GRAPH_DIR}/otp-config.json" ]]; then
  cp "${GRAPH_DIR}/otp-config.json" "${SERVE_DIR}/otp-config.json"
else
  cat > "${SERVE_DIR}/otp-config.json" <<'EOF'
{
  "otpFeatures": {
    "GtfsGraphQlApi": true,
    "ActuatorAPI": true
  }
}
EOF
fi

# Write serve manifest for check-ready correlation
python3 - <<PY
import json
from datetime import datetime, timezone
from pathlib import Path
active = json.loads(Path("${ACTIVE_JSON}").read_text())
meta = {
  **active,
  "serveDir": "${SERVE_DIR}",
  "startedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "hostPort": 8090,
  "containerPort": 8080,
  "containerName": "${CONTAINER_NAME}",
}
Path("${SERVE_DIR}/serve-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
PY

if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  echo "run-otp: removing existing container ${CONTAINER_NAME}"
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

DETACH_ARGS=(-d)
if [[ "${DETACH}" == "0" ]]; then
  DETACH_ARGS=()
fi

echo "run-otp: serving graphVersion=${GRAPH_VERSION}"
echo "run-otp: http://localhost:8090  (container ${CONTAINER_NAME})"
echo "run-otp: BETTERMTA_DATA_HOST=${BETTERMTA_DATA_HOST} (realtime updaters; expected fail until data gateway live)"
echo "run-otp: memory=${OTP_MEMORY} JAVA_XMX=${JAVA_XMX}"

docker run "${DETACH_ARGS[@]}" \
  --name "${CONTAINER_NAME}" \
  --memory="${OTP_MEMORY}" \
  --memory-swap="${OTP_MEMORY}" \
  --restart unless-stopped \
  -p 8090:8080 \
  -e JAVA_OPTS="-Xmx${JAVA_XMX} -Xms1g" \
  -e JAVA_TOOL_OPTIONS="-Xmx${JAVA_XMX} -Xms1g" \
  -e BETTERMTA_DATA_HOST="${BETTERMTA_DATA_HOST}" \
  -e BETTERMTA_INTERNAL_TOKEN="${BETTERMTA_INTERNAL_TOKEN}" \
  -v "${SERVE_DIR}:/var/opentripplanner" \
  "${OTP_IMAGE}" \
  --load --serve

if [[ "${DETACH}" == "1" ]]; then
  echo "run-otp: started. Logs: docker logs -f ${CONTAINER_NAME}"
  echo "run-otp: stop with: docker stop ${CONTAINER_NAME} && docker rm ${CONTAINER_NAME}"
fi
