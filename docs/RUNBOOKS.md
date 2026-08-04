# BetterMTA Runbooks

**Owner:** Infrastructure (+ Integration Phase 11 inventory)  
**Status:** Local compose live path proven (Phases 8–10); Phase 12A local edge + 12A.13 remediations in place; controlled alpha **BLOCKED** (remote gates pending); Fly cloud **not activated**  
**Related:** `docs/SLOS.md`, `docs/RELEASE_GATE_REPORT.md`, `docs/alpha/REMOTE_VALIDATION.md`, `infra/observability/alerts.md`, `infra/fly/DEPLOY.md`, `docker-compose.yml`, `.agents/handoffs/integration-live.md`

Fly.io apps `bettermta-api`, `bettermta-web`, `bettermta-data`, `bettermta-otp` are **prepared in TOML only**. Activation is **BLOCKED** until `flyctl` auth + app creation. Phase 11 go/no-go: **`BLOCKED`** (not ready for Fly private/public beta). Phase 12A controlled alpha: final status **`BLOCKED`** — **not** `READY_FOR_CONTROLLED_ALPHA` until remote gates pass (ADR-0021).

---

## Controlled alpha (Phase 12A) — pointer

**Deploy decision:** ADR-0021 — self-hosted macOS + Docker Compose origin; Cloudflare Tunnel transport; Cloudflare Access auth; **no** router port forwarding.

**Edge origin (12A.3–12A.4):** loopback Caddy at `http://127.0.0.1:8088` — see `infra/alpha/README.md` (restart policies, health deps, start/stop scripts).

**Host / Tunnel / Access (12A.5–12A.7):** docs only + read-only preflight in-repo; interactive Cloudflare setup is operator-owned and stays outside Git.

| Doc | Phase |
|---|---|
| `infra/alpha/HOST.md` | 12A.5 macOS operating requirements |
| `infra/alpha/TUNNEL.md` | 12A.6 named Cloudflare Tunnel |
| `infra/alpha/ACCESS.md` | 12A.7 Access allowlist + OTP + service token |
| `deployments/README.md` | 12A.8 release IDs + deploy/rollback |
| `infra/alpha/scripts/monitor-alpha.sh` | 12A.9 external / dogfood health monitor |
| `.github/workflows/alpha-monitor.yml` | 12A.9 scheduled monitor (disabled until configured) |
| `infra/alpha/cloudflared/config.template.yml` | placeholders only |
| `docs/alpha/REMOTE_VALIDATION.md` | 12A.10 twenty remote tests — all PENDING_USER / not run |
| `docs/alpha/RELIABILITY_DRILLS.md` | 12A.11 local drills (PARTIAL; some PENDING_USER) |
| `docs/alpha/PERFORMANCE.md` | 12A.12 local latency sample (not G15) |

```bash
./infra/alpha/scripts/preflight-host.sh   # read-only host/Docker/tunnel/health
./infra/alpha/scripts/start-alpha.sh      # compose up + wait ready + smoke
./infra/alpha/scripts/stop-alpha.sh       # compose down (no -v; volumes kept)
# Smoke only: ./infra/alpha/scripts/smoke-edge.sh
# External / dogfood monitor (12A.9):
MONITOR_MODE=local ./infra/alpha/scripts/monitor-alpha.sh
# Release / rollback (image tags — not source re-edit):
./deployments/scripts/deploy-release.sh --retag-only
./deployments/scripts/rollback-release.sh
```

Alpha override: no host publish for data/OTP; api/web debug binds are `127.0.0.1` only; web bakes same-origin API (`NEXT_PUBLIC_API_BASE_URL=""`); long-running services `restart: unless-stopped`; API alpha healthcheck uses `/health/ready`. Named tunnel + Access must be completed interactively (`TUNNEL.md` / `ACCESS.md`) before remote gates pass.

### External monitor (12A.9)

Probes public app `/`, `/health/live`, `/health/ready`, `/v1/status`, one bounded
Carroll→Bryant F route search (`placeId` only), static coherence, and `dataMode`.
Uses Cloudflare Access service token headers when remote.

| Secret / var (names only) | Where |
|---|---|
| `ALPHA_PUBLIC_BASE_URL` | shell or GitHub Actions secret |
| `CF_ACCESS_CLIENT_ID` | shell or GitHub Actions secret |
| `CF_ACCESS_CLIENT_SECRET` | shell or GitHub Actions secret |
| `ALPHA_MONITOR_ENABLED=true` | GitHub Actions repository **variable** (enable schedule) |

