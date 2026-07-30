# BetterMTA Data Spec

**Owner:** Data workstream (`agent/data`)  
**Primary contract:** `docs/DATA_CONTRACT.md` (conductor-owned; read-only here)  
**Package:** `services/data/`  
**Status:** Initial implementation against locked contract `2026-07-30`

This document is the authoritative inventory of MTA sources, licensing, refresh cadences, and how each `DATA_CONTRACT` requirement is met. Do not scrape undocumented sources when supported feeds exist.

---

## 1. Source inventory

### 1.1 Static subway GTFS

| Field | Value |
|---|---|
| Source | MTA New York City Transit subway static GTFS |
| Canonical download (production default) | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip` |
| Legacy / portal mirror | `http://web.mta.info/developers/data/nyct/subway/google_transit.zip` |
| Developer portal | https://new.mta.info/developers |
| Format | GTFS zip (`agency`, `stops`, `routes`, `trips`, `stop_times`, optional `transfers`, `calendar` and/or `calendar_dates`, plus optional `shapes`, etc.) |
| Product use | Versioned static dataset for routing + `lineId` mapping |
| Fixture stand-in | `services/data/fixtures/static/valid/` (deterministic subset; labeled synthetic; **never** used in production) |

Required tables for the production pipeline: `agency.txt`, `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`, plus `calendar.txt` and/or `calendar_dates.txt`. `transfers.txt` is optional (empty stub synthesized when absent).

Override the download URL with `BETTERMTA_STATIC_GTFS_URL`. Re-verify the mirror before ops cutover (MTA relocates hosts occasionally).


### 1.2 GTFS-Realtime — trip updates (by trunk)

Production uses **protobuf** GTFS-RT via the live feed gateway (`services/data/src/realtime-live/`). Recorded fixtures use a JSON representation of the same entity shapes for offline deterministic tests, plus captured `.pb` bytes under `fixtures/realtime-pb/captured/`.

**Base URL:** `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/`  
**Access:** anonymous (no API key) as of 2026-07-30.

| Feed ID (BINDING) | Trunk | Full URL |
|---|---|---|
| `nyct-gtfs` | 1–7 + GS | `…/nyct%2Fgtfs` |
| `nyct-gtfs-ace` | A, C, E, H, FS | `…/nyct%2Fgtfs-ace` |
| `nyct-gtfs-bdfm` | B, D, F, M, FX | `…/nyct%2Fgtfs-bdfm` |
| `nyct-gtfs-g` | G | `…/nyct%2Fgtfs-g` |
| `nyct-gtfs-jz` | J, Z | `…/nyct%2Fgtfs-jz` |
| `nyct-gtfs-nqrw` | N, Q, R, W | `…/nyct%2Fgtfs-nqrw` |
| `nyct-gtfs-l` | L | `…/nyct%2Fgtfs-l` |
| `nyct-gtfs-si` | SIR | `…/nyct%2Fgtfs-si` |

Notes:

- Internal `feedId` values are **BINDING** — OTP updater URLs use `/internal/feeds/<feedId>` with these ids.
- The ACE feed also carries **H** and **FS**. **GS** is on `nyct-gtfs`.
- Override base with `BETTERMTA_RT_BASE_URL` if needed.

### 1.3 GTFS-Realtime — service alerts

