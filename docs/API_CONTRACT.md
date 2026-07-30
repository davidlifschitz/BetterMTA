# API Contract

**Owner:** Conductor  
**Status:** Locked v1  
**Machine-readable:** `contracts/openapi/bettermta-v1.yaml`  
**Contract version:** `2026-07-30`

This document supersedes path names in `TECHNICAL_DESIGN.md` §6. Product behavior from the PRD remains unchanged.

Base path: `/v1`  
Content type: `application/json`  
Time format: ISO-8601 timestamps with offset or `Z`.

## 1. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/routes/search` | Baseline + constrained route search |
| `GET` | `/v1/lines` | Active subway lines for picker |
| `GET` | `/v1/places/search` | Place autocomplete |
| `GET` | `/v1/status` | Public data freshness / degraded status |
| `GET` | `/health/live` | Process liveness |
| `GET` | `/health/ready` | Readiness (static OK + realtime OK or permitted degraded) |

Optional later (not MVP-required to implement now, reserved names):

- `POST /v1/feedback` — route correction / feedback (backend may stub)

## 2. Common headers / metadata

### Request

- `X-Request-Id` optional; server generates if absent
- `X-BetterMTA-Client` optional client identifier (`web`)

### Response

- `X-Request-Id` always
- `X-Contract-Version: 2026-07-30`
- Cache headers only for stable metadata (`/v1/lines` may be cached briefly)

## 3. POST `/v1/routes/search`

### Request

```json
{
  "origin": { "placeId": "pl_origin_1" },
  "destination": { "placeId": "pl_dest_1" },
  "timing": {
    "type": "depart_now"
  },
  "selectedLineIds": ["A", "D"],
  "clientContext": {
    "viewport": "mobile",
    "experimentOptIn": true
  }
}
```

#### Origin / destination reference (one of)

```json
{ "placeId": "pl_..." }
```

```json
{ "stationId": "st_..." }
```

```json
{ "coordinate": { "lat": 40.75, "lon": -73.99 }, "label": "Pinned location" }
```

#### Timing

```json
{ "type": "depart_now" }
```

```json
{ "type": "depart_at", "time": "2026-07-30T13:15:00-04:00" }
```

```json
{ "type": "arrive_by", "time": "2026-07-30T09:00:00-04:00" }
```

#### Limits

| Field | Rule |
|---|---|
| `selectedLineIds` | 0–5 unique IDs |
| payload size | ≤ 16 KiB |
| unknown line IDs | `400 unknown_line` |

### Response (success `200`)

```json
{
  "contractVersion": "2026-07-30",
  "requestId": "req_123",
  "staticDatasetVersion": "gtfs_2026-07-29_a1",
  "realtimeSnapshotId": "rt_987",
  "dataMode": "live",
  "freshness": {
    "realtimeAgeSeconds": 18,
    "staticActivatedAt": "2026-07-29T06:00:00Z",
    "warnings": []
  },
  "baseline": {
    "itineraries": []
  },
  "constrained": {
    "itineraries": [],
    "satisfactionSummary": {
      "bestSatisfactionCount": 2,
      "requestedCount": 2,
      "completeMatchFound": true
    }
  },
  "experiment": {
    "explanationVariant": "concise"
  }
}
```

Each itinerary must conform to `contracts/schemas/itinerary.schema.json`.

Rules:

- Return at most **3** constrained itineraries.
- Return at most **3** baseline itineraries.
- If `selectedLineIds` is empty, `constrained.itineraries` is `[]` and `satisfactionSummary.completeMatchFound` is `true` with `requestedCount: 0`.
- Partial matches allowed; UI uses `satisfaction` + `explanation`.
- Never omit `dataMode`.

## 4. GET `/v1/lines`

Query: none required.

```json
{
  "contractVersion": "2026-07-30",
  "staticDatasetVersion": "gtfs_2026-07-29_a1",
  "lines": [
    {
      "lineId": "A",
      "label": "A",
      "displayName": "A train",
      "color": "#0039A6",
      "textColor": "#FFFFFF",
      "isActive": true,
      "gtfsRouteIds": ["A"]
    }
  ]
}
```

## 5. GET `/v1/places/search`

Query params:

| Param | Required | Notes |
|---|---|---|
| `q` | yes | 1–100 chars |
| `limit` | no | default 8, max 15 |
| `proximityLat` / `proximityLon` | no | bias only; do not log precisely by default |

```json
{
  "contractVersion": "2026-07-30",
  "query": "union",
  "places": [
    {
      "placeId": "pl_union_sq",
      "label": "Union Square",
      "kind": "station",
      "stationId": "st_union_sq",
      "borough": "Manhattan"
    }
  ]
}
```

## 6. GET `/v1/status`

```json
{
  "contractVersion": "2026-07-30",
  "dataMode": "live",
  "staticDatasetVersion": "gtfs_2026-07-29_a1",
  "realtimeSnapshotId": "rt_987",
  "realtimeAgeSeconds": 18,
  "degraded": false,
  "messages": []
}
```

## 7. Health

### `GET /health/live`

`200` `{ "status": "ok" }` if process is up.

### `GET /health/ready`

`200` when static dataset is active **and** (realtime is fresh **or** degraded mode is explicitly permitted).

`503` otherwise:

```json
{
  "status": "not_ready",
  "reasons": ["static_dataset_missing"]
}
```

## 8. Error model

All errors:

```json
{
  "error": {
    "code": "invalid_input",
    "message": "Human-readable safe message",
    "requestId": "req_123",
    "details": {}
  }
}
```

| Code | HTTP | When |
|---|---|---|
| `invalid_input` | 400 | Schema/validation failure |
| `unknown_place` | 400 | Unresolvable place |
| `unknown_line` | 400 | Unknown selected line |
| `no_transit_path` | 404 | No path even without constraints |
| `incomplete_selected_line_satisfaction` | 200* | Reserved notice code in warnings; partials still 200 |
| `insufficient_candidate_coverage` | 503 | Budget exhausted without trustworthy candidates |
| `timeout` | 504 | Upstream/routing timeout |
| `data_unavailable` | 503 | Static missing / routing offline |
| `stale_realtime` | 200 | Soft warning via `dataMode: stale` + warning code |
| `rate_limited` | 429 | Abuse controls |
| `internal_error` | 500 | Unexpected |

\* Partial satisfaction is a **successful** response with itineraries and explanations, not an HTTP error.

Do not collapse distinct failures into opaque `500`.

## 9. Freshness metadata

Every route search and status response includes enough information for the UI to label live vs degraded data. See `DATA_CONTRACT.md`.

## 10. Caching

| Endpoint | Cacheability |
|---|---|
| `/v1/lines` | Short TTL OK (≤ 5 minutes) keyed by `staticDatasetVersion` |
| `/v1/places/search` | Optional short TTL; never cache precise current-location queries across users |
| `/v1/routes/search` | Optional; key must include normalized OD, timing bucket, selected lines, static version, realtime snapshot ID, experiment variant |
| health | no public CDN cache |

## 11. Fixtures

Frontend and backend must support the fixture set under `contracts/fixtures/**` for local and CI work before live routing exists. Fixture responses set `dataMode: "synthetic"` unless testing a specific degraded mode.

## 12. Unresolved API items

1. Exact geocoder vendor and place ID strategy — backend proposes, conductor approves.
2. Whether `/v1/feedback` ships in the first public URL — deferred but reserved.
3. Arrive-by precision / search window — routing + backend to document after engine choice.