```bash
# Local dogfood (loopback edge, no Access):
MONITOR_MODE=local ./infra/alpha/scripts/monitor-alpha.sh

# Remote (from another machine or CI), after Tunnel + Access exist:
export ALPHA_PUBLIC_BASE_URL="https://<ALPHA_HOSTNAME>"
export CF_ACCESS_CLIENT_ID="…"
export CF_ACCESS_CLIENT_SECRET="…"
MONITOR_MODE=remote ./infra/alpha/scripts/monitor-alpha.sh
```

**Alerts:** failed GitHub Actions `alpha-monitor` runs notify watchers via GitHub’s
notification/email settings. Optional later webhook: secret `MONITOR_WEBHOOK_URL`
(reserved). Soft-skip when secrets/vars missing so contributor CI stays green.
Do not ship coordinates, tester identities, or route history to analytics vendors.
Gate **CA09** remains PENDING until remote secrets are configured and a run passes.

- Local origin (dev ports): this doc § Local compose bring-up  
- Alpha index: `infra/alpha/README.md`  
- Host / Tunnel / Access: `infra/alpha/HOST.md`, `TUNNEL.md`, `ACCESS.md`  
- Gates / status: `docs/RELEASE_GATE_REPORT.md` (CA01–CA09 + vocabulary)  
- Risks: `docs/RISK_REGISTER.md` R19–R23  
- Do not commit secrets, tunnel UUIDs, hostnames, or tester emails  

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

Prefer the Compose V2 plugin when available; otherwise use the standalone CLI (common on Colima/Homebrew):

```bash
cd /path/to/bettermta   # integration-live worktree / repo root

# Plugin form:
docker compose build && docker compose up -d
# Standalone form (if `docker compose` is unknown):
docker-compose build && docker-compose up -d

docker-compose ps
docker-compose logs -f api data otp web
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
docker-compose down
# or: docker compose down
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

### Health-check inventory (actual)

| Endpoint | Expected | Notes |
|---|---|---|
| `GET http://localhost:8080/health/live` | 200 | API process up |
| `GET http://localhost:8080/health/ready` | 200 when data+OTP adapters ready | Reflects graph pin / data mode |
| `GET http://localhost:8080/v1/status` | JSON with `dataMode`, static + RT versions | Never unlabeled live when stale |
| `GET http://localhost:8090/otp/actuators/health` | OTP actuator | Direct OTP container |
| Web `http://localhost:3000/` | 200 | `NEXT_PUBLIC_API_BASE_URL` → `:8080` |

### Phase 8–9 smoke results (2026-07-30)

Recorded on `agent/integration-live` after Colima restart to **12 GiB** MemTotal. Phase 8 had a Carroll→Bryant API miss; **Phase 9 live smoke fixed the end-to-end path** (feed-prefixed route IDs + graph version match + later Phase 10 NY TZ / timeout remediations).

| Check | Result | Notes |
|---|---|---|
| `docker build` data/api/web/otp | **PASS** | Tags `bettermta-*:local` |
| `docker-compose up` full stack | **PASS** | data, data-proxy, otp, api, web all **healthy** |
| `GET /health/live` + `/health/ready` | **PASS** | ready with honest data mode |
| `GET /v1/status` | **PASS** | static `mta-subway-c9c3366cdd16`; RT snapshot present |
| `GET /v1/lines` | **PASS** | 26 lines |
| `GET /v1/places/search` | **PASS** | `st:F21` Carroll St, `st:D16` 42 St-Bryant Pk |
| `POST /v1/routes/search` Carroll→Bryant F | **PASS** (Phase 9) | Live smoke ~2107 ms; complete/stale; see `benchmarks/reports/live-shadow-2026-07-30T19-22-40-758Z.txt` |
| OTP GraphQL plan (direct :8090) | **PASS** | F subway itinerary |
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

## Deployment rollback (recorded Fly images) — PENDING

