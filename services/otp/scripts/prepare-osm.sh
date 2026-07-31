#!/usr/bin/env bash
# Crop Geofabrik NY-state OSM PBF to the NYC metro bbox using osmium in Docker.
#
# Bbox choice (WGS84, lon/lat): -74.30,40.45,-73.65,40.95
#   West  -74.30  — covers Staten Island / Newark Bay fringe for transfers
#   South  40.45  — south of Rockaways / Coney Island
#   East  -73.65  — eastern Queens / Nassau fringe (JFK approach)
#   North  40.95  — north of Van Cortlandt / Yonkers fringe
# This is intentionally larger than the five boroughs so subway termini and
# walk-access streets near the edges remain connected.
#
# Idempotent: skips crop when var/otp/nyc.osm.pbf exists and its sha256 matches
# osm-metadata.json. Re-run with FORCE=1 to rebuild.
#
# Env:
#   NY_OSM_PBF   path to Geofabrik new-york-latest.osm.pbf (required unless skip)
#   OSM_SOURCE_URL  recorded source URL (default Geofabrik NY state)
#   OSMIUM_IMAGE    docker image with osmium (default: iboates/osmium:latest)
#   FORCE=1         force re-crop

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OTP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VAR_DIR="${OTP_ROOT}/var/otp"
OUT_PBF="${VAR_DIR}/nyc.osm.pbf"
META_JSON="${VAR_DIR}/osm-metadata.json"

BBOX="-74.30,40.45,-73.65,40.95"
OSMIUM_IMAGE="${OSMIUM_IMAGE:-iboates/osmium:latest}"
OSM_SOURCE_URL="${OSM_SOURCE_URL:-https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf}"
NY_OSM_PBF="${NY_OSM_PBF:-/Users/thebiglipper/Developer/bettermta-artifacts/new-york-latest.osm.pbf}"

mkdir -p "${VAR_DIR}"

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

if [[ -f "${OUT_PBF}" && -f "${META_JSON}" && "${FORCE:-0}" != "1" ]]; then
  recorded="$(python3 -c "import json; print(json.load(open('${META_JSON}'))['sha256'])")"
  actual="$(sha256_file "${OUT_PBF}")"
  if [[ "${recorded}" == "${actual}" ]]; then
    echo "prepare-osm: skip — ${OUT_PBF} exists with matching checksum ${actual}"
    exit 0
  fi
  echo "prepare-osm: checksum mismatch (recorded=${recorded} actual=${actual}); re-cropping"
fi

if [[ ! -f "${NY_OSM_PBF}" ]]; then
  echo "prepare-osm: ERROR missing source PBF: ${NY_OSM_PBF}" >&2
  exit 1
fi

if ! docker image inspect "${OSMIUM_IMAGE}" >/dev/null 2>&1; then
  echo "prepare-osm: pulling ${OSMIUM_IMAGE}"
  docker pull "${OSMIUM_IMAGE}"
fi

SRC_DIR="$(cd "$(dirname "${NY_OSM_PBF}")" && pwd)"
SRC_BASE="$(basename "${NY_OSM_PBF}")"
# Must end in .osm.pbf so osmium detects PBF format (not .tmp).
TMP_OUT="${VAR_DIR}/nyc.partial.osm.pbf"

echo "prepare-osm: cropping ${NY_OSM_PBF} → ${OUT_PBF}"
echo "prepare-osm: bbox=${BBOX} (NYC metro; see script header for rationale)"

rm -f "${TMP_OUT}"
# Image ENTRYPOINT is already `osmium`, so pass subcommand only.
docker run --rm \
  -v "${SRC_DIR}:/data:ro" \
  -v "${VAR_DIR}:/out" \
  "${OSMIUM_IMAGE}" \
  extract -b "${BBOX}" -o /out/nyc.partial.osm.pbf --overwrite --output-format=pbf "/data/${SRC_BASE}"

mv "${TMP_OUT}" "${OUT_PBF}"
CHECKSUM="$(sha256_file "${OUT_PBF}")"
SIZE_BYTES="$(wc -c < "${OUT_PBF}" | tr -d ' ')"
SOURCE_SHA="$(sha256_file "${NY_OSM_PBF}")"
CROPPED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

python3 - <<PY
import json
meta = {
  "bbox": "${BBOX}",
  "bboxRationale": "NYC metro covering five boroughs plus fringe termini (SI/Rockaways/VC Park/JFK approach)",
  "sourceUrl": "${OSM_SOURCE_URL}",
  "sourcePath": "${NY_OSM_PBF}",
  "sourceSha256": "${SOURCE_SHA}",
  "outputPath": "${OUT_PBF}",
  "sha256": "${CHECKSUM}",
  "sizeBytes": int("${SIZE_BYTES}"),
  "croppedAt": "${CROPPED_AT}",
  "osmiumImage": "${OSMIUM_IMAGE}",
  "note": "User brief named osmium/osmium-tool; that repo is unavailable — using ${OSMIUM_IMAGE}",
}
with open("${META_JSON}", "w") as f:
    json.dump(meta, f, indent=2)
    f.write("\n")
print("prepare-osm: wrote", "${META_JSON}")
print("prepare-osm: nyc.osm.pbf sha256=${CHECKSUM} size=${SIZE_BYTES}")
PY