| Field | Value |
|---|---|
| Feed ID (BINDING) | `camsys-subway-alerts` |
| Full URL | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts` |
| Mode computation | **Optional** — included in snapshots when present; does not drive overall `dataMode` |
| Normalized to | `ServiceAlert` (header, description, severity, affected line/stop/trip IDs) |

### 1.4 Station metadata

| Field | Value |
|---|---|
| Primary | Static GTFS `stops.txt` parent/child hierarchy (`location_type`, `parent_station`) |
| Complexes | Derived from parent stations / transfers when present in static GTFS; no undocumented scrape |
| Accessibility / elevator outages | Deferred until authoritative feed wiring is confirmed (see deferred) |

### 1.5 Explicitly out of scope for scraping

- Unofficial station APIs, HTML scrape of mta.info service status pages, third-party mirrors without license clarity.
- Fabricating vehicle positions when unused.

---

## 2. Licensing and attribution

MTA developer data is provided under MTA’s developer terms / open data terms. BetterMTA must:

1. Retain required attribution language in product UI (frontend owns display; data owns the text inventory).
2. Not present MTA data as originating from BetterMTA.
3. Not claim endorsement by MTA.
4. Cache/refresh within documented use; do not republish raw feeds as a competing open-data portal.

**Suggested attribution copy (for UI footer):**

> Subway schedule and realtime data provided by the Metropolitan Transportation Authority (MTA). BetterMTA is not affiliated with or endorsed by the MTA.

Exact legal text should be confirmed against the current MTA developer terms before public beta. Risk: R12 in `RISK_REGISTER.md`.

---

## 3. Refresh cadences

| Dataset | Cadence | Notes |
|---|---|---|
| Static GTFS | Daily check; activate only after validation | Keep previous version for rollback |
| Realtime trip updates | Poll each trunk feed every **30s** default (`BETTERMTA_RT_POLL_MS`); per-feed overrides via `BETTERMTA_RT_POLL_MS_BY_FEED` | Live max age 90s; timeout 10s; max 5MB; 2 retries w/ exponential backoff + jitter |
| Service alerts | Same poller loop (optional for mode) | Attach to snapshot when present |
| Last-known-good retention | ≥ 30 minutes | After that, drop to schedule-only |
| Snapshot manifests | Retain last **20**, expire **30 min** | Queryable via `/internal/manifests` |

Unit tests use recorded fixtures / captured `.pb` only (no network). Env-gated live cycle: `BETTERMTA_LIVE_RT=true npm test`.

---

## 3.1 Live GTFS-Realtime gateway

Module: `services/data/src/realtime-live/`. Entrypoint: `src/main.ts` (`npm run build && npm start` → `node dist/main.js`).

### Dependency + proto provenance

| Item | Choice |
|---|---|
| Library | **protobufjs** (runtime `.proto` load) — **not** `gtfs-realtime-bindings` |
| Why | NYCT extensions (`NyctFeedHeader` / `trip_replacement_period`, `NyctTripDescriptor`, `NyctStopTimeUpdate`) are required; MobilityData bindings cover only base GTFS-RT |
| `proto/gtfs-realtime.proto` | https://raw.githubusercontent.com/google/transit/master/gtfs-realtime/proto/gtfs-realtime.proto (retrieved 2026-07-30) |
| `proto/nyct-subway.proto` | https://raw.githubusercontent.com/OneBusAway/onebusaway-gtfs-realtime-api/master/src/main/proto/com/google/transit/realtime/gtfs-realtime-NYCT.proto — linked from https://new.mta.info/developers (retrieved 2026-07-30). Import rewritten to local `gtfs-realtime.proto` |

### Poll / timeout / retry policy

| Env | Default | Meaning |
|---|---|---|
| `BETTERMTA_RT_POLL_MS` | `30000` | Base poll interval; starts staggered with jitter |
| `BETTERMTA_RT_POLL_MS_BY_FEED` | _(unset)_ | `feedId=ms,...` overrides |
| `BETTERMTA_RT_TIMEOUT_MS` | `10000` | Per-attempt fetch timeout |
| `BETTERMTA_RT_MAX_BYTES` | `5242880` (5MB) | Response size cap |
| `BETTERMTA_RT_MAX_RETRIES` | `2` | Extra attempts within the poll cycle (exp backoff + jitter) |
| `BETTERMTA_RT_MIRROR_DISK` | `true` | Atomic raw LKG under `$BETTERMTA_DATA_DIR/realtime/raw/<feedId>.pb` |
| `BETTERMTA_INTERNAL_PORT` | `8081` | Internal HTTP listen (127.0.0.1) |
| `BETTERMTA_INTERNAL_TOKEN` | _(required in production)_ | Bearer token for all `/internal/*` |
| `BETTERMTA_INTERNAL_ALLOW_ANON` | _(false)_ | Dev/test only when token unset |
| `BETTERMTA_STATIC_REFRESH_ON_BOOT` | _(false)_ | Optional static refresh if no active version |

On success: store raw bytes as per-feed LKG `{bytes, fetchedAt, headerTimestamp, byteSize}`, decode, normalize, assemble snapshot. On failure after retries: **keep prior raw LKG**; mark feed degraded; never fabricate. Empty/hollow entity lists still do not displace usable **snapshot** LKG (existing ingest rule).

### Decode validation

- Reject HTML/XML/JSON error pages (careful: protobuf length delimiter `0x7b` is not JSON).
- Require `gtfs_realtime_version`.
- Reject `timestamp` 0 or >5 minutes in the future.

### NYCT semantics

1. **Explicit cancellations** — `schedule_relationship = CANCELED` → cancelled trips.
2. **Skipped stops** — stop_time_update `SKIPPED` preserved on normalized updates.
3. **`trip_replacement_period` (absence-as-cancellation)** — for each route with a replacement period, scheduled trips of that route from the **active static dataset** whose service falls **inside** the replacement window and are **absent** from the feed are derived as cancelled (`derivedFromReplacementPeriod: true`). Trips outside the window or present in the feed are not cancelled.
4. **Unknown trip IDs** — quarantined with counts by feed (existing behavior).
5. **Midnight / service-day rule** — NYCT uses `start_date` (service day YYYYMMDD) + origin time. Post-midnight trips belonging to the prior service day use GTFS times ≥ `24:00:00` (e.g. `24:30:00` = 00:30 local next calendar day). Replacement-window matching converts `service_date_local_midnight (America/New_York) + gtfs_time_seconds` to absolute POSIX; tested at a 00:30 boundary.
6. **Direction / train_id** — retained on normalized trip metadata when present.

### Overall `dataMode` (required feeds)

Required = all eight trip-update feeds. Alerts optional.

- All required **fresh** (≤90s) → `live`
- Any required **stale** (≤15min) and none unavailable → `stale`
- Any required **unavailable** / never fetched / older → `schedule_only`

### Snapshot manifest schema

```json
{
  "snapshotId": "rt_live_YYYYMMDD_<hash10>",
  "createdAt": "<ISO-8601>",
  "staticVersionId": "mta-subway-<sha12>|null",
  "dataMode": "live|stale|schedule_only|…",
  "perFeed": {
    "<feedId>": {
      "feedId": "<feedId>",
      "headerTimestamp": "<ISO>|null",
      "fetchedAt": "<ISO>|null",
      "ageSeconds": 0,
      "status": "fresh|stale|unavailable|never_fetched",
      "entityCounts": { "tripUpdates": 0, "alerts": 0, "vehicles": 0, "quarantined": 0 }
    }
  }
}
```

### Internal API (not public)

All routes require `Authorization: Bearer ${BETTERMTA_INTERNAL_TOKEN}` (or anon only when `BETTERMTA_INTERNAL_ALLOW_ANON=true` in non-production).

| Method | Path | Purpose |
|---|---|---|
| GET | `/internal/health` | Liveness (200 if process up) |
| GET | `/internal/ready` | 200 only when static active |
| GET | `/internal/status` | `{staticVersionId, activeSince, realtime, ready}` |
| GET | `/internal/feeds` | Raw LKG manifest |
| GET | `/internal/feeds/<feedId>` | Raw protobuf (`application/x-protobuf`, `X-Feed-Header-Timestamp`, `X-Fetched-At`, `Cache-Control: no-store`) |
| GET | `/internal/catalog/lines` | Active static → BetterMTA lineIds (GS/FS/H/SI→SIR) |
| GET | `/internal/catalog/stations` | Station catalog for place search |
| GET | `/internal/manifests` | Recent snapshot manifests |

### Capture provenance

`npm run capture:live` → `fixtures/realtime-pb/captured/<feedId>.pb` + `manifest.json` (sizes, header timestamps, capture time, NYCT extension counts). Used as offline decoder regression inputs.

---

## 4. Mapping DATA_CONTRACT requirements → implementation

| Contract section | How met |
|---|---|
| §2 Static identity (`staticDatasetVersion`, `source`, `checksum`, `status`, timestamps) | `StaticImporter` + `StaticDatasetStore` |
| §2 Activation rules | Validate before activate; previous kept; failed never activates |
| §2 Exported entities | Stops hierarchy, routes→`lineId`, trips, stop times, transfers, calendar window |
| §3 Realtime identity | `RealtimeSnapshot` with `snapshotId`, feed timestamps, counts, `dataMode` |
| §3 Payload | Trip updates, cancellations, skipped stops, `ServiceAlert`; vehicles counted but unused |
| §4 Data modes / thresholds | `freshness.ts` — live ≤90s, stale ≤15m, then schedule_only; retention ≥30m |
| §5 Freshness object | `buildFreshness()` warnings safe for UI |
| §6 Line ID mapping | `line-mapping.ts`; versioned with dataset; unknowns quarantined + metric |
| §7 Snapshot handle | `buildRoutingSnapshotHandle()` ≡ `data-snapshot.schema.json` |
| §8 Attribution | This document §2 |
| §9 Fixtures | `services/data/fixtures/**` |
| §10 Observability | `MetricsRegistry` in-memory surface |

---

## 5. Normalization decisions

### lineId

- Product constraints use stable `lineId` only (`A`, `D`, `GS`, `SIR`, …).
- Shuttles: `GS` → `GS`, `FS` → `FS`, `H` → `H`, `SI`/`SIR` → `SIR`.
- Express variants (`6X`, `7X`, `FX`) map to parent line when present.
- Unknown `route_id`s are quarantined (`unknown_route_id`); ingestion continues.

### Realtime wire format

- **Production:** GTFS-RT protobuf via live gateway (`realtime-live/`), including NYCT extensions.
- **Fixtures/tests:** JSON entity shapes under `fixtures/realtime/*.json` with optional `_fixtureMeta`; captured protobuf under `fixtures/realtime-pb/captured/*.pb`.

### Identifier mismatch

Realtime trip IDs not present in the active static dataset are **quarantined** and counted (`bettermta_broken_references_total`). They are never silently merged into the accepted trip-update set. When a static dataset version is pinned, ingestion **requires** a known-trip set; an empty set fails closed (quarantines all trip updates).

### Empty / header-only realtime polls

A successful poll with a fresh feed header but **no** trip updates or alerts is **not** usable realtime. It must not be labeled `live` and must not overwrite last-known-good. `resolveForRouting` retains the prior LKG within the 15/30-minute windows, otherwise falls through to `schedule_only`. Raw protobuf LKG for OTP updaters may still update on successful wire fetch.

### NYCT `trip_replacement_period` (implemented)

NYCT GTFS-RT `trip_replacement_period` on the feed header is parsed and applied: within each route’s replacement window, scheduled trips from the active static dataset that are absent from the feed are derived as cancelled. See §3.1. Explicit `CANCELED` entities remain supported (`fixtures/realtime/cancelled-trip.json`).

### Mercury / NYCT alert extensions (deferred)

Mercury / NYCT-specific alert extension fields are **not** parsed. Only standard GTFS-RT alert text + `informedEntity` are normalized. Deferred until product needs those fields.

### Midnight service-day boundary

**Implemented for replacement-period matching** (America/New_York; GTFS times may be ≥24:00:00). Full “which service day is now?” for arbitrary routing queries remains with the routing engine / OTP. Fixture: `fixtures/realtime/midnight-boundary.json` (ingest preserves `startDate`/`startTime`). Gateway tests cover a 00:30 absence-as-cancellation boundary.

### Consumer note: `dataMode` vs `realtimeSnapshotId`

Between **15 and 30 minutes** of realtime age, `resolveForRouting` / `getRoutingHandle` may return `dataMode: schedule_only` while `realtimeSnapshotId` is still **non-null** (LKG retained until the 30-minute retention window expires). **Routing must honor `dataMode`** and must not treat a non-null snapshot id as permission to apply live trip updates.

### Static ZIP URL re-verification

The canonical static download URL in §1.1 should be **re-verified against current MTA mirrors** before ops wiring. MTA occasionally relocates developer zip hosts; do not hard-wire a stale URL in production fetchers without a check.

---

## 6. Package layout

```text
services/data/
  package.json          # @bettermta/data — do not use repo-root package.json
  proto/                # Vendored gtfs-realtime.proto + nyct-subway.proto
  src/                  # TypeScript platform
    static-pipeline/    # Production download → validate → version → activate
    realtime-live/      # Live GTFS-RT poller, decode, NYCT normalize, manifests
    internal-server.ts  # /internal/* HTTP for OTP updaters
    main.ts             # Process entrypoint (poller + server)
  fixtures/             # Recorded static + realtime fixtures (test/dev only)
    realtime-pb/captured/  # Live-captured .pb regression inputs
  scripts/capture-live.ts
  tests/                # Vitest
  RUNBOOK.md            # Ops notes
```

Public façade: `DataPlatform` in `src/platform.ts` (re-exported from `src/index.ts`).

---

## 6.1 Production static pipeline

Module: `services/data/src/static-pipeline/`. Built around the fixture-era `StaticImporter` / `StaticDatasetStore` / `validateGtfs` primitives.

### Config / env

| Env | Default | Meaning |
|---|---|---|
| `BETTERMTA_STATIC_GTFS_URL` | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip` | Zip source (http(s), `file://`, or filesystem path) |
| `BETTERMTA_DATA_DIR` | `var/data` (relative to service root) | On-disk data root |
| `BETTERMTA_STATIC_MAX_BYTES` | `104857600` (100MB) | Download byte cap |
| `BETTERMTA_STATIC_TIMEOUT_MS` | `60000` | Download timeout |
| `BETTERMTA_REFRESH_INTERVAL_MS` | `86400000` (24h) | Scheduler interval |
| `BETTERMTA_STATIC_RETAIN_VERSIONS` | `3` | Retained version directories |
| `BETTERMTA_STATIC_MIN_STOPS` | `400` | Row-count sanity (real feed) |
| `BETTERMTA_STATIC_MIN_ROUTES` | `20` | Row-count sanity (real feed) |
| `BETTERMTA_STATIC_SERVICE_COVERAGE_DAYS` | `7` | Require active service for today..today+N |
| `BETTERMTA_GRAPH_BUILD_WEBHOOK` | _(unset)_ | Optional POST target on new activation |
| `BETTERMTA_ALLOW_FIXTURE_STATIC` | _(unset/false)_ | Permit fixture directory import (test/dev) |
| `NODE_ENV` | — | `production` always refuses fixture static loading |

### On-disk layout

```text
$BETTERMTA_DATA_DIR/static/
  tmp/                          # download + extract scratch (never under versions/)
  versions/<versionId>/         # extracted .txt tables + metadata.json
  active.json                   # atomic pointer { versionId, sha256, activatedAt }
  graph-build-request.json      # written only when a NEW version activates
```

### Version ID convention (BINDING)

```text
versionId = "mta-subway-" + first_12_hex_chars(sha256(zip_bytes))
```

Full sha256 (64 hex) is recorded in `metadata.json` and `active.json`. Other workstreams must key static dataset identity on this `versionId`.

`metadata.json` fields: `versionId`, `sha256`, `sourceUrl` (sanitized), `fetchedAt`, `byteSize`, `serviceDateRange`, `tableCounts`, `attribution` (`Schedule data © Metropolitan Transportation Authority`), `licenseNote`.

### Refresh semantics

1. Download to temp (timeout + byte cap + content-type sanity).
2. sha256 zip bytes → versionId.
3. If sha256 equals the active version’s sha256 → log unchanged and **do nothing** (no re-activation, no graph-build trigger).
4. Else: ZIP integrity (central directory + inflate) → extract required tables → validate (existing referential checks + service coverage today..today+7 + row counts) → store under `versions/<versionId>/` → atomic `active.json` via temp+rename → load into `StaticDatasetStore` → fire graph-build trigger → prune to last N versions.
5. Any failure leaves the previous active version untouched; failures are logged and counted in metrics.

### Rollback

`rollbackStaticVersion` / `DataPlatform.rollbackStatic(versionId)` rewrites `active.json` atomically to a retained prior version and reloads it into memory. Readiness stays true when the prior version loads successfully.

### Graph-build trigger contract

Fired **only** when a new version activates (not on unchanged checksum, not on startup disk load).

Payload (`graph-build-request.json` and optional webhook body):

```json
{ "versionId": "mta-subway-…", "sha256": "<64 hex>", "requestedAt": "<ISO-8601>" }
```

Default implementation writes the file atomically and, when `BETTERMTA_GRAPH_BUILD_WEBHOOK` is set, POSTs the same JSON. The trigger interface is pluggable (`GraphBuildTrigger`).

### Readiness

- `DataPlatform.isReady()` / `isStaticReady()` → true only when an active static dataset is loaded in memory.
- On process start: `loadActiveFromDisk()` reads `active.json` and loads that version from disk with **zero network calls**. If no active version exists and no successful refresh has run → not ready.
- Production **never** falls back to fixtures. `DataPlatform.importStatic` requires `BETTERMTA_ALLOW_FIXTURE_STATIC=true` and refuses when `NODE_ENV=production`.

### Metrics (additions)

Counters/gauges follow existing `bettermta_*` conventions, including: `bettermta_static_refresh_success_total`, `bettermta_static_refresh_failure_total`, `bettermta_static_refresh_unchanged_total`, `bettermta_static_download_failures_total`, `bettermta_static_validation_failures_total`, `bettermta_static_activation_failures_total`, `bettermta_static_rollback_total`, `bettermta_graph_build_triggers_total`, `bettermta_static_ready`, `bettermta_static_download_bytes`, `bettermta_static_refresh_duration_ms`.

---

## 7. How to run tests

```bash
cd services/data
npm install
npm test
```

Env-gated real-feed integration (optional):

```bash
BETTERMTA_REAL_GTFS_ZIP=/path/to/gtfs_subway.zip npm test
BETTERMTA_LIVE_RT=true npm test   # one live poll cycle across all nine RT feeds
```

Live capture (writes fixtures; network required):

```bash
npm run capture:live
```

Build / run gateway:

```bash
npm run build
BETTERMTA_INTERNAL_TOKEN=… npm start
```

Contract validation (unchanged conductor package):

```bash
npm --prefix contracts install
npm --prefix contracts run validate
```

---

## 8. Operational notes

See `services/data/RUNBOOK.md` for stale realtime, failed import, and rollback procedures.