**Status:** Pending until Fly apps exist and first deploy succeeds (Acceptance Criteria E.4).
Current Fly guidance has no special rollback command: redeploy the exact prior
image. BetterMTA records the compatible four-service set before mutation and
rolls it back in dependency order. See the
[official Fly rollback guide](https://fly.io/docs/blueprints/rollback-guide/).

```bash
./infra/fly/scripts/capture-rollback-manifest.sh \
  --output infra/fly/manifests/pre-deploy-CHANGE_ID.json

# Validate the rollback set without changing external state.
./infra/fly/scripts/rollback-private-beta.sh \
  --manifest infra/fly/manifests/pre-deploy-CHANGE_ID.json

# Only after owner approval, with both origins supplied privately:
BETTERMTA_API_BASE_URL='https://<api-host>' \
BETTERMTA_WEB_BASE_URL='https://<web-host>' \
./infra/fly/scripts/rollback-private-beta.sh \
  --manifest infra/fly/manifests/pre-deploy-CHANGE_ID.json \
  --execute
```

The manifest is gitignored and must be retained in an access-controlled evidence
store. Image rollback does not revert secrets, volumes, or Fly configuration. A
mid-sequence failure can leave a mixed set; stop and inspect all four apps.

Verify:

```bash
curl -fsS https://<api-host>/health/live
curl -fsS https://<api-host>/health/ready
curl -fsS https://<api-host>/v1/status
```

---

## Cost estimate (proposed Fly footprint)

Four always-on Machines, no Postgres, **API exactly 1 replica** (in-memory rate limiter — do not scale API >1 until a shared store exists):

| App | Size | Approx $/mo |
|---|---|---|
| api | shared-cpu-1x · 1GB | ~$5–7 |
| web | shared-cpu-1x · 512MB | ~$3–5 |
| data | shared-cpu-1x · 512MB + vol | ~$3–6 |
| otp | shared-cpu-2x · 4GB + vol | ~$15–25 |
| IPv4 / egress | — | ~$2–5 |

**Ballpark: ~$30–50/mo** (Phase 11 confirmation; aligns with ADR-0005 proposal ≈ $25–45/mo). OTP dominates. Confirm on current Fly pricing before launch. Managed Postgres deferred until feedback (≈ $55–85/mo if added). Local compose cost is host/Colima only.

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
5. If a bad deploy is implicated: run the guarded four-service image rollback with the recorded pre-deploy manifest; do not roll back API alone.
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
2. **One-action rollback:** run `infra/fly/scripts/rollback-private-beta.sh` with the recorded pre-deploy manifest so web/API/data/OTP stay compatible.
3. Verify `https://<web-host>/` loads and can call API (CORS / `NEXT_PUBLIC_API_BASE_URL`).
4. If API contract mismatch: rollback web and/or api to last known compatible pair.
5. Block auto-deploys until fix merges; add regression test in frontend/QA.

---

## Rollback

**Trigger:** Bad deploy, readiness fail after release, sev-1 regression.

### One-action command

```bash
BETTERMTA_API_BASE_URL='https://<api-host>' \
BETTERMTA_WEB_BASE_URL='https://<web-host>' \
./infra/fly/scripts/rollback-private-beta.sh \
  --manifest infra/fly/manifests/pre-deploy-CHANGE_ID.json \
  --execute
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
| Post-first-deploy rollback drill (E.4): retain two known-good four-image sets, execute `rollback-private-beta.sh` against the recorded prior manifest, verify public health/readiness, then restore the candidate | **Pending** — Fly not activated |
| Deploy workflow wired (Dockerfiles + flyctl steps) | **Prepared** — still `workflow_dispatch` + `ACTIVATE` guard; needs `FLY_API_TOKEN` |
| Local compose Dockerfiles | **Prepared** — `docker-compose.yml` + images |
| Alerts bound to a manager + Slack webhook | **Pending** |
| Postgres provisioned only when feedback feature needs it | **Deferred** (recommended) |
| Data bind `0.0.0.0` for private networking | **Prepared** — `BETTERMTA_DATA_BIND_HOST` (default `127.0.0.1` + compose socat; Fly toml sets `0.0.0.0`) |
| Web bake-time `NEXT_PUBLIC_API_BASE_URL` | **Prepared** — deploy.yml requires non-localhost `public_api_base_url`; see `infra/fly/DEPLOY.md` |
| OTP Fly build context `services/otp` | **Prepared** — `fly deploy services/otp -c ../infra/fly/otp.fly.toml` |

---

## Phase 11 / 12A go/no-go (release gates)

**Final status:** `BLOCKED` — see `docs/RELEASE_GATE_REPORT.md` and `.agents/handoffs/integration-live.md`.  
**Not** `READY_FOR_CONTROLLED_ALPHA` (CA03–CA05/CA09 PENDING; CA08/CA10 PARTIAL; Access env unset; approved/denied login not evidenced; distinct-digest disk-blocked; origin self-hosted macOS). **Not** Fly private/public beta.

| Track | Verdict |
|---|---|
| Local compose (data+OTP+API+web) + fixture CI gates | Proven; Critical Phase 10 remediations landed |
| Controlled alpha (ADR-0021: Tunnel + Access + compose) | **BLOCKED** — edge local (CA02); 12A.13 local reviews PASS / High fixed; Tunnel / Access / remote smoke + 20 remote tests pending; CA09 secrets pending |
| Fly private beta (intended cloud cohort) | **BLOCKED** — no `flyctl`/creds/apps, no domain/TLS, no rollback drill |
| Public beta | **BLOCKED** (same + a11y/p95/Google non-claim) |

Regenerate machine checklist:

```bash
npm --prefix benchmarks/runner run gate
# → benchmarks/reports/release-gate-latest.md (G01–G20)
```

Rollback pointers: this doc § Deployment rollback / § Rollback; `infra/fly/DEPLOY.md` (Fly pending activation).

---

## Quick reference — flags

See `infra/flags/flags.json`. Emergency product off switch: `maintenance_mode=true`.

---

## Place/geocode & candidate-coverage privacy (Wave 1D)

**Related:** ADR-0022, API_CONTRACT §11, `infra/observability/log-fields.md`, `infra/observability/metrics.md`, R10/R25.

### What must never appear in default logs/analytics

- Raw place-search `q` / street address / POI free text
- Precise proximity or OD coordinates
- Raw `providerPlaceId` / vendor payloads
- Preferred-line ID lists in operational metrics (use counts/buckets)

### Safe substitutes already emitted by API

| Signal | Where |
|---|---|
| `queryLength`, `proximityGrid`, `proximityProvided` | `places_ok` logs |
| `selectedLineCount`, PrivacySafe OD refs (`placeId` / `stationId` / `coarseGrid`) | `route_search_ok` logs |
| `bettermta_place_provider_*`, `bettermta_candidate_*`, `bettermta_preference_coverage_total` | in-process `PrivacySafeMetrics` |

### Suspected privacy leak

1. Grep recent API logs for `places_ok` / `route_search_ok` — confirm no decimal coords beyond 2 places and no address substrings.
2. Confirm geocode flag-off path still station-index only until attribution + privacy checklist pass.
3. Do **not** enable durable retention of precise pins without a reviewed transport (ADR-0017 family).
4. Regression: `npm --prefix apps/api test -- test/privacy.test.ts`.

### Hooks for other waves

| Wave | Call |
|---|---|
| Places / geocode adapter | `coarseGridId`, `PrivacySafeMetrics.recordPlaceProvider` |
| Routing candidate orchestration | `PrivacySafeMetrics.recordCandidateCoverage` / `recordPreferenceCoverage` (or API `recordRouteSearchPrivacySignals`) |

---

## Geocoder provider outage

**Trigger:** `GeocoderFailureSpike`, repeated bounded `place_provider_error` events, or address/POI results consistently falling back to station-only results.

1. Confirm the API and station-index path are healthy with `/health/ready` and a known station query. Do not paste a rider address into logs or tickets.
2. Inspect the authenticated `/internal/metrics` counters for `provider="geocoder"`; use only aggregate result/reason labels.
3. If failures persist, set the server-side `address_poi_enabled` flag false (for example `BETTERMTA_ADDRESS_POI_ENABLED=false`) and restart or roll forward the API through the normal release procedure. This preserves station search while disabling geocoder calls.
4. Verify a station query still succeeds and the geocoder attempt counter stops increasing. Keep the web address flag off for the current controlled alpha unless a separate go/no-go authorizes it.
5. If the outage began with a release, use the documented immutable rollback. Do not hot-swap vendors or enable precise-coordinate retention during incident response.
6. Re-enable only after provider health, attribution, privacy tests, and the flag-on smoke corpus pass. Record the incident window and aggregate counts, never raw queries or coordinates.

Exporter note: `/internal/metrics` exists only when `BETTERMTA_METRICS_TOKEN` is configured and requires its bearer token. If no scrape backend is active, use the privacy-safe structured logs and leave alert status explicitly “not loaded.”
