#!/usr/bin/env bash
# Deterministic OpenTripPlanner 2.9.0 graph build for BetterMTA NYC subway.
#
# Binding conventions (do not change):
#   staticVersionId = "mta-subway-" + first 12 hex of sha256(GTFS zip)
#   graphVersion    = "<staticVersionId>+otp2.9.0"
#
# Usage:
#   ./scripts/build-graph.sh [gtfs_zip] [osm_pbf]
#
# Defaults:
#   GTFS: /Users/thebiglipper/Developer/bettermta-artifacts/gtfs_subway.zip
#   OSM:  var/otp/nyc.osm.pbf (from prepare-osm.sh)
#
# JVM heap: prefers 6g when Docker MemTotal >= 7GiB; otherwise ~50% of MemTotal
# (documented in build-report.json). Container memory limit = heap + 1.5g headroom.
#
# Env:
#   OTP_IMAGE     default opentripplanner/opentripplanner:2.9.0
#   JAVA_XMX      override heap (e.g. 6g)
#   FORCE=1       rebuild even if graphVersion already exists

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OTP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VAR_DIR="${OTP_ROOT}/var/otp"
CONFIG_DIR="${OTP_ROOT}/config"

OTP_IMAGE="${OTP_IMAGE:-opentripplanner/opentripplanner:2.9.0}"
GTFS_ZIP="${1:-/Users/thebiglipper/Developer/bettermta-artifacts/gtfs_subway.zip}"
OSM_PBF="${2:-${VAR_DIR}/nyc.osm.pbf}"

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

if [[ ! -f "${GTFS_ZIP}" ]]; then
  echo "build-graph: ERROR missing GTFS: ${GTFS_ZIP}" >&2
  exit 1
fi
if [[ ! -f "${OSM_PBF}" ]]; then
  echo "build-graph: ERROR missing OSM (run prepare-osm.sh first): ${OSM_PBF}" >&2
  exit 1
fi
if [[ ! -f "${CONFIG_DIR}/build-config.json" ]]; then
  echo "build-graph: ERROR missing ${CONFIG_DIR}/build-config.json" >&2
  exit 1
fi

GTFS_SHA="$(sha256_file "${GTFS_ZIP}")"
STATIC_VERSION_ID="mta-subway-${GTFS_SHA:0:12}"
GRAPH_VERSION="${STATIC_VERSION_ID}+otp2.9.0"
OSM_SHA="$(sha256_file "${OSM_PBF}")"
BUILD_CFG_SHA="$(sha256_file "${CONFIG_DIR}/build-config.json")"

GRAPH_DIR="${VAR_DIR}/graphs/${GRAPH_VERSION}"
BUILD_DIR="${VAR_DIR}/build/${GRAPH_VERSION}"
REPORT_PATH="${BUILD_DIR}/build-report.json"

if [[ -f "${GRAPH_DIR}/graph.obj" && -f "${GRAPH_DIR}/manifest.json" && "${FORCE:-0}" != "1" ]]; then
  echo "build-graph: graph already exists at ${GRAPH_DIR}; skipping (FORCE=1 to rebuild)"
  # Still refresh active pointer
  ACTIVE_TMP="${VAR_DIR}/graphs/active.json.tmp"
  python3 - <<PY
import json
from pathlib import Path
manifest = json.loads(Path("${GRAPH_DIR}/manifest.json").read_text())
active = {
  "graphVersion": "${GRAPH_VERSION}",
  "staticVersionId": "${STATIC_VERSION_ID}",
  "graphPath": "${GRAPH_DIR}/graph.obj",
  "manifestPath": "${GRAPH_DIR}/manifest.json",
  "updatedAt": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
}
Path("${ACTIVE_TMP}").write_text(json.dumps(active, indent=2) + "\n")
Path("${ACTIVE_TMP}").replace(Path("${VAR_DIR}/graphs/active.json"))
print("build-graph: active → ${GRAPH_VERSION}")
PY
  exit 0
fi

# Heap sizing from Docker MemTotal
MEM_TOTAL="$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)"
MEM_GIB="$(python3 -c "print(round(int('${MEM_TOTAL}')/1024/1024/1024, 2) if '${MEM_TOTAL}'.isdigit() else 0)")"

if [[ -n "${JAVA_XMX:-}" ]]; then
  HEAP="${JAVA_XMX}"
elif python3 -c "import sys; sys.exit(0 if float('${MEM_GIB}') >= 11.0 else 1)"; then
  # NYC OSM+subway build needs ~8g heap in practice (6g OOMs during island prune/transfers)
  HEAP="8g"
