#!/usr/bin/env bash
# Stage active graph + BetterMTA router-config, then exec OTP --load --serve.
set -euo pipefail

GRAPHS_DIR="${OTP_GRAPHS_DIR:-/otp-graphs}"
LOAD_DIR="${OTP_LOAD_DIR:-/var/opentripplanner}"
CONFIG_DIR="${OTP_CONFIG_DIR:-/otp-config}"
ACTIVE_JSON="${GRAPHS_DIR}/active.json"
JAVA_XMX="${JAVA_XMX:-2g}"

if [[ ! -f "${ACTIVE_JSON}" ]]; then
  echo "bettermta-otp: ERROR missing ${ACTIVE_JSON}" >&2
  echo "bettermta-otp: mount services/otp/var/otp/graphs → ${GRAPHS_DIR}" >&2
  exit 1
fi

# Avoid python dependency in the thin image; active.json is simple JSON.
GRAPH_VERSION="$(
  awk -F'"' '/"graphVersion"/ { print $4; exit }' "${ACTIVE_JSON}"
)"
if [[ -z "${GRAPH_VERSION}" ]]; then
  echo "bettermta-otp: ERROR could not parse graphVersion from ${ACTIVE_JSON}" >&2
  exit 1
fi

GRAPH_OBJ="${GRAPHS_DIR}/${GRAPH_VERSION}/graph.obj"
if [[ ! -f "${GRAPH_OBJ}" ]]; then
  echo "bettermta-otp: ERROR missing ${GRAPH_OBJ}" >&2
  exit 1
fi

mkdir -p "${LOAD_DIR}"
cp -f "${GRAPH_OBJ}" "${LOAD_DIR}/graph.obj"
cp -f "${CONFIG_DIR}/router-config.json" "${LOAD_DIR}/router-config.json"

if [[ -f "${GRAPHS_DIR}/${GRAPH_VERSION}/otp-config.json" ]]; then
  cp -f "${GRAPHS_DIR}/${GRAPH_VERSION}/otp-config.json" "${LOAD_DIR}/otp-config.json"
else
  cat > "${LOAD_DIR}/otp-config.json" <<'EOF'
{
  "otpFeatures": {
    "GtfsGraphQlApi": true,
    "ActuatorAPI": true
  }
}
EOF
fi

cp -f "${CONFIG_DIR}/build-config.json" "${LOAD_DIR}/build-config.json" || true

export JAVA_OPTS="${JAVA_OPTS:--Xmx${JAVA_XMX} -Xms512m}"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--Xmx${JAVA_XMX} -Xms512m}"

echo "bettermta-otp: graphVersion=${GRAPH_VERSION}"
echo "bettermta-otp: BETTERMTA_DATA_HOST=${BETTERMTA_DATA_HOST:-unset}"
echo "bettermta-otp: load dir=${LOAD_DIR} JAVA_XMX=${JAVA_XMX}"

exec /docker-entrypoint.sh --load --serve
