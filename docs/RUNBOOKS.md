# BetterMTA Runbooks

**Owner:** Infrastructure  
**Status:** Phase 8 prepared (local compose); Fly cloud **not activated**  
**Related:** `docs/SLOS.md`, `infra/observability/alerts.md`, `infra/fly/DEPLOY.md`, `docker-compose.yml`

Fly.io apps `bettermta-api`, `bettermta-web`, `bettermta-data`, `bettermta-otp` are **prepared in TOML only**. Activation is **BLOCKED** until `flyctl` auth + app creation. Phase 8 cloud status: **prepared, not activated**.

---

## Local compose bring-up

Prod-like stack at repo root (`docker-compose.yml`): `data` (+ `data-proxy` socat), `otp`, `api`, `web`.

### Prerequisites

```bash
docker info --format 'MemTotal={{.MemTotal}}'
# OTP serve needs ≳ 4 GiB Docker RAM (2g heap + overhead).
# Graph present:
ls services/otp/var/otp/graphs/active.json \
   services/otp/var/otp/graphs/*/graph.obj
# Static/realtime volumes (optional but recommended):
ls services/data/var/data/static/active.json
```

### Commands

```bash
cd /path/to/bettermta   # integration-live worktree / repo root

docker compose build
docker compose up -d

docker compose ps
docker compose logs -f api data otp web
```

Compose-only token (documented, **non-prod**): `BETTERMTA_INTERNAL_TOKEN=dev-local-token`.

Internal networking:

| From → To | URL |
|---|---|
| API → data | `http://data:8082` (socat; process binds `127.0.0.1:8081`) |
| OTP updaters → data | `http://data:8082/internal/feeds/*` |
| API → OTP | `http://otp:8080` |
| Browser → API | `http://localhost:8080` (`NEXT_PUBLIC_API_BASE_URL`) |

Host ports: web `3000`, api `8080`, data `8081` (→ proxy `:8082`), otp `8090:8080`.

### Tear down

```bash
docker compose down
```

---

## Smoke tests

### Against compose (preferred)

```bash
# Liveness / readiness
curl -fsS http://localhost:8080/health/live
curl -fsS http://localhost:8080/health/ready

# Status + lines
curl -fsS http://localhost:8080/v1/status | jq .
curl -fsS http://localhost:8080/v1/lines | jq '.lines | length'

# Route search (use live placeIds from /v1/places/search)
curl -fsS -X POST http://localhost:8080/v1/routes/search \
  -H 'content-type: application/json' \
  -d '{
    "origin": { "placeId": "st:F21" },
    "destination": { "placeId": "st:D16" },
    "timing": { "type": "depart_now" },
    "selectedLineIds": ["F"]
  }' | jq .
```

Discover place IDs:

```bash
curl -fsS 'http://localhost:8080/v1/places/search?q=Carroll' | jq .
curl -fsS 'http://localhost:8080/v1/places/search?q=Bryant' | jq .
```

Use `docker-compose` (standalone CLI) if `docker compose` plugin is unavailable.

### Phase 8 smoke results (2026-07-30)

Recorded on `agent/integration-live` after Colima restart to **12 GiB** MemTotal:

| Check | Result | Notes |
|---|---|---|
| `docker build` data/api/web/otp | **PASS** | Tags `bettermta-*:local` |
| `docker-compose up` full stack | **PASS** | data, data-proxy, otp, api, web all **healthy** |
| `GET /health/live` + `/health/ready` | **PASS** | ready `dataMode=live` |
| `GET /v1/status` | **PASS** | `dataMode=live`, static `mta-subway-c9c3366cdd16`, live RT snapshot |
| `GET /v1/lines` | **PASS** | 26 lines |
| `GET /v1/places/search` | **PASS** | `st:F21` Carroll St, `st:D16` 42 St-Bryant Pk |
| `POST /v1/routes/search` | **PARTIAL** | Endpoint reachable; returns `404 no_transit_path` for Carroll→Bryant F (OTP GraphQL plan for same OD **succeeds** — API/routing binding deferred) |
| OTP GraphQL plan (direct :8090) | **PASS** | F subway itinerary ~24m |
| Web `/` | **PASS** | HTTP 200 |
| Fly deploy | **BLOCKED** | No `flyctl`, no Fly credentials/apps — **prepared, not activated** |

Earlier attempt with Docker MemTotal ≈1.9 GiB could not host OTP (needs ~3.5 g). After Colima `--memory 12`, full stack boots.

---

## Realtime outage drill

**Goal:** Confirm API labels stale/schedule_only and does not claim live when feeds die.

### Compose / local