elif python3 -c "import sys; sys.exit(0 if float('${MEM_GIB}') >= 7.0 else 1)"; then
  HEAP="6g"
else
  # ~50% of available Docker memory, minimum 2g
  HEAP="$(python3 -c "m=float('${MEM_GIB}'); h=max(2, int(m*0.5)); print(f'{h}g')")"
fi

# Container memory = heap GiB + 1.5g headroom (cgroup limit)
CONTAINER_MEM="$(python3 -c "
h='${HEAP}'.lower().rstrip('g')
print(f'{float(h)+1.5}g')
")"

echo "build-graph: staticVersionId=${STATIC_VERSION_ID}"
echo "build-graph: graphVersion=${GRAPH_VERSION}"
echo "build-graph: docker MemTotal=${MEM_GIB}GiB → JAVA_XMX=${HEAP} container --memory=${CONTAINER_MEM}"

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}" "${GRAPH_DIR}" "${VAR_DIR}/graphs"

cp "${CONFIG_DIR}/build-config.json" "${BUILD_DIR}/build-config.json"
# Do not embed live router-config into the graph; serve mounts it at runtime.
cp "${GTFS_ZIP}" "${BUILD_DIR}/gtfs_subway.zip"
cp "${OSM_PBF}" "${BUILD_DIR}/nyc.osm.pbf"

# otp-config.json: keep features default (GtfsGraphQlApi enabled)
cat > "${BUILD_DIR}/otp-config.json" <<'EOF'
{
  "otpFeatures": {
    "GtfsGraphQlApi": true,
    "ActuatorAPI": true
  }
}
EOF

START_EPOCH="$(date +%s)"
START_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
BUILD_LOG="${BUILD_DIR}/build.log"

echo "build-graph: starting OTP --build --save (this may take several minutes)"
set +e
docker run --rm \
  --name bettermta-otp-build \
  --memory="${CONTAINER_MEM}" \
  --memory-swap="${CONTAINER_MEM}" \
  -e JAVA_OPTS="-Xmx${HEAP} -Xms${HEAP}" \
  -e JAVA_TOOL_OPTIONS="-Xmx${HEAP} -Xms${HEAP}" \
  -v "${BUILD_DIR}:/var/opentripplanner" \
  "${OTP_IMAGE}" \
  --build --save --abortOnUnknownConfig \
  2>&1 | tee "${BUILD_LOG}"
BUILD_RC=${PIPESTATUS[0]}
set -e

END_EPOCH="$(date +%s)"
END_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
WALL_SECONDS=$((END_EPOCH - START_EPOCH))

if [[ ${BUILD_RC} -ne 0 ]]; then
  echo "build-graph: ERROR OTP build failed (exit ${BUILD_RC}); see ${BUILD_LOG}" >&2
  python3 - <<PY
import json
from pathlib import Path
report = {
  "ok": False,
  "graphVersion": "${GRAPH_VERSION}",
  "staticVersionId": "${STATIC_VERSION_ID}",
  "otpImage": "${OTP_IMAGE}",
  "otpVersion": "2.9.0",
  "startedAt": "${START_ISO}",
  "finishedAt": "${END_ISO}",
  "wallTimeSeconds": ${WALL_SECONDS},
  "javaXmx": "${HEAP}",
  "containerMemory": "${CONTAINER_MEM}",
  "dockerMemTotalBytes": int("${MEM_TOTAL}") if "${MEM_TOTAL}".isdigit() else None,
  "exitCode": ${BUILD_RC},
  "inputs": {
    "gtfsZip": "${GTFS_ZIP}",
    "gtfsSha256": "${GTFS_SHA}",
    "osmPbf": "${OSM_PBF}",
    "osmSha256": "${OSM_SHA}",
    "buildConfigSha256": "${BUILD_CFG_SHA}",
  },
  "buildLog": "${BUILD_LOG}",
}
Path("${REPORT_PATH}").write_text(json.dumps(report, indent=2) + "\n")
PY
  exit ${BUILD_RC}
fi

if [[ ! -f "${BUILD_DIR}/graph.obj" ]]; then
  echo "build-graph: ERROR graph.obj not produced" >&2
  exit 1
fi

GRAPH_SHA="$(sha256_file "${BUILD_DIR}/graph.obj")"
GRAPH_SIZE="$(wc -c < "${BUILD_DIR}/graph.obj" | tr -d ' ')"

# Peak memory: best-effort from docker stats if still available; else parse log
PEAK_MEM="$(rg -o 'Peak memory[^:]*:\s*[0-9.]+[^\s]*' "${BUILD_LOG}" 2>/dev/null | tail -1 || true)"
if [[ -z "${PEAK_MEM}" ]]; then
  PEAK_MEM="$(rg -i 'max memory|peak|Xmx' "${BUILD_LOG}" 2>/dev/null | tail -5 || true)"
