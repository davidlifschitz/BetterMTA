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

Production uses **protobuf** GTFS-RT. Recorded fixtures use a JSON representation of the same entity shapes for offline deterministic tests. Documented production endpoints (MTA open GTFS-RT API; **anonymous access** — no API key / `x-api-key` required for these feeds as of 2026):

| Feed ID (internal) | Trunk | Endpoint path (under MTA GTFS-RT API host) |
|---|---|---|
| `nyct-ace` | A, C, E, H, FS | `nyct/gtfs-ace` |
| `nyct-bdfm` | B, D, F, M | `nyct/gtfs-bdfm` |
| `nyct-g` | G | `nyct/gtfs-g` |
| `nyct-jz` | J, Z | `nyct/gtfs-jz` |
| `nyct-nqrw` | N, Q, R, W | `nyct/gtfs-nqrw` |
| `nyct-l` | L | `nyct/gtfs-l` |
| `nyct-1234567` | 1–7 + GS (42nd Street Shuttle) | `nyct/gtfs` |
| `nyct-si` | SIR | `nyct/gtfs-si` |

Notes:

- The ACE feed also carries the **H** (Rockaway Park Shuttle) and **FS** (Franklin Avenue Shuttle) routes.
- **GS** (42nd Street Shuttle) is on the numbered-lines feed (`nyct/gtfs`), not ACE.
- Host reference: MTA open-data GTFS-RT API (`https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/...`). Exact URL wiring is infrastructure-owned; this workstream owns parsing + normalization.

### 1.3 GTFS-Realtime — service alerts

| Field | Value |
|---|---|
| Source | MTA subway alerts GTFS-RT feed |
| Path | `camsys/subway-alerts` (documented MTA feed) |
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
| Realtime trip updates | Poll each trunk feed every 15–30s (infra tunes) | Live max age 90s |
| Service alerts | Poll every 30–60s | Attach to snapshot |
| Last-known-good retention | ≥ 30 minutes | After that, drop to schedule-only |

Live pollers are **not** executed in unit tests. Tests use recorded fixtures only.

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

- **Production:** GTFS-RT protobuf.
- **Fixtures/tests:** JSON entity shapes under `fixtures/realtime/*.json` with optional `_fixtureMeta` for simulated timeout/fetch failure/malformed.

### Identifier mismatch

Realtime trip IDs not present in the active static dataset are **quarantined** and counted (`bettermta_broken_references_total`). They are never silently merged into the accepted trip-update set. When a static dataset version is pinned, ingestion **requires** a known-trip set; an empty set fails closed (quarantines all trip updates).

### Empty / header-only realtime polls

A successful poll with a fresh feed header but **no** trip updates or alerts is **not** usable realtime. It must not be labeled `live` and must not overwrite last-known-good. `resolveForRouting` retains the prior LKG within the 15/30-minute windows, otherwise falls through to `schedule_only`.

### NYCT `trip_replacement_period` (deferred — required before live poller)

**Deferred risk (explicit):** NYCT GTFS-RT extensions include `trip_replacement_period` on the feed header. Within a replacement window, **scheduled trips that are absent from the feed are cancelled**. The current pipeline only records explicit `scheduleRelationship: CANCELED` entities (see fixture `cancelled-trip.json`). That fixture is **not** complete cancellation coverage — absence-as-cancellation under replacement periods is unimplemented. **Required work before enabling a live poller:** parse NYCT extension `trip_replacement_period`, compute the cancelled-by-absence set against the pinned static trip universe for the window, and surface those cancellations on the snapshot. Until then, do not claim full cancellation fidelity in production.

### Mercury / NYCT alert extensions (deferred)

Mercury / NYCT-specific alert extension fields are **not** parsed. Only standard GTFS-RT alert text + `informedEntity` are normalized. Deferred until product needs those fields.

### Midnight service-day boundary

**Deferred (with fixture):** GTFS allows `24:xx:xx` / `25:xx:xx` times for post-midnight service on the prior service day. Static parser accepts those times. Full “which service day is now?” resolution for routing queries is deferred to the routing engine / OTP integration, because it depends on agency timezone and router service-day semantics. Fixture: `fixtures/realtime/midnight-boundary.json`. Tests assert ingest preserves `startDate`/`startTime` without inventing a clock policy (ingest-only coverage).

### Consumer note: `dataMode` vs `realtimeSnapshotId`

Between **15 and 30 minutes** of realtime age, `resolveForRouting` / `getRoutingHandle` may return `dataMode: schedule_only` while `realtimeSnapshotId` is still **non-null** (LKG retained until the 30-minute retention window expires). **Routing must honor `dataMode`** and must not treat a non-null snapshot id as permission to apply live trip updates.

### Static ZIP URL re-verification

The canonical static download URL in §1.1 should be **re-verified against current MTA mirrors** before ops wiring. MTA occasionally relocates developer zip hosts; do not hard-wire a stale URL in production fetchers without a check.

---

## 6. Package layout

```text
services/data/
  package.json          # @bettermta/data — do not use repo-root package.json
  src/                  # TypeScript platform
    static-pipeline/    # Production download → validate → version → activate
  fixtures/             # Recorded static + realtime fixtures (test/dev only)
  tests/                # Vitest
  RUNBOOK.md            # Ops notes
```

Public façade: `DataPlatform` in `src/index.ts`.

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
```

Contract validation (unchanged conductor package):

```bash
npm --prefix contracts install
npm --prefix contracts run validate
```

---

## 8. Operational notes

See `services/data/RUNBOOK.md` for stale realtime, failed import, and rollback procedures.