```bash
# Option A — stop data pollers by stopping the data service
docker compose stop data data-proxy

# Option B — block feed reachability (keep data up, deny egress)
# e.g. temporarily set an unreachable BETTERMTA_RT_BASE_URL and recreate data:
#   BETTERMTA_RT_BASE_URL=http://127.0.0.1:9 docker compose up -d data

# Watch age climb
watch -n 5 'curl -fsS http://localhost:8080/v1/status | jq .'

# Route search should still return (schedule_only / stale labeling) or
# degrade per readiness policy — never unlabeled "live".
curl -fsS -X POST http://localhost:8080/v1/routes/search \
  -H 'content-type: application/json' \
  -d @- <<'EOF'
{ "origin": { "placeId": "PLACE_ORIGIN" },
  "destination": { "placeId": "PLACE_DEST" },
  "timing": { "type": "depart_now" },
  "selectedLineIds": ["F"] }
EOF

# Recover
docker compose start data
# wait for data-proxy; recreate if needed:
docker compose up -d data data-proxy
```

### Fly (PENDING activation)

```bash
fly apps restart bettermta-data
# or scale to zero briefly (not recommended in prod) then back to 1
```

---

## OTP restart drill

```bash
# Compose
docker compose restart otp
docker compose logs -f otp
curl -fsS http://localhost:8090/otp/actuators/health

# Script-based (non-compose)
cd services/otp && ./scripts/run-otp.sh
./scripts/check-ready.sh

# Fly — PENDING
# fly apps restart bettermta-otp
```

Expect: graph reload messages, Jetty on 8080; updater poll errors until data is healthy are OK (schedule-only).

---

## Static rollback drill (repoint `active.json`)

Data static pointer: `services/data/var/data/static/active.json`  
OTP graph pointer: `services/otp/var/otp/graphs/active.json`

```bash
# OTP graph rollback (must exist under graphs/)
PRIOR="mta-subway-<old12>+otp2.9.0"
cd services/otp
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
  "graphPath": str((root / prior / "graph.obj").resolve()),
  "manifestPath": str((root / prior / "manifest.json").resolve()),
  "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
tmp = root / "active.json.tmp"
tmp.write_text(json.dumps(active, indent=2) + "\n")
tmp.replace(root / "active.json")
print("active ->", prior)
PY
docker compose restart otp   # or ./scripts/run-otp.sh

# Data static: repoint static/active.json to a prior versionId directory
# under var/data/static/versions/, then restart data:
docker compose restart data
```

Do **not** activate a partial/corrupt graph. Keep prior version until the new one validates.

---

## Deployment rollback (Fly releases) — PENDING

**Status:** Pending until Fly apps exist and first deploy succeeds (Acceptance Criteria E.4).

```bash
fly releases rollback -a bettermta-api
fly releases rollback -a bettermta-web
fly releases rollback -a bettermta-data
fly releases rollback -a bettermta-otp
```

Verify:

```bash
curl -fsS https://<api-host>/health/live
curl -fsS https://<api-host>/health/ready
curl -fsS https://<api-host>/v1/status
```

---

## Cost estimate (proposed Fly footprint)

Four always-on Machines, no Postgres, single API replica:

| App | Size | Approx $/mo |
|---|---|---|
| api | shared-cpu-1x · 1GB | ~$5–7 |
| web | shared-cpu-1x · 512MB | ~$3–5 |
| data | shared-cpu-1x · 512MB + vol | ~$3–6 |
| otp | shared-cpu-2x · 4GB + vol | ~$15–25 |
| IPv4 / egress | — | ~$2–5 |

**Ballpark: ~$30–50/mo.** OTP dominates. Confirm on current Fly pricing before launch. Managed Postgres deferred until feedback.

---

## Stale realtime

**Trigger:** `RealtimeStale` — age > 15 minutes (DATA_CONTRACT).

1. Check `/v1/status` and compare feed ages / `dataMode`.
2. Check data poller logs: `fly logs -a bettermta-data` — poll errors, 401s, parse errors.
3. Verify `MTA_GTFS_RT_API_KEY` secret still valid; rotate if provider revoked.
4. If poller dead: restart `fly apps restart bettermta-data` or rollback data release.
5. Ensure API labels results `stale` or `schedule_only` — **never** unlabeled live.
6. Optional: set `realtime_enabled=false` (flag) to force schedule_only while investigating.
7. After recovery: confirm `bettermta_realtime_age_seconds` < 90s and `/health/ready` 200.

---

## Failed static import

**Trigger:** readiness reasons include `static_dataset_missing` / import failure metrics.

1. Inspect last import: `bettermta_static_import_status`, data logs.
2. Confirm `MTA_STATIC_GTFS_URL` reachable from the data Machine.
3. Do **not** activate a partial graph; keep prior active version (data workstream activation rules).
4. If corrupt artifact: re-run import from last-known-good archive in object store.
5. If no prior version: enable `maintenance_mode` or accept `unavailable` errors; page sev-1.
6. When new version validates: activate, verify `/health/ready`, run one synthetic route search.

---

## Elevated routing latency

**Trigger:** `ApiSearchP95High` (p95 > 2s) or search timeouts.