fi

cp "${BUILD_DIR}/graph.obj" "${GRAPH_DIR}/graph.obj"
cp "${BUILD_DIR}/build-config.json" "${GRAPH_DIR}/build-config.json"
cp "${BUILD_DIR}/otp-config.json" "${GRAPH_DIR}/otp-config.json"
[[ -f "${CONFIG_DIR}/router-config.json" ]] && cp "${CONFIG_DIR}/router-config.json" "${GRAPH_DIR}/router-config.json"

python3 - <<PY
import json
from datetime import datetime, timezone
from pathlib import Path

manifest = {
  "graphVersion": "${GRAPH_VERSION}",
  "staticVersionId": "${STATIC_VERSION_ID}",
  "otpVersion": "2.9.0",
  "otpImage": "${OTP_IMAGE}",
  "graphObjSha256": "${GRAPH_SHA}",
  "graphObjSizeBytes": int("${GRAPH_SIZE}"),
  "builtAt": "${END_ISO}",
  "inputs": {
    "gtfsZip": "${GTFS_ZIP}",
    "gtfsSha256": "${GTFS_SHA}",
    "osmPbf": "${OSM_PBF}",
    "osmSha256": "${OSM_SHA}",
    "buildConfigSha256": "${BUILD_CFG_SHA}",
  },
  "bindingRule": "graphVersion = staticVersionId + '+otp2.9.0'; staticVersionId = 'mta-subway-' + sha256(gtfs)[:12]",
}
Path("${GRAPH_DIR}/manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

report = {
  "ok": True,
  "graphVersion": "${GRAPH_VERSION}",
  "staticVersionId": "${STATIC_VERSION_ID}",
  "otpImage": "${OTP_IMAGE}",
  "otpVersion": "2.9.0",
  "startedAt": "${START_ISO}",
  "finishedAt": "${END_ISO}",
  "wallTimeSeconds": ${WALL_SECONDS},
  "javaXmx": "${HEAP}",
  "containerMemory": "${CONTAINER_MEM}",
  "dockerMemTotalBytes": int("${MEM_TOTAL}") if "${MEM_TOTAL}".isdigit() else None,
  "dockerMemTotalGiB": float("${MEM_GIB}"),
  "heapRationale": "Prefer 8g when Docker MemTotal >= 11GiB (NYC OSM+subway OOMs at 6g during island prune/transfers); 6g when >= 7GiB; else ~50% MemTotal (min 2g). Container --memory = heap + 1.5g. Colima resized to 12GiB for this build.",
  "peakMemoryNote": """${PEAK_MEM}""" or None,
  "inputs": {
    "gtfsZip": "${GTFS_ZIP}",
    "gtfsSha256": "${GTFS_SHA}",
    "gtfsSizeBytes": Path("${GTFS_ZIP}").stat().st_size,
    "osmPbf": "${OSM_PBF}",
    "osmSha256": "${OSM_SHA}",
    "osmSizeBytes": Path("${OSM_PBF}").stat().st_size,
    "buildConfigSha256": "${BUILD_CFG_SHA}",
  },
  "outputs": {
    "graphObj": "${GRAPH_DIR}/graph.obj",
    "graphObjSha256": "${GRAPH_SHA}",
    "graphObjSizeBytes": int("${GRAPH_SIZE}"),
    "manifest": "${GRAPH_DIR}/manifest.json",
    "buildDir": "${BUILD_DIR}",
    "buildLog": "${BUILD_LOG}",
  },
}
Path("${REPORT_PATH}").write_text(json.dumps(report, indent=2) + "\n")

active = {
  "graphVersion": "${GRAPH_VERSION}",
  "staticVersionId": "${STATIC_VERSION_ID}",
  "graphPath": "${GRAPH_DIR}/graph.obj",
  "manifestPath": "${GRAPH_DIR}/manifest.json",
  "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
active_path = Path("${VAR_DIR}/graphs/active.json")
tmp = active_path.with_suffix(".json.tmp")
tmp.write_text(json.dumps(active, indent=2) + "\n")
tmp.replace(active_path)
print("build-graph: OK graphVersion=${GRAPH_VERSION}")
print("build-graph: graph.obj size=${GRAPH_SIZE} sha256=${GRAPH_SHA}")
print("build-graph: report ${REPORT_PATH}")
print("build-graph: active pointer → ${GRAPH_VERSION}")
PY
