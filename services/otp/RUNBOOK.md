# BetterMTA OTP 2.9.0 Runbook

Pinned image: `opentripplanner/opentripplanner:2.9.0`  
Host port: **8090** → container **8080**  
Container name: `bettermta-otp`  
Workdir: `services/otp/`

## Graph ↔ static-version binding (do not change)

```
staticVersionId = "mta-subway-" + first_12_hex(sha256(gtfs_subway.zip))
graphVersion    = "<staticVersionId>+otp2.9.0"
```

Example: GTFS sha256 `c9c3366cdd16…` → `mta-subway-c9c3366cdd16+otp2.9.0`.

Active pointer (atomic temp+rename): `var/otp/graphs/active.json`.

## Prerequisites

- Docker (this machine uses **Colima**; NYC OSM+subway graph build needs **≥ ~12 GiB** Docker memory for an **8 g** heap).
  - Checked via `docker info --format '{{.MemTotal}}'`.
  - First attempt with 6 g heap on 8 GiB Colima was **OOM-killed (exit 137)** during island prune / stop reconnect.
  - Working setup used:  
    `colima stop && colima start --memory 12 --cpu 4`  
    then `JAVA_XMX=8g` (script auto-picks 8 g when MemTotal ≥ 11 GiB).
- Artifacts:
  - GTFS: `/Users/thebiglipper/Developer/bettermta-artifacts/gtfs_subway.zip`
  - OSM: `/Users/thebiglipper/Developer/bettermta-artifacts/new-york-latest.osm.pbf` (Geofabrik NY state)
- Java is **not** required on the host; all OTP/OSM tooling runs in Docker.
- OSM crop image: brief named `osmium/osmium-tool` (unavailable); using **`iboates/osmium:latest`** (ENTRYPOINT is already `osmium`).

## Build (crop OSM → graph)

```bash
cd services/otp
chmod +x scripts/*.sh

# 1) Crop NY-state PBF → NYC bbox (-74.30,40.45,-73.65,40.95)
./scripts/prepare-osm.sh
# outputs: var/otp/nyc.osm.pbf + var/otp/osm-metadata.json

# 2) Deterministic graph build
./scripts/build-graph.sh \
  /Users/thebiglipper/Developer/bettermta-artifacts/gtfs_subway.zip \
  var/otp/nyc.osm.pbf
# outputs:
#   var/otp/build/<graphVersion>/build-report.json
#   var/otp/graphs/<graphVersion>/graph.obj + manifest.json
#   var/otp/graphs/active.json
```

### Heap / memory

| Phase | Default `JAVA_XMX` | Container `--memory` | Notes |
|-------|--------------------|----------------------|-------|
| Build | **8g** when Docker MemTotal ≥ 11 GiB; **6g** when ≥ 7 GiB; else ~50% MemTotal (min 2g) | heap + 1.5 g | Override with `JAVA_XMX=8g`. Official image uses both `JAVA_OPTS` (entrypoint) and `JAVA_TOOL_OPTIONS`. |
| Serve | **2g** | **3.5g** (`OTP_MEMORY`) | Override with `JAVA_XMX` / `OTP_MEMORY` |

## Serve / restart

```bash
# Preflight validates router-config + env-resolved updater URLs, then starts OTP
export BETTERMTA_DATA_HOST="${BETTERMTA_DATA_HOST:-host.docker.internal:8081}"
export BETTERMTA_INTERNAL_TOKEN="${BETTERMTA_INTERNAL_TOKEN:-offline-placeholder-not-a-secret}"

./scripts/run-otp.sh
# maps localhost:8090 → container 8080
# --restart unless-stopped

# Readiness (health + GraphQL serviceTimeRange + active/manifest match)
./scripts/check-ready.sh
```

Restart without rebuild:

```bash
docker restart bettermta-otp
# or full recreate:
./scripts/run-otp.sh
```

Stop:

```bash
docker stop bettermta-otp && docker rm bettermta-otp
```

Logs:

```bash
docker logs -f bettermta-otp
```

Expect: graph load messages, then Jetty on 8080. Until the data gateway is live, GTFS-RT updater poll failures are **expected** (connection refused / 401). OTP remains ready on schedule-only data.

## Rollback

Repoint `active.json` to a prior `graphVersion` and restart:

```bash
PRIOR="mta-subway-<old12>+otp2.9.0"   # must exist under var/otp/graphs/

python3 - <<PY
import json
from datetime import datetime, timezone
from pathlib import Path
root = Path("var/otp/graphs")
prior = "${PRIOR}"
manifest = json.loads((root / prior / "manifest.json").read_text())
active = {
  "graphVersion": prior,
  "staticVersionId": manifest["staticVersionId"],
  "graphPath": str(root / prior / "graph.obj"),
  "manifestPath": str(root / prior / "manifest.json"),
  "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
tmp = root / "active.json.tmp"
tmp.write_text(json.dumps(active, indent=2) + "\n")
tmp.replace(root / "active.json")
print("active →", prior)
PY

./scripts/run-otp.sh
./scripts/check-ready.sh
```

## Realtime degradation semantics

- Router config declares **nine** updaters (8× `stop-time-updater` + 1× `real-time-alerts`) polling every **30s** against  
  `http://${BETTERMTA_DATA_HOST}/internal/feeds/<feedId>` with  
  `Authorization: Bearer ${BETTERMTA_INTERNAL_TOKEN}`.
- OTP `feedId` for all updaters is **`nyct-gtfs`** (matches static GTFS `feedId` in `build-config.json`) so trip matching works; URL path segments keep the data-gateway feed ids (`nyct-gtfs-ace`, …, `camsys-subway-alerts`).
- **Headers are supported in OTP 2.9.0** (`headers` map on updaters since 2.3). No private-network-only fallback required for auth.
- When the data gateway is down: updaters fail quietly; **OTP stays UP** and continues schedule-only routing. Degradation is observable via updater logs / future data-gateway status — not via OTP readiness failing.
- Phase 5 adapter should treat schedule-only as valid when realtime is OFF, and surface degraded realtime separately.

## Config schema notes (OTP 2.9.0)

| Brief / older name | OTP 2.9.0 actual | Status |
|--------------------|------------------|--------|
| `pollingIntervalSeconds: 30` | `frequency: "30s"` (duration) | Adjusted |
| updater `headers.Authorization` | Supported since 2.3 | Used with `Bearer ${BETTERMTA_INTERNAL_TOKEN}` |
| GraphQL endpoint | `POST /otp/gtfs/v1` | Confirmed |
| Health | `GET /otp/actuators/health` | Requires `ActuatorAPI` in `otp-config.json` |
| CLI directory arg | Image entrypoint already passes `/var/opentripplanner/` | Pass only `--build --save` / `--load --serve` |
| JVM heap env | Entrypoint uses `JAVA_OPTS`; also set `JAVA_TOOL_OPTIONS` | Both set in scripts |
| OSM crop image `osmium/osmium-tool` | Unavailable on Docker Hub | Using `iboates/osmium:latest` (ENTRYPOINT=`osmium`) |

## Recorded GraphQL plans

After serve + ready, capture fixtures under `recorded/` (see `recorded/README.md`). These are Phase 5 adapter test basis with **realtime OFF**.

## Rebuild from scratch

```bash
FORCE=1 ./scripts/prepare-osm.sh
FORCE=1 ./scripts/build-graph.sh
./scripts/run-otp.sh
./scripts/check-ready.sh
```
