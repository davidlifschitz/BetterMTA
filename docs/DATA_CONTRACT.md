# Data Contract

**Owner:** Conductor  
**Status:** Locked for cross-workstream consumption  
**Companion schemas:** `contracts/schemas/data-snapshot.schema.json`, `freshness.schema.json`

This contract defines what the data platform must expose to routing and the API. Detailed feed inventory, poll intervals, and importer internals belong in `docs/DATA_SPEC.md` (data workstream).

## 1. Goals

- Provide versioned static subway schedule data.
- Provide versioned realtime snapshots with explicit freshness.
- Never present stale or synthetic data as live.
- Remain separable from ranking and presentation.

## 2. Static dataset

### Identity

| Field | Description |
|---|---|
| `staticDatasetVersion` | Opaque monotonic/versioned string |
| `source` | e.g. `mta-subway-gtfs` |
| `checksum` | Content hash of imported archive |
| `activatedAt` | When dataset became active |
| `importedAt` | When import finished |
| `status` | `active` \| `pending` \| `failed` \| `rolled_back` |

### Required exported entities

- Stations / stop hierarchy (parent/child)
- Station complexes when available
- Routes mapped to stable `lineId`s
- Trips / stop times / calendars / shapes as needed by the chosen router
- Transfer / pathway edges used for in-system transfers
- Service calendar validity window

### Activation rules

1. Validate schema + referential integrity before activation.
2. Keep previous active dataset for rollback.
3. Routing and API must pin a search to one `staticDatasetVersion`.
4. Failed imports never silently become active.

## 3. Realtime snapshot

### Identity

| Field | Description |
|---|---|
| `realtimeSnapshotId` | Opaque ID |
| `staticDatasetVersion` | Dataset the snapshot was aligned against when possible |
| `ingestedAt` | Ingestion completion time |
| `feedTimestamps` | Map of feed ID → GTFS-RT header timestamp |
| `entityCounts` | Trip updates, alerts, vehicles (if used) |
| `dataMode` | See below |

### Minimum payload to routing/API

- Trip updates applicable to active trips
- Cancellations / skipped stops when present
- Service alerts normalized to `ServiceAlert`
- Explicit `dataMode` and ages

Vehicle positions are optional for MVP; if unused, document as unused rather than fabricating.

## 4. Data modes (normative)

| Mode | Meaning | Allowed in production UI |
|---|---|---|
| `live` | Realtime snapshot age ≤ live threshold | Yes |
| `schedule_only` | No usable realtime; schedule routing only | Yes, labeled |
| `stale` | Realtime exists but age > stale threshold | Yes, labeled |
| `synthetic` | Fixture / mock | Dev/CI only unless explicitly flagged maintenance demo |
| `unavailable` | Cannot route | Error / unavailable state |

### Default thresholds (initial; infra may tune with ADR)

| Parameter | Initial value |
|---|---|
| Live max age | 90 seconds |
| Stale max age before schedule-only fallback flag | 15 minutes |
| Last-known-good retention | ≥ 30 minutes |

**Unresolved:** Exact per-feed thresholds may be refined by data + infra after measurement. Changes require updating this contract or an ADR addendum.

## 5. Freshness object (API-facing)

```json
{
  "realtimeAgeSeconds": 18,
  "staticActivatedAt": "2026-07-29T06:00:00Z",
  "warnings": [
    {
      "code": "stale_realtime",
      "message": "Live train times are delayed; showing last known updates."
    }
  ]
}
```

Warnings are safe for end users. Internal debug details stay in logs.

## 6. Line ID mapping

Data owns the mapping table:

`gtfs route_id` / shuttle IDs → stable product `lineId`

Rules:

- Product constraints use `lineId` only.
- Mapping changes are versioned with the static dataset.
- Unknown GTFS routes must not crash ingestion; quarantine and metric them.

## 7. Snapshot handle passed to routing

```json
{
  "staticDatasetVersion": "gtfs_2026-07-29_a1",
  "realtimeSnapshotId": "rt_987",
  "dataMode": "live",
  "realtimeAgeSeconds": 18
}
```

Routing must treat the handle as immutable for the duration of a search and record it on every returned itinerary lineage.

## 8. Attribution and licensing

Data workstream must document MTA source attribution and license obligations in `DATA_SPEC.md`. UI must be able to show required attribution without scraping undocumented sources.

## 9. Fixtures

Data provides recorded fixtures for:

- valid static subset
- empty realtime
- stale realtime
- malformed entities
- unknown trip IDs
- cancellations
- reroutes
- alerts
- midnight service-day boundary
- static/realtime mismatch

API/frontend may use conductor `contracts/fixtures/**` which already encode the **public** degraded shapes even before data fixtures land.

## 10. Observability requirements (contract-level)

Data must emit:

- static import status/version
- realtime age
- poll duration
- parse errors
- entity counts
- broken references
- stale duration
- last successful update

Exact dashboard tooling is infrastructure-owned.