1. Confirm scope: `/v1/routes/search` only vs whole API.
2. Check cache hit rate (`bettermta_cache_requests_total`); warm miss storm → inspect Redis.
3. Check routing service CPU / timeouts; look for candidate explosion.
4. Mitigations (flags): lower `result_count` toward 1; set `candidate_strategy=baseline_only`; disable `constraints_enabled` if constrained path is hot.
5. If single bad deploy: **rollback API** (`fly releases rollback -a bettermta-api`).
6. Capture `requestId`s for failing slow traces; file routing issue with snapshot IDs.

---

## Invalid route reports

**Trigger:** User feedback / QA that itineraries are impossible or violate selected-line honesty.

1. Collect `requestId`, timestamp, origin/destination IDs (not precise coordinates), `selectedLineIds`, `dataMode`, static+realtime snapshot IDs from response metadata.
2. Reproduce against same snapshot if retained; else mark unreproducible.
3. If ranking bug: route to routing workstream with fixture proposal — do not hot-patch contracts.
4. If stale/wrong feeds: treat as data issue; consider `realtime_enabled=false`.
5. If widespread: `maintenance_mode=true` until fix+rollback decision.

---

## Broken frontend deploy

**Trigger:** `FrontendCrashSpike` or blank/error UI in production.

1. Confirm release version in error tracker vs `fly releases -a bettermta-web`.
2. **One-action rollback:** `fly releases rollback -a bettermta-web`.
3. Verify `https://<web-host>/` loads and can call API (CORS / `NEXT_PUBLIC_API_BASE_URL`).
4. If API contract mismatch: rollback web and/or api to last known compatible pair.
5. Block auto-deploys until fix merges; add regression test in frontend/QA.

---

## Rollback

**Trigger:** Bad deploy, readiness fail after release, sev-1 regression.

### One-action commands

```bash
fly releases rollback -a bettermta-api
fly releases rollback -a bettermta-web
fly releases rollback -a bettermta-data
```

### Verify

```bash
curl -fsS https://<api-host>/health/live
curl -fsS https://<api-host>/health/ready
curl -fsS https://<api-host>/v1/status
```

### Notes

- Prefer rolling back the **single** offending app first.
- Document the rollback in the incident channel with from→to release IDs.
- Acceptance Criteria E.4 requires this procedure tested at least once before public beta — see **Launch checklist** below (**post-first-deploy rollback drill: Pending**).

---

## Experiment regression

**Trigger:** Metric/UX regression after flag or `candidate_strategy` change.

1. Identify change: flag JSON, env override, or routing build.
2. Safe disable: set `candidate_strategy=default` or `baseline_only`; restore `explanation_variant=standard`; restore `result_count` default.
3. If code deploy: rollback the owning service.
4. Leave experiment assignment logging intact for postmortem; do not destroy analytics.
5. Re-open experiment only after benchmark/QA gate passes.

---

## Backup, restore, and retention

MVP-proportionate. Prefer managed snapshots over custom backup daemons.

### Postgres (when provisioned)

- **Daily snapshot:** enable provider daily automated backups (Fly Managed Postgres or volume snapshots if self-managed).
- **Restore:** create a new Postgres from the chosen snapshot; point `DATABASE_URL` at the restored instance; restart api; verify `/health/ready` and one write/read of feedback if that feature is live.
- **Retention:** keep **7 daily** snapshots for beta (extend only if feedback/support needs longer).
- **Note:** Prefer deferring Postgres creation until the feedback feature ships — anonymous search does not require it.

### Object-storage GTFS snapshot archives

- Retain **static GTFS version archives** used for active + prior graphs so imports and invalid-route reports stay reproducible.
- **Retention window:** keep at least the **last 14 days** of activated static versions (and any version referenced by open incident tickets) in object storage; prune older unmarked archives monthly.
- Realtime snapshots: retain short-lived copies only as needed for debugging (e.g. **24–72h**); not a long-term backup store.

### Redis / cache

- **Ephemeral / rebuildable** — do not back up Redis or Upstash cache.
- On loss: restart api/data consumers; accept cold-cache latency until warm; verify `bettermta_cache_requests_total` recovers.
- Never store sole copies of GTFS graphs or user data only in cache.

---

## Launch checklist (ops)

Track Acceptance Criteria E.4 and related go/no-go items:

| Item | Status |
|---|---|
| Post-first-deploy rollback drill (E.4): after first successful api/web deploy, run `fly releases rollback` once per app and verify `/health/live` + `/health/ready` | **Pending** — Fly not activated |
| Deploy workflow wired (Dockerfiles + flyctl steps) | **Prepared** — still `workflow_dispatch` + `ACTIVATE` guard; needs `FLY_API_TOKEN` |
| Local compose Dockerfiles | **Prepared** — `docker-compose.yml` + images |
| Alerts bound to a manager + Slack webhook | **Pending** |
| Postgres provisioned only when feedback feature needs it | **Deferred** (recommended) |
| Data bind `0.0.0.0` for private networking | **Deferred** — compose uses socat sidecar |

---

## Quick reference — flags

See `infra/flags/flags.json`. Emergency product off switch: `maintenance_mode=true`.
